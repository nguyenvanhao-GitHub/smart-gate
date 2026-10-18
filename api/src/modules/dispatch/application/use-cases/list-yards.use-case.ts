import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YardSummaryView } from '../dto/dispatch-view.dto';
import { YARD_MAX_STORAGE_HOURS_ENV, overdueThreshold, resolveMaxStorageHours } from '../../domain/yard-storage.rules';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';
import { SETTINGS_READER, SettingsReader } from '../../../../common/settings/settings-reader.port';
import { SYSTEM_SETTING_KEYS } from '../../../system/domain/system-setting.catalog';

/** Danh sách khu bãi kèm số ô đang có xe và số ô quá hạn lưu bãi (F42). */
@Injectable()
export class ListYardsUseCase {
  constructor(
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    private readonly config: ConfigService,
    @Inject(SETTINGS_READER)
    private readonly settings: SettingsReader,
  ) {}

  async execute(): Promise<YardSummaryView[]> {
    const stored = await this.settings.getValue(SYSTEM_SETTING_KEYS.YARD_MAX_STORAGE_HOURS);
    const maxHours = resolveMaxStorageHours(stored ?? this.config.get<string>(YARD_MAX_STORAGE_HOURS_ENV));
    const [yards, occupied, overdue] = await Promise.all([
      this.yards.listYards(),
      this.assignments.countOccupiedByYard(),
      this.assignments.countOverdueByYard(overdueThreshold(new Date(), maxHours)),
    ]);
    return yards.map((yard) => ({
      id: yard.id,
      code: yard.code,
      name: yard.name,
      capacity: yard.capacity,
      occupied: occupied.get(yard.id) ?? 0,
      overdue: overdue.get(yard.id) ?? 0,
    }));
  }
}
