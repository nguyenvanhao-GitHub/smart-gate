import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ hẳn cột `users.role` (và chỉ mục `IDX_users_role`).
 *
 * Từ đây phân quyền là **hoàn toàn động**: nguồn sự thật là bảng `user_roles` / `roles` (RBAC). Cột
 * `role` cũ chỉ còn là giá trị **suy ngược** không ai đọc để phân quyền nữa — token mang `roles[]`,
 * ảnh chụp kiểm toán ghi danh sách vai trò RBAC nối bằng `+`, seed ghi thẳng `user_roles`.
 *
 * ⚠️ **Không mất vết kiểm toán**: các dòng nhật ký/lịch sử hồ sơ **đã có** giữ nguyên giá trị
 * `actor_role` cũ (mã vai trò cũ) — migration này **không** đụng tới chúng, chỉ bỏ cột trên bảng
 * `users`. Cột `users.default_route` được giữ lại (vẫn dùng để điều hướng sau đăng nhập).
 *
 * `down()` dựng lại cột `varchar(32)` cho **NULL** nhưng **không khôi phục dữ liệu**: giá trị cũ có
 * thể suy lại từ `user_roles` qua bảng đối chiếu vai trò (`docs/ROLE-MAPPING.md`) nếu cần.
 */
export class UserRoleColumnDrop1784074700000 implements MigrationInterface {
  name = 'UserRoleColumnDrop1784074700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" character varying(32)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_role" ON "users" ("role")`);
  }
}
