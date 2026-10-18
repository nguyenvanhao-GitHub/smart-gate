/**
 * Cổng tra **hồ sơ đã tới bước thu phí trong workflow chưa** (quyết định chủ dự án: chỉ được thu phí
 * khi hồ sơ đã đi tới bước thu phí). Đặt ở `common/` theo đúng nếp của `fee-settlement.port`: phân hệ
 * phí cần biết tiến độ bước phí mà **không được** phụ thuộc vào chi tiết bên trong phân hệ workflow —
 * và ngược lại `workflow` đã phụ thuộc `fees` (cổng `FEE_SETTLEMENT`), nên một cổng trung lập ở
 * `common/` phá được vòng phụ thuộc mô-đun. Hiện thực đọc `workflow_instance` và áp luật "đã tới bước
 * phí" (xem `workflow/domain/fee-step-gate.rules.ts`).
 */
export const FEE_STEP_GATE = Symbol('FEE_STEP_GATE');

export interface FeeStepGateQuery {
  /**
   * Hồ sơ đã tới (đang ở hoặc đã đi qua) bước thu phí chưa. Hồ sơ chưa có phiên xử lý (nháp/chưa nộp)
   * hoặc lộ trình không có bước phí → `false`.
   */
  hasReachedFeeStep(dossierId: string): Promise<boolean>;

  /**
   * Tự động hoàn thành bước thu phí (IMPORT_FEE / EXPORT_FEE) trong Workflow khi đã xác nhận thu đủ
   * 100% tiền phí. Chuyển trạng thái bước sang COMPLETED và hồ sơ sang READY_FOR_EXIT.
   */
  completeFeeStepIfSettled?(dossierId: string, actorId: string): Promise<boolean>;
}
