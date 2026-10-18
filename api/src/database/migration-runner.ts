import { Logger } from '@nestjs/common';
import { DataSource, DataSourceOptions, MigrationExecutor } from 'typeorm';

/**
 * Migration được áp dụng lúc khởi động bằng **cơ chế của TypeORM**: `migrations` + `migrationsRun`
 * trong `database.module.ts` (thay cho stage `migrate` của CI — Runner ngoài cụm không nối được DB).
 *
 * Tệp này KHÔNG tham gia việc đó. Nó chỉ xử lý **ghi nhận nền**: đánh dấu migration là đã áp dụng mà
 * không chạy, tương đương `migration:run --fake`, cho database có schema đầy đủ nhưng bảng
 * `migrations` trống (dev/testing dựng bằng `synchronize`). Cần vì lệnh CLI kia phải chạy từ máy nối
 * được tới database, mà database chỉ nối được từ trong cụm.
 *
 * **Chỉ bật bằng tay, KHÔNG tự nhận diện.** Bản đầu đoán "bảng `migrations` trống + đã có bảng
 * `declarations` ⇒ schema đủ" và gây sự cố production 2026-08-01: DB production chỉ có `users` +
 * `declarations` từ bản tháng 6, 20 migration bị đánh dấu đã áp dụng mà chưa hề chạy, app chết ở seed
 * với `relation "catalog_types" does not exist` — và vì bảng `migrations` đã có 20 dòng nên lần khởi
 * động sau cũng không chạy lại. Đây là quyết định của người vận hành, không đoán được từ schema.
 */

/** Khoá tư vấn cấp phiên: nhiều pod cùng khởi động thì chỉ một pod ghi nhận, tránh bản ghi trùng. */
const ADVISORY_LOCK_KEY = 1784070000;

export type EnvReader = (key: string) => string | undefined;

export function shouldRunMigrationsOnStart(read: EnvReader): boolean {
  return (read('DATABASE_MIGRATIONS_RUN') ?? 'true').trim().toLowerCase() !== 'false';
}

export function shouldBaselineMigrations(read: EnvReader): boolean {
  return (read('DATABASE_MIGRATIONS_BASELINE') ?? '').trim().toLowerCase() === 'true';
}

/**
 * Gọi trước khi DataSource của ứng dụng khởi tạo. Có cờ baseline thì ghi nhận; không thì chỉ cảnh
 * báo khi database đã có bảng mà chưa có lịch sử migration.
 */
export async function prepareMigrations(options: DataSourceOptions, read: EnvReader): Promise<void> {
  const logger = new Logger('DatabaseMigrations');
  const dataSource = new DataSource(options);
  await dataSource.initialize();

  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    await queryRunner.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      const executor = new MigrationExecutor(dataSource, queryRunner);
      executor.transaction = 'each';
      // Phải đếm TRƯỚC: ở chế độ `fake`, `executePendingMigrations()` ghi bản ghi rồi `continue` nên
      // mảng nó trả về luôn rỗng (xem MigrationExecutor của TypeORM) — không dùng để đếm được.
      const pending = await executor.getPendingMigrations();
      if (pending.length === 0) return;

      if (!shouldBaselineMigrations(read)) {
        // Sắp chạy migration đầu tiên lên một schema đã tồn tại. Nếu schema đó vốn đầy đủ, việc này
        // vỡ với lỗi rất khó truy (`CREATE TABLE IF NOT EXISTS` bỏ qua bảng đã có, rồi lệnh tạo
        // index ngay sau báo `column "role" does not exist`). Nói trước cho người vận hành.
        const [{ total }] = (await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name <> 'migrations'`,
        )) as Array<{ total: number }>;
        if (total > 0) {
          logger.warn(
            `Database đã có ${total} bảng nhưng chưa ghi nhận migration nào; sắp chạy ${pending.length} ` +
              'migration từ đầu. Nếu schema vốn ĐẦY ĐỦ (dựng bằng synchronize) thì việc này sẽ vỡ — hãy ' +
              'khởi động MỘT lần với DATABASE_MIGRATIONS_BASELINE=true rồi gỡ cờ ra.',
          );
        }
        return;
      }

      executor.fake = true;
      await executor.executePendingMigrations();
      logger.warn(
        `DATABASE_MIGRATIONS_BASELINE=true — đã GHI NHẬN ${pending.length} migration là đã áp dụng mà ` +
          'KHÔNG chạy chúng. Nếu schema thực tế chưa đầy đủ thì đây là thao tác SAI: xoá các bản ghi ' +
          'vừa ghi nhận rồi khởi động lại không kèm cờ này. Gỡ cờ ra sau lần khởi động này.',
      );
    } finally {
      await queryRunner.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}
