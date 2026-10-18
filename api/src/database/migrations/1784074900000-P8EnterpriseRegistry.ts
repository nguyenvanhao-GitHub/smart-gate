import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P8 — registry **lái xe** và **phương tiện** theo doanh nghiệp (mở rộng ngoài SRS).
 *
 * Hai bảng **hoàn toàn mới**: `enterprise_drivers`, `enterprise_vehicles` — danh bạ dùng lại qua
 * nhiều hồ sơ, tách hẳn khỏi các bảng snapshot per-hồ-sơ `drivers`/`vehicles` (KHÔNG đụng tới chúng).
 * Không di trú dữ liệu cũ nên không có bước đối chiếu số bản ghi; phần đối chiếu ở đây là **kiểm đủ
 * 2 bảng và 2 chỉ mục duy nhất**, thiếu là dừng để TypeORM hoàn tác cả giao dịch.
 *
 * ### Hai ràng buộc duy nhất (ở tầng database, không kiểm trong code — tránh khe hở đua)
 *
 * | Chỉ mục | Bảo đảm |
 * |---|---|
 * | `uq_enterprise_drivers_id_number` (enterprise_id, id_number) WHERE id_number IS NOT NULL | Một số giấy tờ chỉ một lái xe trong cùng doanh nghiệp |
 * | `uq_enterprise_vehicles_plate` (enterprise_id, plate_number) | Một biển số chỉ một phương tiện trong cùng doanh nghiệp |
 *
 * Theo nếp của dự án, các bảng mới **không tạo khoá ngoại** (xem `TypeOrmDeclarationRepository`).
 */
export class P8EnterpriseRegistry1784074900000 implements MigrationInterface {
  name = 'P8EnterpriseRegistry1784074900000';

  private readonly logger = new Logger('P8EnterpriseRegistry');

  private readonly tables = ['enterprise_drivers', 'enterprise_vehicles'];
  private readonly uniqueIndexes = ['uq_enterprise_drivers_id_number', 'uq_enterprise_vehicles_plate'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createDrivers(queryRunner);
    await this.createVehicles(queryRunner);
    await this.verify(queryRunner);
  }

  private async createDrivers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enterprise_drivers" (
        "id" uuid NOT NULL,
        "enterprise_id" uuid NOT NULL,
        "full_name" character varying(160) NOT NULL,
        "id_type" character varying(16),
        "id_number" character varying(32),
        "phone" character varying(32),
        "license_number" character varying(32),
        "nationality" character varying(64),
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_enterprise_drivers" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_enterprise_drivers_enterprise" ON "enterprise_drivers" ("enterprise_id")`,
    );
    // Số giấy tờ là duy nhất trong phạm vi một doanh nghiệp; lái xe chưa nhập giấy tờ không bị chặn.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_enterprise_drivers_id_number"
       ON "enterprise_drivers" ("enterprise_id", "id_number") WHERE "id_number" IS NOT NULL`,
    );
  }

  private async createVehicles(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enterprise_vehicles" (
        "id" uuid NOT NULL,
        "enterprise_id" uuid NOT NULL,
        "plate_number" character varying(32) NOT NULL,
        "vehicle_type" character varying(32),
        "weight_kg" integer,
        "transport_license_number" character varying(64),
        "container_number" character varying(32),
        "trailer_number" character varying(32),
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_enterprise_vehicles" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_enterprise_vehicles_enterprise" ON "enterprise_vehicles" ("enterprise_id")`,
    );
    // Biển số là duy nhất trong phạm vi một doanh nghiệp.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_enterprise_vehicles_plate"
       ON "enterprise_vehicles" ("enterprise_id", "plate_number")`,
    );
  }

  /** Thiếu bảng/chỉ mục nào là ném lỗi để TypeORM hoàn tác cả giao dịch. */
  private async verify(queryRunner: QueryRunner): Promise<void> {
    const tables: Array<{ table_name: string }> = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [this.tables],
    );
    const indexes: Array<{ indexname: string }> = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [this.uniqueIndexes],
    );

    this.logger.log(
      `Đối chiếu P8: bảng ${tables.length}/${this.tables.length} · chỉ mục duy nhất ${indexes.length}/${this.uniqueIndexes.length}.`,
    );

    const missingTables = this.tables.filter((name) => !tables.some((row) => row.table_name === name));
    const missingIndexes = this.uniqueIndexes.filter((name) => !indexes.some((row) => row.indexname === name));
    if (missingTables.length > 0 || missingIndexes.length > 0) {
      throw new Error(
        `Migration P8 chưa tạo đủ: bảng [${missingTables.join(', ')}], chỉ mục [${missingIndexes.join(', ')}]. Đã hoàn tác toàn bộ.`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprise_vehicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprise_drivers"`);
  }
}
