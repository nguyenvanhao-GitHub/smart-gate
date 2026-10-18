import { DeclarationStatus } from './declaration.enums';

/**
 * Chống trùng biển số (F09): **một biển số không được nằm trong hai hồ sơ đang xử lý cùng lúc**.
 *
 * Hai quyết định quan trọng:
 *
 * 1. **Hồ sơ nào "đang xử lý"** — danh sách dưới đây. Hồ sơ nháp chưa vào cuộc (doanh nghiệp còn
 *    đang soạn, chưa chiếm chỗ của ai), còn hồ sơ đã hủy / bị từ chối / đã rời cửa khẩu / hoàn
 *    thành thì đã kết thúc, nên cả hai nhóm **không** chặn hồ sơ mới. Chỉ khoảng giữa mới chặn.
 * 2. **Chặn ở đâu** — ở **tầng database**, bằng chỉ mục duy nhất có điều kiện
 *    `uq_declarations_active_plate` (xem migration P7). Đây là bài học từ F27/F29: kiểm-rồi-ghi có
 *    khe hở đua, hai yêu cầu gửi cùng lúc đều đọc thấy "chưa có ai" rồi cùng ghi. Tầng ghi bắt lỗi
 *    `23505` và đổi thành `PlateInUseError`; use-case đổi tiếp thành 409.
 */
export const PLATE_BLOCKING_STATUSES: DeclarationStatus[] = [
  DeclarationStatus.SUBMITTED,
  DeclarationStatus.PROCESSING,
  DeclarationStatus.REVISION_REQUIRED,
  DeclarationStatus.WAITING_BORDER_GUARD,
  DeclarationStatus.WAITING_CUSTOMS,
  DeclarationStatus.WAITING_QUARANTINE,
  DeclarationStatus.WAITING_FOR_FEE,
  DeclarationStatus.WAITING_GATE,
  // `PAID` hiện **không được ghi lúc runtime** (không luồng nào chuyển hồ sơ sang trạng thái này —
  // xem chờ nối luồng phí Giai đoạn 2). Giữ lại trong danh sách chặn biển số một cách bảo thủ để khi
  // luồng phí bật lên thì hồ sơ đã thu phí vẫn giữ chỗ biển số, không cần sửa lại quy tắc F09.
  DeclarationStatus.PAID,
  DeclarationStatus.READY_FOR_EXIT,
];

/** Hồ sơ ở trạng thái này có **giữ chỗ** biển số hay không. */
export function occupiesPlate(status: DeclarationStatus, plateNumber: string | undefined): boolean {
  if (!plateNumber?.trim()) return false;
  return PLATE_BLOCKING_STATUSES.includes(status);
}

/**
 * Ném khi biển số đã nằm trong một hồ sơ đang xử lý khác. Lỗi **domain thuần** (không phụ thuộc
 * Nest); tầng ghi ném ra, use-case bắt lại và đổi thành 409 với thông báo đa ngữ.
 */
export class PlateInUseError extends Error {
  constructor(public readonly plateNumber: string) {
    super(`Biển số ${plateNumber} đang nằm trong một hồ sơ khác chưa kết thúc.`);
    this.name = 'PlateInUseError';
  }
}
