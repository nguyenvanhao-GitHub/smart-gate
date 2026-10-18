import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SETTINGS_READER } from '../../common/settings/settings-reader.port';
import { SystemController } from './system.controller';
import { SYSTEM_SETTING_REPOSITORY } from './application/ports/system-setting.repository';
import { SystemSettingSeedService } from './application/services/system-setting-seed.service';
import { SystemSettingsReaderService } from './application/services/system-settings-reader.service';
import { ListSystemSettingsUseCase } from './application/use-cases/list-system-settings.use-case';
import { UpdateSystemSettingsUseCase } from './application/use-cases/update-system-settings.use-case';
import { SystemSettingOrmEntity } from './infrastructure/persistence/system-setting.orm-entity';
import { TypeOrmSystemSettingRepository } from './infrastructure/persistence/typeorm-system-setting.repository';
import { SystemSettingsController } from './presentation/http/system-settings.controller';

/**
 * `@Global()` để mọi phân hệ đọc tham số cấu hình qua `SETTINGS_READER` mà không phải import lại
 * module này — giống khuôn `AuditModule`/`NotificationsModule`.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemSettingOrmEntity])],
  controllers: [SystemController, SystemSettingsController],
  providers: [
    { provide: SYSTEM_SETTING_REPOSITORY, useClass: TypeOrmSystemSettingRepository },
    { provide: SETTINGS_READER, useClass: SystemSettingsReaderService },
    SystemSettingSeedService,
    ListSystemSettingsUseCase,
    UpdateSystemSettingsUseCase,
  ],
  exports: [SETTINGS_READER],
})
export class SystemModule {}
