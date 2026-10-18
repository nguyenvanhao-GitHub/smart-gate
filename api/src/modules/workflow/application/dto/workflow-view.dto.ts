import { DossierDetail } from '../../../declarations/application/dto/dossier-view.dto';
import { DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { GateStepDirection } from '../../../declarations/domain/workflow-step.catalog';
import { WorkflowInstance, WorkflowStepState } from '../../domain/workflow-instance.entity';
import { WorkflowRoute, WorkflowStage, WorkflowStepDefinition } from '../../domain/workflow-route';
import { WorkflowDecision, WorkflowInstanceStatus, WorkflowStepStatus } from '../../domain/workflow.enums';
import { ChecklistDefinition, ChecklistState } from '../ports/workflow-checklist.port';
import { QueueDossierRow } from '../ports/workflow-instance.repository';

/** Hợp đồng dữ liệu với web — tên trường đã chốt ở P3, đổi là hỏng màn hình UI-06/UI-07. */
export interface WorkflowStepRefView {
  code: string;
  name: string;
  agencyCode: string;
  agencyName: string;
  /**
   * Bước cổng (CR7/CR26): `ENTRY`/`EXIT` với bước "Biên phòng xác nhận xe vào/ra", `null` với bước
   * thường. Web dùng để hiển thị "xử lý tại Cổng vào/ra" và không mở panel quyết định cho bước cổng.
   */
  gate: GateStepDirection | null;
}

export interface QueueItemView {
  dossierId: string;
  code: string;
  type: DeclarationType;
  status: DeclarationStatus;
  epidemicFlag: boolean;
  enterprise: { taxCode: string; name: string };
  vehicle: { plateNumber: string };
  /** Null khi hồ sơ đã đi hết quy trình (tab "đã xử lý"). */
  currentStep: WorkflowStepRefView | null;
  /** Danh sách tất cả các bước đang mở (đang chờ xử lý trong cụm) */
  activeSteps: WorkflowStepRefView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStepView extends WorkflowStepRefView {
  order: number;
  status: WorkflowStepStatus;
  enteredAt: Date | null;
  completedAt: Date | null;
  elapsedSeconds: number;
  actorId: string | null;
  actorName: string | null;
  decision: WorkflowDecision | null;
  reasonCode: string | null;
  reasonNote: string | null;
}

export interface WorkflowInstanceView {
  id: string;
  /**
   * **Bước đại diện** của tập bước đang mở (giữ hợp đồng P3). Trong cụm nghiệp vụ song song (CR44)
   * đây là bước mở đầu tiên theo thứ tự; web nên vẽ cụm theo `activeStepCodes` chứ không chỉ trường này.
   */
  currentStepCode: string | null;
  /** CR44 — **tập bước đang mở** để web vẽ cụm song song. Ngoài cụm là đúng một mã. */
  activeStepCodes: string[];
  /** CR44 — giai đoạn hiện hành của tập bước mở (`ENTRY_GATE`/`INSPECTION`/`FEE`/`EXIT_GATE`), `null` khi phiên đã đóng. */
  activeStage: WorkflowStage | null;
  status: WorkflowInstanceStatus;
  totalElapsedSeconds: number;
  steps: WorkflowStepView[];
}

export interface ChecklistItemView {
  code: string;
  label: string;
  agencyCode: string;
  required: boolean;
  checked: boolean;
  note: string | null;
}

export interface WorkflowDossierView {
  dossier: DossierDetail;
  instance: WorkflowInstanceView;
  checklist: ChecklistItemView[];
  availableDecisions: WorkflowDecision[];
}

function toStepView(state: WorkflowStepState, route: WorkflowRoute, now: Date): WorkflowStepView {
  const definition = route.find(state.stepCode);
  return {
    code: state.stepCode,
    name: definition?.name ?? state.stepCode,
    agencyCode: definition?.agencyCode ?? '',
    agencyName: definition?.agencyName ?? '',
    gate: definition?.gate ?? null,
    order: state.order,
    status: state.status,
    enteredAt: state.enteredAt,
    completedAt: state.completedAt,
    elapsedSeconds: state.elapsedSeconds(now),
    actorId: state.actorId,
    actorName: state.actorName,
    decision: state.decision,
    reasonCode: state.reasonCode,
    reasonNote: state.reasonNote,
  };
}

export function toWorkflowInstanceView(
  instance: WorkflowInstance,
  route: WorkflowRoute,
  now: Date = new Date(),
): WorkflowInstanceView {
  const activeStepCodes = instance.activeStepCodes;
  return {
    id: instance.id,
    currentStepCode: instance.currentStepCode,
    activeStepCodes,
    activeStage: instance.currentStepCode ? route.stageOf(instance.currentStepCode) : null,
    status: instance.status,
    totalElapsedSeconds: instance.totalElapsedSeconds(now),
    steps: [...instance.steps]
      .sort((left, right) => left.order - right.order)
      .map((state) => toStepView(state, route, now)),
  };
}

export function toQueueItemView(
  instance: WorkflowInstance,
  dossier: QueueDossierRow,
  route: WorkflowRoute,
): QueueItemView {
  const current = instance.currentStepCode ? route.find(instance.currentStepCode) : undefined;
  const activeSteps = instance.activeStepCodes
    .map((code) => route.find(code))
    .filter((step): step is WorkflowStepDefinition => !!step)
    .map((step) => ({
      code: step.code,
      name: step.name,
      agencyCode: step.agencyCode,
      agencyName: step.agencyName,
      gate: step.gate,
    }));

  return {
    dossierId: dossier.id,
    code: dossier.code,
    type: dossier.type,
    status: dossier.status,
    epidemicFlag: dossier.epidemicFlag,
    enterprise: { taxCode: dossier.enterpriseTaxCode, name: dossier.enterpriseName },
    vehicle: { plateNumber: dossier.plateNumber },
    currentStep: current
      ? {
          code: current.code,
          name: current.name,
          agencyCode: current.agencyCode,
          agencyName: current.agencyName,
          gate: current.gate,
        }
      : null,
    activeSteps,
    createdAt: dossier.createdAt,
    updatedAt: dossier.updatedAt,
  };
}

/** Gộp danh mục mục kiểm tra với trạng thái đã tích của hồ sơ. Mục chưa tích thì `checked = false`. */
export function toChecklistView(
  definitions: ChecklistDefinition[],
  states: ChecklistState[],
): ChecklistItemView[] {
  const stateByCode = new Map(states.map((state) => [state.code, state]));
  return definitions.map((definition) => {
    const state = stateByCode.get(definition.code);
    return {
      code: definition.code,
      label: definition.label,
      agencyCode: definition.agencyCode,
      required: definition.required,
      checked: state?.checked ?? false,
      note: state?.note ?? null,
    };
  });
}
