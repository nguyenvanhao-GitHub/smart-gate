import { randomUUID } from 'crypto';
import { elapsedSeconds } from '../../../common/time/elapsed';
import { DeclarationType } from '../../declarations/domain/declaration.enums';
import { QUARANTINE_AGENCY_CODE, WorkflowRoute, WorkflowStage } from './workflow-route';
import {
  WorkflowDecision,
  WorkflowInstanceStatus,
  WorkflowStepStatus,
  advancesToNextStep,
} from './workflow.enums';

/** Một bước trong phiên xử lý — bảng `workflow_instance_steps`. */
export class WorkflowStepState {
  constructor(
    public readonly id: string,
    public readonly stepCode: string,
    public order: number,
    public status: WorkflowStepStatus,
    /** F26 — thời điểm hồ sơ **vào** bước. Null khi chưa tới lượt. */
    public enteredAt: Date | null,
    /** F26 — thời điểm hồ sơ **rời** bước. Null khi đang xử lý. */
    public completedAt: Date | null,
    public actorId: string | null,
    public actorName: string | null,
    public decision: WorkflowDecision | null,
    public reasonCode: string | null,
    public reasonNote: string | null,
  ) {}

  static pending(stepCode: string, order: number): WorkflowStepState {
    return new WorkflowStepState(randomUUID(), stepCode, order, WorkflowStepStatus.PENDING, null, null, null, null, null, null, null);
  }

  /**
   * Thời gian đã trôi qua ở bước (giây). Bước chưa vào thì 0; bước đang xử lý thì tính tới `now`.
   * **Không có ngưỡng SLA** — kế hoạch (điểm D5) chỉ yêu cầu ghi nhận, không cảnh báo.
   */
  elapsedSeconds(now: Date = new Date()): number {
    if (!this.enteredAt) return 0;
    return elapsedSeconds(this.enteredAt, this.completedAt ?? now);
  }
}

export interface WorkflowDecisionInput {
  stepCode: string;
  decision: WorkflowDecision;
  actorId: string;
  actorName: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  at?: Date;
}

/** Phiên xử lý liên ngành của một hồ sơ — bảng `workflow_instances`. Thay cột `workflowProgress` (jsonb). */
export class WorkflowInstance {
  constructor(
    public readonly id: string,
    public readonly dossierId: string,
    public readonly dossierType: DeclarationType,
    public currentStepCode: string | null,
    public status: WorkflowInstanceStatus,
    public startedAt: Date,
    public completedAt: Date | null,
    public steps: WorkflowStepState[],
  ) {}

  /**
   * Mở phiên khi hồ sơ được gửi: dựng đủ các bước của lộ trình, đưa hồ sơ vào bước xử lý đầu tiên.
   *
   * `declarantName` (BUG-049) là tên người/doanh nghiệp đã khai — ghi làm `actorName` cho bước khai
   * báo để mục "Theo dõi trạng thái & lịch sử" hiển thị đúng chủ hồ sơ thay vì rơi về "Hệ thống".
   */
  static start(
    dossierId: string,
    type: DeclarationType,
    route: WorkflowRoute,
    at: Date = new Date(),
    declarantName: string | null = null,
  ): WorkflowInstance {
    const steps = route.steps.map((step) => WorkflowStepState.pending(step.code, step.order));
    const instance = new WorkflowInstance(
      randomUUID(),
      dossierId,
      type,
      null,
      WorkflowInstanceStatus.IN_PROGRESS,
      at,
      null,
      steps,
    );

    // Bước khai báo của doanh nghiệp coi như đã xong ngay khi hồ sơ được gửi — người thao tác chính
    // là người/DN đã khai (BUG-049), không phải hệ thống.
    route.steps
      .filter((step) => step.agencyCode === 'ENTERPRISE')
      .forEach((step) => {
        const state = instance.step(step.code);
        if (!state) return;
        state.status = WorkflowStepStatus.COMPLETED;
        state.enteredAt = at;
        state.completedAt = at;
        state.actorName = declarantName;
      });

    const first = route.firstActionableStep;
    if (first) instance.enterStep(first.code, at);
    else instance.finish(at);
    return instance;
  }

  step(stepCode: string): WorkflowStepState | undefined {
    return this.steps.find((item) => item.stepCode === stepCode);
  }

  get currentStep(): WorkflowStepState | undefined {
    return this.currentStepCode ? this.step(this.currentStepCode) : undefined;
  }

  /**
   * CR44 — **tập bước đang mở** cho lực lượng thao tác (đang xử lý hoặc chờ bổ sung), sắp theo thứ tự
   * lộ trình. Trong cụm nghiệp vụ đây là 2–3 bước song song; ngoài cụm là đúng một bước. `currentStepCode`
   * chỉ là **bước đại diện** (phần tử đầu) để giữ hợp đồng cũ.
   */
  get activeStepCodes(): string[] {
    return [...this.steps]
      .sort((left, right) => left.order - right.order)
      .filter(
        (step) =>
          step.status === WorkflowStepStatus.IN_PROGRESS || step.status === WorkflowStepStatus.WAITING_SUPPLEMENT,
      )
      .map((step) => step.stepCode);
  }

  /** F26 — tổng thời gian hồ sơ nằm trong quy trình (giây). */
  totalElapsedSeconds(now: Date = new Date()): number {
    return elapsedSeconds(this.startedAt, this.completedAt ?? now);
  }

  /** Mở một bước cho lực lượng xử lý và đặt nó làm bước đại diện (dùng khi mở đúng một bước). */
  enterStep(stepCode: string, at: Date = new Date()): void {
    this.openStep(stepCode, at);
    this.currentStepCode = stepCode;
  }

  /** Mở một bước (đang xử lý) — KHÔNG đụng `currentStepCode`; dùng khi mở cả cụm song song. */
  private openStep(stepCode: string, at: Date): void {
    const state = this.step(stepCode);
    if (!state) return;
    if (!state.enteredAt) state.enteredAt = at;
    state.completedAt = null;
    state.status = WorkflowStepStatus.IN_PROGRESS;
  }

  /**
   * Mở **giai đoạn** (tập bước). Cụm nghiệp vụ (INSPECTION) mở song song cả ba bước; các giai đoạn
   * khác chỉ một bước. CR2 — có cờ dịch tễ thì cụm nghiệp vụ chỉ mở Kiểm dịch trước, Biên phòng và
   * Hải quan chờ tới khi Kiểm dịch hoàn thành.
   */
  private openStage(stage: WorkflowStage, route: WorkflowRoute, epidemic: boolean, at: Date): void {
    const steps = route.stepsOfStage(stage);
    const toOpen =
      stage === WorkflowStage.INSPECTION && epidemic
        ? steps.filter((step) => step.agencyCode === QUARANTINE_AGENCY_CODE)
        : steps;
    toOpen.forEach((step) => this.openStep(step.code, at));
    this.recomputeCurrentStep();
  }

  /** Sang **giai đoạn kế tiếp** sau `stepCode`; hết giai đoạn thì khép phiên (COMPLETED). */
  private openNextStageAfter(stepCode: string, route: WorkflowRoute, epidemic: boolean, at: Date): void {
    const stage = route.stageOf(stepCode);
    const next = stage ? route.nextStage(stage) : undefined;
    if (!next) {
      this.finish(at);
      return;
    }
    this.status = WorkflowInstanceStatus.IN_PROGRESS;
    this.openStage(next, route, epidemic, at);
  }

  /** Cả cụm nghiệp vụ (Biên phòng + Kiểm dịch + Hải quan) đã hoàn thành chưa (CR44). */
  private allInspectionCompleted(route: WorkflowRoute): boolean {
    return route.inspectionSteps.every((step) => this.step(step.code)?.status === WorkflowStepStatus.COMPLETED);
  }

  /** `currentStepCode` = bước mở đầu tiên (đại diện) theo thứ tự; không còn bước mở nào thì `null`. */
  private recomputeCurrentStep(): void {
    const byOrder = [...this.steps].sort((left, right) => left.order - right.order);
    const active =
      byOrder.find((step) => step.status === WorkflowStepStatus.IN_PROGRESS) ??
      byOrder.find((step) => step.status === WorkflowStepStatus.WAITING_SUPPLEMENT);
    this.currentStepCode = active?.stepCode ?? null;
  }

  /**
   * Ghi quyết định lên **một bước đang mở** và chuyển tập bước mở/trạng thái phiên (CR44/CR2).
   * Việc kiểm **đúng thứ tự** và **đúng vai trò** nằm ở `workflow-order.rules.ts`, phải chạy trước;
   * hàm này chỉ ghi nhận kết quả.
   *
   * - **REJECT**: một lực lượng từ chối → cả hồ sơ REJECTED (luật #3).
   * - **REQUEST_SUPPLEMENT** trong cụm nghiệp vụ: chỉ bước đó chờ bổ sung (per-step), 2 bước kia vẫn
   *   chạy nên phiên KHÔNG chuyển sang WAITING_SUPPLEMENT (luật #2). Ngoài cụm (bước đơn) thì cả phiên
   *   chờ bổ sung như cũ.
   * - **APPROVE** bước nghiệp vụ: khép bước đó; dịch tễ + vừa xong Kiểm dịch → mở Biên phòng/Hải quan;
   *   chỉ khi **cả cụm** hoàn thành mới sang giai đoạn kế (thu phí). APPROVE bước đơn → sang giai đoạn kế.
   */
  applyDecision(input: WorkflowDecisionInput, route: WorkflowRoute, epidemic = false): void {
    const at = input.at ?? new Date();
    const state = this.step(input.stepCode);
    if (!state) return;

    state.actorId = input.actorId;
    state.actorName = input.actorName;
    state.decision = input.decision;
    state.reasonCode = input.reasonCode;
    state.reasonNote = input.reasonNote;

    if (input.decision === WorkflowDecision.REJECT) {
      state.status = WorkflowStepStatus.REJECTED;
      state.completedAt = at;
      this.status = WorkflowInstanceStatus.REJECTED;
      this.completedAt = at;
      this.recomputeCurrentStep();
      return;
    }

    const stage = route.stageOf(input.stepCode);

    if (input.decision === WorkflowDecision.REQUEST_SUPPLEMENT) {
      state.status = WorkflowStepStatus.WAITING_SUPPLEMENT;
      state.completedAt = null;
      // CR44 luật #2 — trong cụm, không đóng băng phiên; ngoài cụm giữ hành vi cũ (cả phiên chờ bổ sung).
      if (stage !== WorkflowStage.INSPECTION) this.status = WorkflowInstanceStatus.WAITING_SUPPLEMENT;
      this.recomputeCurrentStep();
      return;
    }

    if (!advancesToNextStep(input.decision)) return;

    state.status = WorkflowStepStatus.COMPLETED;
    state.completedAt = at;

    if (stage === WorkflowStage.INSPECTION) {
      // CR2 — hoàn thành Kiểm dịch mở khóa Biên phòng + Hải quan (song song với nhau).
      if (epidemic && input.stepCode === route.quarantineInspectionStep?.code) {
        route.inspectionSteps
          .filter((step) => step.agencyCode !== QUARANTINE_AGENCY_CODE)
          .forEach((step) => this.openStep(step.code, at));
      }
      // Hồ sơ chỉ rời cụm khi CẢ cụm nghiệp vụ đã hoàn thành (CR44).
      if (this.allInspectionCompleted(route)) {
        this.openNextStageAfter(input.stepCode, route, epidemic, at);
      } else {
        this.status = WorkflowInstanceStatus.IN_PROGRESS;
        this.recomputeCurrentStep();
      }
      return;
    }

    // Giai đoạn đơn (thu phí) — sang giai đoạn kế tiếp.
    this.openNextStageAfter(input.stepCode, route, epidemic, at);
  }

  /**
   * CR7/F44 — **bước cổng do sự kiện cổng khép** (không phải quyết định qua phiên liên ngành). Cổng
   * VÀO khép rồi **mở cụm nghiệp vụ** (đọc cờ dịch tễ để mở đúng tập ban đầu); cổng RA đứng cuối lộ
   * trình → khép phiên (COMPLETED).
   *
   * Ghi `decision = APPROVE` cho bước cổng để nhật ký coi cổng "cho qua" tương đương duyệt xong bước.
   * Chỉ áp dụng khi phiên đang chạy và đang đứng ở bước cổng; gọi lại khi phiên đã đóng thì không làm
   * gì (idempotent). Trả về `true` nếu vừa khép/chuyển bước.
   */
  completeGateStep(
    route: WorkflowRoute,
    epidemic: boolean,
    actorId: string,
    actorName: string | null,
    at: Date = new Date(),
  ): boolean {
    if (this.status !== WorkflowInstanceStatus.IN_PROGRESS) return false;
    const state = this.currentStep;
    if (!state) return false;

    state.status = WorkflowStepStatus.COMPLETED;
    // F26/CR7 — bước cổng "thực sự bắt đầu" ngay tại **sự kiện qua cổng** (barrie xác nhận xe), KHÔNG
    // phải lúc mở phiên (cổng vào được `start()` mở từ lúc gửi hồ sơ) hay lúc xong thu phí (cổng ra
    // được mở khi rời giai đoạn phí). Đặt `enteredAt = at` để "Đã trôi qua" của bước cổng chỉ phản
    // ánh thời điểm xác nhận (≈ 0), không gộp thời gian xe đang trên đường/chờ tới cổng — nếu để
    // nguyên mốc mở sẽ phồng bằng cả quãng chờ đó và sai lệch hẳn so với thực tế.
    state.enteredAt = at;
    state.completedAt = at;
    state.actorId = actorId;
    state.actorName = actorName;
    state.decision = WorkflowDecision.APPROVE;

    this.openNextStageAfter(state.stepCode, route, epidemic, at);
    return true;
  }

  /**
   * Doanh nghiệp gửi lại hồ sơ sau khi bổ sung — mở lại **mọi bước đang chờ bổ sung** (per-step trong
   * cụm, hoặc bước đơn ngoài cụm) về trạng thái đang xử lý.
   */
  resumeAfterSupplement(at: Date = new Date()): void {
    const waiting = this.steps.filter((step) => step.status === WorkflowStepStatus.WAITING_SUPPLEMENT);
    if (waiting.length === 0) return;
    waiting.forEach((step) => {
      step.status = WorkflowStepStatus.IN_PROGRESS;
      if (!step.enteredAt) step.enteredAt = at;
    });
    if (this.status === WorkflowInstanceStatus.WAITING_SUPPLEMENT) this.status = WorkflowInstanceStatus.IN_PROGRESS;
    this.recomputeCurrentStep();
  }

  private finish(at: Date): void {
    this.currentStepCode = null;
    this.status = WorkflowInstanceStatus.COMPLETED;
    this.completedAt = at;
  }
}
