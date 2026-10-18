import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { appBadRequest } from '../../../../common/i18n';
import { SystemSetting } from '../../domain/system-setting.entity';
import { findSystemSettingDefinition, normalizeSettingValue } from '../../domain/system-setting.catalog';
import { UpdateSystemSettingsCommand } from '../dto/update-system-settings.command';
import { SystemSettingView } from '../dto/system-setting.view';
import { SYSTEM_SETTING_REPOSITORY, SystemSettingRepository } from '../ports/system-setting.repository';
import { ListSystemSettingsUseCase } from './list-system-settings.use-case';

/**
 * Cập nhật tham số cấu hình hệ thống (BA-092). **Kiểm toàn bộ trước khi ghi** (mã khóa lạ / giá trị
 * sai đều 400) để một lần lưu là "tất cả hoặc không có gì hợp lệ"; chỉ ghi + ghi nhật ký cho các tham
 * số **thật sự đổi giá trị** (bỏ qua dòng gửi lên nhưng trùng giá trị hiện tại, tránh nhật ký rác).
 */
@Injectable()
export class UpdateSystemSettingsUseCase {
  constructor(
    @Inject(SYSTEM_SETTING_REPOSITORY)
    private readonly settings: SystemSettingRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    private readonly list: ListSystemSettingsUseCase,
  ) {}

  async execute(command: UpdateSystemSettingsCommand): Promise<SystemSettingView[]> {
    if (!command.items.length) throw appBadRequest('systemSetting.emptyUpdate');

    // Kiểm hết trước: khóa phải thuộc danh mục, giá trị phải là số nguyên trong khoảng cho phép.
    const normalized = command.items.map((item) => {
      const definition = findSystemSettingDefinition(item.key);
      if (!definition) throw appBadRequest('systemSetting.keyUnknown', { key: item.key });
      const validation = normalizeSettingValue(definition, item.value);
      if (!validation.ok || validation.value === undefined) {
        throw appBadRequest('systemSetting.valueInvalid', {
          key: item.key,
          min: definition.min,
          max: definition.max,
        });
      }
      return { key: definition.key, value: validation.value, defaultValue: definition.defaultValue };
    });

    for (const change of normalized) {
      const existing = await this.settings.findByKey(change.key);
      const currentValue = existing ? existing.value : change.defaultValue;
      if (currentValue === change.value) continue; // Không đổi — bỏ qua để không ghi nhật ký thừa.

      const setting = existing ?? SystemSetting.createDefault(change.key, change.value);
      setting.update(change.value, command.actorId);
      const saved = await this.settings.save(setting);

      await this.audit.record({
        action: 'SYSTEM_SETTINGS_UPDATE',
        targetType: 'SYSTEM_SETTING',
        targetId: change.key,
        before: { key: change.key, value: currentValue },
        after: { key: change.key, value: saved.value },
      });
    }

    return this.list.execute();
  }
}
