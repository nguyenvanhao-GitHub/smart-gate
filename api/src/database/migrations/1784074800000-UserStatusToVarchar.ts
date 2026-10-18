import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đổi `users.status` từ enum PostgreSQL sang `varchar(32)`.
 *
 * Vì sao bắt buộc: `users_status_enum` được cố định 2 giá trị `('ACTIVE','LOCKED')` từ
 * `BaselineSchema`. Tính năng F00 (đăng ký tự phục vụ) thêm trạng thái `PENDING` (chờ duyệt);
 * chèn tài khoản mang giá trị đó vào cột enum sẽ **ném `22P02`**. Không thể vá bằng
 * `ALTER TYPE ... ADD VALUE` vì PostgreSQL **không cho dùng giá trị enum mới trong cùng giao
 * dịch** vừa thêm nó, mà migration của TypeORM chạy trong một giao dịch.
 *
 * Cùng lối P3 đã xử lý cho `declarations.status` (`1784074000000`) và `users.role`
 * (`1784074600000`): trạng thái là **dữ liệu**, không phải kiểu dữ liệu.
 *
 * Không mất dữ liệu: enum vốn lưu dưới dạng chuỗi, ép sang `varchar` giữ nguyên giá trị.
 */
export class UserStatusToVarchar1784074800000 implements MigrationInterface {
  name = 'UserStatusToVarchar1784074800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Truy vấn có thể trả về RỖNG khi cột `status` không tồn tại (database dựng bằng `synchronize`,
    // hoặc schema dở dang). Destructure thẳng `const [{ data_type }] = []` sẽ ném TypeError và làm
    // ứng dụng không khởi động được, nên phải đọc qua phần tử đầu tiên.
    const columns = (await queryRunner.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status'`,
    )) as Array<{ data_type: string }>;
    const dataType = columns[0]?.data_type;

    if (dataType === 'USER-DEFINED') {
      // Bỏ default gắn với enum trước khi đổi kiểu, rồi gắn lại default dạng chuỗi.
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
      await queryRunner.query(
        `ALTER TABLE "users" ALTER COLUMN "status" TYPE character varying(32) USING "status"::text`,
      );
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
      await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dựng lại enum từ **chính các giá trị đang có trong bảng** (cộng ACTIVE/LOCKED gốc), không
    // chép cứng — nếu đã có tài khoản mang trạng thái mới thì chép cứng sẽ làm `down()` vỡ.
    const rows = (await queryRunner.query(
      `SELECT DISTINCT "status" FROM "users" WHERE "status" IS NOT NULL`,
    )) as Array<{ status: string }>;
    const values = new Set<string>(['ACTIVE', 'LOCKED']);
    for (const row of rows) values.add(row.status);
    const literal = [...values].map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`CREATE TYPE "users_status_enum" AS ENUM (${literal})`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "status" TYPE "users_status_enum" USING "status"::"users_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
  }
}
