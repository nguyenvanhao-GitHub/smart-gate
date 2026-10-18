/**
 * Danh mục tham số cấu hình hệ thống (BA-092) — **tập ĐÓNG mã ASCII**, không phải chuỗi tự do.
 *
 * Mỗi tham số ở đây phải **nối được vào hành vi thật** của hệ thống (không thêm cho có). Hiện có hai
 * tham số, cả hai vốn là hằng đọc từ biến môi trường; nay quản trị viên chỉnh được qua màn "Cấu hình
 * hệ thống", giá trị lưu ở bảng `system_settings` và được các phân hệ đọc qua `SETTINGS_READER`
 * (fallback về biến môi trường rồi mặc định để không vỡ khi bảng chưa có bản ghi):
 *   · `yard.maxStorageHours`     — số giờ lưu bãi tối đa (F42/F44): tính mốc dự kiến rời bãi + cờ quá hạn.
 *   · `fee.paymentDeadlineHours`  — hạn thanh toán phí (giờ, F47/UI-11): gắn cờ quá hạn cho khoản phí.
 *   · `fee.enabled`               — CR29: cờ bật/tắt Thu phí chung. TẮT → bước Thu phí bị bỏ khỏi luồng
 *                                   (đọc & đóng băng lúc mở phiên workflow, chỉ áp hồ sơ mới).
 *
 * Thêm tham số mới = thêm một dòng định nghĩa ở đây + nối một consumer thật + thêm nhãn i18n phía web.
 */
export const SYSTEM_SETTING_KEYS = {
  YARD_MAX_STORAGE_HOURS: 'yard.maxStorageHours',
  FEE_PAYMENT_DEADLINE_HOURS: 'fee.paymentDeadlineHours',
  FEE_ENABLED: 'fee.enabled',
} as const;

export type SystemSettingKey = (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

/**
 * Kiểu giá trị của tham số — số nguyên (`integer`) hoặc luận lý (`boolean`, CR29). Giá trị **luôn lưu
 * dạng chuỗi** trong `system_settings`: số nguyên là chữ số; luận lý được chuẩn hoá về `'true'`/`'false'`.
 */
export type SystemSettingValueType = 'integer' | 'boolean';

export interface SystemSettingDefinition {
  key: SystemSettingKey;
  /** Nhóm hiển thị (mã ASCII, web tra nhãn theo mã): `yard` | `fee`. */
  group: string;
  valueType: SystemSettingValueType;
  /** Giá trị mặc định (chuỗi) — dùng cho seed và làm giá trị hiển thị khi bảng chưa có bản ghi. */
  defaultValue: string;
  /** Khoảng hợp lệ cho tham số **số nguyên**; với tham số luận lý không có ý nghĩa (đặt 0/1). */
  min: number;
  max: number;
  sortOrder: number;
}

/** Trần 8760 = số giờ trong một năm — chặn nhập nhầm giá trị vô lý. */
const MAX_HOURS_IN_YEAR = 8760;

export const SYSTEM_SETTING_DEFINITIONS: SystemSettingDefinition[] = [
  {
    key: SYSTEM_SETTING_KEYS.YARD_MAX_STORAGE_HOURS,
    group: 'yard',
    valueType: 'integer',
    defaultValue: '48',
    min: 1,
    max: MAX_HOURS_IN_YEAR,
    sortOrder: 1,
  },
  {
    key: SYSTEM_SETTING_KEYS.FEE_PAYMENT_DEADLINE_HOURS,
    group: 'fee',
    valueType: 'integer',
    defaultValue: '72',
    min: 1,
    max: MAX_HOURS_IN_YEAR,
    sortOrder: 2,
  },
  {
    // CR29 — cờ Thu phí chung, **mặc định BẬT**. Consumer thật: `WorkflowProvisioningService` đọc &
    // đóng băng cờ lúc mở phiên (bỏ bước Thu phí khỏi lộ trình khi tắt). min/max không dùng cho boolean.
    key: SYSTEM_SETTING_KEYS.FEE_ENABLED,
    group: 'fee',
    valueType: 'boolean',
    defaultValue: 'true',
    min: 0,
    max: 1,
    sortOrder: 3,
  },
];

/** Giá trị chuỗi được coi là `true` / `false` khi nhập tham số luận lý (tập đóng, không dò nhãn). */
const BOOLEAN_TRUE_TOKENS = new Set(['true', '1']);
const BOOLEAN_FALSE_TOKENS = new Set(['false', '0']);

const DEFINITION_BY_KEY = new Map<string, SystemSettingDefinition>(
  SYSTEM_SETTING_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function isSystemSettingKey(key: string): key is SystemSettingKey {
  return DEFINITION_BY_KEY.has(key);
}

export function findSystemSettingDefinition(key: string): SystemSettingDefinition | undefined {
  return DEFINITION_BY_KEY.get(key);
}

export interface SettingValueValidation {
  ok: boolean;
  /** Giá trị đã chuẩn hoá (chuỗi số nguyên, hoặc `'true'`/`'false'`) khi hợp lệ. */
  value?: string;
}

/**
 * Chuẩn hoá và kiểm giá trị theo định nghĩa. Với tham số **số nguyên**: phải là số nguyên trong
 * `[min, max]`. Với tham số **luận lý** (CR29): nhận `true/false/1/0` (không phân biệt hoa thường),
 * chuẩn hoá về `'true'`/`'false'`. Trả về giá trị đã chuẩn hoá khi hợp lệ, ngược lại `ok = false`.
 */
export function normalizeSettingValue(definition: SystemSettingDefinition, raw: string): SettingValueValidation {
  const trimmed = (raw ?? '').trim();
  if (definition.valueType === 'boolean') {
    const token = trimmed.toLowerCase();
    if (BOOLEAN_TRUE_TOKENS.has(token)) return { ok: true, value: 'true' };
    if (BOOLEAN_FALSE_TOKENS.has(token)) return { ok: true, value: 'false' };
    return { ok: false };
  }
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isInteger(value) || value < definition.min || value > definition.max) {
    return { ok: false };
  }
  return { ok: true, value: String(value) };
}

/**
 * Diễn giải giá trị chuỗi của một tham số luận lý về `boolean`. Nhận `true/false/1/0` (không phân biệt
 * hoa thường); giá trị trống/không nhận diện được → dùng `fallback` để không vỡ khi bảng chưa có bản ghi.
 */
export function parseBooleanSetting(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const token = raw.trim().toLowerCase();
  if (BOOLEAN_TRUE_TOKENS.has(token)) return true;
  if (BOOLEAN_FALSE_TOKENS.has(token)) return false;
  return fallback;
}
