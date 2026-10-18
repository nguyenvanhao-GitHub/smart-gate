import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ registry lái xe/phương tiện theo doanh nghiệp (`enterprise_drivers`, `enterprise_vehicles` từ
 * P8) — hoàn nguyên hướng "tách màn quản lý riêng".
 *
 * Chủ dự án chốt: lái xe/phương tiện/hàng hóa khai **trong luồng hồ sơ**, KHÔNG phải danh bạ dùng lại
 * (đúng SRS UI-12/UI-13 + template `tao-ho-so-1trang.html`). Toàn bộ FE registry + module backend
 * `enterprises` đã gỡ; hai bảng này thành dữ liệu chết → drop.
 *
 * ⚠️ **Không xóa file P8**: P8 đã được áp lên các môi trường thật (dev/prod ghi vào bảng `migrations`),
 * nên phải **thêm migration mới để hoàn tác**, không được sửa/xóa lịch sử đã áp. `down()` dựng lại 2
 * bảng (sao đúng P8) để `migration:check` chạy tiến/lùi/tiến sạch.
 *
 * Hai bảng này **không di trú dữ liệu** khi tạo (P8) và **không có khoá ngoại trỏ tới**, nên drop an
 * toàn — không ảnh hưởng bảng snapshot per-hồ-sơ `drivers`/`vehicles` hay bảng `enterprises` (P2).
 */
export class DropEnterpriseRegistry1784075000000 implements MigrationInterface {
  name = 'DropEnterpriseRegistry1784075000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprise_vehicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprise_drivers"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_enterprise_drivers_id_number"
       ON "enterprise_drivers" ("enterprise_id", "id_number") WHERE "id_number" IS NOT NULL`,
    );
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
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_enterprise_vehicles_plate"
       ON "enterprise_vehicles" ("enterprise_id", "plate_number")`,
    );
  }
}
