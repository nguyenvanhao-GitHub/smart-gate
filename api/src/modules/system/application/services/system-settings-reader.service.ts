import { Inject, Injectable } from '@nestjs/common';
import { SettingsReader } from '../../../../common/settings/settings-reader.port';
import { SYSTEM_SETTING_REPOSITORY, SystemSettingRepository } from '../ports/system-setting.repository';

/**
 * Hiện thực `SETTINGS_READER` — đọc giá trị tham số cấu hình từ bảng `system_settings`. Consumer ở các
 * phân hệ khác (thu phí, điều phối) inject qua token `SETTINGS_READER` và tự lo fallback về biến môi
 * trường/mặc định khi giá trị `null`.
 */
@Injectable()
export class SystemSettingsReaderService implements SettingsReader {
  constructor(
    @Inject(SYSTEM_SETTING_REPOSITORY)
    private readonly settings: SystemSettingRepository,
  ) {}

  async getValue(key: string): Promise<string | null> {
    const row = await this.settings.findByKey(key);
    return row ? row.value : null;
  }
}
