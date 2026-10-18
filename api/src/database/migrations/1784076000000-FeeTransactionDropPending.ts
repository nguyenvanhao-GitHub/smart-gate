import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ hẳn trạng thái `PENDING` của **giao dịch thu phí** (`fee_transactions.status`).
 *
 * Quyết định chủ dự án: gộp cơ chế hai bước "ghi nhận (`PENDING`) → xác nhận (`CONFIRMED`)" của giao
 * dịch phí về **một bước nguyên tử** — mọi lần thu ghi thẳng ở `CONFIRMED`. Cấu hình vai trò không
 * tách người thu với người duyệt nên hai bước không tạo kiểm soát gì, chỉ sinh giao dịch `PENDING`
 * **treo** làm kẹt hồ sơ.
 *
 * `up()` làm hai việc:
 *  1. **XOÁ** mọi giao dịch còn treo `PENDING` (theo quyết định chủ dự án — không chuyển thành
 *     `CONFIRMED`, vì chúng chưa được xác nhận là đã nhận đủ tiền).
 *  2. Đổi **default** cột `status` từ `'PENDING'` sang `'CONFIRMED'` cho khớp với việc giao dịch mới
 *     luôn ghi thẳng ở trạng thái đã xác nhận.
 *
 * ⚠️ `down()` chỉ khôi phục **default** `'PENDING'`; **KHÔNG thể phục hồi các dòng đã xoá** — phần dữ
 * liệu của migration này là **không đảo ngược được**.
 */
export class FeeTransactionDropPending1784076000000 implements MigrationInterface {
  name = 'FeeTransactionDropPending1784076000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "fee_transactions" WHERE "status" = 'PENDING'`);
    await queryRunner.query(`ALTER TABLE "fee_transactions" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Không khôi phục được các dòng PENDING đã xoá ở up() — chỉ trả lại default cũ.
    await queryRunner.query(`ALTER TABLE "fee_transactions" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
  }
}
