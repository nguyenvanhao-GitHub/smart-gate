// =============================================================================
// Ánh xạ lỗi do API trả về vào đúng ô nhập trên biểu mẫu (F13).
//
// API trả `errors: [{ field, message }]` — kèm `messageKey`/`messageParams` nếu
// lỗi đã được gắn khóa. Biểu mẫu cần tô đỏ đúng ô và hiện thông báo ngay tại
// chỗ, không chỉ một toast chung chung — nên phần ánh xạ tách riêng ở đây để
// kiểm thử được độc lập với component.
//
// Đa ngữ: truyền `translate` để lấy bản dịch theo khóa; **không có bản dịch thì
// dùng `message` của API** (fail-soft — không bao giờ hiện khóa trần).
// =============================================================================

import { DossierFieldError } from '../models/declaration.model';

/** Hàm dịch lỗi: trả chuỗi rỗng khi không có bản dịch cho khóa. */
export type FieldErrorTranslator = (error: DossierFieldError) => string;

/** Lời văn hiển thị cho một lỗi: ưu tiên bản dịch theo khóa, nếu không thì `message` của API. */
export function fieldErrorText(error: DossierFieldError, translate?: FieldErrorTranslator): string {
  const translated = translate ? (translate(error) || '').trim() : '';
  return translated || (error?.message || '').trim();
}

/** Bản đồ `tên trường -> thông báo lỗi`. */
export type FieldErrorMap = Record<string, string>;

/** Tiền tố API hay thêm vào tên trường khi validate cả body. */
const IGNORED_PREFIXES = ['body.', 'payload.', 'dto.'];

/**
 * Chuẩn hóa tên trường về đúng khóa biểu mẫu đang dùng.
 *
 *   'body.enterprise.taxCode'   -> 'enterprise.taxCode'
 *   'cargoItems.0.description'  -> 'cargoItems[0].description'
 *   'cargoItems[1].hsCode'      -> 'cargoItems[1].hsCode'
 */
export function normalizeFieldName(field: string): string {
  let name = (field || '').trim();
  if (!name) return '';
  for (const prefix of IGNORED_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }
  // `a.0.b` -> `a[0].b`
  name = name.replace(/\.(\d+)(?=\.|$)/g, '[$1]');
  return name;
}

/**
 * Gom danh sách lỗi thành bản đồ theo tên trường.
 * Cùng một trường có nhiều lỗi thì giữ **thông báo đầu tiên** — đó là lỗi API ưu tiên báo.
 */
export function toFieldErrorMap(
  errors: readonly DossierFieldError[] | null | undefined,
  translate?: FieldErrorTranslator,
): FieldErrorMap {
  const result: FieldErrorMap = {};
  (errors || []).forEach((item) => {
    const field = normalizeFieldName(item?.field || '');
    const message = fieldErrorText(item, translate);
    if (!field || !message || result[field]) return;
    result[field] = message;
  });
  return result;
}

/**
 * Ánh xạ khóa lỗi nghiệp vụ sang tên trường biểu mẫu khi API trả về dưới dạng chuỗi `message`
 * của ValidationPipe (hoặc dạng lồng `<prefix>.dossier.<key>`).
 */
export const DOSSIER_MESSAGE_KEY_FIELD_MAP: Record<string, string> = {
  'dossier.missingEnterpriseTaxCode': 'enterprise.taxCode',
  'dossier.invalidEnterpriseTaxCode': 'enterprise.taxCode',
  'dossier.missingIdNumber': 'enterprise.taxCode',
  'dossier.missingEnterpriseName': 'enterprise.name',
  'dossier.missingRepresentative': 'enterprise.representativeName',
  'dossier.missingPhone': 'enterprise.phone',
  'dossier.invalidPhone': 'enterprise.phone',
  'dossier.missingAddress': 'enterprise.address',
  'dossier.missingEmail': 'enterprise.email',
  'dossier.invalidEmail': 'enterprise.email',
  'dossier.missingScheduledAt': 'appointment.scheduledAt',
  'dossier.appointmentInPast': 'appointment.scheduledAt',
  'dossier.missingVehicles': 'vehicles',
  'dossier.missingPlateNumber': 'vehicles[0].plateNumber',
  'dossier.invalidPlateNumber': 'vehicles[0].plateNumber',
  'dossier.missingVehicleType': 'vehicles[0].vehicleType',
  'dossier.missingContainerNumber': 'vehicles[0].containerNumber',
  'dossier.missingTrailerNumber': 'vehicles[0].trailerNumber',
  'dossier.missingTransportLicense': 'vehicles[0].transportLicenseNumber',
  'dossier.missingPayloadWeight': 'vehicles[0].weightKg',
  'dossier.invalidPayloadWeight': 'vehicles[0].weightKg',
  'dossier.missingDriverName': 'vehicles[0].driver.fullName',
  'dossier.missingDriverDocType': 'vehicles[0].driver.idType',
  'dossier.missingDriverDocNo': 'vehicles[0].driver.idNumber',
  'dossier.missingDriverLicenseNo': 'vehicles[0].driver.licenseNumber',
  'dossier.missingDriverPhone': 'vehicles[0].driver.phone',
  'dossier.missingDriverNationality': 'vehicles[0].driver.nationality',
  'dossier.missingCargoItems': 'cargoItems',
  'dossier.missingCargoType': 'cargoItems[0].cargoTypeCode',
  'dossier.missingCargoName': 'cargoItems[0].description',
  'dossier.missingQuantity': 'cargoItems[0].quantity',
  'dossier.invalidQuantity': 'cargoItems[0].quantity',
  'dossier.missingUnit': 'cargoItems[0].unitCode',
  'dossier.missingCargoWeight': 'cargoItems[0].grossWeightKg',
  'dossier.invalidCargoWeight': 'cargoItems[0].grossWeightKg',
  'dossier.missingDocument': 'attachments',
};

/**
 * Tra cứu an toàn tên trường từ khóa thông báo, bảo vệ chống prototype pollution (ví dụ messageKey = '__proto__').
 */
function getMappedDossierField(messageKey: string): string {
  if (messageKey && Object.prototype.hasOwnProperty.call(DOSSIER_MESSAGE_KEY_FIELD_MAP, messageKey)) {
    const val = DOSSIER_MESSAGE_KEY_FIELD_MAP[messageKey];
    return typeof val === 'string' ? val : '';
  }
  return '';
}

/**
 * Rút danh sách lỗi từ phản hồi API — chấp nhận nhiều dạng gói khác nhau:
 * `HttpErrorResponse` (400), thân lỗi thuần, `errors` là mảng chuỗi, hoặc
 * `message` là mảng chuỗi kiểu ValidationPipe mặc định của NestJS.
 */
export function extractFieldErrors(error: unknown): DossierFieldError[] {
  const body = unwrapErrorBody(error);
  if (!body) return [];

  const raw = Array.isArray(body['errors'])
    ? (body['errors'] as unknown[])
    : Array.isArray(body['message'])
      ? (body['message'] as unknown[])
      : [];

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        const str = item.trim();
        const match = /^(?:([a-zA-Z0-9_[\].]+)\.)?(dossier\.[a-zA-Z0-9_]+)$/.exec(str);
        if (match) {
          const rawPrefix = match[1] || '';
          const messageKey = match[2];
          let mappedField = getMappedDossierField(messageKey) || rawPrefix;
          if (rawPrefix) {
            const prefixMatch = /^(cargoItems|vehicles)(?:\[(\d+)\]|\.(\d+))/.exec(rawPrefix);
            if (prefixMatch) {
              const listName = prefixMatch[1];
              const idx = prefixMatch[2] ?? prefixMatch[3];
              if (mappedField.startsWith(`${listName}[0].`)) {
                mappedField = `${listName}[${idx}]${mappedField.slice(`${listName}[0]`.length)}`;
              }
            }
          }
          return { field: mappedField, message: str, messageKey };
        }
        return { field: '', message: str };
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        let field = typeof record['field'] === 'string' ? record['field'] : '';
        const messageKey = typeof record['messageKey'] === 'string' ? record['messageKey'] : '';
        if (messageKey && (!field || field === 'enterprise' || field === 'appointment')) {
          const mapped = getMappedDossierField(messageKey);
          if (mapped) field = mapped;
        }
        return {
          field,
          message: typeof record['message'] === 'string' ? record['message'] : '',
          // Giữ nguyên khóa nếu API có gửi — giao diện dịch được thì dịch, không thì dùng `message`.
          ...(messageKey ? { messageKey } : {}),
          ...(record['messageParams'] && typeof record['messageParams'] === 'object'
            ? { messageParams: record['messageParams'] as DossierFieldError['messageParams'] }
            : {}),
        };
      }
      return { field: '', message: '' };
    })
    .filter((item) => !!item.message);
}

/** Thông báo tổng quát kèm theo lỗi (nếu API có gửi). */
export function extractErrorMessage(error: unknown): string {
  const body = unwrapErrorBody(error);
  const message = body?.['message'];
  return typeof message === 'string' ? message : '';
}

/**
 * Khóa thông báo (`messageKey`) của lỗi cấp cao — **hợp đồng ổn định giữa API và web**.
 *
 * Đây là thứ để nhận ra lỗi thuộc loại nào mà **không phụ thuộc ngôn ngữ**. Dò chuỗi hiển thị
 * (`message.includes('lý do')`) hỏng ngay khi API trả tiếng Anh; khóa thì không đổi theo ngôn ngữ.
 */
export function extractErrorMessageKey(error: unknown): string {
  const body = unwrapErrorBody(error);
  const key = body?.['messageKey'];
  return typeof key === 'string' ? key : '';
}

function unwrapErrorBody(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null;
  const outer = error as Record<string, unknown>;
  const inner = outer['error'];
  if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
  return outer;
}

/** Gốc của tên trường: `cargoItems[0].description` -> `cargoItems`. */
export function fieldRoot(field: string): string {
  return normalizeFieldName(field).split(/[.[]/)[0] || '';
}

/** Chỉ số dòng hàng hóa trong tên trường, trả `null` nếu không phải trường theo dòng. */
export function fieldRowIndex(field: string): number | null {
  const matched = /\[(\d+)\]/.exec(normalizeFieldName(field));
  return matched ? Number(matched[1]) : null;
}

/** Các lỗi không gắn được vào ô nào — hiện ở banner chung của biểu mẫu. */
export function unmappedErrors(
  errors: readonly DossierFieldError[],
  knownFields: readonly string[],
  translate?: FieldErrorTranslator,
): string[] {
  return (errors || [])
    .filter((item) => {
      const field = normalizeFieldName(item?.field || '');
      return !field || !knownFields.includes(field);
    })
    .map((item) => fieldErrorText(item, translate))
    .filter((message) => !!message);
}

/** Fallback cho lỗi duplicate cũ (dò theo messageKey và chuỗi tiếng Việt dự phòng). */
export function fallbackDuplicateFieldError(error: unknown, fallbackMessage: string): DossierFieldError | null {
  const status = (error as { status?: number })?.status;
  if (status !== 400 && status !== 409) return null;

  const messageKey = extractErrorMessageKey(error);
  const msg = extractErrorMessage(error).toLowerCase();

  if (messageKey === 'auth.registerDuplicateUsername' || messageKey === 'user.duplicated') {
    return { field: 'username', message: fallbackMessage };
  }
  
  /* eslint-disable no-restricted-syntax */
  if (messageKey === 'auth.registerDuplicateEmail' || msg.includes('thư điện tử') || msg.includes('email')) {
    return { field: 'email', message: fallbackMessage };
  }
  if (messageKey === 'auth.registerDuplicatePhone' || msg.includes('điện thoại') || msg.includes('phone')) {
    return { field: 'phone', message: fallbackMessage };
  }
  if (messageKey === 'auth.registerDuplicateTaxCode' || msg.includes('thuế') || msg.includes('tax')) {
    return { field: 'taxCode', message: fallbackMessage };
  }
  if (messageKey === 'auth.registerDuplicateIdNumber' || msg.includes('cccd') || msg.includes('hộ chiếu')) {
    return { field: 'idNumber', message: fallbackMessage };
  }
  if (msg.includes('tên đăng nhập') || msg.includes('username')) {
    return { field: 'username', message: fallbackMessage };
  }
  /* eslint-enable no-restricted-syntax */

  return null;
}

export interface ProcessedApiErrors {
  fieldErrors: FieldErrorMap;
  unmappedMessages: string[];
  hasKnownField: boolean;
}

/** Trích xuất và ánh xạ mảng lỗi từ API xuống form, có lọc theo KNOWN_FIELDS và fallback duplicate. */
export function processApiErrors(
  error: unknown,
  fallbackMessage: string,
  knownFields: string[],
  translate: FieldErrorTranslator
): ProcessedApiErrors {
  const apiErrors = extractFieldErrors(error);
  const duplicateFallback = fallbackDuplicateFieldError(error, fallbackMessage);
  if (duplicateFallback && apiErrors.length === 0) {
    apiErrors.push(duplicateFallback);
  }

  const errorMap = toFieldErrorMap(apiErrors, translate);
  const fieldErrors = Object.fromEntries(Object.entries(errorMap).filter(([k]) => knownFields.includes(k)));
  const hasKnownField = Object.keys(fieldErrors).length > 0;
  const unmappedMessages = unmappedErrors(apiErrors, knownFields, translate);

  return { fieldErrors, unmappedMessages, hasKnownField };
}

