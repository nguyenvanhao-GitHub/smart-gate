import { AppointmentStatus, CheckpointCode, DeclarationStatus, DeclarationType, ForceStatus } from '../../domain/declaration.enums';
import { makeDeclaration } from '../../testing/declaration.fixture';
import { AppointmentOrmEntity } from './appointment.orm-entity';
import { CargoItemOrmEntity } from './cargo-item.orm-entity';
import { DeclarationMapper, DossierRelationalRows } from './declaration.mapper';
import { DeclarationOrmEntity } from './declaration.orm-entity';
import { EnterpriseOrmEntity } from './enterprise.orm-entity';
import { VehicleOrmEntity } from './vehicle.orm-entity';

/**
 * Bộ test khoá các nhánh MỚI của mapper sau khi gỡ cột `jsonb`: dữ liệu doanh nghiệp / phương tiện /
 * hàng hoá nay đọc từ bảng quan hệ (`enterprises`/`vehicles`/`cargo_items`), còn hồ sơ cũ chưa di
 * trú thì phải dựng lại an toàn từ cột scalar còn lưu trên bảng chính — KHÔNG được đọc jsonb.
 */

const FIXED_DATE = new Date('2026-07-22T08:00:00.000Z');

/** Dựng dòng bảng chính với các cột scalar tối thiểu; nhận `overrides` để chỉnh từng test. */
function makeRow(overrides: Partial<DeclarationOrmEntity> = {}): DeclarationOrmEntity {
  return Object.assign(new DeclarationOrmEntity(), {
    id: 'decl-001',
    code: 'CK-2026-0001',
    type: DeclarationType.IMPORT,
    status: DeclarationStatus.SUBMITTED,
    enterpriseTaxCode: '5500123456',
    enterpriseId: null,
    plateNumber: '26C-123.45',
    containerNumber: undefined,
    trailerNumber: undefined,
    checkpoint: CheckpointCode.B1,
    workflowProgress: {},
    auditTrail: [],
    createdById: 'user-dn-a',
    feeDeclarationCode: undefined,
    submittedAt: null,
    qrCode: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } satisfies Partial<DeclarationOrmEntity>, overrides);
}

function makeEnterpriseRow(overrides: Partial<EnterpriseOrmEntity> = {}): EnterpriseOrmEntity {
  return Object.assign(new EnterpriseOrmEntity(), {
    id: 'ent-001',
    taxCode: '5500999888',
    name: 'Công ty CP Xuất nhập khẩu Tân Thanh',
    representativeName: 'Trần Thị Bình',
    address: 'Khu kinh tế cửa khẩu Tân Thanh',
    phone: '0203888999',
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } satisfies Partial<EnterpriseOrmEntity>, overrides);
}

function makeVehicleRow(overrides: Partial<VehicleOrmEntity> = {}): VehicleOrmEntity {
  return Object.assign(new VehicleOrmEntity(), {
    id: 'veh-001',
    dossierId: 'decl-001',
    plateNumber: '29C-543.21',
    containerNumber: 'CONT-777',
    trailerNumber: 'RMOOC-888',
    transportLicenseNumber: 'GPVT-123',
    vehicleType: 'TRUCK',
    weightKg: '15000.50',
    driverFullName: null,
    driverIdNumber: null,
    driverIdType: null,
    driverPhone: null,
    driverLicenseNumber: null,
    driverNationality: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } satisfies Partial<VehicleOrmEntity>, overrides);
}

function makeCargoItemRow(overrides: Partial<CargoItemOrmEntity> = {}): CargoItemOrmEntity {
  return Object.assign(new CargoItemOrmEntity(), {
    id: 'cargo-001',
    dossierId: 'decl-001',
    lineNo: 1,
    description: 'Thanh long ruột đỏ',
    quantity: '12.500',
    unitCode: 'TON',
    grossWeightKg: '12500.000',
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } satisfies Partial<CargoItemOrmEntity>, overrides);
}

describe('DeclarationMapper.toDomain — nguồn dữ liệu là bảng quan hệ', () => {
  describe('doanh nghiệp và phương tiện lấy từ bảng con khi có', () => {
    it('ánh xạ đủ trường doanh nghiệp từ bản ghi bảng enterprises', () => {
      const related: DossierRelationalRows = { enterprise: makeEnterpriseRow() };

      const domain = DeclarationMapper.toDomain(makeRow(), related);

      expect(domain.enterprise).toEqual({
        id: 'ent-001',
        taxCode: '5500999888',
        name: 'Công ty CP Xuất nhập khẩu Tân Thanh',
        representativeName: 'Trần Thị Bình',
        address: 'Khu kinh tế cửa khẩu Tân Thanh',
        phone: '0203888999',
        accountType: 'ENTERPRISE',
        idNumber: undefined,
        email: undefined,
      });
    });

    it('chuyển cột null của bảng con thành undefined thay vì giữ null', () => {
      const related: DossierRelationalRows = {
        enterprise: makeEnterpriseRow({ representativeName: null, address: null, phone: null }),
      };

      const domain = DeclarationMapper.toDomain(makeRow(), related);

      expect(domain.enterprise.representativeName).toBeUndefined();
      expect(domain.enterprise.address).toBeUndefined();
      expect(domain.enterprise.phone).toBeUndefined();
    });

    it('ánh xạ đủ trường phương tiện và đổi weightKg numeric-chuỗi thành số', () => {
      const related: DossierRelationalRows = { vehicles: [makeVehicleRow()] };

      const domain = DeclarationMapper.toDomain(makeRow(), related);

      expect(domain.vehicle).toEqual({
        id: 'veh-001',
        plateNumber: '29C-543.21',
        containerNumber: 'CONT-777',
        trailerNumber: 'RMOOC-888',
        transportLicenseNumber: 'GPVT-123',
        vehicleType: 'TRUCK',
        weightKg: 15000.5,
        driver: null,
      });
    });

    it('bỏ weightKg khi cột numeric là null', () => {
      const related: DossierRelationalRows = { vehicles: [makeVehicleRow({ weightKg: null })] };

      const domain = DeclarationMapper.toDomain(makeRow(), related);

      expect(domain.vehicle.weightKg).toBeUndefined();
    });

    it('nhúng lái xe của phương tiện từ cột driver_* (BUG-033)', () => {
      const related: DossierRelationalRows = {
        vehicles: [
          makeVehicleRow({
            id: 'v1',
            plateNumber: '29C-000.01',
            driverFullName: 'Nguyễn Văn A',
            driverIdNumber: '001199001234',
            driverIdType: 'CCCD',
            driverNationality: 'Việt Nam',
          }),
        ],
      };

      const domain = DeclarationMapper.toDomain(makeRow(), related);

      expect(domain.vehicles[0].driver).toEqual({
        fullName: 'Nguyễn Văn A',
        idNumber: '001199001234',
        idType: 'CCCD',
        phone: undefined,
        licenseNumber: undefined,
        nationality: 'Việt Nam',
      });
      expect(domain.driver?.fullName).toBe('Nguyễn Văn A');
    });

    it('một phương tiện/hồ sơ: dựng đúng một xe và giữ xe đó làm vehicle tóm tắt', () => {
      const related: DossierRelationalRows = {
        vehicles: [makeVehicleRow({ id: 'v1', plateNumber: '29C-000.01' })],
      };

      const domain = DeclarationMapper.toDomain(makeRow(), related);

      expect(domain.vehicles.map((item) => item.id)).toEqual(['v1']);
      expect(domain.vehicle.plateNumber).toBe('29C-000.01');
      expect(domain.plateNumbers).toEqual(['29C-000.01']);
    });
  });

  describe('hồ sơ cũ thiếu bảng con — dựng lại từ cột scalar, không đọc jsonb', () => {
    it('dựng doanh nghiệp từ enterpriseTaxCode/enterpriseId với name rỗng, không ném lỗi', () => {
      const row = makeRow({ enterpriseTaxCode: '5500123456', enterpriseId: 'ent-legacy' });

      const domain = DeclarationMapper.toDomain(row, {});

      expect(domain.enterprise).toEqual({
        id: 'ent-legacy',
        taxCode: '5500123456',
        name: '',
        accountType: 'ENTERPRISE',
        idNumber: undefined,
        email: undefined,
      });
    });

    it('mặc định là ENTERPRISE khi enterpriseTaxCode 12 số và không có thông tin cá nhân', () => {
      const row = makeRow({ enterpriseTaxCode: '038090001234', enterpriseId: null });
      const domain = DeclarationMapper.toDomain(row, {});
      expect(domain.enterprise.accountType).toBe('ENTERPRISE');
      expect(domain.enterprise.taxCode).toBe('038090001234');
    });

    it('dựng đúng accountType/idNumber cho cá nhân khi workflowProgress hoặc user lưu accountType=INDIVIDUAL', () => {
      const row = makeRow({
        enterpriseTaxCode: '038090001234',
        enterpriseId: null,
        workflowProgress: { accountType: 'INDIVIDUAL', idNumber: '038090001234', jobTitle: 'Chuyên viên' },
      });
      const domain = DeclarationMapper.toDomain(row, {});
      expect(domain.enterprise.accountType).toBe('INDIVIDUAL');
      expect(domain.enterprise.idNumber).toBe('038090001234');
      expect(domain.enterprise.jobTitle).toBe('Chuyên viên');
    });

    it('dựng đúng accountType/email cho cán bộ nội bộ khi enterpriseTaxCode hoặc workflowProgress là email', () => {
      const row = makeRow({
        enterpriseTaxCode: 'INTERNAL',
        enterpriseId: null,
        workflowProgress: { accountType: 'INTERNAL', email: 'canbo@smartgate.vn', department: 'HaiQuan' },
      });
      const domain = DeclarationMapper.toDomain(row, {});
      expect(domain.enterprise.accountType).toBe('INTERNAL');
      expect(domain.enterprise.email).toBe('canbo@smartgate.vn');
      expect(domain.enterprise.department).toBe('HaiQuan');
    });

    it('để id doanh nghiệp là undefined khi enterpriseId trên bảng chính là null', () => {
      const domain = DeclarationMapper.toDomain(makeRow({ enterpriseId: null }), {});

      expect(domain.enterprise.id).toBeUndefined();
      expect(domain.enterpriseId).toBeNull();
    });

    it('dựng phương tiện từ plateNumber/containerNumber/trailerNumber, không có trường tách bảng', () => {
      const row = makeRow({ plateNumber: '26C-111.22', containerNumber: 'C-001', trailerNumber: 'T-002' });

      const domain = DeclarationMapper.toDomain(row, {});

      expect(domain.vehicle).toEqual({
        plateNumber: '26C-111.22',
        containerNumber: 'C-001',
        trailerNumber: 'T-002',
        driver: null,
      });
      expect(domain.vehicle.id).toBeUndefined();
      expect(domain.vehicle.transportLicenseNumber).toBeUndefined();
      expect(domain.vehicle.vehicleType).toBeUndefined();
      expect(domain.vehicle.weightKg).toBeUndefined();
    });

    it('không ném lỗi khi related hoàn toàn trống (mặc định tham số)', () => {
      expect(() => DeclarationMapper.toDomain(makeRow())).not.toThrow();
    });
  });

  describe('hàng hoá dựng từ bảng cargo_items', () => {
    it('sắp dòng hàng theo lineNo và dựng khối cargo tóm tắt từ dòng đầu', () => {
      const related: DossierRelationalRows = {
        cargoItems: [
          makeCargoItemRow({ id: 'c2', lineNo: 2, description: 'Chuối tươi' }),
          makeCargoItemRow({ id: 'c1', lineNo: 1, description: 'Thanh long ruột đỏ' }),
        ],
      };

      const domain = DeclarationMapper.toDomain(makeRow(), related);

      expect(domain.cargoItems.map((item) => item.id)).toEqual(['c1', 'c2']);
      expect(domain.cargo.description).toBe('Thanh long ruột đỏ');
      expect(domain.cargoItems[0]).toEqual({
        id: 'c1',
        description: 'Thanh long ruột đỏ',
        cargoTypeCode: undefined,
        quantity: 12.5,
        unitCode: 'TON',
        grossWeightKg: 12500,
      });
    });

    it('trả cargo mặc định an toàn khi không có dòng hàng nào', () => {
      const domain = DeclarationMapper.toDomain(makeRow(), { cargoItems: [] });

      expect(domain.cargo).toEqual({ description: '' });
      expect(domain.cargoItems).toEqual([]);
    });

    it('gắn tài xế và lịch hẹn từ bảng con khi có', () => {
      const appointment = Object.assign(new AppointmentOrmEntity(), {
        id: 'appt-001',
        dossierId: 'decl-001',
        scheduledAt: FIXED_DATE,
        gateCode: 'G1',
        laneCode: 'L2',
        status: AppointmentStatus.SCHEDULED,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      });

      const domain = DeclarationMapper.toDomain(makeRow(), { appointment });

      expect(domain.appointment).toEqual({
        id: 'appt-001',
        scheduledAt: FIXED_DATE,
        gateCode: 'G1',
        laneCode: 'L2',
        status: AppointmentStatus.SCHEDULED,
      });
    });
  });
});

describe('DeclarationMapper.toPersistence — không còn ghi jsonb enterprise/vehicle/cargo', () => {
  it('không đặt bất kỳ khoá jsonb enterprise/vehicle/cargo nào lên orm row', () => {
    const domain = makeDeclaration({
      enterprise: { taxCode: '5500123456', name: 'Công ty TNHH Chiềng Khương' },
      vehicle: { plateNumber: '26C-123.45', containerNumber: 'C-9', trailerNumber: 'T-9' },
      cargoItems: [{ description: 'Nông sản', quantity: 3, unitCode: 'TON' }],
    });

    const row = DeclarationMapper.toPersistence(domain);

    const keys = Object.keys(row);
    expect(keys).not.toContain('enterprise');
    expect(keys).not.toContain('vehicle');
    expect(keys).not.toContain('cargo');
  });

  it('ghi đủ cột scalar từ khối domain', () => {
    const domain = makeDeclaration({
      id: 'decl-777',
      code: 'CK-2026-0777',
      enterprise: { id: 'ent-777', taxCode: '5500123456', name: 'Công ty TNHH Chiềng Khương' },
      vehicle: { plateNumber: '26C-123.45', containerNumber: 'C-9', trailerNumber: 'T-9' },
      feeDeclarationCode: 'FEE-001',
      createdById: 'user-dn-a',
      submittedAt: FIXED_DATE,
      qrCode: 'QR-XYZ',
    });

    const row = DeclarationMapper.toPersistence(domain);

    expect(row.id).toBe('decl-777');
    expect(row.code).toBe('CK-2026-0777');
    expect(row.enterpriseTaxCode).toBe('5500123456');
    expect(row.enterpriseId).toBe('ent-777');
    expect(row.plateNumber).toBe('26C-123.45');
    expect(row.containerNumber).toBe('C-9');
    expect(row.trailerNumber).toBe('T-9');
    expect(row.feeDeclarationCode).toBe('FEE-001');
    expect(row.createdById).toBe('user-dn-a');
    expect(row.submittedAt).toBe(FIXED_DATE);
    expect(row.qrCode).toBe('QR-XYZ');
  });

  it('vẫn ghi workflowProgress/auditTrail (trạng thái sống, không có bảng thay thế)', () => {
    const workflowProgress = { IMPORT_DECLARED: ForceStatus.COMPLETED };
    const auditTrail = [
      {
        id: 'audit-1',
        at: FIXED_DATE,
        actorId: 'user-dn-a',
        actorRole: 'DN',
        action: 'SUBMIT' as never,
      },
    ];
    const domain = makeDeclaration({
      workflowProgress,
      auditTrail,
    });

    const row = DeclarationMapper.toPersistence(domain);

    expect(row.workflowProgress).toBe(workflowProgress);
    expect(row.auditTrail).toBe(auditTrail as never);
  });

  it('đổ null cho submittedAt/qrCode khi hồ sơ chưa gửi', () => {
    const domain = makeDeclaration({ submittedAt: null, qrCode: null });

    const row = DeclarationMapper.toPersistence(domain);

    expect(row.submittedAt).toBeNull();
    expect(row.qrCode).toBeNull();
  });

  it('giữ enterpriseTaxCode rỗng khi taxCode không có (không ghi CCCD hay INTERNAL sai ngữ nghĩa), lưu vào declarantAccount', () => {
    const domainIndividual = makeDeclaration({
      enterprise: { taxCode: '', idNumber: '038090001234', name: 'Trần Văn C', accountType: 'INDIVIDUAL' },
    });
    const rowIndividual = DeclarationMapper.toPersistence(domainIndividual);
    expect(rowIndividual.enterpriseTaxCode).toBe('');
    expect((rowIndividual.declarantAccount as any).idNumber).toBe('038090001234');

    const domainInternal = makeDeclaration({
      enterprise: { taxCode: '', email: 'staff@smartgate.vn', name: 'Cán bộ A', accountType: 'INTERNAL' },
    });
    const rowInternal = DeclarationMapper.toPersistence(domainInternal);
    expect(rowInternal.enterpriseTaxCode).toBe('');
    expect((rowInternal.declarantAccount as any).email).toBe('staff@smartgate.vn');

    const longEmail = 'a'.repeat(30) + '@smartgate.vn';
    const domainLongEmail = makeDeclaration({
      enterprise: { taxCode: '', email: longEmail, name: 'Cán bộ Dài', accountType: 'INTERNAL' },
    });
    const rowLongEmail = DeclarationMapper.toPersistence(domainLongEmail);
    expect(rowLongEmail.enterpriseTaxCode).toBe('');
    expect((rowLongEmail.declarantAccount as any).email).toBe(longEmail);

    const reloaded = DeclarationMapper.toDomain(rowLongEmail, {});
    expect(reloaded.enterprise.email).toBe(longEmail);
    expect(reloaded.enterprise.accountType).toBe('INTERNAL');

    const domainEmpty = makeDeclaration({
      enterprise: { taxCode: '' },
    });
    const rowEmpty = DeclarationMapper.toPersistence(domainEmpty);
    expect(rowEmpty.enterpriseTaxCode).toBe('');
  });
});

describe('DeclarationMapper.toEnterprisePersistence — ghi dữ liệu doanh nghiệp an toàn', () => {
  it('không vỡ NOT NULL khi enterprise.name để trống lúc tạo mới', () => {
    const row = DeclarationMapper.toEnterprisePersistence({
      taxCode: '5500123456',
    });

    expect(row.taxCode).toBe('5500123456');
    expect(row.name).toBe('5500123456');
  });

  it('giữ nguyên name của existing khi enterprise.name không truyền', () => {
    const existing = makeEnterpriseRow({ name: 'Công ty TNHH Cũ' });
    const row = DeclarationMapper.toEnterprisePersistence(
      { taxCode: '5500999888' },
      existing,
    );

    expect(row.name).toBe('Công ty TNHH Cũ');
  });
});

describe('DeclarationMapper.toVehiclePersistence — ghi lái xe nhúng theo xe (BUG-033)', () => {
  it('ghi đủ cột driver_* từ lái xe của phương tiện', () => {
    const row = DeclarationMapper.toVehiclePersistence('decl-001', {
      plateNumber: '29C-000.01',
      driver: { fullName: 'Nguyễn Văn A', idNumber: '001199001234', idType: 'CCCD', nationality: 'Việt Nam' },
    });

    expect(row.driverFullName).toBe('Nguyễn Văn A');
    expect(row.driverIdNumber).toBe('001199001234');
    expect(row.driverIdType).toBe('CCCD');
    expect(row.driverNationality).toBe('Việt Nam');
    expect(row.driverPhone).toBeNull();
    expect(row.driverLicenseNumber).toBeNull();
  });

  it('đổ null mọi cột driver_* khi xe chưa khai lái xe', () => {
    const row = DeclarationMapper.toVehiclePersistence('decl-001', { plateNumber: '29C-000.02' });

    expect(row.driverFullName).toBeNull();
    expect(row.driverIdNumber).toBeNull();
    expect(row.driverIdType).toBeNull();
    expect(row.driverPhone).toBeNull();
    expect(row.driverLicenseNumber).toBeNull();
    expect(row.driverNationality).toBeNull();
  });

  describe('SG-281: bảo toàn dữ liệu và không trộn lẫn thông tin người tạo vào enterprise', () => {
    it('hồ sơ cũ chưa có progress.accountType do cán bộ tạo (có MST): suy ra ENTERPRISE, không đoán nhầm INTERNAL', () => {
      const row = makeRow({ enterpriseTaxCode: '5500123456', enterpriseId: null });
      const domain = DeclarationMapper.toDomain(row, {});

      expect(domain.enterprise.accountType).toBe('ENTERPRISE');
      expect(domain.enterprise.taxCode).toBe('5500123456');
    });

    it('toPersistence và toDomain: lưu và nạp lại trọn vẹn name, phone, address, email cho tài khoản INTERNAL', () => {
      const domainInternal = makeDeclaration({
        enterprise: {
          taxCode: '',
          name: 'Cán bộ trực ban',
          phone: '0988776655',
          address: 'Cửa khẩu Chiềng Khương',
          representativeName: 'Trưởng trạm',
          email: 'officer@smartgate.vn',
          accountType: 'INTERNAL',
          jobTitle: 'Kiểm hóa viên',
          department: 'Hải quan',
          createForOther: true,
        },
      });

      const row = DeclarationMapper.toPersistence(domainInternal);
      expect(row.enterpriseTaxCode).toBe('');
      const declarant = row.declarantAccount as any;
      expect(declarant.name).toBe('Cán bộ trực ban');
      expect(declarant.phone).toBe('0988776655');
      expect(declarant.address).toBe('Cửa khẩu Chiềng Khương');
      expect(declarant.representativeName).toBe('Trưởng trạm');
      expect(declarant.email).toBe('officer@smartgate.vn');
      expect((row.workflowProgress as any).email).toBeUndefined();

      const reloaded = DeclarationMapper.toDomain(row, {});
      expect(reloaded.enterprise.name).toBe('Cán bộ trực ban');
      expect(reloaded.enterprise.phone).toBe('0988776655');
      expect(reloaded.enterprise.address).toBe('Cửa khẩu Chiềng Khương');
      expect(reloaded.enterprise.representativeName).toBe('Trưởng trạm');
      expect(reloaded.enterprise.email).toBe('officer@smartgate.vn');
      expect(reloaded.enterprise.accountType).toBe('INTERNAL');
      expect(reloaded.enterprise.jobTitle).toBe('Kiểm hóa viên');
      expect(reloaded.enterprise.department).toBe('Hải quan');
      expect(reloaded.enterprise.createForOther).toBe(true);
    });
  });
});
