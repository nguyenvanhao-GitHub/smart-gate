import { buildDossierQrPayload } from '../../../modules/declarations/domain/dossier-qr';

/**
 * Logic đọc dữ liệu từ các cột `jsonb` cũ của bảng `declarations` để đổ sang bảng quan hệ.
 *
 * Tách khỏi tệp migration để **test được không cần cơ sở dữ liệu** — đây là phần rủi ro nhất của
 * đợt tách bảng (rủi ro **R2** của kế hoạch: di trú làm hỏng hồ sơ đang có). Mọi hàm ở đây phải
 * chịu được `jsonb` null, không phải object, hoặc thiếu trường.
 *
 * Nguyên tắc: **không bịa dữ liệu**. Thiếu thì để trống/null và ghi nhận vào số liệu đối chiếu,
 * để người vận hành nhìn ra chỗ cần bổ sung thay vì tưởng đã đủ.
 */

/** Một dòng đọc từ bảng `declarations` (đặt tên đúng như cột trong DB). */
export interface LegacyDeclarationRow {
  id: string;
  code: string;
  status: string;
  enterprise: unknown;
  enterpriseTaxCode: string | null;
  vehicle: unknown;
  plateNumber: string | null;
  containerNumber: string | null;
  trailerNumber: string | null;
  cargo: unknown;
  auditTrail: unknown;
  createdAt: Date | string;
}

export interface EnterpriseRowData {
  taxCode: string;
  name: string;
  representativeName: string | null;
  address: string | null;
  phone: string | null;
}

export interface VehicleRowData {
  dossierId: string;
  plateNumber: string;
  containerNumber: string | null;
  trailerNumber: string | null;
  transportLicenseNumber: string | null;
}

export interface CargoItemRowData {
  dossierId: string;
  lineNo: number;
  description: string;
  hsCode: string | null;
  quantity: number | null;
  grossWeightKg: number | null;
  quarantineTypes: string[] | null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Chỉ nhận mảng chuỗi thật. Phần tử kiểu khác là dữ liệu hỏng, thà bỏ còn hơn ghi vào bảng mới. */
function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Doanh nghiệp của một hồ sơ. Mã số thuế lấy từ `jsonb`, thiếu thì lùi về cột `enterpriseTaxCode`
 * (cột này NOT NULL nên gần như luôn có). Không có mã số thuế thì **không tạo** bản ghi doanh nghiệp —
 * hồ sơ đó sẽ hiện trong số liệu đối chiếu để xử lý tay.
 */
export function extractEnterprise(row: LegacyDeclarationRow): EnterpriseRowData | null {
  const source = asObject(row.enterprise);
  const taxCode = asText(source.taxCode) ?? asText(row.enterpriseTaxCode);
  if (!taxCode) return null;
  return {
    taxCode,
    // Tên trống được giữ nguyên là chuỗi rỗng — quy tắc kiểm tra khi gửi hồ sơ sẽ bắt lỗi này,
    // tốt hơn là bịa ra một cái tên trông như dữ liệu thật.
    name: asText(source.name) ?? '',
    representativeName: asText(source.representativeName),
    address: asText(source.address),
    phone: asText(source.phone),
  };
}

/**
 * Gộp doanh nghiệp theo mã số thuế: nhiều hồ sơ cùng một doanh nghiệp chỉ sinh **một** bản ghi.
 * Trường nào ở bản ghi đã gộp còn trống thì lấy giá trị đầu tiên tìm được ở các hồ sơ sau.
 */
export function mergeEnterprises(rows: LegacyDeclarationRow[]): Map<string, EnterpriseRowData> {
  const merged = new Map<string, EnterpriseRowData>();
  rows.forEach((row) => {
    const enterprise = extractEnterprise(row);
    if (!enterprise) return;
    const existing = merged.get(enterprise.taxCode);
    if (!existing) {
      merged.set(enterprise.taxCode, enterprise);
      return;
    }
    merged.set(enterprise.taxCode, {
      taxCode: existing.taxCode,
      name: existing.name || enterprise.name,
      representativeName: existing.representativeName ?? enterprise.representativeName,
      address: existing.address ?? enterprise.address,
      phone: existing.phone ?? enterprise.phone,
    });
  });
  return merged;
}

/** Phương tiện: mỗi hồ sơ đúng một dòng. Cột phẳng `plateNumber` là nguồn dự phòng cho `jsonb`. */
export function extractVehicle(row: LegacyDeclarationRow): VehicleRowData {
  const source = asObject(row.vehicle);
  return {
    dossierId: row.id,
    plateNumber: asText(source.plateNumber) ?? asText(row.plateNumber) ?? '',
    containerNumber: asText(source.containerNumber) ?? asText(row.containerNumber),
    trailerNumber: asText(source.trailerNumber) ?? asText(row.trailerNumber),
    transportLicenseNumber: asText(source.transportLicenseNumber),
  };
}

/**
 * Hàng hoá: cột `cargo` cũ chứa **một** khối, bảng mới cho **nhiều dòng** → mỗi hồ sơ sinh đúng
 * 1 dòng với `line_no = 1`. Không có mô tả hàng thì **không tạo dòng rỗng** — dòng hàng trống còn
 * tệ hơn là không có dòng nào, vì nó lọt qua mắt người kiểm tra.
 */
export function extractCargoItem(row: LegacyDeclarationRow): CargoItemRowData | null {
  const source = asObject(row.cargo);
  const description = asText(source.description);
  if (!description) return null;
  return {
    dossierId: row.id,
    lineNo: 1,
    description,
    hsCode: asText(source.hsCode),
    quantity: asNumber(source.quantity),
    grossWeightKg: asNumber(source.grossWeightKg),
    quarantineTypes: asStringArray(source.quarantineTypes),
  };
}

/**
 * Thời điểm gửi hồ sơ: lấy mốc sớm nhất của hành động `SUBMIT` trong `auditTrail`; không có thì
 * lùi về `createdAt` với mọi hồ sơ đã rời trạng thái nháp (hồ sơ P1 được tạo là đã gửi luôn).
 */
export function extractSubmittedAt(row: LegacyDeclarationRow): Date | null {
  const entries = Array.isArray(row.auditTrail) ? row.auditTrail : [];
  const submitDates = entries
    .map((entry) => asObject(entry))
    .filter((entry) => asText(entry.action) === 'SUBMIT')
    .map((entry) => asDate(entry.at))
    .filter((date): date is Date => !!date)
    .sort((left, right) => left.getTime() - right.getTime());

  if (submitDates.length > 0) return submitDates[0];
  if (row.status === 'DRAFT') return null;
  return asDate(row.createdAt);
}

/** Chuỗi QR của hồ sơ cũ, dùng đúng công thức domain để không lệch với hồ sơ tạo mới sau này. */
export function extractQrCode(row: LegacyDeclarationRow): string | null {
  const submittedAt = extractSubmittedAt(row);
  return submittedAt ? buildDossierQrPayload(row.code, submittedAt) : null;
}

/** Số liệu đối chiếu nguồn → đích, in ra nhật ký migration để phát hiện mất mát dữ liệu. */
export interface BackfillExpectation {
  declarations: number;
  enterprises: number;
  vehicles: number;
  cargoItems: number;
  /** Hồ sơ không suy ra được mã số thuế — phải xử lý tay, không tự tạo doanh nghiệp giả. */
  declarationsWithoutTaxCode: number;
  /** Hồ sơ không có mô tả hàng hoá nên không sinh dòng hàng nào. */
  declarationsWithoutCargo: number;
  submitted: number;
}

export function computeExpectation(rows: LegacyDeclarationRow[]): BackfillExpectation {
  const enterprises = mergeEnterprises(rows);
  const cargoItems = rows.map(extractCargoItem).filter((item): item is CargoItemRowData => !!item);
  return {
    declarations: rows.length,
    enterprises: enterprises.size,
    vehicles: rows.length,
    cargoItems: cargoItems.length,
    declarationsWithoutTaxCode: rows.filter((row) => !extractEnterprise(row)).length,
    declarationsWithoutCargo: rows.length - cargoItems.length,
    submitted: rows.filter((row) => !!extractSubmittedAt(row)).length,
  };
}
