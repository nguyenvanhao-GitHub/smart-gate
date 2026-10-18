import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng `system_settings` — kho tham số cấu hình hệ thống dạng khóa–giá trị (BA-092, màn "Cấu hình
 * hệ thống"). Trước đây các tham số vận hành (số giờ lưu bãi tối đa, hạn thanh toán phí) là hằng đọc
 * từ biến môi trường; nay quản trị viên chỉnh được qua giao diện, giá trị nằm ở bảng này.
 *
 * Thiết kế:
 * - Khoá chính là `key` (mã ASCII trong tập đóng `system-setting.catalog.ts`), không dùng UUID: mỗi
 *   tham số chỉ có đúng một dòng, tra theo khóa.
 * - `value` lưu **dạng chuỗi**; tầng domain ép/kiểm kiểu (số nguyên trong khoảng) khi đọc/ghi.
 * - Không tạo khóa ngoại cho `updated_by_id` — theo quy ước migration của dự án (ORM entity chỉ lưu
 *   id thuần), giống các bảng khác.
 *
 * Giá trị mặc định do `SystemSettingSeedService` ghi ở `onApplicationBootstrap` (idempotent), không
 * seed trong migration để nguồn mặc định chỉ nằm ở một nơi (`SYSTEM_SETTING_DEFINITIONS`).
 */
export class P11SystemSettings1784075900000 implements MigrationInterface {
  name = 'P11SystemSettings1784075900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_settings" (
        "key" character varying(64) NOT NULL,
        "value" character varying(255) NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_by_id" uuid,
        CONSTRAINT "PK_system_settings" PRIMARY KEY ("key")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "system_settings"`);
  }
}
