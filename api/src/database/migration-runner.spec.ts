import { shouldBaselineMigrations, shouldRunMigrationsOnStart } from './migration-runner';

const readFrom =
  (env: Record<string, string | undefined>) =>
  (key: string): string | undefined =>
    env[key];

describe('shouldRunMigrationsOnStart', () => {
  it('mặc định bật — dịch vụ tự áp dụng migration lúc khởi động', () => {
    expect(shouldRunMigrationsOnStart(readFrom({}))).toBe(true);
  });

  it('chỉ tắt khi khai đúng "false"; giá trị lạ vẫn coi là bật', () => {
    expect(shouldRunMigrationsOnStart(readFrom({ DATABASE_MIGRATIONS_RUN: 'false' }))).toBe(false);
    expect(shouldRunMigrationsOnStart(readFrom({ DATABASE_MIGRATIONS_RUN: ' FALSE ' }))).toBe(false);
    expect(shouldRunMigrationsOnStart(readFrom({ DATABASE_MIGRATIONS_RUN: '0' }))).toBe(true);
  });
});

describe('shouldBaselineMigrations', () => {
  it('mặc định TẮT — ghi nhận nền là quyết định của người vận hành, không tự đoán', () => {
    // Bản đầu tự nhận diện theo trạng thái schema và đã gây sự cố production 2026-08-01: database
    // chỉ có users + declarations bị coi là "schema đã đủ", 20 migration bị đánh dấu đã áp dụng mà
    // chưa hề chạy. Mặc định phải là TẮT.
    expect(shouldBaselineMigrations(readFrom({}))).toBe(false);
    expect(shouldBaselineMigrations(readFrom({ DATABASE_MIGRATIONS_BASELINE: 'false' }))).toBe(false);
    expect(shouldBaselineMigrations(readFrom({ DATABASE_MIGRATIONS_BASELINE: '1' }))).toBe(false);
  });

  it('chỉ bật khi khai đúng "true"', () => {
    expect(shouldBaselineMigrations(readFrom({ DATABASE_MIGRATIONS_BASELINE: 'true' }))).toBe(true);
    expect(shouldBaselineMigrations(readFrom({ DATABASE_MIGRATIONS_BASELINE: ' TRUE ' }))).toBe(true);
  });
});
