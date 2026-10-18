import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReleaseYardSlotCommand } from '../dto/assign-dispatch.command';
import { YardDetailView, toYardDetailView } from '../dto/dispatch-view.dto';
import { YARD_MAX_STORAGE_HOURS_ENV, resolveMaxStorageHours } from '../../domain/yard-storage.rules';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';
import { appNotFound } from '../../../../common/i18n';
import { SETTINGS_READER, SettingsReader } from '../../../../common/settings/settings-reader.port';
import { SYSTEM_SETTING_KEYS } from '../../../system/domain/system-setting.catalog';

/**
 * Giải phóng một ô đỗ ngay trên sơ đồ bãi (F44, UI-10). Trả về **sơ đồ khu sau khi giải phóng**
 * để màn hình vẽ lại mà không phải gọi thêm lần nữa.
 */
@Injectable()
export class ReleaseYardSlotUseCase {
  constructor(
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    private readonly config: ConfigService,
    @Inject(SETTINGS_READER)
    private readonly settings: SettingsReader,
  ) {}

  async execute(command: ReleaseYardSlotCommand): Promise<YardDetailView> {
    const yard = await this.yards.findYardById(command.yardId);
    if (!yard) throw appNotFound('yard.notFound');
    if (!yard.hasSlot(command.slotCode)) {
      throw appNotFound('yard.slotNotFound', { yardName: yard.name, slotCode: command.slotCode });
    }

    const occupied = await this.assignments.findActiveBySlot(yard.id, command.slotCode);
    if (occupied) {
      occupied.release();
      await this.assignments.update(occupied);
    }

    const occupants = await this.assignments.findActiveByYard(yard.id);
    const stored = await this.settings.getValue(SYSTEM_SETTING_KEYS.YARD_MAX_STORAGE_HOURS);
    const maxHours = resolveMaxStorageHours(stored ?? this.config.get<string>(YARD_MAX_STORAGE_HOURS_ENV));
    return toYardDetailView(yard, occupants, new Date(), maxHours);
  }
}
