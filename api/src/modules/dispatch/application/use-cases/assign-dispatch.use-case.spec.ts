import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { FakeNotificationPublisher } from '../../../../common/notifications/testing/fake-notification-publisher';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { InMemoryDeclarationRepository, makeAccess, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import {
  InMemoryDispatchAssignmentRepository,
  InMemoryYardRepository,
  makeFacilities,
  makeYardZone,
} from '../../testing/dispatch.fixture';
import { PlacementValidatorService } from '../services/placement-validator.service';
import { AssignDispatchUseCase } from './assign-dispatch.use-case';
import { MoveDispatchUseCase } from './move-dispatch.use-case';
import { ReleaseDispatchUseCase } from './release-dispatch.use-case';

const staff = makeAccess({
  userId: 'user-dieu-phoi',
  roles: [{ code: 'DISPATCHER', name: 'Điều phối viên', dataScope: DataScopeLevel.ALL }],
  permissions: ['dispatch.create', 'dispatch.update', 'dispatch.delete'],
});

/** Ghi vết trong bộ nhớ để test không phụ thuộc nhật ký thật. */
class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

function build(blindPreChecks = false) {
  const declarations = new InMemoryDeclarationRepository([
    // Hồ sơ xuất: cổng ra B1 (EXIT) đúng chiều luồng — khớp luật chặn gán ngược chiều (nhóm B).
    makeDeclaration({ id: 'ho-so-1', code: 'EXP-0001', type: DeclarationType.EXPORT }),
    makeDeclaration({ id: 'ho-so-2', code: 'EXP-0002', type: DeclarationType.EXPORT }),
    // Hồ sơ nhập: chỉ hợp lệ với cổng vào A1 (ENTRY) — dùng cho ca "đúng chiều" của nhóm B.
    makeDeclaration({ id: 'ho-so-3', code: 'IMP-0003', type: DeclarationType.IMPORT }),
  ]);
  const assignments = new InMemoryDispatchAssignmentRepository(blindPreChecks);
  const yards = new InMemoryYardRepository([makeYardZone()]);
  const placements = new PlacementValidatorService(makeFacilities(), yards);
  const scope = new DossierScopeService(new DataScopeService());

  const notifications = new FakeNotificationPublisher();
  const audit = new RecordingAudit();

  return {
    assignments,
    yards,
    notifications,
    audit,
    assign: new AssignDispatchUseCase(assignments, declarations, scope, placements, notifications, audit),
    move: new MoveDispatchUseCase(assignments, declarations, scope, placements, notifications, audit),
    release: new ReleaseDispatchUseCase(assignments, declarations, scope, audit),
  };
}

async function yardId(yards: InMemoryYardRepository): Promise<string> {
  const yard = await yards.findYardByCode('A');
  return yard!.id;
}

/** Rút `messageKey` từ body lỗi của AppException (appBadRequest…) để khẳng định đúng khóa i18n. */
function messageKeyOf(error: unknown): string | undefined {
  const response = (error as BadRequestException)?.getResponse?.();
  return response && typeof response === 'object' ? (response as { messageKey?: string }).messageKey : undefined;
}

describe('Điều phối vị trí (F29, F31, F43)', () => {
  it('gán được cổng và làn cho một xe', async () => {
    const { assign } = build();

    const view = await assign.execute({
      dossierId: 'ho-so-1',
      gateCode: 'B1',
      laneCode: 'B1-1',
      actorId: staff.userId,
      access: staff,
    });

    expect(view.gateCode).toBe('B1');
    expect(view.laneCode).toBe('B1-1');
    expect(view.status).toBe('ACTIVE');
  });

  /** ĐIỀU KIỆN NGHIỆM THU: một xe không được nằm ở hai vị trí. */
  it('xe đã có vị trí thì không gán thêm vị trí thứ hai', async () => {
    const { assign, yards } = build();
    const id = await yardId(yards);
    await assign.execute({ dossierId: 'ho-so-1', yardId: id, slotCode: 'A01', actorId: staff.userId, access: staff });

    await expect(
      assign.execute({ dossierId: 'ho-so-1', yardId: id, slotCode: 'A02', actorId: staff.userId, access: staff }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  /** Cùng luật trên, nhưng hai yêu cầu **song song**: lớp kiểm trước không thấy nhau. */
  it('hai yêu cầu song song cho cùng một xe vẫn bị ràng buộc dữ liệu chặn', async () => {
    const { assign, assignments, yards } = build(true);
    const id = await yardId(yards);

    const results = await Promise.allSettled([
      assign.execute({ dossierId: 'ho-so-1', yardId: id, slotCode: 'A01', actorId: staff.userId, access: staff }),
      assign.execute({ dossierId: 'ho-so-1', yardId: id, slotCode: 'A02', actorId: staff.userId, access: staff }),
    ]);

    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(assignments.rows.filter((row) => row.isActive)).toHaveLength(1);
  });

  /** ĐIỀU KIỆN NGHIỆM THU: một ô đỗ không chứa hai xe. */
  it('ô đỗ đang có xe thì xe khác không vào được', async () => {
    const { assign, yards } = build();
    const id = await yardId(yards);
    await assign.execute({ dossierId: 'ho-so-1', yardId: id, slotCode: 'A01', actorId: staff.userId, access: staff });

    await expect(
      assign.execute({ dossierId: 'ho-so-2', yardId: id, slotCode: 'A01', actorId: staff.userId, access: staff }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hai yêu cầu song song vào cùng một ô đỗ: chỉ một cái thành công', async () => {
    const { assign, assignments, yards } = build(true);
    const id = await yardId(yards);

    const results = await Promise.allSettled([
      assign.execute({ dossierId: 'ho-so-1', yardId: id, slotCode: 'A01', actorId: staff.userId, access: staff }),
      assign.execute({ dossierId: 'ho-so-2', yardId: id, slotCode: 'A01', actorId: staff.userId, access: staff }),
    ]);

    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(assignments.rows.filter((row) => row.isActive && row.slotCode === 'A01')).toHaveLength(1);
  });

  it('giải phóng xong thì ô đỗ nhận được xe khác', async () => {
    const { assign, release, yards } = build();
    const id = await yardId(yards);
    const first = await assign.execute({
      dossierId: 'ho-so-1',
      yardId: id,
      slotCode: 'A01',
      actorId: staff.userId,
      access: staff,
    });

    await release.execute({ assignmentId: first.id, actorId: staff.userId, access: staff });
    const second = await assign.execute({
      dossierId: 'ho-so-2',
      yardId: id,
      slotCode: 'A01',
      actorId: staff.userId,
      access: staff,
    });

    expect(second.slotCode).toBe('A01');
    expect(second.status).toBe('ACTIVE');
  });

  it('chuyển vị trí sang ô còn trống thì được, sang ô đã có xe thì bị chặn', async () => {
    const { assign, move, yards } = build();
    const id = await yardId(yards);
    const first = await assign.execute({
      dossierId: 'ho-so-1',
      yardId: id,
      slotCode: 'A01',
      actorId: staff.userId,
      access: staff,
    });
    await assign.execute({ dossierId: 'ho-so-2', yardId: id, slotCode: 'A02', actorId: staff.userId, access: staff });

    const moved = await move.execute({ assignmentId: first.id, slotCode: 'A03', actorId: staff.userId, access: staff });
    expect(moved.slotCode).toBe('A03');

    await expect(
      move.execute({ assignmentId: first.id, slotCode: 'A02', actorId: staff.userId, access: staff }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('chặn vị trí không hợp lệ: ô đỗ không có trong khu, làn không thuộc cổng, không chọn gì', async () => {
    const { assign, yards } = build();
    const id = await yardId(yards);

    await expect(
      assign.execute({ dossierId: 'ho-so-1', yardId: id, slotCode: 'A99', actorId: staff.userId, access: staff }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      assign.execute({ dossierId: 'ho-so-1', gateCode: 'B1', laneCode: 'A1-1', actorId: staff.userId, access: staff }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(assign.execute({ dossierId: 'ho-so-1', actorId: staff.userId, access: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('không cho gán vào cổng đang tạm ngừng khai thác', async () => {
    const { assign } = build();
    await expect(
      assign.execute({ dossierId: 'ho-so-1', gateCode: 'B9', actorId: staff.userId, access: staff }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Nhóm B — chặn gán/chuyển cổng ngược chiều luồng của hồ sơ', () => {
  it('gán hồ sơ XUẤT vào cổng chiều VÀO (ENTRY) → 400 gateDirectionMismatch', async () => {
    const { assign } = build();

    const error = await assign
      .execute({ dossierId: 'ho-so-1', gateCode: 'A1', laneCode: 'A1-1', actorId: staff.userId, access: staff })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(messageKeyOf(error)).toBe('dispatch.gateDirectionMismatch');
  });

  it('gán hồ sơ NHẬP vào cổng chiều VÀO (ENTRY) → OK', async () => {
    const { assign } = build();

    const view = await assign.execute({
      dossierId: 'ho-so-3',
      gateCode: 'A1',
      laneCode: 'A1-1',
      actorId: staff.userId,
      access: staff,
    });

    expect(view.gateCode).toBe('A1');
    expect(view.status).toBe('ACTIVE');
  });

  it('chuyển hồ sơ XUẤT từ cổng RA sang cổng VÀO (ENTRY) → 400 gateDirectionMismatch', async () => {
    const { assign, move } = build();
    const first = await assign.execute({
      dossierId: 'ho-so-1',
      gateCode: 'B1',
      laneCode: 'B1-1',
      actorId: staff.userId,
      access: staff,
    });

    const error = await move
      .execute({ assignmentId: first.id, gateCode: 'A1', laneCode: 'A1-1', actorId: staff.userId, access: staff })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(messageKeyOf(error)).toBe('dispatch.gateDirectionMismatch');
  });

  it('chuyển hồ sơ NHẬP đang trong bãi sang thêm cổng VÀO (ENTRY) đúng chiều → OK', async () => {
    const { assign, move, yards } = build();
    const id = await yardId(yards);
    const first = await assign.execute({
      dossierId: 'ho-so-3',
      yardId: id,
      slotCode: 'A01',
      actorId: staff.userId,
      access: staff,
    });

    const moved = await move.execute({
      assignmentId: first.id,
      gateCode: 'A1',
      laneCode: 'A1-1',
      actorId: staff.userId,
      access: staff,
    });

    expect(moved.gateCode).toBe('A1');
  });
});

describe('Ghi vết điều phối vào nhật ký kiểm toán (F33)', () => {
  it('gán vị trí ghi audit DISPATCH_ASSIGN, before rỗng, after là vị trí mới', async () => {
    const { assign, audit } = build();

    await assign.execute({ dossierId: 'ho-so-1', gateCode: 'B1', laneCode: 'B1-1', actorId: staff.userId, access: staff });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'DISPATCH_ASSIGN',
      targetType: 'DECLARATION',
      targetId: 'ho-so-1',
      before: null,
      after: { gate: 'B1', lane: 'B1-1', yard: null, slot: null },
    });
  });

  it('chuyển vị trí ghi audit DISPATCH_MOVE với before là vị trí cũ, after là vị trí mới', async () => {
    const { assign, move, audit, yards } = build();
    const id = await yardId(yards);
    const first = await assign.execute({
      dossierId: 'ho-so-1',
      yardId: id,
      slotCode: 'A01',
      actorId: staff.userId,
      access: staff,
    });

    await move.execute({ assignmentId: first.id, slotCode: 'A03', actorId: staff.userId, access: staff });

    const moveEntry = audit.entries.find((entry) => entry.action === 'DISPATCH_MOVE')!;
    expect(moveEntry).toMatchObject({
      action: 'DISPATCH_MOVE',
      targetType: 'DECLARATION',
      targetId: 'ho-so-1',
      before: { gate: null, lane: null, yard: id, slot: 'A01' },
      after: { gate: null, lane: null, yard: id, slot: 'A03' },
    });
  });

  it('giải phóng ghi audit DISPATCH_RELEASE với before là vị trí cũ, after rỗng', async () => {
    const { assign, release, audit, yards } = build();
    const id = await yardId(yards);
    const first = await assign.execute({
      dossierId: 'ho-so-1',
      yardId: id,
      slotCode: 'A01',
      actorId: staff.userId,
      access: staff,
    });

    await release.execute({ assignmentId: first.id, actorId: staff.userId, access: staff });

    const releaseEntry = audit.entries.find((entry) => entry.action === 'DISPATCH_RELEASE')!;
    expect(releaseEntry).toMatchObject({
      action: 'DISPATCH_RELEASE',
      targetType: 'DECLARATION',
      targetId: 'ho-so-1',
      before: { gate: null, lane: null, yard: id, slot: 'A01' },
      after: null,
    });
  });

  it('giải phóng lần hai (idempotent) không ghi thêm audit', async () => {
    const { assign, release, audit, yards } = build();
    const id = await yardId(yards);
    const first = await assign.execute({
      dossierId: 'ho-so-1',
      yardId: id,
      slotCode: 'A01',
      actorId: staff.userId,
      access: staff,
    });

    await release.execute({ assignmentId: first.id, actorId: staff.userId, access: staff });
    await release.execute({ assignmentId: first.id, actorId: staff.userId, access: staff });

    expect(audit.entries.filter((entry) => entry.action === 'DISPATCH_RELEASE')).toHaveLength(1);
  });
});
