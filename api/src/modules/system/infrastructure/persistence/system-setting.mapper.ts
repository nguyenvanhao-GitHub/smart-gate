import { SystemSetting } from '../../domain/system-setting.entity';
import { SystemSettingOrmEntity } from './system-setting.orm-entity';

export class SystemSettingMapper {
  static toDomain(row: SystemSettingOrmEntity): SystemSetting {
    return new SystemSetting(row.key, row.value, row.updatedAt, row.updatedById);
  }

  static toPersistence(setting: SystemSetting): SystemSettingOrmEntity {
    const row = new SystemSettingOrmEntity();
    row.key = setting.key;
    row.value = setting.value;
    row.updatedAt = setting.updatedAt;
    row.updatedById = setting.updatedById;
    return row;
  }
}
