import { ConflictException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DossierQueueTicketIssuer } from '../../../../common/queue/dossier-queue-ticket-issuer.port';
import { FakeNotificationPublisher } from '../../../../common/notifications/testing/fake-notification-publisher';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { WorkflowPolicyService } from '../../../declarations/application/workflow-policy.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import { DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import {
  InMemoryDeclarationRepository,
  makeAccess,
  makeDeclaration,
} from '../../../declarations/testing/declaration.fixture';
import { DispatchAssignment } from '../../../dispatch/domain/dispatch-assignment.entity';
import { FakeFeeSettlement } from '../../../fees/testing/fee.fixture';
import { InMemoryDispatchAssignmentRepository, makeFacilities } from '../../../dispatch/testing/dispatch.fixture';
import { WorkflowInstance } from '../../../workflow/domain/workflow-instance.entity';
import { WorkflowInstanceStatus } from '../../../workflow/domain/workflow.enums';
import { WorkflowProvisioningService } from '../../../workflow/application/services/workflow-provisioning.service';
import { WorkflowRouteService } from '../../../workflow/application/services/workflow-route.service';
import {
  FakeSettingsReader,
  FakeStepDirectory,
  InMemoryWorkflowInstanceRepository,
  makeApprovedInstance,
} from '../../../workflow/testing/workflow.fixture';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision } from '../../domain/gate-event.entity';
import { FakeGateChecklistCatalog, InMemoryGateEventRepository } from '../../testing/gate.fixture';
import { GateEvaluationService } from '../services/gate-evaluation.service';
import { RecordGateEventUseCase } from './record-gate-event.use-case';

const officer = makeAccess({
  userId: 'user-bien-phong',
  roles: [{ code: 'BORDER_GUARD', name: 'Biên phòng', dataScope: DataScopeLevel.ALL }],
  permissions: ['gate.view', 'gate.approve'],
});

/** Cổng ghi nhật ký kiểm toán ghi lại được — kiểm mã hành động và ảnh chụp (BUG-009). */
class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

/**
 * Cổng cấp số ghi lại lời gọi — để kiểm gate **tự cấp số** khi xe qua cổng vào (SRS 4.1) và cơ chế
 * best-effort: bật `shouldThrow` để mô phỏng cấp số lỗi, sự kiện cổng vẫn phải ghi được.
 */
class RecordingQueueIssuer implements DossierQueueTicketIssuer {
  readonly calls: { dossierId: string; actorId: string }[] = [];
  shouldThrow = false;
  async ensureIssued(dossierId: string, actorId: string): Promise<void> {
    if (this.shouldThrow) throw new Error('cố tình lỗi cấp số');
    this.calls.push({ dossierId, actorId });
  }
}

/** Hồ sơ nhập khẩu chưa xử lý gì (chưa có phiên) — dùng làm điểm xuất phát. */
function makeReadyDossier(): Declaration {
  return makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' });
}

/** Phiên nhập đã duyệt hết mọi bước liên ngành, chỉ còn bước cổng — hồ sơ sẵn sàng ra cổng. */
function readyInstance(): WorkflowInstance {
  return makeApprovedInstance('ho-so-1', DeclarationType.IMPORT);
}

function build(declaration: Declaration, instance?: WorkflowInstance) {
  const declarations = new InMemoryDeclarationRepository([declaration]);
  const events = new InMemoryGateEventRepository();
  const assignments = new InMemoryDispatchAssignmentRepository();
  const settlements = new FakeFeeSettlement();
  const instances = new InMemoryWorkflowInstanceRepository();
  if (instance) instances.rows.set(instance.dossierId, instance);
  const routes = new WorkflowRouteService(new FakeStepDirectory());
  const evaluator = new GateEvaluationService(
    new WorkflowPolicyService(instances, routes),
    makeFacilities(),
    new FakeGateChecklistCatalog(),
    events,
    settlements,
  );
  const notifications = new FakeNotificationPublisher();
  const audit = new RecordingAudit();
  const queueIssuer = new RecordingQueueIssuer();
  const useCase = new RecordGateEventUseCase(
    events,
    declarations,
    assignments,
    instances,
    new DossierScopeService(new DataScopeService()),
    evaluator,
    routes,
    new WorkflowProvisioningService(instances, new FakeSettingsReader()),
    notifications,
    audit,
    queueIssuer,
  );
  return { useCase, events, assignments, notifications, settlements, instances, declarations, audit, queueIssuer };
}

/** Checklist đã tích đủ mục bắt buộc. */
const checkedList = [{ code: 'CONG_HO_SO', checked: true }];

/** Ghi một lượt CHO QUA chiều VÀO (cổng A1) — điều kiện tiên quyết để sau đó cho ra. */
function enterGate(useCase: RecordGateEventUseCase, overrides: Partial<any> = {}) {
  return useCase.execute({
    dossierId: 'ho-so-1',
    gateCode: 'A1',
    decision: GateDecision.ALLOW,
    checklist: checkedList,
    actorId: officer.userId,
    access: officer,
    ...overrides,
  });
}

/** Ghi một lượt CHO QUA chiều RA (cổng B1). */
function exitGate(useCase: RecordGateEventUseCase) {
  return useCase.execute({
    dossierId: 'ho-so-1',
    gateCode: 'B1',
    decision: GateDecision.ALLOW,
    checklist: checkedList,
    actorId: officer.userId,
    access: officer,
  });
}

describe('RecordGateEventUseCase (F38, F39)', () => {
  /**
   * ĐIỀU KIỆN NGHIỆM THU CỦA P4: thiếu bất kỳ điều kiện nào thì **không xác nhận cho qua cổng
   * được**, và phản hồi phải liệt kê rõ những gì còn thiếu. Chặn ở API, không phải ẩn nút.
   */
  it('chặn cho qua cổng khi hồ sơ chưa xong nghiệp vụ, kèm danh sách điều kiện còn thiếu', async () => {
    // Hồ sơ mặc định: Hải quan, Biên phòng và phí thuế đều đang chờ.
    const { useCase, events } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

    const error = await useCase
      .execute({
        dossierId: 'ho-so-1',
        gateCode: 'B1',
        decision: GateDecision.ALLOW,
        checklist: checkedList,
        actorId: officer.userId,
        access: officer,
      })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    const body = (error as ConflictException).getResponse() as { message: string; blockingReasons: string[] };
    expect(body.message).toContain('chưa đủ điều kiện qua cổng');
    // Bước còn thiếu được nêu đích danh theo tên bước + lực lượng, đọc từ phiên xử lý thật.
    expect(body.blockingReasons).toEqual(
      expect.arrayContaining([
        'Chưa hoàn thành bước "Biên phòng kiểm tra nghiệp vụ theo chuyên ngành" (Biên phòng).',
        'Chưa hoàn thành bước "Hải quan kiểm tra nghiệp vụ theo chuyên ngành" (Hải quan).',
        'Chưa hoàn thành bước "Thu phí (nếu có)" (Cơ quan thu phí).',
      ]),
    );
    // Không được ghi sự kiện "cho qua" nào khi bị chặn.
    expect(events.rows).toHaveLength(0);
  });


  /** Còn một bước liên ngành chưa duyệt (Hải quan) thì cổng vẫn đóng, và nêu đúng bước còn thiếu. */
  it('còn bước liên ngành chưa hoàn thành thì vẫn chưa được qua cổng', async () => {
    // Duyệt 2/4 bước liên ngành (đến hết Kiểm dịch), còn Hải quan và Thu phí chưa xử lý.
    const { useCase } = build(makeReadyDossier(), makeApprovedInstance('ho-so-1', DeclarationType.IMPORT, 2));

    const error = await useCase
      .execute({
        dossierId: 'ho-so-1',
        gateCode: 'B1',
        decision: GateDecision.ALLOW,
        checklist: checkedList,
        actorId: officer.userId,
        access: officer,
      })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      blockingReasons: [
        'Chưa hoàn thành bước "Hải quan kiểm tra nghiệp vụ theo chuyên ngành" (Hải quan).',
        'Chưa hoàn thành bước "Thu phí (nếu có)" (Cơ quan thu phí).',
      ],
    });
  });

  /**
   * F39 ↔ F48: **tiền phải thật sự vào** thì cổng mới mở. Cờ tiến độ `taxFee`/`economicZoneFee`
   * nói "lực lượng thu phí đã xử lý xong", còn ảnh chụp nghĩa vụ tài chính nói "đã có giao dịch
   * được xác nhận". Hai câu trả lời khác nhau và **cả hai** đều phải đạt.
   */
  it('nghiệp vụ đã xong nhưng phí chưa được xác nhận thanh toán → chặn cho qua cổng', async () => {
    const { useCase, settlements, events } = build(makeReadyDossier(), readyInstance());
    settlements.owes(1_500_000);

    const error = await useCase
      .execute({
        dossierId: 'ho-so-1',
        gateCode: 'B1',
        decision: GateDecision.ALLOW,
        checklist: checkedList,
        actorId: officer.userId,
        access: officer,
      })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      blockingReasons: ['Còn 1500000 VND phí chưa được xác nhận thanh toán.'],
    });
    expect(events.rows).toHaveLength(0);
  });

  it('sau khi xác nhận thanh toán đủ thì chính hồ sơ đó được cho qua', async () => {
    const { useCase, settlements } = build(makeReadyDossier(), readyInstance());
    settlements.owes(1_500_000);
    // Cán bộ xác nhận giao dịch → hồ sơ hết nợ.
    settlements.owes(0);
    await enterGate(useCase);

    const result = await exitGate(useCase);

    expect(result.event.canOpen).toBe(true);
    expect(result.event.blockingReasons).toEqual([]);
  });

  it('từ chối cho qua thì luôn ghi được, và lưu lại đúng những gì còn thiếu', async () => {
    const { useCase, events, audit, declarations } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

    const result = await useCase.execute({
      dossierId: 'ho-so-1',
      gateCode: 'A1',
      decision: GateDecision.DENY,
      note: 'Xe quay đầu bổ sung chứng từ.',
      actorId: officer.userId,
      access: officer,
    });

    expect(result.event.decision).toBe(GateDecision.DENY);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].note).toBe('Xe quay đầu bổ sung chứng từ.');

    // Kiểm tra lưu vết kiểm toán và lịch sử hồ sơ có lý do từ chối
    const auditEntry = audit.entries.find((e) => e.action === 'GATE_EVENT_DENY');
    expect(auditEntry?.after).toMatchObject({ note: 'Xe quay đầu bổ sung chứng từ.' });

    const dossier = await declarations.findById('ho-so-1');
    const lastAction = dossier?.auditTrail[dossier.auditTrail.length - 1];
    expect(lastAction?.note).toContain('Lý do: Xe quay đầu bổ sung chứng từ.');
  });

  /** BUG-020 — lưu tên người thao tác thật để cột "Người xử lý" của nhật ký cổng không còn trống. */
  it('lưu tên người thao tác (actorName) vào sự kiện cổng, không để trống', async () => {
    const { useCase, events } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

    const result = await useCase.execute({
      dossierId: 'ho-so-1',
      gateCode: 'A1',
      decision: GateDecision.DENY,
      note: 'Xe quay đầu bổ sung chứng từ.',
      actorId: officer.userId,
      actorName: 'nvcong',
      access: officer,
    });

    expect(result.event.actorName).toBe('nvcong');
    expect(events.rows[0].actorName).toBe('nvcong');
  });

  it('hồ sơ đã hoàn thành / rời cửa khẩu thì chặn cả ALLOW lẫn DENY', async () => {
    const completedDossier = makeDeclaration({
      id: 'ho-so-completed',
      code: 'IMP-COMPLETED',
      status: DeclarationStatus.COMPLETED,
    });
    const { useCase } = build(completedDossier);

    await expect(
      useCase.execute({
        dossierId: 'ho-so-completed',
        gateCode: 'A1',
        decision: GateDecision.DENY,
        note: 'Từ chối sau khi đã hoàn thành',
        actorId: officer.userId,
        access: officer,
      }),
    ).rejects.toThrow();

    await expect(
      useCase.execute({
        dossierId: 'ho-so-completed',
        gateCode: 'B1',
        decision: GateDecision.DENY,
        note: 'Từ chối sau khi đã hoàn thành',
        actorId: officer.userId,
        access: officer,
      }),
    ).rejects.toThrow();
  });

  it('đủ điều kiện thì ghi sự kiện cho qua và nhả vị trí đang giữ trong bãi', async () => {
    const { useCase, assignments } = build(makeReadyDossier(), readyInstance());
    await assignments.insert(
      DispatchAssignment.assign({
        dossierId: 'ho-so-1',
        gateCode: null,
        laneCode: null,
        yardId: 'khu-a',
        slotCode: 'A01',
        assignedById: 'user-dieu-phoi',
        note: null,
      }),
    );
    await enterGate(useCase);

    const result = await exitGate(useCase);

    expect(result.event.canOpen).toBe(true);
    expect(result.event.statusColor).toBe('GREEN');
    expect(result.event.blockingReasons).toEqual([]);
    expect(assignments.rows[0].isActive).toBe(false);
    expect(assignments.rows[0].releasedAt).not.toBeNull();
  });

  /**
   * LÔ 3 — **đường duy nhất** đặt EXITED: cho qua cổng RA thì khép phiên liên ngành (COMPLETED),
   * hồ sơ chuyển `EXITED` rồi lưu trữ ngay `COMPLETED` (MVP), và nhật ký ghi cả hai mốc.
   */
  it('cho qua cổng ra thì khép phiên và đặt hồ sơ EXITED → COMPLETED', async () => {
    const { useCase, instances, declarations } = build(makeReadyDossier(), readyInstance());
    await enterGate(useCase);

    await exitGate(useCase);

    const instance = await instances.findByDossierId('ho-so-1');
    expect(instance?.status).toBe(WorkflowInstanceStatus.COMPLETED);
    expect(instance?.currentStepCode).toBeNull();

    const declaration = await declarations.findById('ho-so-1');
    expect(declaration?.status).toBe(DeclarationStatus.COMPLETED);
    // Truy vết đủ hai mốc: đã rời cửa khẩu (EXITED) rồi lưu trữ (COMPLETED).
    const trail = declaration?.auditTrail.map((entry) => entry.toStatus) ?? [];
    expect(trail).toContain(DeclarationStatus.EXITED);
    expect(trail).toContain(DeclarationStatus.COMPLETED);
  });

  /**
   * BUG-003 — hồ sơ đã rời cửa khẩu thì **không cho ghi thêm lượt CHO QUA nào nữa**. Trước đây lượt
   * thứ hai vẫn 200 (idempotent), làm KPI/báo cáo lưu lượng đếm trùng một xe nhiều lần.
   */
  it('chặn ghi lượt CHO QUA thứ hai sau khi hồ sơ đã rời cửa khẩu (chống trùng)', async () => {
    const { useCase, instances, declarations, events } = build(makeReadyDossier(), readyInstance());
    await enterGate(useCase);
    await exitGate(useCase); // lượt ra hợp lệ → hồ sơ COMPLETED

    const error = await exitGate(useCase).catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ messageKey: 'gate.alreadyLeft' });

    const declaration = await declarations.findById('ho-so-1');
    expect(declaration?.status).toBe(DeclarationStatus.COMPLETED);
    // Chỉ đúng một mốc EXITED và đúng một sự kiện cổng RA được ghi.
    const exits = declaration?.auditTrail.filter((entry) => entry.toStatus === DeclarationStatus.EXITED) ?? [];
    expect(exits).toHaveLength(1);
    expect(events.rows.filter((row) => row.direction === 'EXIT')).toHaveLength(1);
    expect((await instances.findByDossierId('ho-so-1'))?.status).toBe(WorkflowInstanceStatus.COMPLETED);
  });

  it('chặn cho ra khi chưa từng ghi lượt vào, kèm thông báo rõ nghĩa', async () => {
    const { useCase, events } = build(makeReadyDossier(), readyInstance());

    const error = await exitGate(useCase).catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ messageKey: 'gate.exitBeforeEntry' });
    expect(events.rows).toHaveLength(0);
  });

  it('chặn ghi lượt vào lần thứ hai cho cùng hồ sơ (trùng chiều VÀO)', async () => {
    const { useCase, events } = build(makeReadyDossier(), readyInstance());
    await enterGate(useCase);

    const error = await enterGate(useCase).catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ messageKey: 'gate.duplicateEntry' });
    expect(events.rows.filter((row) => row.direction === 'ENTRY')).toHaveLength(1);
  });

  /**
   * Chống đua ở tầng database: hai yêu cầu cùng ghi CHO QUA một chiều đọc thấy "chưa có ai" ở bước
   * kiểm trình tự, chỉ chỉ mục duy nhất có điều kiện (`23505`) mới chặn được — đổi thành 409.
   */
  it('lỗi trùng chỉ mục duy nhất (23505) khi ghi được đổi thành 409', async () => {
    const { useCase, events } = build(makeReadyDossier(), readyInstance());
    await enterGate(useCase);
    jest.spyOn(events, 'append').mockRejectedValueOnce({ driverError: { code: '23505' } });

    const error = await exitGate(useCase).catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ messageKey: 'gate.duplicatePassage' });
  });

  /** BUG-009 — mỗi lượt qua cổng phải để lại vết kiểm toán bất biến với mã hành động rõ nghĩa. */
  it('ghi audit GATE_EVENT_ALLOW khi cho qua và GATE_EVENT_DENY khi từ chối', async () => {
    const { useCase, audit } = build(makeReadyDossier(), readyInstance());

    await enterGate(useCase);
    const allow = audit.entries.find((entry) => entry.action === 'GATE_EVENT_ALLOW');
    expect(allow).toMatchObject({ targetType: 'DECLARATION', targetId: 'ho-so-1' });
    expect((allow?.after as Record<string, unknown>)?.['direction']).toBe('ENTRY');

    await useCase.execute({
      dossierId: 'ho-so-1',
      gateCode: 'B1',
      decision: GateDecision.DENY,
      note: 'Xe quay đầu bổ sung chứng từ.',
      actorId: officer.userId,
      access: officer,
    });
    expect(audit.entries.some((entry) => entry.action === 'GATE_EVENT_DENY')).toBe(true);
  });

  it('cổng nhập cảnh chỉ đòi hồ sơ còn hiệu lực nên xe vào được dù nghiệp vụ chưa xong', async () => {
    const { useCase, assignments, declarations } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));
    await assignments.insert(
      DispatchAssignment.assign({
        dossierId: 'ho-so-1',
        gateCode: 'A1',
        laneCode: null,
        yardId: null,
        slotCode: null,
        assignedById: 'user-dieu-phoi',
        note: null,
      }),
    );

    const result = await useCase.execute({
      dossierId: 'ho-so-1',
      gateCode: 'A1',
      decision: GateDecision.ALLOW,
      checklist: checkedList,
      actorId: officer.userId,
      access: officer,
    });

    expect(result.event.canOpen).toBe(true);
    expect(result.event.direction).toBe('ENTRY');
    // Cổng vào thì xe chưa rời khu vực nên vị trí vẫn được giữ.
    expect(assignments.rows[0].isActive).toBe(true);
    // Cổng VÀO không đụng trạng thái hồ sơ — không được EXITED.
    expect((await declarations.findById('ho-so-1'))?.status).not.toBe(DeclarationStatus.EXITED);
  });

  /**
   * CR7 — "xác nhận xe vào chỉ ở màn Cổng vào/ra": sự kiện cổng VÀO **khép bước cổng vào** của phiên
   * liên ngành (Biên phòng xác nhận xe vào) và đẩy hồ sơ sang bước kiểm tra liên ngành đầu tiên.
   */
  it('xe qua cổng VÀO khép bước cổng vào của phiên và mở cả cụm nghiệp vụ song song (CR44)', async () => {
    const { useCase, instances, declarations } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

    await enterGate(useCase);

    const instance = await instances.findByDossierId('ho-so-1');
    // Bước cổng vào đã hoàn thành; cả ba bước nghiệp vụ mở song song (Biên phòng/Kiểm dịch/Hải quan).
    expect(instance?.step('IMPORT_B1_ENTRY')?.status).toBe('COMPLETED');
    expect(instance?.activeStepCodes).toEqual(['IMPORT_BORDER', 'IMPORT_QUARANTINE', 'IMPORT_CUSTOMS']);
    // Bước đại diện là bước mở đầu tiên theo thứ tự.
    expect(instance?.currentStepCode).toBe('IMPORT_BORDER');
    // Sau khi xe qua cổng vào và tự cấp số, trạng thái hồ sơ là Chờ gọi (WAITING_CALL); chưa rời cửa khẩu.
    const declaration = await declarations.findById('ho-so-1');
    expect(declaration?.status).toBe(DeclarationStatus.WAITING_CALL);
    expect(declaration?.status).not.toBe(DeclarationStatus.EXITED);
  });

  /**
   * CR2 — nút "Ưu tiên kiểm dịch" ở làn Vào: khép cổng vào **đồng thời** bật cờ dịch tễ trên hồ sơ,
   * nên cụm nghiệp vụ mở ra chỉ có Kiểm dịch (Biên phòng/Hải quan chờ). Cờ một chiều, chỉ áp ENTRY+ALLOW.
   */
  describe('CR2 — ưu tiên kiểm dịch tại cổng vào', () => {
    it('xe qua cổng VÀO có tích "Ưu tiên kiểm dịch" bật cờ dịch tễ và chỉ mở bước Kiểm dịch', async () => {
      const { useCase, instances, declarations } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

      await useCase.execute({
        dossierId: 'ho-so-1',
        gateCode: 'A1',
        decision: GateDecision.ALLOW,
        checklist: checkedList,
        actorId: officer.userId,
        access: officer,
        prioritizeQuarantine: true,
      });

      const declaration = await declarations.findById('ho-so-1');
      expect(declaration?.epidemicFlag).toBe(true);
      // Cụm nghiệp vụ mở ra CHỈ có Kiểm dịch; Biên phòng/Hải quan còn chờ (CR2).
      const instance = await instances.findByDossierId('ho-so-1');
      expect(instance?.activeStepCodes).toEqual(['IMPORT_QUARANTINE']);
    });

    it('không tích thì không bật cờ dịch tễ, cả ba bước nghiệp vụ mở song song', async () => {
      const { useCase, instances, declarations } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

      await enterGate(useCase);

      expect((await declarations.findById('ho-so-1'))?.epidemicFlag).toBe(false);
      expect((await instances.findByDossierId('ho-so-1'))?.activeStepCodes).toEqual([
        'IMPORT_BORDER',
        'IMPORT_QUARANTINE',
        'IMPORT_CUSTOMS',
      ]);
    });

    it('TỪ CHỐI tại cổng vào dù có tích "Ưu tiên kiểm dịch" cũng không bật cờ (chỉ áp ENTRY + ALLOW)', async () => {
      const { useCase, declarations } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

      await useCase.execute({
        dossierId: 'ho-so-1',
        gateCode: 'A1',
        decision: GateDecision.DENY,
        note: 'Xe quay đầu bổ sung chứng từ.',
        actorId: officer.userId,
        access: officer,
        prioritizeQuarantine: true,
      });

      expect((await declarations.findById('ho-so-1'))?.epidemicFlag).toBe(false);
    });
  });

  it('nhớ lại trạng thái checklist của lần ghi trước, không bắt tích lại từ đầu', async () => {
    const { useCase } = build(makeReadyDossier(), readyInstance());
    // Ghi lượt vào (có tích checklist) để đủ điều kiện cho ra sau đó.
    await enterGate(useCase);

    // Lần ra không gửi lại checklist — mục bắt buộc vẫn được coi là đã tích (nhớ từ lượt trước).
    const result = await useCase.execute({
      dossierId: 'ho-so-1',
      gateCode: 'B1',
      decision: GateDecision.ALLOW,
      actorId: officer.userId,
      access: officer,
    });

    expect(result.event.canOpen).toBe(true);
  });

  /**
   * Xe được CHO QUA **cổng vào** → tự cấp số thứ tự để hồ sơ vào ngay bảng Điều phối (SRS 4.1).
   * Chỉ áp cổng VÀO + quyết định CHO QUA; best-effort, không đụng cổng RA / TỪ CHỐI.
   */
  it('xe qua cổng VÀO (ENTRY + ALLOW) thì tự cấp số thứ tự đúng một lần, chuyển trạng thái Chờ gọi và phát thông báo tới Điều phối', async () => {
    const { useCase, queueIssuer, declarations, notifications } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

    await enterGate(useCase);

    expect(queueIssuer.calls).toEqual([{ dossierId: 'ho-so-1', actorId: officer.userId }]);
    const declaration = await declarations.findById('ho-so-1');
    expect(declaration?.status).toBe(DeclarationStatus.WAITING_CALL);

    const statusNotif = notifications.published.find((n) => n.dossierId === 'ho-so-1' && (n.titleKey === 'notification.gateAllowedTitle' || n.title?.includes('đã được cho qua cổng')));
    expect(statusNotif).toBeDefined();
    expect(statusNotif?.titleKey).toBe('notification.gateAllowedTitle');
    expect(statusNotif?.titleParams).toEqual({ plateNumber: '26C-123.45' });
    expect(statusNotif?.content).toBe('Phương tiện của hồ sơ IMP-0001 đã được cho qua cổng.');
    expect(statusNotif?.excludeActorId).toBe(officer.userId);

    const dispatchNotif = notifications.published.find((n) => n.titleKey === 'notification.vehicleWaitingDispatchTitle');
    expect(dispatchNotif).toBeDefined();
    expect(dispatchNotif?.recipientRoleCodes).toEqual(['DISPATCHER']);
    expect(dispatchNotif?.excludeActorId).toBe(officer.userId);
  });

  it('phát thông báo cho qua cổng với đúng định dạng tiêu đề biển số xe và tài khoản cho qua', async () => {
    const declaration = makeDeclaration({
      id: 'ho-so-2',
      code: 'IMP-0002',
      vehicle: { plateNumber: '29C-123.45', driverName: 'Nguyễn Văn A' } as any,
    });
    const { useCase, notifications } = build(declaration);

    await useCase.execute({
      dossierId: 'ho-so-2',
      gateCode: 'A1',
      decision: GateDecision.ALLOW,
      checklist: checkedList,
      actorId: officer.userId,
      actorName: 'bp_officer',
      access: officer,
    });

    const statusNotif = notifications.published.find((n) => n.dossierId === 'ho-so-2' && (n.titleKey === 'notification.gateAllowedTitle' || n.title?.includes('đã được cho qua cổng')));
    expect(statusNotif).toBeDefined();
    expect(statusNotif?.titleKey).toBe('notification.gateAllowedTitle');
    expect(statusNotif?.content).toBe('Phương tiện của hồ sơ IMP-0002 đã được bp_officer cho qua cổng.');
  });

  it('khi xe qua cổng vào bật cờ ưu tiên kiểm dịch, thông báo chờ điều phối chỉ gửi cho Admin, Kiểm dịch và Điều phối (không gửi Biên phòng/Hải quan)', async () => {
    const { useCase, notifications } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

    await enterGate(useCase, { prioritizeQuarantine: true });

    const dispatcherNotif = notifications.published.find((n) => n.recipientRoleCodes?.includes('DISPATCHER'));
    expect(dispatcherNotif).toBeDefined();
    expect(dispatcherNotif?.recipientRoleCodes).toEqual(['SYS_ADMIN', 'ADMIN', 'QUARANTINE', 'DISPATCHER']);
  });

  it('xe qua cổng RA (EXIT) không tự cấp số thứ tự', async () => {
    const { useCase, queueIssuer } = build(makeReadyDossier(), readyInstance());
    await enterGate(useCase); // lượt vào để đủ điều kiện cho ra
    queueIssuer.calls.length = 0; // bỏ lời gọi của lượt vào, chỉ xét lượt ra

    await exitGate(useCase);

    expect(queueIssuer.calls).toHaveLength(0);
  });

  it('từ chối tại cổng vào (DENY) không tự cấp số thứ tự', async () => {
    const { useCase, queueIssuer } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));

    await useCase.execute({
      dossierId: 'ho-so-1',
      gateCode: 'A1',
      decision: GateDecision.DENY,
      note: 'Xe quay đầu bổ sung chứng từ.',
      actorId: officer.userId,
      access: officer,
    });

    expect(queueIssuer.calls).toHaveLength(0);
  });

  /** Best-effort: cấp số lỗi thì chỉ cảnh báo, sự kiện cổng VẪN được ghi thành công. */
  it('cấp số lỗi không làm hỏng việc ghi sự kiện cổng vào', async () => {
    const { useCase, events, queueIssuer } = build(makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' }));
    queueIssuer.shouldThrow = true;

    const result = await enterGate(useCase);

    expect(result.event.direction).toBe('ENTRY');
    expect(result.event.decision).toBe(GateDecision.ALLOW);
    expect(events.rows).toHaveLength(1);
  });
  it('ghi nhận sự kiện cổng vào bằng direction ENTRY và gateCode tổng hợp GATE_ENTRY', async () => {
    const { useCase, events } = build(makeDeclaration({ id: 'ho-so-dir', code: 'IMP-DIR' }));

    const result = await useCase.execute({
      dossierId: 'ho-so-dir',
      gateCode: 'GATE_ENTRY',
      direction: GateDirection.ENTRY,
      decision: GateDecision.ALLOW,
      checklist: checkedList,
      actorId: officer.userId,
      access: officer,
    });

    expect(result.event.direction).toBe(GateDirection.ENTRY);
    expect(result.event.decision).toBe(GateDecision.ALLOW);
    expect(events.rows).toHaveLength(1);
  });
});
