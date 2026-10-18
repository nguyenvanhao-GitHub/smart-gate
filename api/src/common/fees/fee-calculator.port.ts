/**
 * Cổng **tự động tính phí cho một hồ sơ** khi hồ sơ đi tới bước thu phí (quyết định chủ dự án: hồ sơ
 * tới bước phí thì phải hiện đúng số tiền + nút thu, không chờ cán bộ bấm "Tính lại phí" thủ công).
 *
 * Đặt ở `common/` theo đúng nếp của `fee-settlement.port` / `fee-step-gate.port`: phân hệ `workflow`
 * cần kích hoạt tính phí mà **không được** phụ thuộc vào chi tiết bên trong phân hệ phí, và chiều phụ
 * thuộc mô-đun đã là `workflow` → `fees` (cổng `FEE_SETTLEMENT`) nên một cổng trung lập ở `common/` giữ
 * chiều nhất quán, không tạo vòng. `FeesModule` cung cấp hiện thực (bọc `CalculateDossierFeesUseCase`).
 */
export const FEE_CALCULATOR = Symbol('FEE_CALCULATOR');

export interface DossierFeeCalculator {
  /**
   * Bảo đảm hồ sơ đã có bảng phí. **Idempotent**: nếu hồ sơ đã có khoản phí (`fee_charges`) thì
   * KHÔNG tính lại — giữ nguyên mọi điều chỉnh/giao dịch đã có; chỉ tính khi chưa có khoản nào.
   * Việc tính lại **có chủ đích** vẫn đi qua nút "Tính lại phí" thủ công ở màn phí theo hồ sơ.
   */
  ensureCalculated(dossierId: string): Promise<void>;
}
