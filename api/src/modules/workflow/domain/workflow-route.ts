import { DeclarationType, WorkflowStepCode } from '../../declarations/domain/declaration.enums';
import {
  GateStepDirection,
  WORKFLOW_STEP_METADATA,
  isInspectionStep,
  stepPrefixForType,
  workflowStepMetadata,
} from '../../declarations/domain/workflow-step.catalog';

/**
 * CR44/CR2 — **giai đoạn (stage)** của lộ trình. Không lưu trong DB: suy thẳng từ siêu dữ liệu bước
 * (khai báo / cổng vào / kiểm tra nghiệp vụ / thu phí / cổng ra). Các bước cùng một giai đoạn nằm
 * liền nhau theo thứ tự lộ trình, nên "giai đoạn" chỉ là cách nhóm lại để mô tả **cụm bước song song**.
 */
export const WorkflowStage = {
  DECLARATION: 'DECLARATION',
  ENTRY_GATE: 'ENTRY_GATE',
  INSPECTION: 'INSPECTION',
  FEE: 'FEE',
  EXIT_GATE: 'EXIT_GATE',
} as const;
export type WorkflowStage = (typeof WorkflowStage)[keyof typeof WorkflowStage];

/** Mã lực lượng Kiểm dịch — bước tiên quyết của cụm khi có cờ dịch tễ (CR2). */
export const QUARANTINE_AGENCY_CODE = 'QUARANTINE';

/** Giai đoạn suy từ mã lực lượng + chiều cổng của một bước (không phụ thuộc dữ liệu vận hành). */
function stageFromMeta(agencyCode: string, gate: GateStepDirection | null): WorkflowStage {
  if (agencyCode === 'ENTERPRISE') return WorkflowStage.DECLARATION;
  if (gate === GateStepDirection.ENTRY) return WorkflowStage.ENTRY_GATE;
  if (gate === GateStepDirection.EXIT) return WorkflowStage.EXIT_GATE;
  if (agencyCode === FEE_STEP_AGENCY_CODE) return WorkflowStage.FEE;
  return WorkflowStage.INSPECTION;
}

/** Giai đoạn của một bước, suy từ siêu dữ liệu (không phụ thuộc dữ liệu vận hành). */
export function stageOfStep(step: WorkflowStepDefinition): WorkflowStage {
  return stageFromMeta(step.agencyCode, step.gate);
}

/** Giai đoạn của một **mã bước**, suy thẳng từ siêu dữ liệu; `null` nếu mã không có siêu dữ liệu hiển thị. */
export function stageOfStepCode(code: string): WorkflowStage | null {
  const meta = workflowStepMetadata(code);
  return meta ? stageFromMeta(meta.agencyCode, meta.gate) : null;
}

/**
 * CR41/CR44 — **giai đoạn hiện hành** của một phiên suy từ **tập bước đang mở** (IN_PROGRESS /
 * WAITING_SUPPLEMENT). Cụm nghiệp vụ mở song song nên nếu **bất kỳ** bước nghiệp vụ nào đang mở thì
 * giai đoạn là INSPECTION; ngoài cụm chỉ có một bước mở nên lấy thẳng giai đoạn của nó. Không có bước
 * mở nào (phiên chưa mở hoặc đã đóng — đã hoàn tất/từ chối) → `null`.
 */
export function currentStageFromOpenSteps(openStepCodes: string[]): WorkflowStage | null {
  const stages = openStepCodes
    .map(stageOfStepCode)
    .filter((stage): stage is WorkflowStage => stage !== null);
  if (stages.length === 0) return null;
  if (stages.includes(WorkflowStage.INSPECTION)) return WorkflowStage.INSPECTION;
  return stages[0];
}

/** Một dòng của bảng `workflow_step_roles` sau khi đã đổi `role_id` thành mã vai trò. */
export interface WorkflowStepRoleRow {
  stepCode: string;
  roleCode: string;
  sortOrder: number;
  force: string | null;
}

export interface WorkflowStepDefinition {
  code: WorkflowStepCode;
  name: string;
  agencyCode: string;
  agencyName: string;
  /** Thứ tự bước — **đọc từ DB**, không cố định trong mã nguồn. */
  order: number;
  /** Vai trò RBAC được phép quyết định bước này — cũng đọc từ DB. */
  roleCodes: string[];
  force: string | null;
  /**
   * Bước cổng và chiều (CR7): `ENTRY` (Biên phòng xác nhận xe vào), `EXIT` (Biên phòng xác nhận xe
   * ra) hoặc `null` (bước thường). Bước cổng do **sự kiện cổng** khép, không quyết định qua liên ngành.
   */
  gate: GateStepDirection | null;
}

/**
 * Mã lực lượng của **bước thu phí** (`*_FEE`). Bước này do cơ quan thu phí (`FEE_COLLECTOR`) duyệt
 * qua `POST /workflow/.../decide`, nhưng chỉ được duyệt/chuyển tiếp khi **nghĩa vụ tài chính đã
 * hoàn tất** (F48 — nguồn sự thật là `settlement`, không phải cột phí cũ). Trùng đúng mã đang dùng
 * ở `workflow-step.catalog.ts`.
 */
export const FEE_STEP_AGENCY_CODE = 'FEE_COLLECTOR';

/**
 * Lộ trình xử lý của một loại hình hồ sơ: danh sách bước đã sắp thứ tự.
 *
 * Toàn bộ nội dung do `buildWorkflowRoute()` dựng từ dữ liệu bảng `workflow_step_roles`. Lớp này
 * chỉ trả lời các câu hỏi về thứ tự nên **test được mà không cần cơ sở dữ liệu**.
 */
export class WorkflowRoute {
  constructor(
    readonly type: DeclarationType,
    readonly steps: WorkflowStepDefinition[],
  ) {}

  get isEmpty(): boolean {
    return this.steps.length === 0;
  }

  /** Bước khai báo (`*_DECLARED`) do doanh nghiệp thực hiện, không thuộc phần xử lý liên ngành. */
  get actionableSteps(): WorkflowStepDefinition[] {
    return this.steps.filter((step) => step.agencyCode !== 'ENTERPRISE');
  }

  get firstActionableStep(): WorkflowStepDefinition | undefined {
    return this.actionableSteps[0];
  }

  /** Bước cuối cùng của lộ trình — bước cổng ra, hoàn thành là xe đã rời cửa khẩu. */
  get lastStep(): WorkflowStepDefinition | undefined {
    return this.steps[this.steps.length - 1];
  }

  find(code: string): WorkflowStepDefinition | undefined {
    return this.steps.find((step) => step.code === code);
  }

  indexOf(code: string): number {
    return this.steps.findIndex((step) => step.code === code);
  }

  next(code: string): WorkflowStepDefinition | undefined {
    const index = this.indexOf(code);
    return index < 0 ? undefined : this.steps[index + 1];
  }

  isLast(code: string): boolean {
    return this.indexOf(code) === this.steps.length - 1;
  }

  /**
   * Bước cổng (`gate != null`) — được **sự kiện cổng** hoàn thành, KHÔNG quyết định qua phiên liên
   * ngành. Gồm 4 bước "Biên phòng xác nhận xe vào/ra tại Barrie" (CR7). Dùng để chặn deciding bước
   * cổng ở `POST /workflow/.../decide` và để cổng biết đây là bước cần khép khi xe qua.
   */
  isGateStep(code: string): boolean {
    return this.find(code)?.gate != null;
  }

  /**
   * Chiều của bước cổng (`ENTRY`/`EXIT`) hoặc `null` nếu không phải bước cổng. Cổng dùng để biết một
   * sự kiện cổng VÀO/RA khép đúng bước cổng cùng chiều.
   */
  gateDirectionOf(code: string): GateStepDirection | null {
    return this.find(code)?.gate ?? null;
  }

  /**
   * Bước thu phí (`FEE_COLLECTOR`) — do cơ quan thu phí duyệt qua phiên liên ngành, nhưng gắn thêm
   * điều kiện tài chính: chỉ DUYỆT/CHUYỂN TIẾP được khi hồ sơ đã thanh toán đủ (F48). Dùng để chặn
   * đúng chỗ ở `POST /workflow/.../decide`.
   */
  isFeeStep(code: string): boolean {
    return this.find(code)?.agencyCode === FEE_STEP_AGENCY_CODE;
  }

  get feeStep(): WorkflowStepDefinition | undefined {
    return this.steps.find((step) => step.agencyCode === FEE_STEP_AGENCY_CODE);
  }

  /**
   * Bước kiểm tra nghiệp vụ (`isInspectionStep`) — do Biên phòng / Kiểm dịch / Hải quan chủ trì,
   * không phải bước cổng. Đây là **cụm bước chạy song song** của CR44.
   */
  get inspectionSteps(): WorkflowStepDefinition[] {
    return this.steps.filter((step) => isInspectionStep(step.code));
  }

  /** Bước Kiểm dịch trong cụm nghiệp vụ — bước tiên quyết khi có cờ dịch tễ (CR2). */
  get quarantineInspectionStep(): WorkflowStepDefinition | undefined {
    return this.inspectionSteps.find((step) => step.agencyCode === QUARANTINE_AGENCY_CODE);
  }

  /** Giai đoạn của một bước; `null` nếu mã bước không thuộc lộ trình. */
  stageOf(code: string): WorkflowStage | null {
    const step = this.find(code);
    return step ? stageOfStep(step) : null;
  }

  /** Các bước thuộc một giai đoạn, theo thứ tự lộ trình. */
  stepsOfStage(stage: WorkflowStage): WorkflowStepDefinition[] {
    return this.steps.filter((step) => stageOfStep(step) === stage);
  }

  /** Danh sách giai đoạn có mặt trong lộ trình, theo thứ tự (không lặp). */
  get stagesInOrder(): WorkflowStage[] {
    const seen: WorkflowStage[] = [];
    for (const step of this.steps) {
      const stage = stageOfStep(step);
      if (!seen.includes(stage)) seen.push(stage);
    }
    return seen;
  }

  /** Giai đoạn ngay sau `stage` trong lộ trình, hoặc `undefined` nếu đã là giai đoạn cuối. */
  nextStage(stage: WorkflowStage): WorkflowStage | undefined {
    const order = this.stagesInOrder;
    const index = order.indexOf(stage);
    return index < 0 ? undefined : order[index + 1];
  }

  /**
   * CR29 — lộ trình **bỏ bước thu phí**. Dùng khi cờ `fee.enabled` bị tắt lúc mở phiên: phiên không
   * có bước Thu phí, cụm nghiệp vụ xong đi thẳng sang Cổng ra. Giữ nguyên các bước còn lại theo thứ tự.
   */
  withoutFeeSteps(): WorkflowRoute {
    return new WorkflowRoute(
      this.type,
      this.steps.filter((step) => step.agencyCode !== FEE_STEP_AGENCY_CODE),
    );
  }

  /** Vai trò có được quyết định bước này không. Bước không khai vai trò nào thì không ai làm được. */
  allowsRole(code: string, roleCodes: string[]): boolean {
    if (roleCodes.includes('SYS_ADMIN') || roleCodes.includes('ADMIN')) return true;
    const step = this.find(code);
    if (!step || step.roleCodes.length === 0) return false;
    return step.roleCodes.some((role) => roleCodes.includes(role));
  }
}

/**
 * Dựng lộ trình cho một loại hình hồ sơ từ dữ liệu `workflow_step_roles`.
 *
 * - Lọc theo tiền tố mã bước (`EXPORT_` / `IMPORT_`) — sang tải đi cùng luồng xuất, xe tự hành đi
 *   cùng luồng nhập, đúng như `stepPrefixForType()`.
 * - Thứ tự lấy từ cột `sort_order`; nhiều vai trò cùng một bước thì lấy `sort_order` nhỏ nhất.
 * - Bước có trong DB nhưng không có siêu dữ liệu hiển thị thì **bỏ qua** — dữ liệu rác không được
 *   phép làm hỏng lộ trình của hồ sơ đang chạy.
 */
export function buildWorkflowRoute(type: DeclarationType, rows: WorkflowStepRoleRow[]): WorkflowRoute {
  const prefix = stepPrefixForType(type);
  const byStep = new Map<string, WorkflowStepDefinition>();

  for (const row of rows) {
    if (!row.stepCode.startsWith(prefix)) continue;
    const metadata = workflowStepMetadata(row.stepCode);
    if (!metadata) continue;

    const existing = byStep.get(row.stepCode);
    if (!existing) {
      byStep.set(row.stepCode, {
        code: metadata.code,
        name: metadata.name,
        agencyCode: metadata.agencyCode,
        agencyName: metadata.agencyName,
        order: row.sortOrder,
        roleCodes: row.roleCode ? [row.roleCode] : [],
        force: row.force,
        gate: metadata.gate,
      });
      continue;
    }
    existing.order = Math.min(existing.order, row.sortOrder);
    if (row.roleCode && !existing.roleCodes.includes(row.roleCode)) existing.roleCodes.push(row.roleCode);
    existing.force = existing.force ?? row.force;
  }

  const steps = [...byStep.values()].sort((left, right) =>
    left.order === right.order ? left.code.localeCompare(right.code) : left.order - right.order,
  );
  return new WorkflowRoute(type, steps);
}

/** Danh sách mã bước hợp lệ — dùng để kiểm dữ liệu đầu vào ở tầng DTO. */
export const ALL_WORKFLOW_STEP_CODES: string[] = Object.keys(WORKFLOW_STEP_METADATA);
