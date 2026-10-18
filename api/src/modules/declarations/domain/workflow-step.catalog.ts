import { CheckpointCode, DeclarationStatus, DeclarationType, WorkflowStepCode } from './declaration.enums';

/**
 * Siêu dữ liệu **hiển thị** của từng bước nghiệp vụ: tên bước, lực lượng chủ trì, chốt tương ứng
 * và trạng thái `WAITING_*` của hồ sơ khi đang chờ bước đó.
 *
 * ⚠️ Ở đây **không** có thứ tự bước và **không** có danh sách vai trò được thao tác — hai thứ đó là
 * dữ liệu, nằm ở bảng `workflow_step_roles` (seed từ `access-control/domain/workflow-step-role.catalog.ts`)
 * và được đọc lúc chạy qua cổng `WORKFLOW_STEP_DIRECTORY`. Đổi thứ tự bước = sửa dữ liệu, không sửa mã nguồn.
 */
/**
 * Chiều của **bước cổng** (CR7/28/30): xe VÀO (`ENTRY`) hay xe RA (`EXIT`) cửa khẩu. Bốn bước
 * "Biên phòng xác nhận xe vào/ra tại Barrie" mang thuộc tính này; các bước khác để `null`. Đây là
 * mã ASCII trong tập đóng — dùng làm dấu hiệu nhận biết bước cổng thay cho mã lực lượng cũ
 * `GATE_OFFICER` (đã bỏ theo CR42), vì nay cả 4 bước cổng đều do **Biên phòng** thực hiện.
 */
export const GateStepDirection = {
  ENTRY: 'ENTRY',
  EXIT: 'EXIT',
} as const;
export type GateStepDirection = (typeof GateStepDirection)[keyof typeof GateStepDirection];

export interface WorkflowStepMetadata {
  code: WorkflowStepCode;
  name: string;
  /** Mã vai trò RBAC của lực lượng chủ trì bước (khớp `role.catalog.ts`). */
  agencyCode: string;
  agencyName: string;
  /** Chốt vật lý mà hồ sơ đứng khi bước hoàn thành. Null với bước khai báo. */
  checkpoint: CheckpointCode | null;
  /** Trạng thái hồ sơ trong lúc chờ bước này (Phụ lục A của SRS). */
  waitingStatus: DeclarationStatus | null;
  /**
   * Bước cổng và chiều của nó (CR7). Khác `null` nghĩa là bước này **do sự kiện cổng khép**, không
   * quyết định qua `POST /workflow/.../decide`: `ENTRY` khép khi ghi sự kiện cổng VÀO, `EXIT` khép
   * khi ghi sự kiện cổng RA. Bước thường để `null`.
   */
  gate: GateStepDirection | null;
}

const AGENCY_NAMES: Record<string, string> = {
  ENTERPRISE: 'Doanh nghiệp',
  BORDER_GUARD: 'Biên phòng',
  CUSTOMS: 'Hải quan',
  QUARANTINE: 'Kiểm dịch',
  FEE_COLLECTOR: 'Cơ quan thu phí',
};

export function agencyName(agencyCode: string): string {
  return AGENCY_NAMES[agencyCode] ?? agencyCode;
}

function step(
  code: WorkflowStepCode,
  name: string,
  agencyCode: string,
  checkpoint: CheckpointCode | null,
  waitingStatus: DeclarationStatus | null,
  gate: GateStepDirection | null = null,
): WorkflowStepMetadata {
  return { code, name, agencyCode, agencyName: agencyName(agencyCode), checkpoint, waitingStatus, gate };
}

export const WORKFLOW_STEP_METADATA: Record<WorkflowStepCode, WorkflowStepMetadata> = {
  [WorkflowStepCode.EXPORT_DECLARED]: step(WorkflowStepCode.EXPORT_DECLARED, 'Doanh nghiệp khai báo', 'ENTERPRISE', null, null),
  [WorkflowStepCode.EXPORT_B2_ENTRY]: step(
    WorkflowStepCode.EXPORT_B2_ENTRY,
    'Biên phòng xác nhận xe vào cửa khẩu tại Barrie 2',
    'BORDER_GUARD',
    CheckpointCode.B2,
    DeclarationStatus.WAITING_GATE,
    GateStepDirection.ENTRY,
  ),
  [WorkflowStepCode.EXPORT_CUSTOMS]: step(
    WorkflowStepCode.EXPORT_CUSTOMS,
    'Hải quan kiểm tra nghiệp vụ theo chuyên ngành',
    'CUSTOMS',
    CheckpointCode.YARD,
    DeclarationStatus.BUSINESS_PROCESSING,
  ),
  [WorkflowStepCode.EXPORT_QUARANTINE]: step(
    WorkflowStepCode.EXPORT_QUARANTINE,
    'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành',
    'QUARANTINE',
    CheckpointCode.YARD,
    DeclarationStatus.BUSINESS_PROCESSING,
  ),
  [WorkflowStepCode.EXPORT_BORDER]: step(
    WorkflowStepCode.EXPORT_BORDER,
    'Biên phòng kiểm tra nghiệp vụ theo chuyên ngành',
    'BORDER_GUARD',
    CheckpointCode.B1,
    DeclarationStatus.BUSINESS_PROCESSING,
  ),
  [WorkflowStepCode.EXPORT_FEE]: step(
    WorkflowStepCode.EXPORT_FEE,
    'Thu phí (nếu có)',
    'FEE_COLLECTOR',
    CheckpointCode.B1,
    DeclarationStatus.WAITING_FOR_FEE,
  ),
  [WorkflowStepCode.EXPORT_B1_EXIT]: step(
    WorkflowStepCode.EXPORT_B1_EXIT,
    'Biên phòng xác nhận xe ra cửa khẩu tại Barrie 1',
    'BORDER_GUARD',
    CheckpointCode.B1,
    DeclarationStatus.READY_FOR_EXIT,
    GateStepDirection.EXIT,
  ),
  [WorkflowStepCode.IMPORT_DECLARED]: step(WorkflowStepCode.IMPORT_DECLARED, 'Doanh nghiệp khai báo', 'ENTERPRISE', null, null),
  [WorkflowStepCode.IMPORT_B1_ENTRY]: step(
    WorkflowStepCode.IMPORT_B1_ENTRY,
    'Biên phòng xác nhận xe vào cửa khẩu tại Barrie 1',
    'BORDER_GUARD',
    CheckpointCode.B1,
    DeclarationStatus.WAITING_GATE,
    GateStepDirection.ENTRY,
  ),
  [WorkflowStepCode.IMPORT_BORDER]: step(
    WorkflowStepCode.IMPORT_BORDER,
    'Biên phòng kiểm tra nghiệp vụ theo chuyên ngành',
    'BORDER_GUARD',
    CheckpointCode.B1,
    DeclarationStatus.BUSINESS_PROCESSING,
  ),
  [WorkflowStepCode.IMPORT_QUARANTINE]: step(
    WorkflowStepCode.IMPORT_QUARANTINE,
    'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành',
    'QUARANTINE',
    CheckpointCode.YARD,
    DeclarationStatus.BUSINESS_PROCESSING,
  ),
  [WorkflowStepCode.IMPORT_CUSTOMS]: step(
    WorkflowStepCode.IMPORT_CUSTOMS,
    'Hải quan kiểm tra nghiệp vụ theo chuyên ngành',
    'CUSTOMS',
    CheckpointCode.B5,
    DeclarationStatus.BUSINESS_PROCESSING,
  ),
  [WorkflowStepCode.IMPORT_FEE]: step(
    WorkflowStepCode.IMPORT_FEE,
    'Thu phí (nếu có)',
    'FEE_COLLECTOR',
    CheckpointCode.B2,
    DeclarationStatus.WAITING_FOR_FEE,
  ),
  [WorkflowStepCode.IMPORT_B2_EXIT]: step(
    WorkflowStepCode.IMPORT_B2_EXIT,
    'Biên phòng xác nhận xe ra cửa khẩu tại Barrie 2',
    'BORDER_GUARD',
    CheckpointCode.B2,
    DeclarationStatus.READY_FOR_EXIT,
    GateStepDirection.EXIT,
  ),
};

export function workflowStepMetadata(code: string): WorkflowStepMetadata | undefined {
  return WORKFLOW_STEP_METADATA[code as WorkflowStepCode];
}

/**
 * Ba lực lượng chuyên ngành chủ trì các **bước kiểm tra nghiệp vụ** (CR41): Biên phòng, Kiểm dịch,
 * Hải quan. Khớp mã vai trò RBAC ở `role.catalog.ts` / `AGENCY_NAMES`.
 */
const INSPECTION_AGENCY_CODES = new Set(['BORDER_GUARD', 'QUARANTINE', 'CUSTOMS']);

/**
 * Bước này có phải **bước kiểm tra nghiệp vụ** không (CR41 — dùng cho bảng điều phối 3 khung):
 * do một trong ba lực lượng Biên phòng/Kiểm dịch/Hải quan chủ trì **và không phải bước cổng**
 * (`gate === null`). Sau CR7/28/30 các bước "Biên phòng xác nhận xe vào/ra tại Barrie" là bước cổng
 * (`gate = ENTRY/EXIT`) nên bị loại — mỗi luồng chỉ còn đúng ba bước kiểm tra chuyên ngành. Bước
 * khai báo (`ENTERPRISE`), thu phí (`FEE_COLLECTOR`) và bước cổng đều **không** tính.
 */
export function isInspectionStep(code: string): boolean {
  const meta = workflowStepMetadata(code);
  return !!meta && meta.gate === null && INSPECTION_AGENCY_CODES.has(meta.agencyCode);
}

/** Mã mọi bước kiểm tra nghiệp vụ — dẫn xuất từ metadata, không hard-code danh sách. */
export const INSPECTION_STEP_CODES: string[] = (Object.keys(WORKFLOW_STEP_METADATA) as WorkflowStepCode[]).filter((code) =>
  isInspectionStep(code),
);

/** Luồng xuất và sang tải đầu xuất dùng chung bộ bước `EXPORT_*`; nhập, xe tự hành và sang tải đầu nhập dùng `IMPORT_*`. */
export function isExportLikeType(type: DeclarationType): boolean {
  return type === DeclarationType.EXPORT || type === DeclarationType.TRANSSHIPMENT_EXPORT;
}

/** Tiền tố mã bước theo loại hình hồ sơ — dùng để lọc bảng `workflow_step_roles`. */
export function stepPrefixForType(type: DeclarationType): 'EXPORT_' | 'IMPORT_' {
  return isExportLikeType(type) ? 'EXPORT_' : 'IMPORT_';
}
