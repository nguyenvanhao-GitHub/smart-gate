import { SystemSetting } from '../../domain/system-setting.entity';

export const SYSTEM_SETTING_REPOSITORY = Symbol('SYSTEM_SETTING_REPOSITORY');

export interface SystemSettingRepository {
  findAll(): Promise<SystemSetting[]>;
  findByKey(key: string): Promise<SystemSetting | null>;
  save(setting: SystemSetting): Promise<SystemSetting>;
  /** Ghi các giá trị mặc định còn thiếu (idempotent) — dùng cho seed lúc khởi động. */
  ensureDefaults(defaults: { key: string; value: string }[]): Promise<void>;
}
