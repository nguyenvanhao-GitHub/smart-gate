import { Inject, Injectable } from '@nestjs/common';
import { FEE_SETTLEMENT, FeeSettlementQuery } from '../../../../common/fees/fee-settlement.port';
import { BorderFacilityService } from '../../../catalog/application/services/border-facility.service';
import { BorderGateConfig, GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { WorkflowPolicyService } from '../../../declarations/application/workflow-policy.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import {
  GateChecklistItem,
  GateConditionResult,
  evaluateGateConditions,
  gateRuleKey,
} from '../../domain/gate-condition.rules';
import { GateChecklistState } from '../../domain/gate-event.entity';
import { GATE_CHECKLIST_CATALOG, GateChecklistCatalog } from '../ports/gate-checklist.port';
import { GATE_EVENT_REPOSITORY, GateEventRepository } from '../ports/gate-event.repository';
import { appBadRequest } from '../../../../common/i18n';

export interface GateConditionSnapshot {
  gate: BorderGateConfig;
  checklist: GateChecklistItem[];
  evaluation: GateConditionResult;
}

/** Các mã cổng tổng hợp đại diện theo chiều khi không dùng danh mục cổng vật lý. */
export const SYNTHETIC_GATE_CODES = ['GATE_ENTRY', 'GATE_EXIT', 'ENTRY', 'EXIT'] as const;

/**
 * Nơi duy nhất tính "hồ sơ này có được qua cổng không".
 *
 * **Tái dùng `WorkflowPolicyService.evaluateGate()` nguyên vẹn** — không chép lại điều kiện nào.
 * Phần thêm của P4 chỉ là: chọn đúng một trong bốn nhánh quy tắc theo chiều đi của cổng, và gộp
 * thêm các mục checklist bắt buộc tại cổng (F39).
 */
@Injectable()
export class GateEvaluationService {
  constructor(
    private readonly workflow: WorkflowPolicyService,
    private readonly facilities: BorderFacilityService,
    @Inject(GATE_CHECKLIST_CATALOG)
    private readonly checklistCatalog: GateChecklistCatalog,
    @Inject(GATE_EVENT_REPOSITORY)
    private readonly events: GateEventRepository,
    @Inject(FEE_SETTLEMENT)
    private readonly settlements: FeeSettlementQuery,
  ) {}

  /**
   * Cổng dùng để đánh giá. Không chỉ định thì lấy **cổng ra** đầu tiên còn hoạt động — đó mới là
   * cổng quyết định của cả hai luồng (F39).
   */
  async resolveGate(gateCode?: string, direction?: GateDirection): Promise<BorderGateConfig> {
    const isSyntheticCode =
      gateCode !== undefined && (SYNTHETIC_GATE_CODES as readonly string[]).includes(gateCode.toUpperCase());

    // 1. Nếu truyền mã cổng vật lý cụ thể (không phải mã tổng hợp GATE_ENTRY/GATE_EXIT)
    if (gateCode && !isSyntheticCode) {
      const gates = await this.facilities.listGates();
      const gate = gates.find((item) => item.code === gateCode);
      if (!gate) throw appBadRequest('gate.notFound', { gateCode });
      if (!gate.active) throw appBadRequest('gate.inactive', { gateName: gate.name });
      return gate;
    }

    // 2. Xác định chiều tra cứu: từ tham số direction hoặc từ mã tổng hợp
    const normDir =
      direction ??
      (gateCode?.toUpperCase() === GateDirection.ENTRY || gateCode?.toUpperCase() === 'GATE_ENTRY'
        ? GateDirection.ENTRY
        : gateCode?.toUpperCase() === GateDirection.EXIT || gateCode?.toUpperCase() === 'GATE_EXIT'
          ? GateDirection.EXIT
          : undefined);

    if (normDir) {
      const gates = await this.facilities.listGates();
      const matched = gates.find((item) => item.active && item.direction === normDir);
      if (matched) return matched;
      return {
        code: normDir === GateDirection.ENTRY ? 'GATE_ENTRY' : 'GATE_EXIT',
        name: normDir === GateDirection.ENTRY ? 'Cổng vào' : 'Cổng ra',
        direction: normDir,
        checkpoint: 'SMART_GATE',
        active: true,
      };
    }

    // 3. Fallback khi không truyền cả gateCode lẫn direction
    const gates = await this.facilities.listGates();
    if (gates.length === 0) {
      return {
        code: 'DEFAULT',
        name: 'Cửa khẩu Chiềng Khương',
        direction: GateDirection.EXIT,
        checkpoint: 'SMART_GATE',
        active: true,
      };
    }

    const exit = gates.find((item) => item.active && item.direction === GateDirection.EXIT);
    const fallback = gates.find((item) => item.active);
    const chosen = exit ?? fallback;
    if (!chosen) {
      return {
        code: 'DEFAULT',
        name: 'Cửa khẩu Chiềng Khương',
        direction: GateDirection.EXIT,
        checkpoint: 'SMART_GATE',
        active: true,
      };
    }
    return chosen;
  }

  /**
   * Đánh giá đầy đủ một hồ sơ tại một cổng.
   * `overrides` là các mục checklist nhân viên vừa tích trên màn hình; không truyền thì lấy lại
   * trạng thái của sự kiện gần nhất.
   */
  async evaluate(
    declaration: Declaration,
    gate: BorderGateConfig,
    overrides: GateChecklistState[] = [],
  ): Promise<GateConditionSnapshot> {
    const [checklist, settlement] = await Promise.all([
      this.buildChecklist(declaration.id, overrides),
      // F39 — nghĩa vụ tài chính đọc từ phân hệ phí qua cổng `FEE_SETTLEMENT`; cổng không biết
      // (và không cần biết) bảng phí được tính thế nào.
      this.settlements.snapshotOf(declaration.id),
    ]);
    const ruleKey = gateRuleKey(this.workflow.isExportLike(declaration.type), gate.direction);
    const evaluation = evaluateGateConditions(
      await this.workflow.evaluateGate(declaration, ruleKey, settlement),
      checklist,
    );
    return { gate, checklist, evaluation };
  }

  private async buildChecklist(dossierId: string, overrides: GateChecklistState[]): Promise<GateChecklistItem[]> {
    const [definitions, latest] = await Promise.all([
      this.checklistCatalog.listDefinitions(),
      this.events.findLatestByDossier(dossierId),
    ]);

    const stored = new Map((latest?.checklist ?? []).map((state) => [state.code, state]));
    const sent = new Map(overrides.map((state) => [state.code, state]));

    return definitions.map((definition) => {
      const state = sent.get(definition.code) ?? stored.get(definition.code);
      return {
        code: definition.code,
        label: definition.label,
        required: definition.required,
        checked: state?.checked === true,
        note: state?.note ?? null,
      };
    });
  }
}
