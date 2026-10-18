import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loại bỏ các vai trò thừa (`MANAGEMENT`, `FEE_COLLECTOR`) của tài khoản `dieuphoi` trong bảng `user_roles`.
 *
 * Tài khoản `dieuphoi` chỉ thuộc về lực lượng Điều phối viên (`DISPATCHER`). Trước đây, do dữ liệu seed
 * cũ gán gộp 3 vai trò làm `dieuphoi` thừa quyền `workflow.view` (Xử lý liên ngành) từ vai trò Ban quản lý
 * và Thu phí.
 *
 * Migration này dọn dẹp dữ liệu lịch sử trong `user_roles` để tài khoản `dieuphoi` chỉ giữ duy nhất vai trò
 * `DISPATCHER`.
 */
export class CleanDieuPhoiExtraRoles1784077400000 implements MigrationInterface {
  name = 'CleanDieuPhoiExtraRoles1784077400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user_roles" 
      WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "username" = 'dieuphoi')
        AND "role_id" IN (SELECT "id" FROM "roles" WHERE "code" IN ('MANAGEMENT', 'FEE_COLLECTOR'));
    `);
  }

  public async down(): Promise<void> {
    // Không khôi phục lại các vai trò thừa. Nếu cần có thể gán lại tay qua màn quản trị người dùng.
  }
}
