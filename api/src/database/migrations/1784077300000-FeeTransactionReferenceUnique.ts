import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cập nhật chỉ mục duy nhất `uq_fee_transactions_reference` trên bảng `fee_transactions`.
 *
 * Trước đây, chỉ mục kiểm tra duy nhất trên `(dossier_id, reference_code) WHERE status <> 'CANCELLED'`.
 * Khi thu tiền mặt (CASH), `reference_code` để trống `""`. Điều này dẫn đến việc thu tiền mặt lần 2
 * bị báo lỗi trùng mã giao dịch rỗng `""`.
 *
 * Chỉ mục mới chỉ áp dụng tính duy nhất khi `reference_code` không rỗng và không NULL.
 */
export class FeeTransactionReferenceUnique1784077300000 implements MigrationInterface {
  name = 'FeeTransactionReferenceUnique1784077300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_fee_transactions_reference"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_fee_transactions_reference"
       ON "fee_transactions" ("dossier_id", "reference_code")
       WHERE "status" <> 'CANCELLED' AND "reference_code" IS NOT NULL AND "reference_code" <> ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_fee_transactions_reference"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_fee_transactions_reference"
       ON "fee_transactions" ("dossier_id", "reference_code")
       WHERE "status" <> 'CANCELLED'`,
    );
  }
}
