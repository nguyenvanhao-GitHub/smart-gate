import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvReader, prepareMigrations, shouldRunMigrationsOnStart } from './migration-runner';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const read: EnvReader = (key) => config.get<string>(key);
        const nodeEnv = config.get<string>('NODE_ENV', 'development');
        const syncSetting = config.get<string>('DATABASE_SYNC');
        const migrateOnStart = shouldRunMigrationsOnStart(read);

        const connection = {
          type: 'postgres' as const,
          host: read('DATABASE_HOST') || 'localhost',
          port: Number(read('DATABASE_PORT') || 5432),
          username: read('DATABASE_USER') || 'smart_gate',
          password: read('DATABASE_PASSWORD') || 'smart_gate',
          database: read('DATABASE_NAME') || 'smart_gate',
          // Một cấp và đúng phần mở rộng đang chạy: `migrations/support/` là hàm backfill dùng chung
          // chứ không phải migration, còn `dist` có cả `*.d.ts` mà TypeORM nạp vào là ném lỗi.
          migrations: [join(__dirname, 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js')],
        };

        // Ghi nhận nền khi có `DATABASE_MIGRATIONS_BASELINE=true` — xem `migration-runner.ts`.
        if (migrateOnStart) await prepareMigrations({ ...connection, synchronize: false, logging: false }, read);

        return {
          ...connection,
          autoLoadEntities: true,
          // `synchronize` và migration không được cùng bật: TypeORM sẽ tự sửa schema theo entity ngay
          // sau khi migration vừa đặt nó về đúng trạng thái. Chạy migration thì luôn tắt `synchronize`.
          synchronize: migrateOnStart ? false : syncSetting ? syncSetting === 'true' : nodeEnv !== 'production',
          logging: nodeEnv === 'development',
          // Toàn bộ cơ chế chạy migration lúc khởi động: TypeORM áp dụng migration đang chờ ngay trong
          // `dataSource.initialize()`, trước khi nhận request và trước mọi seed ở `onApplicationBootstrap`.
          migrationsRun: migrateOnStart,
          // Mỗi migration một giao dịch: cái nào hỏng thì những cái trước vẫn giữ nguyên và đã được
          // ghi nhận, lần khởi động sau chạy tiếp từ đúng chỗ hỏng.
          migrationsTransactionMode: 'each' as const,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
