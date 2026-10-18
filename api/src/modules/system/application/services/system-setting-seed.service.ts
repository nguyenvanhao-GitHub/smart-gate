import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SYSTEM_SETTING_DEFINITIONS } from '../../domain/system-setting.catalog';
import { SYSTEM_SETTING_REPOSITORY, SystemSettingRepository } from '../ports/system-setting.repository';

/** Ghi giá trị mặc định cho các tham số cấu hình còn thiếu lúc khởi động (idempotent). */
@Injectable()
export class SystemSettingSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemSettingSeedService.name);

  constructor(
    @Inject(SYSTEM_SETTING_REPOSITORY)
    private readonly settings: SystemSettingRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.settings.ensureDefaults(
      SYSTEM_SETTING_DEFINITIONS.map((definition) => ({ key: definition.key, value: definition.defaultValue })),
    );
    this.logger.log(`Đã đồng bộ ${SYSTEM_SETTING_DEFINITIONS.length} tham số cấu hình hệ thống.`);
  }
}
