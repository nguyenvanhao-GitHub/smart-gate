import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR37 — bỏ hẳn "Trao đổi, ghi chú" giữa các lực lượng: gỡ endpoint + use-case + port/impl/entity ở
 * tầng ứng dụng, và **DROP bảng `dossier_notes`** ở đây. Được phép xóa vì DB đang được clear, chưa có
 * dữ liệu thật (chủ dự án chốt).
 *
 * `down()` dựng lại đúng khuôn bảng của P3 (xem `1784074000000-P3WorkflowInstances.ts:129-142`) để
 * `migration:check` chạy tiến/lùi/tiến sạch. Không khôi phục dữ liệu vì bảng bị xóa là rỗng.
 */
export class DropDossierNotes1784076500000 implements MigrationInterface {
  name = 'DropDossierNotes1784076500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dossier_notes"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dossier_notes" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "actor_id" uuid NOT NULL,
        "actor_name" character varying(160),
        "agency_code" character varying(32),
        "content" character varying(2000) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dossier_notes" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dossier_notes_dossier" ON "dossier_notes" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dossier_notes_actor" ON "dossier_notes" ("actor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dossier_notes_created_at" ON "dossier_notes" ("created_at")`);
  }
}
