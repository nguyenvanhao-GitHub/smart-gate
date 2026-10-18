import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { FEE_STEP_GATE, FeeStepGateQuery } from '../../../../common/fees/fee-step-gate.port';
import { appNotFound } from '../../../../common/i18n';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { FeeCharge } from '../../domain/fee-charge.entity';
import { FeeLine, calculateFeeLines, feeTotals } from '../../domain/fee-calculation.rules';
import { applyDateOf, pickEffectiveRules } from '../../domain/fee-rule.rules';
import { FeeUnit } from '../../domain/fee.enums';
import { FeeSheetView, toFeeSheetView } from '../dto/fee-view.dto';
import { CalculateDossierFeesCommand } from '../dto/fee.command';
import { FEE_CHARGE_REPOSITORY, FeeChargeRepository } from '../ports/fee-charge.repository';
import { FEE_RULE_REPOSITORY, FeeRuleRepository } from '../ports/fee-rule.repository';
import { FEE_TRANSACTION_REPOSITORY, FeeTransactionRepository } from '../ports/fee-transaction.repository';
import { FeeBasisService } from '../services/fee-basis.service';

/**
 * Tính (hoặc tính lại) bảng phí của một hồ sơ (F47).
 *
 * Ba điều quyết định tính đúng — và cũng là ba chỗ dễ sai nhất:
 * 1. **Chọn bản biểu phí đang hiệu lực tại ngày áp dụng**, không lấy "bản mới nhất"
 *    (`pickEffectiveRules`): bản mới có thể chưa tới ngày hiệu lực hoặc đã hết hiệu lực.
 * 2. **Không ghi đè dòng đã điều chỉnh**: điều chỉnh (F47) là quyết định có mã lý do và người
 *    chịu trách nhiệm; một phép tính lại không được âm thầm xoá nó. Dòng đã điều chỉnh giữ nguyên
 *    số tiền, mã lý do và `id`.
 * 3. **VAT tính lại trên số tiền thực của các dòng sau khi gộp**, nên điều chỉnh một dòng thì
 *    thuế đi theo — tổng bảng luôn bằng tổng các dòng người dùng nhìn thấy.
 */
@Injectable()
export class CalculateDossierFeesUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(FEE_RULE_REPOSITORY)
    private readonly rules: FeeRuleRepository,
    @Inject(FEE_CHARGE_REPOSITORY)
    private readonly charges: FeeChargeRepository,
    @Inject(FEE_TRANSACTION_REPOSITORY)
    private readonly transactions: FeeTransactionRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(FEE_STEP_GATE)
    private readonly feeStepGate: FeeStepGateQuery,
    private readonly basis: FeeBasisService,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: CalculateDossierFeesCommand): Promise<{ fees: FeeSheetView }> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('fee.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    const at = command.at ?? new Date();
    const [allRules, existing, transactions] = await Promise.all([
      this.rules.findAll(),
      this.charges.findByDossier(declaration.id),
      this.transactions.findByDossier(declaration.id),
    ]);

    const vehicleType =
      declaration.vehicles?.[0]?.vehicleType ??
      declaration.transshipmentVehicles?.[0]?.vehicleType ??
      null;
    const effective = pickEffectiveRules(allRules, applyDateOf(at), declaration.type, vehicleType);
    const lines = calculateFeeLines(effective, await this.basis.basisFor(declaration, at));
    const merged = this.merge(declaration.id, existing, lines, at);

    const before = { total: feeTotals(existing).total, lines: existing.length };
    const saved = await this.charges.replaceForDossier(declaration.id, merged);

    await this.audit.record({
      action: 'FEE_CALCULATE',
      targetType: 'DECLARATION',
      targetId: declaration.id,
      before: {
        code: declaration.code,
        dossierCode: declaration.code,
        ...before,
      },
      after: {
        code: declaration.code,
        dossierCode: declaration.code,
        total: feeTotals(saved).total,
        lines: saved.length,
        appliedAt: applyDateOf(at),
      },
    });

    const feeStepReached = await this.feeStepGate.hasReachedFeeStep(declaration.id);
    return {
      fees: {
        ...toFeeSheetView(saved, transactions, feeStepReached),
        dossierCode: declaration.code,
      },
    };
  }

  /**
   * Gộp kết quả tính mới với bảng phí đang có.
   *
   * Dòng **đã điều chỉnh** được giữ nguyên (kể cả khi biểu phí không còn khoản đó nữa — xoá đi là
   * xoá mất một quyết định có mã lý do). Dòng chưa điều chỉnh được cập nhật tại chỗ để giữ `id`,
   * nhờ vậy nhật ký kiểm toán vẫn trỏ đúng bản ghi. Dòng cũ không còn trong biểu phí và chưa từng
   * được điều chỉnh thì bị loại.
   */
  private merge(dossierId: string, existing: FeeCharge[], lines: FeeLine[], at: Date): FeeCharge[] {
    const byCode = new Map(existing.map((charge) => [charge.ruleCode, charge]));
    const result: FeeCharge[] = [];

    lines.forEach((line) => {
      const current = byCode.get(line.ruleCode);
      if (!current) {
        result.push(FeeCharge.fromLine(dossierId, line, at));
        return;
      }
      if (!current.adjusted) {
        current.ruleId = line.ruleId;
        current.name = line.name;
        current.unit = line.unit;
        current.quantity = line.quantity;
        current.unitAmount = line.unitAmount;
        current.amount = line.amount;
        current.sortOrder = line.sortOrder;
        current.calculatedAt = at;
      }
      result.push(current);
    });

    const keptCodes = new Set(lines.map((line) => line.ruleCode));
    existing
      .filter((charge) => charge.adjusted && !keptCodes.has(charge.ruleCode))
      .forEach((charge) => result.push(charge));

    this.recalculatePercentLines(result);
    return result.sort((left, right) => left.sortOrder - right.sortOrder || left.ruleCode.localeCompare(right.ruleCode));
  }

  /** VAT bám theo số tiền thực của các dòng còn lại; dòng VAT đã bị điều chỉnh tay thì để yên. */
  private recalculatePercentLines(charges: FeeCharge[]): void {
    const base = charges
      .filter((charge) => charge.unit !== FeeUnit.PERCENT)
      .reduce((sum, charge) => sum + charge.amount, 0);
    charges
      .filter((charge) => charge.unit === FeeUnit.PERCENT && !charge.adjusted)
      .forEach((charge) => {
        charge.amount = Math.round((base * charge.unitAmount) / 100);
      });
  }
}
