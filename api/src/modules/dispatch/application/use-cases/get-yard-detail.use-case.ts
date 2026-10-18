import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YardDetailView, toYardDetailView } from '../dto/dispatch-view.dto';
import { YARD_MAX_STORAGE_HOURS_ENV, resolveMaxStorageHours } from '../../domain/yard-storage.rules';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';
import { appNotFound } from '../../../../common/i18n';
import { SETTINGS_READER, SettingsReader } from '../../../../common/settings/settings-reader.port';
import { SYSTEM_SETTING_KEYS } from '../../../system/domain/system-setting.catalog';

/** Sơ đồ ô đỗ của một khu bãi (F42, UI-10): ô nào trống, ô nào có xe và xe từ khi nào. */
@Injectable()
export class GetYardDetailUseCase {
  constructor(
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    private readonly config: ConfigService,
    @Inject(SETTINGS_READER)
    private readonly settings: SettingsReader,
  ) {}

  async execute(yardId: string): Promise<YardDetailView> {
    const yard = await this.yards.findYardById(yardId);
    if (!yard) throw appNotFound('yard.notFound');
    const occupants = await this.assignments.findActiveByYard(yard.id);
    const stored = await this.settings.getValue(SYSTEM_SETTING_KEYS.YARD_MAX_STORAGE_HOURS);
    const maxHours = resolveMaxStorageHours(stored ?? this.config.get<string>(YARD_MAX_STORAGE_HOURS_ENV));
    return toYardDetailView(yard, occupants, new Date(), maxHours);
  }
}
