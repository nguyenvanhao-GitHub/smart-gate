import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đổi `users.role` từ enum PostgreSQL sang `varchar(32)`.
 *
 * Vì sao bắt buộc: `users_role_enum` được cố định 19 giá trị từ `BaselineSchema`. Mỗi lần bổ sung
 * một vai trò cũ (ví dụ `GATE_OFFICER`, `YARD_MANAGER` — hai vai trò SRS trước đây không có tài
 * khoản nào) thì việc chèn người dùng **ném `22P02`** vì giá trị không thuộc enum. Không thể vá
 * bằng `ALTER TYPE ... ADD VALUE` vì PostgreSQL **không cho dùng giá trị enum mới trong cùng giao
 * dịch** vừa thêm nó, mà migration của TypeORM chạy trong một giao dịch.
 *
 * Đây đúng là cách P3 đã xử lý cho `declarations.status` (`1784074000000-P3WorkflowInstances`) —
 * giữ nhất quán: mã vai trò là **dữ liệu**, không phải kiểu dữ liệu.
 *
 * Không mất dữ liệu: enum vốn được lưu dưới dạng chuỗi, ép sang `varchar` giữ nguyên giá trị.
 */
export class UserRoleToVarchar1784074600000 implements MigrationInterface {
  name = 'UserRoleToVarchar1784074600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Truy vấn có thể trả về RỖNG khi cột `role` không tồn tại — database dựng bằng `synchronize`
    // theo entity hiện tại không còn cột này. Destructure thẳng `const [{ data_type }] = []` sẽ ném
    // TypeError và làm ứng dụng không khởi động được, nên phải đọc qua phần tử đầu tiên.
    const columns = (await queryRunner.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'`,
    )) as Array<{ data_type: string }>;
    const dataType = columns[0]?.data_type;

    if (dataType === 'USER-DEFINED') {
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE character varying(32) USING "role"::text`);
      await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dựng lại enum từ **chính các giá trị đang có trong bảng**, không chép cứng danh sách cũ —
    // nếu đã có tài khoản mang vai trò mới thì chép cứng sẽ làm `down()` vỡ.
    const rows = (await queryRunner.query(
      `SELECT DISTINCT "role" FROM "users" WHERE "role" IS NOT NULL ORDER BY "role"`,
    )) as Array<{ role: string }>;
    const values = rows.map((row) => `'${row.role.replace(/'/g, "''")}'`).join(', ');
    if (!values) return;

    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM (${values})`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING "role"::"users_role_enum"`,
    );
  }
}
