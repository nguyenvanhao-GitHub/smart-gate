import { Inject, Injectable } from '@nestjs/common';
import { SystemSettingView } from '../dto/system-setting.view';
import { SYSTEM_SETTING_DEFINITIONS } from '../../domain/system-setting.catalog';
import { SYSTEM_SETTING_REPOSITORY, SystemSettingRepository } from '../ports/system-setting.repository';

/**
 * Liệt kê toàn bộ tham số cấu hình theo **danh mục cố định** (`SYSTEM_SETTING_DEFINITIONS`), ghép với
 * giá trị đã lưu trong bảng. Tham số chưa từng lưu vẫn hiện ra với giá trị mặc định và `updatedAt = null`
 * để màn hình luôn đủ dòng, không phụ thuộc việc seed đã chạy hay chưa.
 */
@Injectable()
export class ListSystemSettingsUseCase {
  constructor(
    @Inject(SYSTEM_SETTING_REPOSITORY)
    private readonly settings: SystemSettingRepository,
  ) {}

  async execute(): Promise<SystemSettingView[]> {
    const stored = await this.settings.findAll();
    const byKey = new Map(stored.map((item) => [item.key, item]));
    return SYSTEM_SETTING_DEFINITIONS.map((definition) => {
      const row = byKey.get(definition.key);
      return {
        key: definition.key,
        value: row?.value ?? definition.defaultValue,
        valueType: definition.valueType,
        group: definition.group,
        min: definition.min,
        max: definition.max,
        defaultValue: definition.defaultValue,
        updatedAt: row ? row.updatedAt.toISOString() : null,
        updatedById: row?.updatedById ?? null,
      };
    });
  }
}
