import { ConflictException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { InMemoryDeclarationRepository, makeAccess, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { DispatchAssignment } from '../../domain/dispatch-assignment.entity';
import { InspectionStatus } from '../../domain/inspection-status.rules';
import { InMemoryDispatchAssignmentRepository } from '../../testing/dispatch.fixture';
import { ChangeInspectionUseCase } from './change-inspection.use-case';

class SilentAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

const staff = makeAccess({
  userId: 'quan-ly-bai',
  roles: [{ code: 'YARD_MANAGER', name: 'Quản lý bãi', dataScope: DataScopeLevel.ALL }],
  permissions: ['yard.update'],
});

async function build() {
  const assignments = new InMemoryDispatchAssignmentRepository();
  const assignment = DispatchAssignment.assign({
    dossierId: 'ho-so-1',
    gateCode: null,
    laneCode: null,
    yardId: 'yard-1',
    slotCode: 'A01',
    assignedById: staff.userId,
    note: null,
  });
  await assignments.insert(assignment);
  const declarations = new InMemoryDeclarationRepository([makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' })]);
  const audit = new SilentAudit();
  const useCase = new ChangeInspectionUseCase(
    assignments,
    declarations,
    new DossierScopeService(new DataScopeService()),
    audit,
  );
  return { useCase, assignment, audit };
}

/** F44 — vòng đời kiểm tra/tập kết ở bãi, chuyển đúng thứ tự và lưu lịch sử. */
describe('Trạng thái kiểm tra ở bãi (F44)', () => {
  it('chuyển đúng bước: chờ kiểm tra → đang kiểm tra, và ghi lịch sử vào nhật ký', async () => {
    const { useCase, assignment, audit } = await build();

    const view = await useCase.execute({
      assignmentId: assignment.id,
      status: InspectionStatus.INSPECTING,
      note: 'Bắt đầu kiểm tra',
      actorId: staff.userId,
      access: staff,
    });

    expect(view.inspectionStatus).toBe(InspectionStatus.INSPECTING);
    expect(view.inspectionUpdatedAt).toBeInstanceOf(Date);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'DISPATCH_INSPECTION_CHANGED',
      before: { inspectionStatus: InspectionStatus.WAITING_INSPECTION },
      after: { inspectionStatus: InspectionStatus.INSPECTING },
    });
  });

  /** ĐIỀU KIỆN NGHIỆM THU: chuyển sai thứ tự bị chặn ở API → 409. */
  it('chuyển sai thứ tự (chờ kiểm tra → hoàn thành, bỏ bước đang kiểm tra) bị chặn 409', async () => {
    const { useCase, assignment } = await build();

    await expect(
      useCase.execute({
        assignmentId: assignment.id,
        status: InspectionStatus.INSPECTION_DONE,
        actorId: staff.userId,
        access: staff,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('đi trọn vòng đời tới sang tải/tập kết', async () => {
    const { useCase, assignment } = await build();
    const steps = [
      InspectionStatus.INSPECTING,
      InspectionStatus.INSPECTION_DONE,
      InspectionStatus.CONSOLIDATING,
    ];

    let last;
    for (const status of steps) {
      last = await useCase.execute({ assignmentId: assignment.id, status, actorId: staff.userId, access: staff });
    }

    expect(last?.inspectionStatus).toBe(InspectionStatus.CONSOLIDATING);
  });
});
