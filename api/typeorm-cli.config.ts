import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * Datasource **chỉ dành cho TypeORM CLI** (`migration:generate` / `migration:run` / `migration:revert`).
 * Runtime của ứng dụng cấu hình trong `src/database/database.module.ts` và **tự chạy migration lúc
 * khởi động** (`migrationsRun: true`); các lệnh CLI ở đây dùng để soạn migration mới.
 *
 * Biến môi trường đọc từ `.env` như ứng dụng; biến đã có sẵn trong shell được ưu tiên, nhờ vậy chạy
 * migration lên một database khác chỉ cần `DATABASE_NAME=... npm run migration:run`.
 */
loadEnv();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  username: process.env.DATABASE_USER || 'smart_gate',
  password: process.env.DATABASE_PASSWORD || 'smart_gate',
  database: process.env.DATABASE_NAME || 'smart_gate',
  entities: ['src/**/*.orm-entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false,
});
