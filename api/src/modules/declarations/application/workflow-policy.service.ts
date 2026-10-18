import { Inject, Injectable } from '@nestjs/common';
import { FeeSettlementSnapshot } from '../../../common/fees/fee-settlement.port';
import { appForbidden } from '../../../common/i18n';
import { Declaration } from '../domain/declaration.entity';
import { DeclarationStatus, DeclarationType, WorkflowStepCode } from '../domain/declaration.enums';
import { workflowStepMetadata } from '../domain/workflow-step.catalog';
// Phiên xử lý liên ngành THẬT — nguồn sự thật cho điều kiện mở cổng (thay cột `forceProgress` cũ).
// Các provider này được khai tại `DeclarationsModule` (xem chú thích ở đó) nên tiêm được vào đây mà
// không tạo vòng module.
import { WorkflowInstanceStatus, WorkflowStepStatus } from '../../workflow/domain/workflow.enums';
import { WorkflowInstance } from '../../workflow/domain/workflow-instance.entity';
import { WorkflowRoute, WorkflowStepDefinition } from '../../workflow/domain/workflow-route';
import { effectiveRouteForInstance } from '../../workflow/domain/fee-step-gate.rules';
import {
  WORKFLOW_INSTANCE_REPOSITORY,
  WorkflowInstanceRepository,
} from '../../workflow/application/ports/workflow-instance.repository';
import { WorkflowRouteService } from '../../workflow/application/services/workflow-route.service';

export interface GateEvaluation {
  gate: 'B2_IN_EXPORT' | 'B1_EXPORT_EXIT' | 'B1_IMPORT_ENTRY' | 'B2_IMPORT_EXIT';
  canOpen: boolean;
  statusColor: 'GREEN' | 'YELLOW' | 'RED';
  blockingReasons: string[];
  requiredCompletedSteps: string[];
}

/**
 * ⚠️ **ĐƯỜNG CŨ — chỉ còn phục vụ quy tắc mở cổng và kiểm vai trò thu phí.**
 *
 * Từ P3, thứ tự bước và vai trò được phép thao tác là **dữ liệu** trong bảng `workflow_step_roles`,
 * do `modules/workflow` đọc qua `WORKFLOW_STEP_DIRECTORY`; đó mới là nơi chặn thao tác sai thứ tự
 * và sai lực lượng (`POST /workflow/dossiers/:id/actions/decide`, trả 409/403).
 *
 * Ma trận thứ tự lực lượng cũ dựa cột `forceProgress` (`assertForceOrder`/`blockersForForce`) **đã
 * bị gỡ** cùng chính cột đó (LÔ 5): thứ tự bước nay do phiên xử lý liên ngành bảo đảm. Phần còn lại:
 * - `evaluateGate`/`buildGateEvaluation` — quy tắc mở cổng, đọc từ phiên thật (`workflow_instances`).
 * - `assertCanConfirmFee` — chỉ còn **kiểm vai trò** thu phí (`FEE_COLLECTOR`/`SYS_ADMIN`); thứ tự
 *   bước phí do đường `POST /workflow/.../decide` bảo đảm.
 */
@Injectable()
export class WorkflowPolicyService {
  constructor(
    // Nguồn sự thật của điều kiện nghiệp vụ mở cổng: phiên xử lý liên ngành + lộ trình bước, đọc
    // đúng thứ đã ghi khi các lực lượng quyết định qua `POST /workflow/.../decide`.
    @Inject(WORKFLOW_INSTANCE_REPOSITORY)
    private readonly instances: WorkflowInstanceRepository,
    private readonly routes: WorkflowRouteService,
  ) {}

  /**
   * Kiểm **vai trò** được xác nhận thu phí và trả mã bước phí tương ứng luồng.
   *
   * Phân quyền theo **vai trò RBAC** (nguồn sự thật): cơ quan thu phí (`FEE_COLLECTOR`) và quản trị
   * hệ thống (`SYS_ADMIN`). Phân biệt khoản phí Thuế/Sang tải là việc của phạm vi phân công
   * (assignment FEE_TYPE), không của mã vai trò — RBAC gộp cả hai về `FEE_COLLECTOR`. Màn thu phí
   * còn bị chặn thêm ở tầng quyền `fee.approve`.
   *
   * Thứ tự bước (phí phải sau các lực lượng trước) **không** kiểm ở đây nữa — cột `forceProgress` đã
   * bị gỡ (LÔ 5); đường quyết định phí đi qua `POST /workflow/.../decide` mới là nơi chặn sai thứ tự.
   */
  assertCanConfirmFee(declaration: Declaration, roles: string[]): WorkflowStepCode {
    const allowed = ['FEE_COLLECTOR', 'SYS_ADMIN'];
    if (!roles.some((role) => allowed.includes(role))) {
      throw appForbidden('workflow.feeRoleNotAllowed');
    }
    return this.isExportLike(declaration.type) ? WorkflowStepCode.EXPORT_FEE : WorkflowStepCode.IMPORT_FEE;
  }

  /**
   * F39 — điều kiện mở cổng, đọc từ **phiên xử lý liên ngành THẬT** (`workflow_instances` /
   * `workflow_instance_steps`), không còn đọc cột `forceProgress` legacy.
   *
   * - **Nghiệp vụ đủ**: mọi bước liên ngành TRƯỚC bước cổng (Biên phòng, Hải quan, Kiểm dịch, Thu
   *   phí…) đều `COMPLETED`. Bước còn thiếu được nêu đích danh theo **tên bước + lực lượng**.
   * - **Tài chính**: `settlement` là ảnh chụp nghĩa vụ tài chính thật (F48). Truyền vào thì cổng ra
   *   có thêm điều kiện độc lập *đã xác nhận thanh toán*; đây là phép **VÀ** với điều kiện nghiệp vụ,
   *   không thay thế nó.
   * - **RED**: phiên đang `REJECTED` (bị từ chối) hoặc `WAITING_SUPPLEMENT` (kéo về bổ sung).
   *
   * Bảo hiểm đã bị bỏ khỏi luồng (SRS F18/F19) nên không còn là điều kiện mở cổng.
   */
  async evaluateGate(
    declaration: Declaration,
    gate: GateEvaluation['gate'],
    settlement?: FeeSettlementSnapshot,
  ): Promise<GateEvaluation> {
    const route = await this.routes.routeFor(declaration.type);
    const instance = await this.instances.findByDossierId(declaration.id);
    return this.buildGateEvaluation(declaration, gate, instance, route, settlement);
  }

  /**
   * Phần thuần tính toán của `evaluateGate` — tách riêng để kiểm thử được mà không cần cơ sở dữ liệu:
   * nhận sẵn phiên + lộ trình đã nạp và ảnh chụp nghĩa vụ tài chính.
   */
  buildGateEvaluation(
    declaration: Declaration,
    gate: GateEvaluation['gate'],
    instance: WorkflowInstance | null,
    route: WorkflowRoute,
    settlement?: FeeSettlementSnapshot,
  ): GateEvaluation {
    const blockingReasons: string[] = [];
    const requiredCompletedSteps: string[] = [];
    // CR29 — lộ trình khớp tập bước đã đóng băng của phiên: phiên mở lúc cờ Thu phí tắt không có bước
    // phí, nên cổng ra không đòi "hoàn thành bước Thu phí" (nghĩa vụ tài chính khi đó bằng 0 → settled).
    const effectiveRoute = instance ? effectiveRouteForInstance(route, instance) : route;

    if (isEntryGate(gate)) {
      // Cổng VÀO chỉ đòi hồ sơ còn hiệu lực (chưa hủy/từ chối) — chưa cần đủ nghiệp vụ.
      const rule = ENTRY_GATE_RULES[gate];
      requiredCompletedSteps.push(rule.label);
      if (declaration.status === DeclarationStatus.CANCELLED || declaration.status === DeclarationStatus.REJECTED) {
        blockingReasons.push(rule.reason);
      }
    } else {
      // Cổng RA: mọi bước liên ngành trước bước cổng phải COMPLETED, đọc từ phiên thật.
      for (const step of businessStepsBeforeGate(effectiveRoute)) {
        requiredCompletedSteps.push(step.name);
        if (instance?.step(step.code)?.status !== WorkflowStepStatus.COMPLETED) {
          blockingReasons.push(`Chưa hoàn thành bước "${step.name}" (${step.agencyName}).`);
        }
      }
      // Nghĩa vụ tài chính THẬT (F48) — điều kiện độc lập, đứng cạnh các bước nghiệp vụ.
      if (settlement) {
        requiredCompletedSteps.push('Đã xác nhận thanh toán phí');
        if (!settlement.settled) {
          blockingReasons.push(`Còn ${settlement.outstanding} ${settlement.currency} phí chưa được xác nhận thanh toán.`);
        }
      }
    }

    const halted =
      instance != null &&
      (instance.status === WorkflowInstanceStatus.REJECTED || instance.status === WorkflowInstanceStatus.WAITING_SUPPLEMENT);
    const canOpen = blockingReasons.length === 0;
    const statusColor: GateEvaluation['statusColor'] = halted ? 'RED' : canOpen ? 'GREEN' : 'YELLOW';
    return { gate, canOpen, statusColor, blockingReasons, requiredCompletedSteps };
  }

  gateForDeclaration(declaration: Declaration): GateEvaluation['gate'] {
    return this.isExportLike(declaration.type) ? 'B1_EXPORT_EXIT' : 'B2_IMPORT_EXIT';
  }

  applyCheckpointForStep(declaration: Declaration, step: WorkflowStepCode): void {
    const checkpoint = workflowStepMetadata(step)?.checkpoint;
    if (checkpoint) declaration.setCheckpoint(checkpoint);
  }

  /** Sang tải đầu xuất đi cùng luồng xuất; xe tự hành và sang tải đầu nhập đi cùng luồng nhập. */
  isExportLike(type: DeclarationType): boolean {
    return type === DeclarationType.EXPORT || type === DeclarationType.TRANSSHIPMENT_EXPORT;
  }
}

/** Điều kiện tối thiểu của hai cổng VÀO: hồ sơ còn hiệu lực (chưa hủy/từ chối). */
const ENTRY_GATE_RULES: Record<'B2_IN_EXPORT' | 'B1_IMPORT_ENTRY', { label: string; reason: string }> = {
  B2_IN_EXPORT: { label: 'Hồ sơ hợp lệ/QR khớp', reason: 'Hồ sơ chưa ở trạng thái được tiếp nhận.' },
  B1_IMPORT_ENTRY: { label: 'Hồ sơ nhập cảnh hợp lệ', reason: 'Hồ sơ nhập cảnh chưa hợp lệ.' },
};

function isEntryGate(gate: GateEvaluation['gate']): gate is 'B2_IN_EXPORT' | 'B1_IMPORT_ENTRY' {
  return gate === 'B2_IN_EXPORT' || gate === 'B1_IMPORT_ENTRY';
}

/**
 * Các bước liên ngành phải hoàn thành trước khi mở cổng ra: mọi bước của lộ trình trừ bước khai báo
 * của doanh nghiệp (đã loại trong `actionableSteps`) và trừ **các bước cổng** (vào/ra — khép bằng
 * sự kiện cổng, CR7). Bước thu phí vẫn nằm trong danh sách này — "lực lượng thu phí đã xử lý xong" là
 * câu hỏi khác với "tiền đã thật sự vào" (điều kiện `settlement`), cả hai đều phải đạt.
 */
function businessStepsBeforeGate(route: WorkflowRoute): WorkflowStepDefinition[] {
  return route.actionableSteps.filter((step) => !route.isGateStep(step.code));
}
