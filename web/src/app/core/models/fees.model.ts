// =============================================================================
// Mô hình phân hệ thu phí (UI-11) — **mã định danh tách khỏi nhãn hiển thị**.
//
// Trước đây nhãn nút tiếng Việt vừa hiển thị, vừa là danh tính hành động gửi lên
// `POST /fees/:slug/actions/:action`, vừa là căn cứ tra biểu tượng/tông màu và loại modal
// (`action.includes('Hủy')`, `action.includes('gộp')`…). Nay tách làm ba: mã, nhãn (khóa i18n),
// quy tắc (bảng tra theo mã). Danh mục phải khớp `api/src/modules/fees/application/fee.catalog.ts`.
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { Translate, translateCode, translateLabel } from './label.util';

// --- Mã hành động ------------------------------------------------------------

// `COLLECT` (thu tiền) đã bị gỡ khỏi màn `/fees/:slug` (BUG-007): màn này chỉ tra cứu/đối soát, việc
// thu tiền THẬT đi qua màn phí theo hồ sơ (`POST /declarations/:id/fees/transactions`).
export const FEE_ACTION_CODES = [
  'SUPPLEMENT_PAYMENT',
  'CANCEL_PAYMENT',
  'MERGE_PAYMENT',
  'MERGE_INVOICE',
] as const;

export type FeeActionCode = (typeof FEE_ACTION_CODES)[number];

/** Kiểu modal mở ra cho một hành động — quyết định theo mã, không dò nhãn. */
export type FeeModalMode = 'payment' | 'cancel' | 'merge' | 'detail' | 'history';

export interface FeeActionView {
  code: FeeActionCode;
  labelKey: MessageKey;
  icon: string;
  tone: string;
  mode: FeeModalMode;
}

export const FEE_ACTION_VIEWS: Record<FeeActionCode, FeeActionView> = {
  SUPPLEMENT_PAYMENT: {
    code: 'SUPPLEMENT_PAYMENT',
    labelKey: 'ui.fee.actionSupplement',
    icon: 'add',
    tone: 'payment',
    mode: 'payment',
  },
  CANCEL_PAYMENT: {
    code: 'CANCEL_PAYMENT',
    labelKey: 'ui.fee.actionCancelPayment',
    icon: 'money_off',
    tone: 'revision',
    mode: 'cancel',
  },
  MERGE_PAYMENT: {
    code: 'MERGE_PAYMENT',
    labelKey: 'ui.fee.actionMergePayment',
    icon: 'sync_alt',
    tone: 'merge',
    mode: 'merge',
  },
  MERGE_INVOICE: {
    code: 'MERGE_INVOICE',
    labelKey: 'ui.fee.actionMergeInvoice',
    icon: 'merge_type',
    tone: 'merge',
    mode: 'merge',
  },
};

export function feeActionView(code: FeeActionCode): FeeActionView {
  return FEE_ACTION_VIEWS[code];
}

export function feeActionLabel(code: FeeActionCode, t?: Translate): string {
  return translateLabel(FEE_ACTION_VIEWS[code].labelKey, t);
}

// --- Mã trường tra cứu -------------------------------------------------------

export const FEE_SEARCH_FIELD_CODES = [
  'PLATE_NUMBER',
  'TRAILER_NUMBER',
  'FEE_CODE',
  'TAX_CODE',
  'CUSTOMS_DECLARATION_NO',
] as const;

export type FeeSearchFieldCode = (typeof FEE_SEARCH_FIELD_CODES)[number];

export const FEE_SEARCH_FIELD_LABEL_KEYS: Record<FeeSearchFieldCode, MessageKey> = {
  PLATE_NUMBER: 'ui.common.plateNumber',
  TRAILER_NUMBER: 'ui.fee.colTrailer',
  FEE_CODE: 'ui.fee.colCode',
  TAX_CODE: 'ui.common.taxCode',
  CUSTOMS_DECLARATION_NO: 'ui.common.customsDeclarationNo',
};

export function feeSearchFieldLabel(code: string, t?: Translate): string {
  return translateCode(FEE_SEARCH_FIELD_LABEL_KEYS[code as FeeSearchFieldCode], code, t);
}

// --- Trạng thái khoản phí (mã `ForceStatus`) --------------------------------

/** Nhãn trạng thái khoản phí — tra theo **mã** `ForceStatus`, mã lạ hiện nguyên mã. */
export const FEE_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  COMPLETED: 'ui.fee.statusPaid',
  NOT_APPLICABLE: 'ui.fee.statusNotApplicable',
  PENDING: 'ui.fee.statusWaiting',
  PROCESSING: 'ui.fee.statusProcessing',
  REVISION_REQUIRED: 'ui.fee.statusSupplement',
  CANCELLED: 'ui.fee.statusCancelled',
  FAILED: 'ui.fee.statusCancelled',
};

export function feeStatusLabel(status: string, t?: Translate): string {
  return translateCode(FEE_STATUS_LABEL_KEYS[status], status, t);
}

/** Nhóm trạng thái để đếm thẻ tóm tắt — theo mã, không so nhãn tiếng Việt. */
export type FeeStatusGroup = 'WAITING' | 'PAID' | 'SUPPLEMENT';

const FEE_STATUS_GROUPS: Record<FeeStatusGroup, string[]> = {
  WAITING: ['PENDING', 'PROCESSING'],
  PAID: ['COMPLETED'],
  SUPPLEMENT: ['REVISION_REQUIRED'],
};

export function feeStatusCount(rows: readonly { status: string }[], group: FeeStatusGroup): number {
  const codes = FEE_STATUS_GROUPS[group];
  return rows.filter((row) => codes.includes(String(row.status || '').toUpperCase())).length;
}

/**
 * Bộ lọc trạng thái ở màn danh sách phí — `'ALL'` không lọc, `'OVERDUE'` lọc theo **cờ** `overdue`
 * do API trả (không phải một nhóm mã trạng thái), còn lại lọc theo nhóm mã.
 */
export type FeeStatusFilter = FeeStatusGroup | 'OVERDUE' | 'ALL';

export function feeRowMatchesStatus(row: Pick<FeeRow, 'status' | 'overdue'>, filter: FeeStatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'OVERDUE') return !!row.overdue;
  return FEE_STATUS_GROUPS[filter].includes(String(row.status || '').toUpperCase());
}

// --- Cấu hình màn hình -------------------------------------------------------

/** `GET /fees/screens` trả về mã; nhãn tra từ `slug`. */
export interface FeeScreenConfig {
  slug: string;
  force: 'taxFee' | 'economicZoneFee';
  searchFields: FeeSearchFieldCode[];
  actions: FeeActionCode[];
}

export interface FeeScreenView {
  slug: string;
  titleKey: MessageKey;
  menuKey: MessageKey;
}

const FEE_SCREEN_VIEWS: Record<string, FeeScreenView> = {
  tax: { slug: 'tax', titleKey: 'ui.fee.screenTaxTitle', menuKey: 'ui.fee.screenTaxMenu' },
  'economic-zone': {
    slug: 'economic-zone',
    titleKey: 'ui.fee.screenEconomicZoneTitle',
    menuKey: 'ui.fee.screenEconomicZoneMenu',
  },
};

export function feeScreenView(slug: string): FeeScreenView | null {
  return FEE_SCREEN_VIEWS[slug] ?? null;
}

/** Một dòng phí do `GET /fees/:slug/items` trả về (trường `status` là mã `ForceStatus`). */
export interface FeeRow {
  declarationId?: string;
  code: string;
  plate: string;
  trailer: string;
  taxCode: string;
  company: string;
  /** Nhóm phí (mã `FeeType` của biểu phí) — web tra nhãn theo mã, hiện trên cột "Loại phí". */
  feeType: string;
  /** Tổng phải thu — số THẬT theo bảng phí đã chốt (`fee_charges`), khớp màn phí theo hồ sơ. */
  amount: number;
  /** Đã thu (tổng giao dịch đã xác nhận). */
  paid: number;
  /** Còn phải thu = tổng - đã thu (không âm). */
  outstanding: number;
  status: string;
  /** Ngày lập khoản phí (ISO) — cột "Ngày lập" và lọc theo khoảng ngày. */
  createdAt: string;
  /** Cờ quá hạn thanh toán do API tính theo cấu hình `FEE_PAYMENT_DEADLINE_HOURS`. */
  overdue: boolean;
  /**
   * Hồ sơ đã tới bước thu phí trong quy trình chưa (quyết định chủ dự án: chỉ được thu khi đã tới
   * bước phí). API tính từ workflow; web chỉ dùng để bật/tắt nút thu — **không tự tính luật**.
   */
  feeStepReached?: boolean;
}

// --- Tổng hợp KPI theo tiền (số THẬT do API trả từ settlement) --------------

/** Tổng số tiền phải thu của tất cả khoản phí đã tải. */
export function feeAmountTotal(rows: readonly FeeRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

/** Tổng tiền của các khoản thuộc một nhóm trạng thái (vd `PAID` = đã thu). */
export function feeAmountByGroup(rows: readonly FeeRow[], group: FeeStatusGroup): number {
  const codes = FEE_STATUS_GROUPS[group];
  return rows
    .filter((row) => codes.includes(String(row.status || '').toUpperCase()))
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

/** Tổng tiền **đã thu thật** (giao dịch đã xác nhận), cộng từ `paid` của từng dòng. */
export function feeAmountPaid(rows: readonly FeeRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.paid) || 0), 0);
}

/** Tổng tiền **còn phải thu thật**, cộng từ `outstanding` của từng dòng (không âm). */
export function feeAmountUnpaid(rows: readonly FeeRow[]): number {
  return Math.max(0, rows.reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0));
}

/** Tổng tiền còn nợ của các khoản quá hạn (theo cờ `overdue`). */
export function feeAmountOverdue(rows: readonly FeeRow[]): number {
  return rows.filter((row) => row.overdue).reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0);
}

/** Số phiếu chưa thanh toán xong (còn phải thu > 0) — thẻ đếm số phiếu, không phải số tiền. */
export function feeCountUnpaid(rows: readonly FeeRow[]): number {
  return rows.filter((row) => (Number(row.outstanding) || 0) > 0).length;
}

/** Số phiếu quá hạn thanh toán (theo cờ `overdue`) — thẻ đếm số phiếu. */
export function feeCountOverdue(rows: readonly FeeRow[]): number {
  return rows.filter((row) => row.overdue).length;
}

/** Danh sách mã nhóm phí xuất hiện trong dữ liệu đã tải — dựng dropdown "Loại phí" từ đây. */
export function distinctFeeTypes(rows: readonly FeeRow[]): string[] {
  return [...new Set(rows.map((row) => row.feeType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// =============================================================================
// UI-11 — Thu phí THEO HỒ SƠ (F46–F48, F51/F56).
//
// Khác hẳn phần trên: phần trên là **màn tác nghiệp phí theo lực lượng** (danh sách tờ khai
// phí, `/fees/:slug`), còn phần này là **bảng kê phí của một hồ sơ** (`/declarations/:id/fees`)
// — nơi tính phí, điều chỉnh có mã lý do, ghi nhận và xác nhận thanh toán.
//
// Nguyên tắc: **số tiền do API quyết**. Web chỉ tự cộng khi API không gửi `total`/`outstanding`,
// và luôn ưu tiên giá trị API trả — đây là dữ liệu tài chính, không được để hai nguồn lệch nhau.
// =============================================================================

/** Đơn vị tiền mặc định khi API không gửi `currency`. */
export const DEFAULT_FEE_CURRENCY = 'VND';

/** Một khoản phí đã tính của hồ sơ. */
export interface DossierFeeItem {
  ruleCode: string;
  name: string;
  unit: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

/** Một giao dịch thanh toán gắn với hồ sơ (F47, F48). */
export interface FeeTransaction {
  id: string;
  amount: number;
  method: string;
  referenceCode: string;
  attachmentId?: string | null;
  status: string;
  confirmedAt?: string | null;
  confirmedByName?: string | null;
  note?: string | null;
}

/** Kết quả `GET /declarations/:id/fees`. */
export interface DossierFeeSummary {
  dossierCode?: string;
  items: DossierFeeItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  currency: string;
  transactions: FeeTransaction[];
  /** Đã thanh toán đủ hay chưa — **điều kiện cho xe qua cổng** (F39). */
  settled: boolean;
  outstanding: number;
  /**
   * Hồ sơ đã tới bước thu phí trong quy trình chưa (quyết định chủ dự án). Web dùng để bật/tắt nút
   * ghi nhận / xác nhận thanh toán — **fail-closed** khi API không gửi (xem `feeStepReached`).
   */
  feeStepReached?: boolean;
}

/**
 * Kết quả các hành động ghi lên bảng kê (`.../actions/calculate`, `.../actions/adjust`).
 * Trường `fees` khai **tùy chọn**: màn hình luôn tải lại bảng kê sau khi ghi, nên phản hồi
 * thiếu trường này cũng không làm vỡ giao diện.
 */
export interface DossierFeeResult {
  fees?: DossierFeeSummary;
}

/** Điều chỉnh một khoản phí (F51) — **bắt buộc mã lý do** nhóm `REASON_FEE_ADJUST`. */
export interface FeeAdjustPayload {
  ruleCode: string;
  amount: number;
  reasonCode: string;
  reasonNote?: string;
}

/**
 * Thu phí **một nhịp** (`POST /declarations/:id/fees/collect`) — payload thu phí **duy nhất**, dùng
 * cho cả bàn làm việc thu ngân lẫn màn phí theo hồ sơ. Server ghi thẳng một giao dịch đã xác nhận,
 * không để lại giao dịch `PENDING` treo. `referenceCode` để trống với tiền mặt; phương thức khác web
 * bắt buộc nhập. `attachmentId` là biên lai/chứng từ đính kèm (tải trước qua `uploadFile()`).
 */
export interface CollectFeePayload {
  amount: number;
  method: string;
  referenceCode?: string;
  attachmentId?: string;
  note?: string;
}

/** Bộ lọc biểu phí — `at` là mốc thời gian hiệu lực (ISO). */
export interface FeeRuleFilters {
  dossierType?: string;
  at?: string;
}

/** Một dòng biểu phí hiện hành — `GET /catalog/fee-rules`. */
export interface FeeRule {
  code: string;
  name: string;
  unit: string;
  amount: number;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  appliesTo: string;
  active: boolean;
}

// =============================================================================
// F46 — Quản trị biểu phí (versioning). Khác `FeeRule` ở trên: trả **mọi bản** (kể cả đã đóng /
// chưa tới) kèm `id` để sửa từng bản. Nhãn nhóm phí / đơn vị / trạng thái tra qua i18n theo mã.
// =============================================================================

/** Nhóm phí — khớp `FeeType` của API. */
export const FEE_TYPE_CODES = ['INFRASTRUCTURE', 'PARKING', 'SERVICE', 'QUARANTINE', 'TAX'] as const;
export type FeeTypeCode = (typeof FEE_TYPE_CODES)[number];

/** Đơn vị tính — khớp `FeeUnit` của API. */
export const FEE_UNIT_CODES = ['TRIP', 'DAY', 'TON', 'PERCENT'] as const;
export type FeeUnitCode = (typeof FEE_UNIT_CODES)[number];

/** Trạng thái vòng đời một bản biểu phí — khớp `FeeRuleVersionStatus` của API. */
export type FeeRuleVersionStatus = 'SCHEDULED' | 'ACTIVE' | 'CLOSED';

export const FEE_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  INFRASTRUCTURE: 'ui.feeRule.typeInfrastructure',
  PARKING: 'ui.feeRule.typeParking',
  SERVICE: 'ui.feeRule.typeService',
  QUARANTINE: 'ui.feeRule.typeQuarantine',
  TAX: 'ui.feeRule.typeTax',
};

export const FEE_UNIT_LABEL_KEYS: Record<string, MessageKey> = {
  TRIP: 'ui.feeRule.unitTrip',
  DAY: 'ui.feeRule.unitDay',
  TON: 'ui.feeRule.unitTon',
  PERCENT: 'ui.feeRule.unitPercent',
};

export const FEE_RULE_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  SCHEDULED: 'ui.feeRule.statusScheduled',
  ACTIVE: 'ui.feeRule.statusActive',
  CLOSED: 'ui.feeRule.statusClosed',
};

export const FEE_RULE_STATUS_TONES: Record<string, string> = {
  SCHEDULED: 'waiting',
  ACTIVE: 'done',
  CLOSED: 'idle',
};

export function feeTypeLabel(code: string, t?: Translate): string {
  return translateCode(FEE_TYPE_LABEL_KEYS[code], code, t);
}

export function feeUnitLabel(code: string, t?: Translate): string {
  return translateCode(FEE_UNIT_LABEL_KEYS[code], code, t);
}

export function feeRuleStatusLabel(code: string, t?: Translate): string {
  return translateCode(FEE_RULE_STATUS_LABEL_KEYS[code], code, t);
}

export function feeRuleStatusTone(code: string): string {
  return FEE_RULE_STATUS_TONES[code] || 'idle';
}

/** Một **bản** biểu phí — `GET /catalog/fee-rules/admin`, `POST`/`PATCH /catalog/fee-rules`. */
export interface FeeRuleVersion {
  id: string;
  code: string;
  name: string;
  feeType: string;
  unit: string;
  amount: number;
  currency: string;
  appliesTo: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  sortOrder: number;
  description: string | null;
  status: FeeRuleVersionStatus;
}

/** Nhóm các khoản phí theo Nhóm phí (feeType) để hiển thị bảng. */
export interface FeeRuleGroup {
  feeType: string;
  code: string;
  name: string;
  versions: FeeRuleVersion[];
}

/** Thêm một bản biểu phí (F46). `amount` là số nguyên (đồng, hoặc % nguyên với đơn vị PERCENT). */
export interface CreateFeeRulePayload {
  code: string;
  name: string;
  feeType: string;
  unit: string;
  amount: number;
  currency?: string;
  appliesTo?: string[];
  effectiveFrom: string;
  description?: string;
}

/** Sửa một bản biểu phí (F46) — mọi trường tùy chọn; `code`/`effectiveFrom` không đổi được. */
export interface UpdateFeeRulePayload {
  name?: string;
  description?: string;
  sortOrder?: number;
  amount?: number;
  unit?: string;
  feeType?: string;
  appliesTo?: string[];
  currency?: string;
  active?: boolean;
}

/** Gộp danh sách bản biểu phí thành nhóm theo Nhóm phí (feeType), mỗi nhóm sắp phí tạo mới xuống cuối bảng. */
export function groupFeeRuleVersions(versions: FeeRuleVersion[], t?: Translate): FeeRuleGroup[] {
  const groups = new Map<string, FeeRuleGroup>();
  for (const version of versions) {
    const feeType = version.feeType || 'OTHER';
    const group = groups.get(feeType);
    if (group) {
      group.versions.push(version);
    } else {
      groups.set(feeType, {
        feeType,
        code: feeType,
        name: feeTypeLabel(feeType, t),
        versions: [version],
      });
    }
  }
  for (const group of groups.values()) {
    group.versions.sort((left, right) => {
      const sortOrderDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (sortOrderDiff !== 0) return sortOrderDiff;
      const effectiveDiff = left.effectiveFrom.localeCompare(right.effectiveFrom);
      if (effectiveDiff !== 0) return effectiveDiff;
      return left.name.localeCompare(right.name);
    });
    group.name = feeTypeLabel(group.feeType, t);
  }
  const orderMap = new Map<string, number>(FEE_TYPE_CODES.map((code, idx) => [code, idx]));
  return [...groups.values()].sort((left, right) => {
    const orderLeft = orderMap.has(left.feeType) ? orderMap.get(left.feeType)! : 999;
    const orderRight = orderMap.has(right.feeType) ? orderMap.get(right.feeType)! : 999;
    if (orderLeft !== orderRight) return orderLeft - orderRight;
    return left.feeType.localeCompare(right.feeType);
  });
}

// --- Phương thức thanh toán (mã ASCII trong tập đóng) ------------------------

/**
 * Phương thức **được chọn khi lập giao dịch mới** — 3 lựa chọn theo mockup `thu-phi.html`
 * (Tiền mặt · Chuyển khoản · Ví điện tử). `CARD` (Thẻ ngân hàng) đã gỡ khỏi danh sách chọn nhưng
 * **giữ nhãn** ở `FEE_PAYMENT_METHOD_LABEL_KEYS` để giao dịch cũ đã lưu `method='CARD'` vẫn hiển
 * thị đúng. BE cũng chặn `CARD` cho giao dịch mới (`FeeTransactionMethod`).
 */
export const FEE_PAYMENT_METHOD_CODES = ['CASH', 'TRANSFER', 'E_WALLET'] as const;

export type FeePaymentMethodCode = (typeof FEE_PAYMENT_METHOD_CODES)[number];

/** Nhãn tra theo mã — GIỮ `CARD` để hiển thị dữ liệu cũ dù không còn cho chọn mới. */
export const FEE_PAYMENT_METHOD_LABEL_KEYS: Record<string, MessageKey> = {
  CASH: 'ui.fee.methodCASH',
  TRANSFER: 'ui.fee.methodTRANSFER',
  CARD: 'ui.fee.methodCARD',
  E_WALLET: 'ui.fee.methodE_WALLET',
};

export function feePaymentMethodLabel(code: string, t?: Translate): string {
  return translateCode(FEE_PAYMENT_METHOD_LABEL_KEYS[code], code, t);
}

/**
 * Phương thức nào bắt buộc có mã giao dịch. Tiền mặt không có mã tham chiếu ngân hàng nên
 * được miễn; mọi phương thức khác đều phải truy ngược được về chứng từ.
 */
export function methodRequiresReference(code: string): boolean {
  return !!code && code !== 'CASH';
}

// --- Trạng thái giao dịch thanh toán ----------------------------------------

/**
 * Thu phí là **một bước nguyên tử**: giao dịch mới luôn ghi thẳng `CONFIRMED`, không còn `PENDING`.
 * API chỉ trả hai trạng thái (`CONFIRMED` / `CANCELLED`). Đừng thêm mã web tự nghĩ ra: mã lạ (kể cả
 * `PENDING` của dữ liệu cũ, nếu còn) vẫn hiện nguyên mã nhờ `translateCode`.
 */
export const FEE_TRANSACTION_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  CONFIRMED: 'ui.fee.txCONFIRMED',
  CANCELLED: 'ui.fee.txCANCELLED',
};

export const FEE_TRANSACTION_STATUS_TONES: Record<string, string> = {
  CONFIRMED: 'done',
  CANCELLED: 'rejected',
};

export function feeTransactionStatusLabel(status: string, t?: Translate): string {
  return translateCode(FEE_TRANSACTION_STATUS_LABEL_KEYS[status], status, t);
}

export function feeTransactionStatusTone(status: string): string {
  return FEE_TRANSACTION_STATUS_TONES[status] || 'idle';
}

// --- Tính toán hiển thị ------------------------------------------------------

/**
 * Còn phải thu. **Luôn ưu tiên `outstanding` của API**; chỉ khi API không gửi trường này
 * (dữ liệu cũ / phản hồi thiếu) web mới tự tính `tổng - đã xác nhận` để không hiện số rỗng.
 */
export function feeOutstanding(fees: DossierFeeSummary | null | undefined): number {
  if (!fees) return 0;
  if (typeof fees.outstanding === 'number' && Number.isFinite(fees.outstanding)) {
    return Math.max(0, fees.outstanding);
  }
  return Math.max(0, (Number(fees.total) || 0) - feeConfirmedAmount(fees));
}

/** Tổng số tiền đã được xác nhận thu (F48) — chỉ tính giao dịch trạng thái `CONFIRMED`. */
export function feeConfirmedAmount(fees: DossierFeeSummary | null | undefined): number {
  return (fees?.transactions || [])
    .filter((item) => String(item.status || '').toUpperCase() === 'CONFIRMED')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

/**
 * Đã thanh toán đủ hay chưa. Ưu tiên cờ `settled` của API; thiếu cờ thì suy từ số còn phải thu.
 * Đây là điều kiện cho xe qua cổng (F39) nên **fail-closed**: không có dữ liệu ⇒ coi là chưa đủ.
 */
export function feeSettled(fees: DossierFeeSummary | null | undefined): boolean {
  if (!fees) return false;
  if (typeof fees.settled === 'boolean') return fees.settled;
  return feeOutstanding(fees) <= 0;
}

/**
 * Hồ sơ đã tới bước thu phí chưa (quyết định chủ dự án: chỉ thu khi đã tới bước phí). Điều kiện thu
 * tiền nên **fail-closed**: thiếu cờ (API cũ / phản hồi thiếu) ⇒ coi là **chưa** tới, khoá nút thu.
 */
export function feeStepReached(fees: DossierFeeSummary | null | undefined): boolean {
  return fees?.feeStepReached === true;
}

/**
 * Định dạng tiền theo **locale đang chọn** (`vi-VN` / `en-US`) — không ghim cứng.
 * Mã tiền lạ làm `Intl` ném lỗi, khi đó rơi về "số + mã" thay vì làm vỡ màn hình.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string = DEFAULT_FEE_CURRENCY,
  locale = 'vi-VN',
): string {
  const value = Number(amount) || 0;
  const code = (currency || DEFAULT_FEE_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(value);
  } catch {
    return `${new Intl.NumberFormat(locale).format(value)} ${code}`;
  }
}

/** Số lượng/đơn giá trên bảng kê — số thường, vẫn theo locale. */
export function formatQuantity(value: number | null | undefined, locale = 'vi-VN'): string {
  return new Intl.NumberFormat(locale).format(Number(value) || 0);
}
