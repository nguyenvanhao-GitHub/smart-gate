import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { makeAccess } from '../../../declarations/testing/declaration.fixture';
import { DispatchAssignment } from '../../domain/dispatch-assignment.entity';
import { ParkingSlotStatus } from '../../domain/yard.entity';
import {
  InMemoryDispatchAssignmentRepository,
  InMemoryYardRepository,
  makeYardZone,
} from '../../testing/dispatch.fixture';
import { SetYardSlotLockCommand } from '../dto/assign-dispatch.command';
import { SetYardSlotLockUseCase } from './set-yard-slot-lock.use-case';
import { SettingsReader } from '../../../../common/settings/settings-reader.port';

/** ConfigService giả lập — không cấu hình giờ lưu bãi nên rơi về mặc định 48. */
const config = { get: () => undefined } as unknown as ConfigService;

/** SETTINGS_READER giả lập — chưa lưu cấu hình nên trả null, use-case rơi về config rồi mặc định. */
const settings: SettingsReader = { getValue: async () => null };

const access = makeAccess({
  userId: 'user-quan-ly-bai',
  roles: [{ code: 'QUAN_LY_BAI', name: 'Quản lý bãi', dataScope: DataScopeLevel.ALL }],
  permissions: ['yard.update'],
});

function build() {
  const yards = new InMemoryYardRepository([makeYardZone()]);
  const assignments = new InMemoryDispatchAssignmentRepository();
  const useCase = new SetYardSlotLockUseCase(yards, assignments, config, settings);
  return { yards, assignments, useCase };
}

async function yardId(yards: InMemoryYardRepository): Promise<string> {
  const yard = await yards.findYardByCode('A');
  return yard!.id;
}

function makeCommand(id: string, overrides: Partial<SetYardSlotLockCommand> = {}): SetYardSlotLockCommand {
  return {
    yardId: id,
    slotCode: 'A01',
    lock: true,
    actorId: access.userId,
    access,
    ...overrides,
  };
}

/** F42 — khoá bảo trì / mở lại ô đỗ. */
describe('Khoá và mở lại ô đỗ (F42)', () => {
  it('khoá được ô đang trống: ô chuyển sang isActive = false và hiện MAINTENANCE', async () => {
    const { yards, useCase } = build();
    const id = await yardId(yards);

    const view = await useCase.execute(makeCommand(id, { slotCode: 'A01', lock: true }));

    const yard = await yards.findYardById(id);
    expect(yard!.slots.find((slot) => slot.code === 'A01')!.isActive).toBe(false);
    expect(view.slots.find((slot) => slot.code === 'A01')!.status).toBe(ParkingSlotStatus.MAINTENANCE);
  });

  it('không cho khoá ô ĐANG CÓ XE → 409 yard.slotLockedOccupied', async () => {
    const { yards, assignments, useCase } = build();
    const id = await yardId(yards);
    await assignments.insert(
      DispatchAssignment.assign({
        dossierId: 'ho-so-1',
        gateCode: null,
        laneCode: null,
        yardId: id,
        slotCode: 'A01',
        assignedById: null,
        note: null,
      }),
    );

    await expect(useCase.execute(makeCommand(id, { slotCode: 'A01', lock: true }))).rejects.toBeInstanceOf(
      ConflictException,
    );
    try {
      await useCase.execute(makeCommand(id, { slotCode: 'A01', lock: true }));
    } catch (thrown) {
      expect((thrown as ConflictException).getResponse()).toMatchObject({ messageKey: 'yard.slotLockedOccupied' });
    }
    // Ô vẫn đang khai thác, không bị khoá nhầm.
    const yard = await yards.findYardById(id);
    expect(yard!.slots.find((slot) => slot.code === 'A01')!.isActive).toBe(true);
  });

  it('mở lại ô đang khoá: tìm được cả ô inactive, isActive → true và hiện FREE', async () => {
    const { yards, useCase } = build();
    const id = await yardId(yards);
    await yards.setSlotActive(id, 'A02', false); // giả lập ô đã bị khoá trước đó

    const view = await useCase.execute(makeCommand(id, { slotCode: 'A02', lock: false }));

    const yard = await yards.findYardById(id);
    expect(yard!.slots.find((slot) => slot.code === 'A02')!.isActive).toBe(true);
    expect(view.slots.find((slot) => slot.code === 'A02')!.status).toBe(ParkingSlotStatus.FREE);
  });

  it('mã ô không có trong khu → 404 yard.slotNotFound', async () => {
    const { yards, useCase } = build();
    const id = await yardId(yards);

    await expect(useCase.execute(makeCommand(id, { slotCode: 'A99' }))).rejects.toBeInstanceOf(NotFoundException);
    try {
      await useCase.execute(makeCommand(id, { slotCode: 'A99' }));
    } catch (thrown) {
      expect((thrown as NotFoundException).getResponse()).toMatchObject({ messageKey: 'yard.slotNotFound' });
    }
  });

  it('khu bãi không tồn tại → 404 yard.notFound', async () => {
    const { useCase } = build();

    await expect(useCase.execute(makeCommand('khu-khong-ton-tai'))).rejects.toBeInstanceOf(NotFoundException);
    try {
      await useCase.execute(makeCommand('khu-khong-ton-tai'));
    } catch (thrown) {
      expect((thrown as NotFoundException).getResponse()).toMatchObject({ messageKey: 'yard.notFound' });
    }
  });
});
