import { BadRequestException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { SystemSetting } from '../../domain/system-setting.entity';
import { SYSTEM_SETTING_KEYS } from '../../domain/system-setting.catalog';
import { SystemSettingRepository } from '../ports/system-setting.repository';
import { ListSystemSettingsUseCase } from './list-system-settings.use-case';
import { UpdateSystemSettingsUseCase } from './update-system-settings.use-case';

class FakeSystemSettingRepository implements SystemSettingRepository {
  readonly rows: SystemSetting[] = [];

  constructor(seed: SystemSetting[] = []) {
    this.rows.push(...seed);
  }

  async findAll(): Promise<SystemSetting[]> {
    return [...this.rows];
  }

  async findByKey(key: string): Promise<SystemSetting | null> {
    return this.rows.find((row) => row.key === key) ?? null;
  }

  async save(setting: SystemSetting): Promise<SystemSetting> {
    const index = this.rows.findIndex((row) => row.key === setting.key);
    if (index >= 0) this.rows[index] = setting;
    else this.rows.push(setting);
    return setting;
  }

  async ensureDefaults(defaults: { key: string; value: string }[]): Promise<void> {
    for (const item of defaults) {
      if (!this.rows.some((row) => row.key === item.key)) {
        this.rows.push(SystemSetting.createDefault(item.key, item.value));
      }
    }
  }
}

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

const YARD_KEY = SYSTEM_SETTING_KEYS.YARD_MAX_STORAGE_HOURS;
const FEE_KEY = SYSTEM_SETTING_KEYS.FEE_PAYMENT_DEADLINE_HOURS;
const FEE_ENABLED_KEY = SYSTEM_SETTING_KEYS.FEE_ENABLED;

function build(seed: SystemSetting[] = []) {
  const repo = new FakeSystemSettingRepository(seed);
  const audit = new RecordingAudit();
  const list = new ListSystemSettingsUseCase(repo);
  const update = new UpdateSystemSettingsUseCase(repo, audit, list);
  return { repo, audit, list, update };
}

function messageKeyOf(error: unknown): string | undefined {
  return ((error as BadRequestException).getResponse() as { messageKey?: string }).messageKey;
}

describe('ListSystemSettingsUseCase — liệt kê tham số cấu hình (BA-092)', () => {
  it('tham số chưa lưu vẫn hiện với giá trị mặc định và updatedAt = null', async () => {
    const { list } = build();

    const views = await list.execute();

    const yard = views.find((view) => view.key === YARD_KEY);
    expect(yard?.value).toBe('48');
    expect(yard?.defaultValue).toBe('48');
    expect(yard?.updatedAt).toBeNull();
    expect(yard?.min).toBe(1);
  });

  it('CR29 — cờ fee.enabled hiện với kiểu boolean và mặc định BẬT (true)', async () => {
    const { list } = build();

    const views = await list.execute();

    const feeEnabled = views.find((view) => view.key === FEE_ENABLED_KEY);
    expect(feeEnabled?.valueType).toBe('boolean');
    expect(feeEnabled?.value).toBe('true');
    expect(feeEnabled?.defaultValue).toBe('true');
  });

  it('ghép giá trị đã lưu vào danh mục', async () => {
    const { list } = build([new SystemSetting(YARD_KEY, '24', new Date('2026-08-01T00:00:00.000Z'), 'admin-1')]);

    const views = await list.execute();

    const yard = views.find((view) => view.key === YARD_KEY);
    expect(yard?.value).toBe('24');
    expect(yard?.updatedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(yard?.updatedById).toBe('admin-1');
  });
});

describe('UpdateSystemSettingsUseCase — cập nhật tham số cấu hình (BA-092)', () => {
  it('lưu giá trị hợp lệ và ghi nhật ký SYSTEM_SETTINGS_UPDATE có ảnh chụp trước/sau', async () => {
    const { repo, audit, update } = build();

    const views = await update.execute({ items: [{ key: YARD_KEY, value: '72' }], actorId: 'admin-1' });

    expect(views.find((view) => view.key === YARD_KEY)?.value).toBe('72');
    expect(repo.rows.find((row) => row.key === YARD_KEY)?.updatedById).toBe('admin-1');
    const entry = audit.entries.find((item) => item.action === 'SYSTEM_SETTINGS_UPDATE');
    expect(entry?.targetType).toBe('SYSTEM_SETTING');
    expect(entry?.targetId).toBe(YARD_KEY);
    expect((entry?.before as { value?: string })?.value).toBe('48');
    expect((entry?.after as { value?: string })?.value).toBe('72');
  });

  it('cập nhật nhiều tham số trong một lần', async () => {
    const { repo, update } = build();

    await update.execute({
      items: [
        { key: YARD_KEY, value: '10' },
        { key: FEE_KEY, value: '96' },
      ],
      actorId: 'admin-1',
    });

    expect(repo.rows.find((row) => row.key === YARD_KEY)?.value).toBe('10');
    expect(repo.rows.find((row) => row.key === FEE_KEY)?.value).toBe('96');
  });

  it('bỏ qua tham số gửi lên nhưng trùng giá trị hiện tại — không ghi nhật ký', async () => {
    const { audit, update } = build();

    await update.execute({ items: [{ key: YARD_KEY, value: '48' }], actorId: 'admin-1' });

    expect(audit.entries).toHaveLength(0);
  });

  it('mã tham số lạ → 400 systemSetting.keyUnknown', async () => {
    const { update } = build();

    let key: string | undefined;
    await update.execute({ items: [{ key: 'khong.tontai', value: '1' }], actorId: 'admin-1' }).catch((error) => {
      key = messageKeyOf(error);
    });

    expect(key).toBe('systemSetting.keyUnknown');
  });

  it.each(['0', '-5', '9999', 'abc', '12.5'])('giá trị "%s" ngoài khoảng/không nguyên → 400 systemSetting.valueInvalid', async (value) => {
    const { update } = build();

    let key: string | undefined;
    await update.execute({ items: [{ key: YARD_KEY, value }], actorId: 'admin-1' }).catch((error) => {
      key = messageKeyOf(error);
    });

    expect(key).toBe('systemSetting.valueInvalid');
  });

  it.each([
    ['false', 'false'],
    ['true', 'true'],
    ['0', 'false'],
    ['1', 'true'],
    ['FALSE', 'false'],
  ])('CR29 — cờ boolean "%s" được chuẩn hoá về "%s"', async (input, stored) => {
    const { update } = build();

    // Đọc từ view trả về: giá trị đổi thì lưu, trùng mặc định (true) thì giữ mặc định — cả hai đều là `stored`.
    const views = await update.execute({ items: [{ key: FEE_ENABLED_KEY, value: input }], actorId: 'admin-1' });

    expect(views.find((view) => view.key === FEE_ENABLED_KEY)?.value).toBe(stored);
  });

  it.each(['2', 'yes', 'bật', ''])('CR29 — giá trị boolean không hợp lệ "%s" → 400 systemSetting.valueInvalid', async (value) => {
    const { update } = build();

    let key: string | undefined;
    await update.execute({ items: [{ key: FEE_ENABLED_KEY, value }], actorId: 'admin-1' }).catch((error) => {
      key = messageKeyOf(error);
    });

    expect(key).toBe('systemSetting.valueInvalid');
  });

  it('danh sách rỗng → 400 systemSetting.emptyUpdate', async () => {
    const { update } = build();

    let key: string | undefined;
    await update.execute({ items: [], actorId: 'admin-1' }).catch((error) => {
      key = messageKeyOf(error);
    });

    expect(key).toBe('systemSetting.emptyUpdate');
  });

  it('kiểm toàn bộ trước khi ghi: một mã lạ làm cả lô bị từ chối, không ghi gì', async () => {
    const { repo, update } = build();

    await update
      .execute({
        items: [
          { key: YARD_KEY, value: '20' },
          { key: 'khong.tontai', value: '1' },
        ],
        actorId: 'admin-1',
      })
      .catch(() => undefined);

    // Không có bản ghi nào được lưu vì lô bị từ chối ngay ở bước kiểm.
    expect(repo.rows).toHaveLength(0);
  });
});
