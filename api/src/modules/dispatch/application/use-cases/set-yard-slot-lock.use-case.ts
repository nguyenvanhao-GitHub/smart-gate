import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SetYardSlotLockCommand } from '../dto/assign-dispatch.command';
import { YardDetailView, toYardDetailView } from '../dto/dispatch-view.dto';
import { YARD_MAX_STORAGE_HOURS_ENV, resolveMaxStorageHours } from '../../domain/yard-storage.rules';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';
import { appConflict, appNotFound } from '../../../../common/i18n';
import { SETTINGS_READER, SettingsReader } from '../../../../common/settings/settings-reader.port';
import { SYSTEM_SETTING_KEYS } from '../../../system/domain/system-setting.catalog';

/**
 * Khoá (bảo trì) hoặc mở lại một ô đỗ (F42, UI-10). Không cho khoá ô **đang có xe** — phải giải
 * phóng trước (409). Trả về sơ đồ khu sau khi cập nhật để màn hình vẽ lại ngay.
 */
@Injectable()
export class SetYardSlotLockUseCase {
  constructor(
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    private readonly config: ConfigService,
    @Inject(SETTINGS_READER)
    private readonly settings: SettingsReader,
  ) {}

  async execute(command: SetYardSlotLockCommand): Promise<YardDetailView> {
    const yard = await this.yards.findYardById(command.yardId);
    if (!yard) throw appNotFound('yard.notFound');

    // Tìm ô kể cả ô đang khoá (không dùng `hasSlot` vì hàm đó bỏ qua ô `isActive = false`).
    const slot = yard.slots.find((item) => item.code === command.slotCode);
    if (!slot) throw appNotFound('yard.slotNotFound', { yardName: yard.name, slotCode: command.slotCode });

    if (command.lock) {
      const occupied = await this.assignments.findActiveBySlot(yard.id, command.slotCode);
      if (occupied) throw appConflict('yard.slotLockedOccupied', { slotCode: command.slotCode });
    }

    await this.yards.setSlotActive(yard.id, command.slotCode, !command.lock);

    const fresh = (await this.yards.findYardById(yard.id)) ?? yard;
    const occupants = await this.assignments.findActiveByYard(fresh.id);
    const stored = await this.settings.getValue(SYSTEM_SETTING_KEYS.YARD_MAX_STORAGE_HOURS);
    const maxHours = resolveMaxStorageHours(stored ?? this.config.get<string>(YARD_MAX_STORAGE_HOURS_ENV));
    return toYardDetailView(fresh, occupants, new Date(), maxHours);
  }
}
