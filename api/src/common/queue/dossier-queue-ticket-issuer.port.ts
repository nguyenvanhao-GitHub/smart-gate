/**
 * Cổng **tự cấp số thứ tự cho một hồ sơ** khi xe được cho qua **cổng vào** (quyết định chủ dự án: xe
 * qua cổng vào thì phải vào ngay cột "Chờ điều phối" của bảng Điều phối — SRS 4.1, không chờ cán bộ
 * bấm "Cấp số" thủ công).
 *
 * Đặt ở `common/` theo đúng nếp của `fee-calculator.port`: phân hệ `gate` cần kích hoạt cấp số mà
 * **không được** phụ thuộc vào chi tiết bên trong phân hệ hàng đợi. Chiều phụ thuộc mô-đun là
 * `gate` → `queue` (một chiều: `queue` chỉ phụ thuộc `declarations`, không biết tới `gate`) nên một
 * cổng trung lập ở `common/` giữ chiều nhất quán, không tạo vòng. `QueueModule` cung cấp hiện thực
 * (bọc `IssueQueueTicketUseCase`).
 */
export const QUEUE_TICKET_ISSUER = Symbol('QUEUE_TICKET_ISSUER');

export interface DossierQueueTicketIssuer {
  /**
   * Bảo đảm hồ sơ đã có số thứ tự trong ngày. **Idempotent**: nếu hồ sơ đã có số còn hiệu lực (chưa
   * hủy) trong ngày hôm nay thì KHÔNG cấp thêm — tránh sinh hai số cho cùng một lượt. `actorId` là
   * người thao tác cổng, được ghi vào `issued_by` để biết ai kích hoạt. Luồng nghiệp vụ (`flow`) và
   * cửa khẩu (`checkpoint`) của số được suy thẳng từ hồ sơ trong `IssueQueueTicketUseCase`.
   */
  ensureIssued(dossierId: string, actorId: string): Promise<void>;
}
