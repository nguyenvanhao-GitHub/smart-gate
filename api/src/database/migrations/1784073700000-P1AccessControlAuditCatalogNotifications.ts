import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema của giai đoạn P1 (kế hoạch MVP mục 3.1 + F04/F05/F06):
 * - 7 bảng RBAC động: `organizations`, `roles`, `permissions`, `role_permissions`, `user_roles`,
 *   `user_assignments`, `workflow_step_roles`.
 * - `audit_logs` (F05), `notifications` (F06), `catalog_types` + `catalog_items` (F04).
 * - 5 cột mới trên `users` và 1 cột mới trên `declarations`.
 *
 * Mọi cột thêm vào bảng đang có dữ liệu đều **nullable, không NOT NULL** — `users` và `declarations`
 * đã có bản ghi thật, thêm cột bắt buộc mà không có default sẽ làm migration fail.
 *
 * Không tạo khoá ngoại: các ORM entity của dự án cố tình chỉ lưu id thuần, không khai
 * `@ManyToOne/@JoinColumn`. Nếu thêm FK ở đây mà entity không khai thì `synchronize` ở môi trường
 * dev sẽ **xoá lại chính những FK đó**, gây lệch schema giữa dev và production. Muốn có FK thì phải
 * khai quan hệ trên entity trước, rồi sinh migration mới.
 */
export class P1AccessControlAuditCatalogNotifications1784073700000 implements MigrationInterface {
  name = 'P1AccessControlAuditCatalogNotifications1784073700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- RBAC động ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(200) NOT NULL,
        "type" character varying(32) NOT NULL DEFAULT 'AGENCY',
        "parent_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_organizations_code" ON "organizations" ("code")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_organizations_parent" ON "organizations" ("parent_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(160) NOT NULL,
        "description" character varying(255),
        "is_system" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_roles_code" ON "roles" ("code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "module" character varying(32) NOT NULL,
        "module_label" character varying(64) NOT NULL,
        "action" character varying(32) NOT NULL,
        "action_label" character varying(64) NOT NULL,
        "name" character varying(160) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_permissions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_permissions_code" ON "permissions" ("code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_permissions_module" ON "permissions" ("module")`);

    // Ma trận vai trò × quyền: khoá chính tổ hợp đã bảo đảm không tick trùng một ô.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        "permission_code" character varying(64) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_role_permissions_code" ON "role_permissions" ("permission_code")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "data_scope" character varying(16) NOT NULL DEFAULT 'OWN',
        "organization_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_roles_user_role" UNIQUE ("user_id", "role_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_roles_user" ON "user_roles" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_roles_role" ON "user_roles" ("role_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_assignments" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "assignment_type" character varying(32) NOT NULL,
        "assignment_value" character varying(64) NOT NULL,
        "label" character varying(160),
        "organization_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_assignments_user_type_value" UNIQUE ("user_id", "assignment_type", "assignment_value")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_assignments_user" ON "user_assignments" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_step_roles" (
        "id" uuid NOT NULL,
        "step_code" character varying(64) NOT NULL,
        "force_code" character varying(32),
        "role_id" uuid NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_step_roles" PRIMARY KEY ("id"),
        CONSTRAINT "uq_workflow_step_roles_step_role" UNIQUE ("step_code", "role_id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_step_roles_step" ON "workflow_step_roles" ("step_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_step_roles_role" ON "workflow_step_roles" ("role_id")`,
    );

    // ---------- Nhật ký kiểm toán (F05) ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "actor_id" uuid,
        "actor_username" character varying(64),
        "actor_role" character varying(32),
        "ip" character varying(64),
        "correlation_id" character varying(64),
        "action" character varying(64) NOT NULL,
        "target_type" character varying(64) NOT NULL,
        "target_id" character varying(64),
        "result" character varying(16) NOT NULL DEFAULT 'SUCCESS',
        "value_before" jsonb,
        "value_after" jsonb,
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      );
    `);
    // Bảng lớn nhanh nhất: mọi truy vấn của GET /audit-logs đều sắp xếp giảm dần theo thời gian.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_occurred_at" ON "audit_logs" ("occurred_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actor_id" ON "audit_logs" ("actor_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actor_username" ON "audit_logs" ("actor_username")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action" ON "audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_target_type" ON "audit_logs" ("target_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_target_id" ON "audit_logs" ("target_id")`);

    // ---------- Thông báo trong hệ thống (F06) ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "type" character varying(48) NOT NULL,
        "title" character varying(200) NOT NULL,
        "content" text NOT NULL,
        "dossier_id" uuid,
        "dossier_code" character varying(32),
        "route" character varying(200),
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_recipient" ON "notifications" ("recipient_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_type" ON "notifications" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_dossier" ON "notifications" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_read_at" ON "notifications" ("read_at")`);
    // Truy vấn nóng nhất: đếm/lọc thông báo chưa đọc của một người nhận.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_recipient_read" ON "notifications" ("recipient_id", "read_at")`,
    );

    // ---------- Danh mục dùng chung (F04) ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "catalog_types" (
        "id" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(160) NOT NULL,
        "description" character varying(255),
        "is_system" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_catalog_types" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_catalog_types_code" ON "catalog_types" ("code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "catalog_items" (
        "id" uuid NOT NULL,
        "type_code" character varying(64) NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(200) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_catalog_items" PRIMARY KEY ("id"),
        CONSTRAINT "uq_catalog_items_type_code" UNIQUE ("type_code", "code")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_items_type" ON "catalog_items" ("type_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_items_status" ON "catalog_items" ("status")`);

    // ---------- Cột mới trên bảng đã có dữ liệu (đều nullable) ----------
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" character varying(160)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_id" uuid`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lock_reason" character varying(255)`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_organization" ON "users" ("organization_id")`);

    await queryRunner.query(`ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "created_by_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_created_by" ON "declarations" ("created_by_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_declarations_created_by"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "created_by_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_organization"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "lock_reason"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "organization_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "catalog_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "catalog_types"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_step_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}
