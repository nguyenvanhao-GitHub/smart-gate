import { randomUUID } from 'crypto';
import { DossierFeeCalculator } from '../../../common/fees/fee-calculator.port';
import {
  FeeSettlementQuery,
  FeeSettlementSnapshot,
  NO_FEE_OBLIGATION,
} from '../../../common/fees/fee-settlement.port';
import { FeeStepGateQuery } from '../../../common/fees/fee-step-gate.port';
import { ReasonCodeView, ReasonScope } from '../../catalog/domain/reason-code.catalog';

import { FeeActor, FeeActorDirectory } from '../application/ports/fee-actor.port';
import { FeeChargeRepository } from '../application/ports/fee-charge.repository';
import { FeeReasonCodeCatalogPort } from '../application/ports/fee-reason-code.port';
import { FeeRuleRepository } from '../application/ports/fee-rule.repository';
import {
  FeeTransactionReferenceError,
  FeeTransactionRepository,
} from '../application/ports/fee-transaction.repository';
import { FeeCharge } from '../domain/fee-charge.entity';
import { FeeRule } from '../domain/fee-rule.entity';
import { FeeRuleSeed } from '../domain/fee-rule.seed';
import { FeeTransaction } from '../domain/fee-transaction.entity';
import { FEE_CURRENCY, FeeTransactionStatus, FeeType, FeeUnit } from '../domain/fee.enums';

/** Bộ dữ liệu dựng sẵn cho test phân hệ phí — KHÔNG dùng trong mã sản phẩm. */
export interface FeeRuleOverrides {
  id?: string;
  code?: string;
  name?: string;
  feeType?: FeeType;
  unit?: FeeUnit;
  amount?: number;
  appliesTo?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export function makeFeeRule(overrides: FeeRuleOverrides = {}): FeeRule {
  return new FeeRule(
    overrides.id ?? randomUUID(),
    overrides.code ?? 'INFRA_GATE',
    overrides.name ?? 'Phí hạ tầng cửa khẩu',
    overrides.feeType ?? FeeType.INFRASTRUCTURE,
    overrides.unit ?? FeeUnit.TRIP,
    overrides.amount ?? 1_000_000,
    FEE_CURRENCY,
    overrides.appliesTo ?? [],
    overrides.effectiveFrom ?? '2026-01-01',
    overrides.effectiveTo ?? null,
    overrides.active ?? true,
    overrides.sortOrder ?? 10,
    null,
  );
}

export interface FeeChargeOverrides {
  id?: string;
  dossierId?: string;
  ruleCode?: string;
  name?: string;
  unit?: FeeUnit;
  quantity?: number;
  unitAmount?: number;
  amount?: number;
  sortOrder?: number;
}

export function makeFeeCharge(overrides: FeeChargeOverrides = {}): FeeCharge {
  const unitAmount = overrides.unitAmount ?? 1_000_000;
  const quantity = overrides.quantity ?? 1;
  return new FeeCharge(
    overrides.id ?? randomUUID(),
    overrides.dossierId ?? 'ho-so-1',
    null,
    overrides.ruleCode ?? 'INFRA_GATE',
    overrides.name ?? 'Phí hạ tầng cửa khẩu',
    overrides.unit ?? FeeUnit.TRIP,
    quantity,
    unitAmount,
    overrides.amount ?? unitAmount * quantity,
    false,
    null,
    null,
    null,
    null,
    new Date('2026-03-01T08:00:00.000Z'),
    overrides.sortOrder ?? 10,
  );
}

export class InMemoryFeeRuleRepository implements FeeRuleRepository {
  constructor(readonly rows: FeeRule[] = []) {}

  async findAll(): Promise<FeeRule[]> {
    return [...this.rows];
  }

  async findById(id: string): Promise<FeeRule | null> {
    return this.rows.find((rule) => rule.id === id) ?? null;
  }

  async save(rule: FeeRule): Promise<FeeRule> {
    const index = this.rows.findIndex((item) => item.id === rule.id);
    if (index >= 0) this.rows[index] = rule;
    else this.rows.push(rule);
    return rule;
  }

  async ensureSeed(seeds: FeeRuleSeed[]): Promise<number> {
    let added = 0;
    seeds.forEach((seed) => {
      const existed = this.rows.some((rule) => rule.code === seed.code && rule.effectiveFrom === seed.effectiveFrom);
      if (existed) return;
      this.rows.push(makeFeeRule({ ...seed }));
      added += 1;
    });
    return added;
  }
}

export class InMemoryFeeChargeRepository implements FeeChargeRepository {
  readonly rows = new Map<string, FeeCharge>();

  constructor(seed: FeeCharge[] = []) {
    seed.forEach((charge) => this.rows.set(charge.id, charge));
  }

  async findByDossier(dossierId: string): Promise<FeeCharge[]> {
    return [...this.rows.values()]
      .filter((charge) => charge.dossierId === dossierId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.ruleCode.localeCompare(right.ruleCode));
  }

  async replaceForDossier(dossierId: string, charges: FeeCharge[]): Promise<FeeCharge[]> {
    const keptIds = new Set(charges.map((charge) => charge.id));
    [...this.rows.values()]
      .filter((charge) => charge.dossierId === dossierId && !keptIds.has(charge.id))
      .forEach((charge) => this.rows.delete(charge.id));
    charges.forEach((charge) => this.rows.set(charge.id, charge));
    return charges;
  }

  async save(charge: FeeCharge): Promise<FeeCharge> {
    this.rows.set(charge.id, charge);
    return charge;
  }
}

/**
 * Bắt chước **chỉ mục duy nhất có điều kiện** `uq_fee_transactions_reference`: mã biên lai duy
 * nhất trong phạm vi hồ sơ, giao dịch đã hủy không chặn ghi nhận lại.
 */
export class InMemoryFeeTransactionRepository implements FeeTransactionRepository {
  readonly rows = new Map<string, FeeTransaction>();

  constructor(seed: FeeTransaction[] = []) {
    seed.forEach((transaction) => this.rows.set(transaction.id, transaction));
  }

  async findById(id: string): Promise<FeeTransaction | null> {
    return this.rows.get(id) ?? null;
  }

  async findByDossier(dossierId: string): Promise<FeeTransaction[]> {
    return [...this.rows.values()]
      .filter((transaction) => transaction.dossierId === dossierId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async insert(transaction: FeeTransaction): Promise<FeeTransaction> {
    const hasRef = Boolean(transaction.referenceCode && transaction.referenceCode.trim());
    const duplicated =
      hasRef &&
      [...this.rows.values()].some(
        (row) =>
          row.dossierId === transaction.dossierId &&
          Boolean(row.referenceCode && row.referenceCode.trim()) &&
          row.referenceCode.trim() === transaction.referenceCode.trim() &&
          row.status !== FeeTransactionStatus.CANCELLED,
      );
    if (duplicated) throw new FeeTransactionReferenceError(transaction.referenceCode);
    this.rows.set(transaction.id, transaction);
    return transaction;
  }

  async update(transaction: FeeTransaction): Promise<FeeTransaction> {
    this.rows.set(transaction.id, transaction);
    return transaction;
  }

  async sumConfirmed(dossierId: string): Promise<number> {
    return [...this.rows.values()]
      .filter((transaction) => transaction.dossierId === dossierId && transaction.isConfirmed)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }
}

/** Danh mục mã lý do điều chỉnh phí. Mặc định có đúng một mã đang hiệu lực. */
export class FakeFeeReasonCatalog implements FeeReasonCodeCatalogPort {
  constructor(private readonly activeCodes: string[] = ['FEE_ADJ_MISS']) {}

  async findActiveAdjustReason(code: string): Promise<ReasonCodeView | null> {
    if (!this.activeCodes.includes(code)) return null;
    return { code, name: 'Điều chỉnh phí', scope: ReasonScope.FEE_ADJUST, active: true };
  }
}

/**
 * Cổng "đã tới bước thu phí" giả lập (quyết định chủ dự án). Mặc định **đã tới** để test luồng thu
 * bình thường không phải dựng phiên; đặt `set(false)` để dựng tình huống hồ sơ chưa tới bước phí.
 */
export class FakeFeeStepGate implements FeeStepGateQuery {
  readonly completedCalls: Array<{ dossierId: string; actorId: string }> = [];

  constructor(private reached = true) {}

  set(reached: boolean): void {
    this.reached = reached;
  }

  async hasReachedFeeStep(): Promise<boolean> {
    return this.reached;
  }

  async completeFeeStepIfSettled(dossierId: string, actorId: string): Promise<boolean> {
    this.completedCalls.push({ dossierId, actorId });
    return true;
  }
}

/**
 * Cổng tự tính phí giả lập (`FEE_CALCULATOR`) — ghi lại các `dossierId` đã được gọi `ensureCalculated`
 * để test hook "vừa tới bước thu phí thì tự tính". Mặc định không làm gì; đặt `failWith` để dựng tình
 * huống tính phí lỗi và kiểm best-effort (workflow không được vỡ theo).
 */
export class FakeDossierFeeCalculator implements DossierFeeCalculator {
  readonly calls: string[] = [];
  private effect: ((dossierId: string) => void | Promise<void>) | null = null;
  constructor(private error: Error | null = null) {}

  /** Dựng tình huống tính phí lỗi để kiểm best-effort (workflow/danh sách không được vỡ theo). */
  failWith(error: Error): void {
    this.error = error;
  }

  /** Mô phỏng việc tính phí **sinh ra khoản phí** (đổi nghĩa vụ tài chính) — dùng cho test lazy-calc. */
  onCalculate(effect: (dossierId: string) => void | Promise<void>): void {
    this.effect = effect;
  }

  async ensureCalculated(dossierId: string): Promise<void> {
    this.calls.push(dossierId);
    if (this.error) throw this.error;
    if (this.effect) await this.effect(dossierId);
  }
}

export class FakeFeeActorDirectory implements FeeActorDirectory {
  constructor(private readonly fullName = 'Trần Thu Phí') {}

  async findById(userId: string): Promise<FeeActor | null> {
    return { id: userId, fullName: this.fullName };
  }
}

/**
 * Cổng nghĩa vụ tài chính giả lập (F39). Mặc định **không có nghĩa vụ nào** — đúng trạng thái của
 * hồ sơ chưa tính phí, để test cũ của phân hệ cổng giữ nguyên ý nghĩa.
 */
export class FakeFeeSettlement implements FeeSettlementQuery {
  constructor(private snapshot: FeeSettlementSnapshot = NO_FEE_OBLIGATION) {}

  set(snapshot: FeeSettlementSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Đặt nhanh tình huống "còn nợ" — dùng cho test cổng bị chặn vì chưa xác nhận thanh toán. */
  owes(outstanding: number): void {
    this.snapshot = {
      total: outstanding,
      confirmed: 0,
      outstanding,
      settled: outstanding === 0,
      currency: FEE_CURRENCY,
    };
  }

  async snapshotOf(): Promise<FeeSettlementSnapshot> {
    return this.snapshot;
  }
}
