import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import { Declaration } from '../../domain/declaration.entity';
import { DeclarationStatus, DeclarationType } from '../../domain/declaration.enums';
import { vietnamDateString } from '../../../../common/time/vietnam-date';
import {
  ActiveDossierConflict,
  DeclarationPageCriteria,
  DeclarationRepository,
  DeclarationScopeCriteria,
  DeclarationSearchCriteria,
} from '../../application/ports/declaration.repository';
import { AppointmentOrmEntity } from './appointment.orm-entity';
import { CargoItemOrmEntity } from './cargo-item.orm-entity';
import { DeclarationMapper, DossierRelationalRows } from './declaration.mapper';
import { DeclarationOrmEntity } from './declaration.orm-entity';
import { DriverOrmEntity } from './driver.orm-entity';
import { EnterpriseOrmEntity } from './enterprise.orm-entity';
import { TransshipmentVehicleOrmEntity } from './transshipment-vehicle.orm-entity';
import { VehicleOrmEntity } from './vehicle.orm-entity';

/** Trần bản ghi cho truy vấn không phân trang (dashboard, phí, báo cáo) — giữ nguyên như P1. */
const UNPAGED_LIMIT = 100;

@Injectable()
export class TypeOrmDeclarationRepository implements DeclarationRepository {
  constructor(
    @InjectRepository(DeclarationOrmEntity)
    private readonly repository: Repository<DeclarationOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async nextCode(type: DeclarationType): Promise<string> {
    const prefix = type.slice(0, 3).toUpperCase();
    // Phần ngày của mã lấy theo **giờ Việt Nam** (BUG-022): hồ sơ tạo 02/08 01:45 giờ VN phải mang
    // tiền tố `20260802`, không phải `20260801` như khi cắt ngày từ UTC.
    const date = vietnamDateString(new Date()).replace(/-/g, '');
    const codePrefix = `${prefix}-${date}-`;

    const latest = await this.repository
      .createQueryBuilder('d')
      .select('d.code', 'code')
      .where('d.code LIKE :prefix', { prefix: `${codePrefix}%` })
      .orderBy('d.code', 'DESC')
      .getRawOne();

    let seq = 1;
    if (latest?.code) {
      const match = String(latest.code).match(/-(\d+)$/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    } else {
      const count = await this.repository.count({ where: { type } });
      seq = count + 1;
    }

    let code = `${codePrefix}${String(seq).padStart(6, '0')}`;
    while (await this.repository.findOne({ where: { code } })) {
      seq++;
      code = `${codePrefix}${String(seq).padStart(6, '0')}`;
    }
    return code;
  }

  async findMany(criteria: DeclarationSearchCriteria): Promise<Declaration[]> {
    const rows = await this.buildQuery(criteria).take(UNPAGED_LIMIT).getMany();
    return this.attachRelated(this.repository.manager, rows);
  }

  async findPage(criteria: DeclarationPageCriteria): Promise<PaginatedResult<Declaration>> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    const [rows, total] = await this.buildQuery(criteria).skip(paging.skip).take(paging.take).getManyAndCount();
    return toPaginatedResult(await this.attachRelated(this.repository.manager, rows), total, paging);
  }

  /** Dùng đúng `buildQuery` của danh sách nên con số luôn khớp `findPage(...).total`. */
  async count(criteria: DeclarationSearchCriteria): Promise<number> {
    return this.buildQuery(criteria).getCount();
  }

  async findById(id: string): Promise<Declaration | null> {
    if (!id || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())) {
      return null;
    }
    const row = await this.repository.findOne({ where: { id: id.trim() } });
    if (!row) return null;
    const [declaration] = await this.attachRelated(this.repository.manager, [row]);
    return declaration;
  }

  async findByCode(code: string): Promise<Declaration | null> {
    if (!code || typeof code !== 'string') return null;
    const cleanCode = code.trim();
    let row = await this.repository.findOne({ where: { code: cleanCode } });
    if (!row) {
      row = await this.repository
        .createQueryBuilder('declaration')
        .where('declaration.code ILIKE :code', { code: cleanCode })
        .getOne();
    }
    if (!row) return null;
    const [declaration] = await this.attachRelated(this.repository.manager, [row]);
    return declaration;
  }

  /**
   * Ghi hồ sơ vào **bảng quan hệ** (P2) là nguồn duy nhất — ba cột `jsonb` cũ đã gỡ ở migration R2.
   * Toàn bộ nằm trong một giao dịch để không có hồ sơ mất phần con; cột scalar denormalized trên
   * bảng chính (mã số thuế, biển số…) vẫn được `toPersistence` ghi để phục vụ index/tìm kiếm.
   *
   * F09 đã bỏ (CR8): **cho phép trùng biển số giữa các hồ sơ**, không còn chỉ mục
   * `uq_vehicles_active_plate` nên không còn dịch lỗi 23505 thành `PlateInUseError`.
   */
  async save(declaration: Declaration): Promise<Declaration> {
    return this.saveInTransaction(declaration);
  }

  private async saveInTransaction(declaration: Declaration): Promise<Declaration> {
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.saveEnterprise(manager, declaration);
      await manager.save(DeclarationMapper.toPersistence(declaration));
      await this.saveVehicles(manager, declaration);
      await this.saveCargoItems(manager, declaration);
      await this.saveTransshipmentVehicles(manager, declaration);
      await this.saveAppointment(manager, declaration);

      const row = await manager.findOne(DeclarationOrmEntity, { where: { id: declaration.id } });
      const [result] = await this.attachRelated(manager, row ? [row] : []);
      return result;
    });
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.deleteChildren(manager, id);
      await manager.delete(DeclarationOrmEntity, id);
    });
  }

  async findActiveConflicts(
    vehicles: { plateNumber?: string; driverIdNumber?: string }[],
    excludeDossierId?: string,
  ): Promise<ActiveDossierConflict[]> {
    if (!vehicles || vehicles.length === 0) return [];
    const plates = vehicles.map((v) => v.plateNumber?.trim()).filter((p): p is string => !!p);
    const idNumbers = vehicles.map((v) => v.driverIdNumber?.trim()).filter((id): id is string => !!id);
    if (plates.length === 0 && idNumbers.length === 0) return [];

    const finishedStatuses = [
      DeclarationStatus.COMPLETED,
      DeclarationStatus.REJECTED,
      DeclarationStatus.CANCELLED,
      DeclarationStatus.EXITED,
    ];

    const qb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(v.plate_number, d.plateNumber)', 'plateNumber')
      .addSelect('v.driver_id_number', 'driverIdNumber')
      .addSelect('d.id', 'dossierId')
      .addSelect('d.code', 'dossierCode')
      .from(DeclarationOrmEntity, 'd')
      .leftJoin(VehicleOrmEntity, 'v', 'v.dossier_id = d.id')
      .where('d.status NOT IN (:...finishedStatuses)', { finishedStatuses });

    if (excludeDossierId) {
      qb.andWhere('d.id != :excludeDossierId', { excludeDossierId });
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (plates.length > 0) {
      conditions.push('(LOWER(v.plate_number) IN (:...plates) OR LOWER(d.plateNumber) IN (:...plates))');
      params['plates'] = plates.map((p) => p.toLowerCase());
    }
    if (idNumbers.length > 0) {
      conditions.push('v.driver_id_number IN (:...idNumbers)');
      params['idNumbers'] = idNumbers;
    }

    qb.andWhere(`(${conditions.join(' OR ')})`, params);

    const rows = await qb.getRawMany();
    const conflicts: ActiveDossierConflict[] = [];

    for (const row of rows) {
      const rowPlate = (row.plateNumber || '').trim();
      const rowIdNumber = (row.driverIdNumber || '').trim();
      vehicles.forEach((v, index) => {
        if (v.plateNumber && rowPlate.toLowerCase() === v.plateNumber.trim().toLowerCase()) {
          conflicts.push({
            field: 'plateNumber',
            value: v.plateNumber,
            vehicleIndex: index,
            dossierId: row.dossierId,
            dossierCode: row.dossierCode,
          });
        }
        if (v.driverIdNumber && rowIdNumber && rowIdNumber === v.driverIdNumber.trim()) {
          conflicts.push({
            field: 'driverIdNumber',
            value: v.driverIdNumber,
            vehicleIndex: index,
            dossierId: row.dossierId,
            dossierCode: row.dossierCode,
          });
        }
      });
    }

    return conflicts;
  }

  // ---------- Truy vấn ----------

  private buildQuery(criteria: DeclarationSearchCriteria): SelectQueryBuilder<DeclarationOrmEntity> {
    const query = this.repository
      .createQueryBuilder('declaration')
      // Chỉ join, không select: bảng `enterprises` phục vụ lọc phạm vi dữ liệu và tìm kiếm theo
      // tên/mã số thuế doanh nghiệp; dữ liệu hiển thị được nạp riêng theo lô ở `attachRelated`.
      .leftJoin(EnterpriseOrmEntity, 'enterprise', 'enterprise.id = declaration.enterpriseId')
      .orderBy('declaration.createdAt', 'DESC');

    if (criteria.type) query.andWhere('declaration.type = :type', { type: criteria.type });
    if (criteria.status) query.andWhere('declaration.status = :status', { status: criteria.status });
    if (criteria.statuses?.length) {
      query.andWhere('declaration.status IN (:...statuses)', { statuses: criteria.statuses });
    }
    if (criteria.checkpoint) query.andWhere('declaration.checkpoint = :checkpoint', { checkpoint: criteria.checkpoint });
    if (criteria.epidemic !== undefined) query.andWhere('declaration.epidemicFlag = :epidemic', { epidemic: criteria.epidemic });
    if (criteria.taxCode) query.andWhere('declaration.enterpriseTaxCode = :taxCode', { taxCode: criteria.taxCode });
    if (criteria.fromDate) query.andWhere('declaration.createdAt >= :fromDate', { fromDate: criteria.fromDate });
    if (criteria.toDate) query.andWhere('declaration.createdAt <= :toDate', { toDate: criteria.toDate });
    this.applyScope(query, criteria.scope);

    if (criteria.code?.trim()) {
      const codePattern = `%${criteria.code.trim()}%`;
      query.andWhere('declaration.code ILIKE :codePattern', { codePattern });
    }

    if (criteria.keyword?.trim()) {
      const keyword = `%${criteria.keyword.trim()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('declaration.code ILIKE :keyword', { keyword })
            .orWhere('declaration.feeDeclarationCode ILIKE :keyword', { keyword })
            .orWhere('declaration.plateNumber ILIKE :keyword', { keyword })
            .orWhere('declaration.containerNumber ILIKE :keyword', { keyword })
            .orWhere('declaration.trailerNumber ILIKE :keyword', { keyword })
            .orWhere('declaration.enterpriseTaxCode ILIKE :keyword', { keyword })
            .orWhere('enterprise.name ILIKE :keyword', { keyword });
        }),
      );
    }
    return query;
  }

  /**
   * Phạm vi `OWN` sau khi tách bảng `enterprises`:
   * - Tài khoản được phân công mã số thuế → chỉ thấy hồ sơ **của đúng các doanh nghiệp đó**.
   *   Không nới thêm theo `createdById` nữa, nếu không thì tài khoản đã chuyển doanh nghiệp vẫn
   *   còn thấy hồ sơ cũ.
   * - Tài khoản không gắn doanh nghiệp nào (tài xế…) → giữ căn cứ `createdById`.
   * Không có căn cứ nào khớp thì danh sách rỗng — chặn mặc định, không để lộ hồ sơ doanh nghiệp khác.
   *
   * Cán bộ lực lượng (`reachedStepCodes`) được siết theo **tiến trình liên ngành** — ưu tiên trước
   * `unrestricted` vì chiều này đi kèm `unrestricted: true` (ràng buộc theo bước, không theo doanh nghiệp).
   */
  private applyScope(
    query: SelectQueryBuilder<DeclarationOrmEntity>,
    scope?: DeclarationScopeCriteria,
  ): void {
    if (!scope) return;
    if (scope.excludeDraft) {
      query.andWhere('declaration.status != :scopeDraftStatus', { scopeDraftStatus: DeclarationStatus.DRAFT });
    }
    if (scope.reachedStepCodes) {
      this.applyWorkflowVisibility(query, scope.reachedStepCodes);
      return;
    }
    if (scope.requireWorkflow) {
      query.andWhere(
        `EXISTS (
           SELECT 1
           FROM "workflow_instances" wfi
           WHERE wfi."dossier_id" = "declaration"."id"
         )`,
      );
      return;
    }
    if (scope.unrestricted) return;
    const taxCodes = scope.taxCodes || [];
    const idNumbers = scope.idNumbers || [];
    if (taxCodes.length > 0) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('enterprise.taxCode IN (:...scopeTaxCodes)', { scopeTaxCodes: taxCodes })
            // Hồ sơ cũ chưa di trú sang bảng `enterprises` thì đối chiếu cột mã số thuế đã có sẵn.
            .orWhere(
              new Brackets((legacy) => {
                legacy
                  .where('declaration.enterpriseId IS NULL')
                  .andWhere('declaration.enterpriseTaxCode IN (:...scopeTaxCodes)', { scopeTaxCodes: taxCodes });
              }),
            );
        }),
      );
      return;
    }
    if (idNumbers.length > 0) {
      query.leftJoin(VehicleOrmEntity, 'vehicle_scope', 'vehicle_scope.dossier_id = declaration.id');
      query.andWhere(
        new Brackets((qb) => {
          qb.where('declaration.createdById = :ownerUserId', { ownerUserId: scope.ownerUserId ?? null })
            .orWhere('vehicle_scope.driver_id_number IN (:...scopeIdNumbers)', { scopeIdNumbers: idNumbers });
        }),
      );
      return;
    }
    query.andWhere('declaration.createdById = :ownerUserId', { ownerUserId: scope.ownerUserId ?? null });
  }

  /**
   * Siết theo tiến trình liên ngành: chỉ giữ hồ sơ có phiên (`workflow_instances`) mà **một bước
   * thuộc vai trò của cán bộ** đã hoàn tất/bị từ chối (đã đi qua) HOẶC đang là bước hiện tại
   * (đang/đến lượt). Bước của cán bộ vẫn PENDING ở tương lai (chưa tới) hoặc hồ sơ không có bước
   * của lực lượng họ → không hiện.
   *
   * Danh sách bước rỗng thì không thấy hồ sơ nào — chặn mặc định. (`toCriteria` không sinh mảng rỗng,
   * nhưng giữ nhánh này để không vô tình mở toang khi có dữ liệu bất thường.)
   */
  private applyWorkflowVisibility(query: SelectQueryBuilder<DeclarationOrmEntity>, stepCodes: string[]): void {
    if (stepCodes.length === 0) {
      query.andWhere('1 = 0');
      return;
    }
    query.andWhere(
      `EXISTS (
         SELECT 1
         FROM "workflow_instance_steps" wis
         JOIN "workflow_instances" wfi ON wfi."id" = wis."instance_id"
         WHERE wfi."dossier_id" = "declaration"."id"
           AND wis."step_code" IN (:...reachedStepCodes)
           AND (wis."status" IN (:...reachedDoneStatuses) OR wis."step_code" = wfi."current_step_code")
       )`,
      { reachedStepCodes: stepCodes, reachedDoneStatuses: ['COMPLETED', 'REJECTED'] },
    );
  }

  /** Nạp các bảng con theo lô cho cả trang danh sách — tránh N+1. */
  private async attachRelated(manager: EntityManager, rows: DeclarationOrmEntity[]): Promise<Declaration[]> {
    if (rows.length === 0) return [];
    const dossierIds = rows.map((row) => row.id);
    const enterpriseIds = [...new Set(rows.map((row) => row.enterpriseId).filter((id): id is string => !!id))];

    const [enterprises, vehicles, drivers, cargoItems, transshipmentVehicles, appointments] = await Promise.all([
      enterpriseIds.length
        ? manager.find(EnterpriseOrmEntity, { where: { id: In(enterpriseIds) } })
        : Promise.resolve([]),
      manager.find(VehicleOrmEntity, { where: { dossierId: In(dossierIds) } }),
      manager.find(DriverOrmEntity, { where: { dossierId: In(dossierIds) } }),
      manager.find(CargoItemOrmEntity, { where: { dossierId: In(dossierIds) } }),
      manager.find(TransshipmentVehicleOrmEntity, { where: { dossierId: In(dossierIds) } }),
      manager.find(AppointmentOrmEntity, { where: { dossierId: In(dossierIds) } }),
    ]);

    const enterpriseById = new Map(enterprises.map((item) => [item.id, item]));
    const driverByDossier = new Map(drivers.map((item) => [item.dossierId, item]));
    const appointmentByDossier = new Map(appointments.map((item) => [item.dossierId, item]));
    const vehicleByDossier = new Map<string, VehicleOrmEntity[]>();
    vehicles.forEach((item) => {
      const bucket = vehicleByDossier.get(item.dossierId) ?? [];
      bucket.push(item);
      vehicleByDossier.set(item.dossierId, bucket);
    });
    const cargoByDossier = new Map<string, CargoItemOrmEntity[]>();
    cargoItems.forEach((item) => {
      const bucket = cargoByDossier.get(item.dossierId) ?? [];
      bucket.push(item);
      cargoByDossier.set(item.dossierId, bucket);
    });
    const transshipmentByDossier = new Map<string, TransshipmentVehicleOrmEntity[]>();
    transshipmentVehicles.forEach((item) => {
      const bucket = transshipmentByDossier.get(item.dossierId) ?? [];
      bucket.push(item);
      transshipmentByDossier.set(item.dossierId, bucket);
    });

    return rows.map((row) => {
      const related: DossierRelationalRows = {
        enterprise: row.enterpriseId ? enterpriseById.get(row.enterpriseId) : null,
        vehicles: vehicleByDossier.get(row.id) ?? [],
        driver: driverByDossier.get(row.id),
        cargoItems: cargoByDossier.get(row.id) ?? [],
        transshipmentVehicles: transshipmentByDossier.get(row.id) ?? [],
        appointment: appointmentByDossier.get(row.id),
      };
      return DeclarationMapper.toDomain(row, related);
    });
  }

  // ---------- Ghi các bảng con ----------

  private async saveEnterprise(manager: EntityManager, declaration: Declaration): Promise<void> {
    const rawType = (declaration.enterprise?.accountType || '').trim().toUpperCase();
    if (
      rawType === 'INTERNAL' ||
      rawType === 'INDIVIDUAL' ||
      (!declaration.enterprise?.taxCode && (declaration.enterprise?.idNumber || declaration.enterprise?.email))
    ) {
      // Cắt đứt liên kết với doanh nghiệp cũ khi đổi loại hồ sơ sang INDIVIDUAL / INTERNAL
      declaration.enterpriseId = null;
      if (declaration.enterprise) {
        declaration.enterprise.id = undefined;
      }
      return;
    }
    const taxCode = (declaration.enterprise?.taxCode || '').trim().slice(0, 32);
    if (!taxCode) return;
    const existing = await manager.findOne(EnterpriseOrmEntity, { where: { taxCode } });
    const saved = await manager.save(
      DeclarationMapper.toEnterprisePersistence({ ...declaration.enterprise, taxCode }, existing),
    );
    declaration.enterpriseId = saved.id;
    declaration.enterprise = { ...declaration.enterprise, id: saved.id };
  }

  /**
   * Phương tiện ghi lại theo kiểu xóa-rồi-thêm: **đúng một xe/hồ sơ** (CR8, khóa duy nhất
   * `uq_vehicles_dossier` ở DB). Id do client gửi lên được giữ nguyên nên tham chiếu ở giao diện không
   * bị đứt.
   */
  private async saveVehicles(manager: EntityManager, declaration: Declaration): Promise<void> {
    await manager.delete(VehicleOrmEntity, { dossierId: declaration.id });
    if (declaration.vehicles.length === 0) return;
    const rows = declaration.vehicles.map((vehicle) =>
      DeclarationMapper.toVehiclePersistence(declaration.id, vehicle),
    );
    const saved = await manager.save(rows);
    declaration.setVehicles(declaration.vehicles.map((vehicle, index) => ({ ...vehicle, id: saved[index].id })));
  }

  /**
   * Dòng hàng ghi lại toàn bộ theo kiểu xóa-rồi-thêm: số dòng nhỏ, và cách này giữ đúng thứ tự
   * `line_no` mà người dùng vừa sắp xếp. Id do client gửi lên được giữ nguyên nên tham chiếu
   * ở giao diện không bị đứt.
   */
  private async saveCargoItems(manager: EntityManager, declaration: Declaration): Promise<void> {
    await manager.delete(CargoItemOrmEntity, { dossierId: declaration.id });
    if (declaration.cargoItems.length === 0) return;
    const rows = declaration.cargoItems.map((item, index) =>
      DeclarationMapper.toCargoItemPersistence(declaration.id, item, index + 1),
    );
    const saved = await manager.save(rows);
    declaration.cargoItems = declaration.cargoItems.map((item, index) => ({ ...item, id: saved[index].id }));
  }

  /**
   * Phương tiện nhận sang tải (CR9) — ghi lại toàn bộ theo kiểu xóa-rồi-thêm, giống dòng hàng. Chỉ có
   * ở hồ sơ Sang tải; hồ sơ loại khác có danh sách rỗng nên chỉ dọn sạch bảng con.
   */
  private async saveTransshipmentVehicles(manager: EntityManager, declaration: Declaration): Promise<void> {
    await manager.delete(TransshipmentVehicleOrmEntity, { dossierId: declaration.id });
    if (declaration.transshipmentVehicles.length === 0) return;
    const rows = declaration.transshipmentVehicles.map((item, index) =>
      DeclarationMapper.toTransshipmentVehiclePersistence(declaration.id, item, index + 1),
    );
    const saved = await manager.save(rows);
    declaration.transshipmentVehicles = declaration.transshipmentVehicles.map((item, index) => ({
      ...item,
      id: saved[index].id,
    }));
  }

  private async saveAppointment(manager: EntityManager, declaration: Declaration): Promise<void> {
    const existing = await manager.findOne(AppointmentOrmEntity, { where: { dossierId: declaration.id } });
    if (!declaration.appointment) {
      if (existing) await manager.delete(AppointmentOrmEntity, { dossierId: declaration.id });
      return;
    }
    const row = DeclarationMapper.toAppointmentPersistence(declaration.id, declaration.appointment);
    if (existing) row.id = existing.id;
    const saved = await manager.save(row);
    declaration.appointment = { ...declaration.appointment, id: saved.id };
  }

  /** Xóa hồ sơ phải dọn cả bảng con: dự án cố tình không tạo khóa ngoại nên không có cascade. */
  private async deleteChildren(manager: EntityManager, dossierId: string): Promise<void> {
    await Promise.all([
      manager.delete(VehicleOrmEntity, { dossierId }),
      manager.delete(DriverOrmEntity, { dossierId }),
      manager.delete(CargoItemOrmEntity, { dossierId }),
      manager.delete(TransshipmentVehicleOrmEntity, { dossierId }),
      manager.delete(AppointmentOrmEntity, { dossierId }),
    ]);
  }
}
