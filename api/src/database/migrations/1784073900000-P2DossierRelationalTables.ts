import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CargoItemRowData,
  LegacyDeclarationRow,
  VehicleRowData,
  computeExpectation,
  extractCargoItem,
  extractEnterprise,
  extractQrCode,
  extractSubmittedAt,
  extractVehicle,
  mergeEnterprises,
} from './support/dossier-jsonb-backfill';

/**
 * P2 — tách hồ sơ khỏi cột `jsonb` thành bảng quan hệ (điểm **D2** của kế hoạch).
 *
 * Bảng mới: `enterprises`, `vehicles`, `drivers`, `cargo_items`, `appointments`
 * (`attachments` đã có từ migration trước).
 *
 * ⚠️ RÀNG BUỘC BẮT BUỘC (rủi ro **R2**): migration này **KHÔNG XOÁ** bất kỳ cột `jsonb` nào
 * (`enterprise`, `vehicle`, `cargo`, `forceProgress`, `workflowProgress`, `auditTrail`).
 * Hai nguồn dữ liệu được giữ song song cho tới khi nghiệm thu P2; repository ghi cả hai.
 * Việc gỡ cột `jsonb` phải là một migration riêng, chạy sau khi có biên bản nghiệm thu.
 *
 * Sau khi đổ dữ liệu, migration **đối chiếu số lượng nguồn với đích** và in ra nhật ký. Lệch số
 * là dừng luôn (ném lỗi → TypeORM rollback cả giao dịch) chứ không âm thầm đi tiếp.
 */
export class P2DossierRelationalTables1784073900000 implements MigrationInterface {
  name = 'P2DossierRelationalTables1784073900000';

  private readonly logger = new Logger('P2DossierRelationalTables');

  /** Số dòng mỗi lệnh INSERT/UPDATE gộp — đủ nhỏ để không chạm trần tham số của PostgreSQL. */
  private readonly batchSize = 200;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createTables(queryRunner);
    await this.alterDeclarations(queryRunner);
    await this.backfill(queryRunner);
  }

  // ---------------------------------------------------------------- Schema

  private async createTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enterprises" (
        "id" uuid NOT NULL,
        "tax_code" character varying(32) NOT NULL,
        "name" character varying(200) NOT NULL,
        "representative_name" character varying(160),
        "address" character varying(255),
        "phone" character varying(32),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_enterprises" PRIMARY KEY ("id")
      );
    `);
    // Mã số thuế là khóa tự nhiên: nhiều hồ sơ trỏ về một doanh nghiệp, không cho phép trùng.
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_enterprises_tax_code" ON "enterprises" ("tax_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_enterprises_name" ON "enterprises" ("name")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicles" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "plate_number" character varying(32) NOT NULL,
        "container_number" character varying(64),
        "trailer_number" character varying(64),
        "transport_license_number" character varying(64),
        "vehicle_type" character varying(32),
        "weight_kg" numeric(12,2),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vehicles" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_vehicles_dossier" ON "vehicles" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicles_plate" ON "vehicles" ("plate_number")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicles_container" ON "vehicles" ("container_number")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicles_trailer" ON "vehicles" ("trailer_number")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "drivers" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "full_name" character varying(160) NOT NULL,
        "id_number" character varying(32) NOT NULL,
        "id_type" character varying(32),
        "phone" character varying(32),
        "license_number" character varying(32),
        "nationality" character varying(32),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_drivers" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_drivers_dossier" ON "drivers" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_drivers_id_number" ON "drivers" ("id_number")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cargo_items" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "line_no" integer NOT NULL,
        "description" character varying(500) NOT NULL,
        "hs_code" character varying(32),
        "quantity" numeric(14,3),
        "unit_code" character varying(32),
        "gross_weight_kg" numeric(14,3),
        "quarantine_types" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cargo_items" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cargo_items_dossier" ON "cargo_items" ("dossier_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cargo_items_dossier_line" ON "cargo_items" ("dossier_id", "line_no")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cargo_items_hs_code" ON "cargo_items" ("hs_code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appointments" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "gate_code" character varying(32),
        "lane_code" character varying(32),
        "status" character varying(16) NOT NULL DEFAULT 'SCHEDULED',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_appointments_dossier" ON "appointments" ("dossier_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appointments_scheduled_at" ON "appointments" ("scheduled_at")`,
    );
  }

  private async alterDeclarations(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "enterprise_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "qr_code" character varying(128)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_enterprise" ON "declarations" ("enterprise_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_submitted_at" ON "declarations" ("submitted_at")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_declarations_qr_code" ON "declarations" ("qr_code")`);
  }

  // ---------------------------------------------------------------- Di trú dữ liệu

  private async backfill(queryRunner: QueryRunner): Promise<void> {
    const rows: LegacyDeclarationRow[] = await queryRunner.query(`
      SELECT "id", "code", "status", "enterprise", "enterpriseTaxCode", "vehicle", "plateNumber",
             "containerNumber", "trailerNumber", "cargo", "auditTrail", "createdAt"
      FROM "declarations"
      ORDER BY "createdAt" ASC
    `);

    const expected = computeExpectation(rows);
    if (rows.length === 0) {
      this.logger.log('Không có hồ sơ nào trong bảng "declarations" — bỏ qua bước sao chép dữ liệu.');
      return;
    }

    await this.copyEnterprises(queryRunner, rows);
    await this.copyVehicles(queryRunner, rows);
    await this.copyCargoItems(queryRunner, rows);
    await this.copySubmissionInfo(queryRunner, rows);
    await this.reconcile(queryRunner, expected);
  }

  private async copyEnterprises(queryRunner: QueryRunner, rows: LegacyDeclarationRow[]): Promise<void> {
    const enterprises = [...mergeEnterprises(rows).values()];
    for (const chunk of this.chunk(enterprises)) {
      const params: unknown[] = [];
      const values = chunk
        .map((item) => {
          const base = params.length;
          params.push(randomUUID(), item.taxCode, item.name, item.representativeName, item.address, item.phone);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
        })
        .join(', ');
      await queryRunner.query(
        `INSERT INTO "enterprises" ("id", "tax_code", "name", "representative_name", "address", "phone")
         VALUES ${values}
         ON CONFLICT ("tax_code") DO NOTHING`,
        params,
      );
    }

    // Đọc lại id thật (bản ghi có sẵn từ trước sẽ không bị ghi đè bởi ON CONFLICT DO NOTHING).
    const stored: Array<{ id: string; tax_code: string }> = await queryRunner.query(
      `SELECT "id", "tax_code" FROM "enterprises"`,
    );
    const idByTaxCode = new Map(stored.map((item) => [item.tax_code, item.id]));

    const links = rows
      .map((row) => {
        const enterprise = extractEnterprise(row);
        const enterpriseId = enterprise ? idByTaxCode.get(enterprise.taxCode) : undefined;
        return enterpriseId ? { dossierId: row.id, enterpriseId } : null;
      })
      .filter((link): link is { dossierId: string; enterpriseId: string } => !!link);

    for (const chunk of this.chunk(links)) {
      const params: unknown[] = [];
      const values = chunk
        .map((link) => {
          const base = params.length;
          params.push(link.dossierId, link.enterpriseId);
          return `($${base + 1}::uuid, $${base + 2}::uuid)`;
        })
        .join(', ');
      await queryRunner.query(
        `UPDATE "declarations" AS d SET "enterprise_id" = v.enterprise_id
         FROM (VALUES ${values}) AS v(dossier_id, enterprise_id)
         WHERE d."id" = v.dossier_id`,
        params,
      );
    }
  }

  private async copyVehicles(queryRunner: QueryRunner, rows: LegacyDeclarationRow[]): Promise<void> {
    const vehicles: VehicleRowData[] = rows.map(extractVehicle);
    for (const chunk of this.chunk(vehicles)) {
      const params: unknown[] = [];
      const values = chunk
        .map((item) => {
          const base = params.length;
          params.push(
            randomUUID(),
            item.dossierId,
            item.plateNumber,
            item.containerNumber,
            item.trailerNumber,
            item.transportLicenseNumber,
          );
          return `($${base + 1}, $${base + 2}::uuid, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
        })
        .join(', ');
      await queryRunner.query(
        `INSERT INTO "vehicles" ("id", "dossier_id", "plate_number", "container_number", "trailer_number", "transport_license_number")
         VALUES ${values}
         ON CONFLICT ("dossier_id") DO NOTHING`,
        params,
      );
    }
  }

  private async copyCargoItems(queryRunner: QueryRunner, rows: LegacyDeclarationRow[]): Promise<void> {
    const items: CargoItemRowData[] = rows
      .map(extractCargoItem)
      .filter((item): item is CargoItemRowData => !!item);

    for (const chunk of this.chunk(items)) {
      const params: unknown[] = [];
      const values = chunk
        .map((item) => {
          const base = params.length;
          params.push(
            randomUUID(),
            item.dossierId,
            item.lineNo,
            item.description,
            item.hsCode,
            item.quantity,
            item.grossWeightKg,
            item.quarantineTypes ? JSON.stringify(item.quarantineTypes) : null,
          );
          return `($${base + 1}, $${base + 2}::uuid, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb)`;
        })
        .join(', ');
      await queryRunner.query(
        `INSERT INTO "cargo_items" ("id", "dossier_id", "line_no", "description", "hs_code", "quantity", "gross_weight_kg", "quarantine_types")
         VALUES ${values}`,
        params,
      );
    }
  }

  /** Bổ sung `submitted_at` + `qr_code` cho hồ sơ đã gửi — hai cột này chưa từng tồn tại ở P1. */
  private async copySubmissionInfo(queryRunner: QueryRunner, rows: LegacyDeclarationRow[]): Promise<void> {
    const submissions = rows
      .map((row) => {
        const submittedAt = extractSubmittedAt(row);
        return submittedAt ? { dossierId: row.id, submittedAt, qrCode: extractQrCode(row) } : null;
      })
      .filter((item): item is { dossierId: string; submittedAt: Date; qrCode: string | null } => !!item);

    for (const chunk of this.chunk(submissions)) {
      const params: unknown[] = [];
      const values = chunk
        .map((item) => {
          const base = params.length;
          params.push(item.dossierId, item.submittedAt.toISOString(), item.qrCode);
          return `($${base + 1}::uuid, $${base + 2}::timestamptz, $${base + 3})`;
        })
        .join(', ');
      await queryRunner.query(
        `UPDATE "declarations" AS d SET "submitted_at" = v.submitted_at, "qr_code" = v.qr_code
         FROM (VALUES ${values}) AS v(dossier_id, submitted_at, qr_code)
         WHERE d."id" = v.dossier_id`,
        params,
      );
    }
  }

  /** Đối chiếu nguồn ↔ đích. Lệch là dừng migration để không âm thầm mất dữ liệu. */
  private async reconcile(
    queryRunner: QueryRunner,
    expected: ReturnType<typeof computeExpectation>,
  ): Promise<void> {
    const actual = {
      enterprises: await this.countRows(queryRunner, 'enterprises'),
      vehicles: await this.countRows(queryRunner, 'vehicles'),
      cargoItems: await this.countRows(queryRunner, 'cargo_items'),
      drivers: await this.countRows(queryRunner, 'drivers'),
      appointments: await this.countRows(queryRunner, 'appointments'),
      linkedDeclarations: await this.countScalar(
        queryRunner,
        `SELECT COUNT(*)::int AS count FROM "declarations" WHERE "enterprise_id" IS NOT NULL`,
      ),
      submitted: await this.countScalar(
        queryRunner,
        `SELECT COUNT(*)::int AS count FROM "declarations" WHERE "submitted_at" IS NOT NULL`,
      ),
    };

    this.logger.log(
      [
        'Đối chiếu di trú jsonb → bảng quan hệ:',
        `hồ sơ nguồn = ${expected.declarations}`,
        `doanh nghiệp: cần ${expected.enterprises} / có ${actual.enterprises}`,
        `hồ sơ gắn được doanh nghiệp: cần ${expected.declarations - expected.declarationsWithoutTaxCode} / có ${actual.linkedDeclarations}`,
        `phương tiện: cần ${expected.vehicles} / có ${actual.vehicles}`,
        `dòng hàng: cần ${expected.cargoItems} / có ${actual.cargoItems}`,
        `hồ sơ đã gửi (submitted_at + qr_code): cần ${expected.submitted} / có ${actual.submitted}`,
        `tài xế = ${actual.drivers}, lịch hẹn = ${actual.appointments} (cột jsonb cũ không có hai loại dữ liệu này)`,
      ].join(' · '),
    );

    if (expected.declarationsWithoutTaxCode > 0) {
      this.logger.warn(
        `${expected.declarationsWithoutTaxCode} hồ sơ không suy ra được mã số thuế nên chưa gắn được doanh nghiệp. Cần bổ sung bằng tay, migration cố ý KHÔNG tạo doanh nghiệp giả.`,
      );
    }
    if (expected.declarationsWithoutCargo > 0) {
      this.logger.warn(
        `${expected.declarationsWithoutCargo} hồ sơ không có mô tả hàng hóa trong cột "cargo" nên không sinh dòng hàng nào.`,
      );
    }

    const mismatches: string[] = [];
    if (actual.enterprises < expected.enterprises) mismatches.push('doanh nghiệp');
    if (actual.vehicles < expected.vehicles) mismatches.push('phương tiện');
    if (actual.cargoItems < expected.cargoItems) mismatches.push('dòng hàng');
    if (actual.linkedDeclarations < expected.declarations - expected.declarationsWithoutTaxCode) {
      mismatches.push('liên kết hồ sơ ↔ doanh nghiệp');
    }
    if (actual.submitted < expected.submitted) mismatches.push('thời điểm gửi hồ sơ');

    if (mismatches.length > 0) {
      throw new Error(
        `Di trú dữ liệu hồ sơ bị thiếu ở: ${mismatches.join(', ')}. Migration dừng lại và hoàn tác toàn bộ; cột jsonb vẫn nguyên vẹn.`,
      );
    }
  }

  private async countRows(queryRunner: QueryRunner, table: string): Promise<number> {
    return this.countScalar(queryRunner, `SELECT COUNT(*)::int AS count FROM "${table}"`);
  }

  private async countScalar(queryRunner: QueryRunner, sql: string): Promise<number> {
    const result: Array<{ count: number | string }> = await queryRunner.query(sql);
    return Number(result[0]?.count ?? 0);
  }

  private chunk<T>(items: T[]): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += this.batchSize) {
      chunks.push(items.slice(index, index + this.batchSize));
    }
    return chunks;
  }

  // ---------------------------------------------------------------- Hoàn tác

  /**
   * Đảo ngược thật: xoá 5 bảng mới và 3 cột vừa thêm trên `declarations`.
   * Không mất dữ liệu nghiệp vụ vì toàn bộ nội dung vẫn còn nguyên trong các cột `jsonb` cũ —
   * đó chính là lý do migration `up()` không được phép xoá chúng.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_declarations_qr_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_declarations_submitted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_declarations_enterprise"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "qr_code"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "submitted_at"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "enterprise_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "appointments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cargo_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drivers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprises"`);
  }
}
