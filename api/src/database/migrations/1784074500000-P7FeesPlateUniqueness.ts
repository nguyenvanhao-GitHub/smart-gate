import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { PLATE_BLOCKING_STATUSES } from '../../modules/declarations/domain/plate-uniqueness.rules';

/**
 * P7 — phân hệ thu phí (F46–F48) và chống trùng biển số (F09).
 *
 * Ba bảng **hoàn toàn mới** (`fee_rules`, `fee_charges`, `fee_transactions`) và **một** chỉ mục
 * duy nhất có điều kiện đặt lên bảng `declarations` đang có. **Không xoá cột/bảng nào**, không
 * đụng tới cột `jsonb` cũ (rủi ro R2).
 *
 * ### Tiền không bao giờ là số thực
 * Mọi cột tiền là `numeric(18,2)`, không phải `double precision`. Số thực nhị phân không biểu diễn
 * chính xác được phần thập phân của hệ mười, nên cộng dồn vài chục dòng phí là tổng lệch — mà báo
 * cáo đối soát (F51) phải khớp đến từng đồng.
 *
 * ### Bốn ràng buộc duy nhất — điểm chính của migration này
 *
 * | Chỉ mục | Bảo đảm |
 * |---|---|
 * | `uq_fee_rules_code_from` (code, effective_from) | Một khoản phí chỉ có **một bản cho mỗi ngày hiệu lực** (F46) |
 * | `uq_fee_charges_dossier_rule` (dossier_id, rule_code) | Một hồ sơ không có hai dòng cùng khoản phí |
 * | `uq_fee_transactions_reference` (dossier_id, reference_code) WHERE status <> 'CANCELLED' | Không ghi nhận hai lần cùng một biên lai (F48) |
 * | `uq_declarations_active_plate` (plateNumber) WHERE status đang xử lý | **Một biển số chỉ có một hồ sơ đang xử lý** (F09) |
 *
 * Chỉ mục F09 là **chỉ mục có điều kiện**: hồ sơ nháp, đã hủy, bị từ chối, đã rời cửa khẩu hay
 * hoàn thành đều nằm ngoài điều kiện nên không chặn hồ sơ mới, còn lịch sử vẫn giữ nguyên vẹn.
 * Đặt ở database chứ không kiểm trong mã vì hai yêu cầu chạy song song đều đọc thấy "chưa có ai"
 * trước khi ghi (bài học F27/F29).
 *
 * ⚠️ **Dữ liệu đang có phải sạch trước khi chạy**: nếu database đã tồn tại hai hồ sơ đang xử lý
 * cùng biển số thì `CREATE UNIQUE INDEX` không thể tạo được. Migration **kiểm trước và dừng có
 * thông báo liệt kê đúng các biển số vi phạm** thay vì để PostgreSQL báo lỗi khó hiểu — xử lý dữ
 * liệu (hủy hồ sơ trùng) là quyết định nghiệp vụ, không được làm âm thầm trong migration.
 *
 * `down()` đảo ngược thật: xoá đúng ba bảng và chỉ mục đã tạo.
 */
export class P7FeesPlateUniqueness1784074500000 implements MigrationInterface {
  name = 'P7FeesPlateUniqueness1784074500000';

  private readonly logger = new Logger('P7FeesPlateUniqueness');

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createFeeRules(queryRunner);
    await this.createFeeCharges(queryRunner);
    await this.createFeeTransactions(queryRunner);
    await this.createPlateUniqueness(queryRunner);
    await this.verify(queryRunner);
  }

  // ---------------------------------------------------------------- Biểu phí (F46)

  private async createFeeRules(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_rules" (
        "id" uuid NOT NULL,
        "code" character varying(32) NOT NULL,
        "name" character varying(160) NOT NULL,
        "fee_type" character varying(32) NOT NULL,
        "unit" character varying(16) NOT NULL,
        "amount" numeric(18,2) NOT NULL DEFAULT 0,
        "currency" character varying(8) NOT NULL DEFAULT 'VND',
        "applies_to" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "description" text,
        CONSTRAINT "PK_fee_rules" PRIMARY KEY ("id")
      );
    `);
    // Sửa mức phí = đóng bản cũ + thêm bản mới, nên khóa duy nhất là (mã, ngày hiệu lực từ).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_fee_rules_code_from" ON "fee_rules" ("code", "effective_from")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fee_rules_code" ON "fee_rules" ("code")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fee_rules_effective_from" ON "fee_rules" ("effective_from")`,
    );
  }

  // ---------------------------------------------------------------- Khoản phí của hồ sơ (F47)

  private async createFeeCharges(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_charges" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "rule_id" uuid,
        "rule_code" character varying(32) NOT NULL,
        "name" character varying(160) NOT NULL,
        "unit" character varying(16) NOT NULL,
        "quantity" numeric(18,3) NOT NULL DEFAULT 0,
        "unit_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "amount" numeric(18,2) NOT NULL DEFAULT 0,
        "is_adjusted" boolean NOT NULL DEFAULT false,
        "reason_code" character varying(32),
        "reason_note" character varying(500),
        "adjusted_by_id" uuid,
        "adjusted_at" TIMESTAMP WITH TIME ZONE,
        "calculated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_fee_charges" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_fee_charges_dossier_rule" ON "fee_charges" ("dossier_id", "rule_code")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fee_charges_dossier" ON "fee_charges" ("dossier_id")`);
  }

  // ---------------------------------------------------------------- Giao dịch thu tiền (F48)

  private async createFeeTransactions(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_transactions" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "amount" numeric(18,2) NOT NULL DEFAULT 0,
        "method" character varying(16) NOT NULL,
        "reference_code" character varying(64) NOT NULL,
        "attachment_id" uuid,
        "status" character varying(16) NOT NULL DEFAULT 'PENDING',
        "note" character varying(500),
        "created_by_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "confirmed_by_id" uuid,
        "confirmed_by_name" character varying(160),
        "confirmed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_fee_transactions" PRIMARY KEY ("id")
      );
    `);
    // Mã biên lai duy nhất trong phạm vi hồ sơ; giao dịch đã hủy không chặn ghi nhận lại.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_fee_transactions_reference"
       ON "fee_transactions" ("dossier_id", "reference_code") WHERE "status" <> 'CANCELLED'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fee_transactions_dossier" ON "fee_transactions" ("dossier_id")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fee_transactions_status" ON "fee_transactions" ("status")`);
  }

  // ---------------------------------------------------------------- Chống trùng biển số (F09)

  /** Điều kiện `status IN (...)` dựng từ đúng danh sách trạng thái trong `plate-uniqueness.rules`. */
  private plateCondition(): string {
    const statuses = PLATE_BLOCKING_STATUSES.map((status) => `'${status}'`).join(', ');
    return `"status" IN (${statuses}) AND "plateNumber" IS NOT NULL AND "plateNumber" <> ''`;
  }

  private async createPlateUniqueness(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{ plate: string; count: number }> = await queryRunner.query(
      `SELECT "plateNumber" AS plate, COUNT(*)::int AS count
       FROM "declarations"
       WHERE ${this.plateCondition()}
       GROUP BY "plateNumber"
       HAVING COUNT(*) > 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Migration P7 dừng: đang có ${duplicates.length} biển số nằm trong nhiều hồ sơ chưa kết thúc ` +
          `[${duplicates.map((row) => `${row.plate} × ${row.count}`).join(', ')}]. ` +
          'Hãy hủy/kết thúc các hồ sơ trùng rồi chạy lại — migration không tự sửa dữ liệu nghiệp vụ.',
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_declarations_active_plate"
       ON "declarations" ("plateNumber") WHERE ${this.plateCondition()}`,
    );
  }

  // ---------------------------------------------------------------- Đối chiếu

  /** Thiếu bảng hay thiếu chỉ mục duy nhất là ném lỗi để TypeORM hoàn tác cả giao dịch. */
  private async verify(queryRunner: QueryRunner): Promise<void> {
    const tables = ['fee_rules', 'fee_charges', 'fee_transactions'];
    const uniqueIndexes = [
      'uq_fee_rules_code_from',
      'uq_fee_charges_dossier_rule',
      'uq_fee_transactions_reference',
      'uq_declarations_active_plate',
    ];

    const foundTables: Array<{ table_name: string }> = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [tables],
    );
    const foundIndexes: Array<{ indexname: string }> = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [uniqueIndexes],
    );

    const missingTables = tables.filter((name) => !foundTables.some((row) => row.table_name === name));
    const missingIndexes = uniqueIndexes.filter((name) => !foundIndexes.some((row) => row.indexname === name));

    this.logger.log(
      `Đối chiếu P7: bảng ${foundTables.length}/${tables.length} · chỉ mục duy nhất ${foundIndexes.length}/${uniqueIndexes.length}.`,
    );

    if (missingTables.length > 0 || missingIndexes.length > 0) {
      throw new Error(
        `Migration P7 chưa tạo đủ: bảng thiếu [${missingTables.join(', ')}], chỉ mục duy nhất thiếu [${missingIndexes.join(', ')}]. Đã hoàn tác toàn bộ.`,
      );
    }
  }

  // ---------------------------------------------------------------- Hoàn tác

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_declarations_active_plate"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_charges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_rules"`);
  }
}
