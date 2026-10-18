import { randomUUID } from 'crypto';
import { WorkflowDecision } from './workflow.enums';

/**
 * Nhật ký thao tác của lực lượng chuyên ngành — bảng `agency_actions`.
 * Chỉ thêm, không sửa: đây là bằng chứng "ai làm gì, lúc nào, vì lý do gì" cho F23–F25.
 */
export class AgencyAction {
  constructor(
    public readonly id: string,
    public readonly dossierId: string,
    public readonly instanceId: string,
    public readonly stepCode: string,
    public readonly agencyCode: string,
    public readonly actorId: string,
    public readonly actorName: string | null,
    public readonly decision: WorkflowDecision,
    public readonly reasonCode: string | null,
    public readonly reasonNote: string | null,
    /** F26 — số giây lực lượng này giữ hồ sơ, chốt tại thời điểm ra quyết định. */
    public readonly elapsedSeconds: number,
    public readonly actedAt: Date,
  ) {}

  static create(input: {
    dossierId: string;
    instanceId: string;
    stepCode: string;
    agencyCode: string;
    actorId: string;
    actorName: string | null;
    decision: WorkflowDecision;
    reasonCode: string | null;
    reasonNote: string | null;
    elapsedSeconds: number;
    actedAt?: Date;
  }): AgencyAction {
    return new AgencyAction(
      randomUUID(),
      input.dossierId,
      input.instanceId,
      input.stepCode,
      input.agencyCode,
      input.actorId,
      input.actorName,
      input.decision,
      input.reasonCode,
      input.reasonNote,
      input.elapsedSeconds,
      input.actedAt ?? new Date(),
    );
  }
}
