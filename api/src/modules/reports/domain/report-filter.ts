/**
 * Bộ lọc dùng chung cho mọi báo cáo và cho dashboard.
 *
 * ⚠️ Tên trường **cố ý trùng** với query param của màn hình danh sách hồ sơ trên web
 * (`/declarations?from=&to=&checkpoint=&type=&status=`). Nhờ vậy mỗi con số tổng hợp mở ngược
 * lại được đúng danh sách đã sinh ra nó — đây là yêu cầu "truy ngược" của mốc M3.
 * Đổi tên trường ở đây là phá cơ chế truy ngược, không phải đổi mỹ từ.
 */
export interface ReportFilter {
  /** Ngày bắt đầu, dạng `YYYY-MM-DD` hoặc ISO. */
  from?: string;
  /** Ngày kết thúc, dạng `YYYY-MM-DD` hoặc ISO. */
  to?: string;
  checkpoint?: string;
  type?: string;
  status?: string;
  /** Mã lực lượng chuyên ngành (`CUSTOMS`, `BORDER_GUARD`…) — chỉ vài báo cáo dùng tới. */
  agencyCode?: string;
}

/**
 * Phạm vi dữ liệu đã quy đổi từ `data_scope` của người dùng. Giữ ở dạng tối giản để tầng
 * persistence của `reports` không phải phụ thuộc vào `access-control`.
 * Cùng ngữ nghĩa với `DeclarationScopeCriteria` — hai nơi phải luôn hiểu giống nhau.
 */
export interface ReportScope {
  /** True thì không chèn thêm điều kiện nào (phạm vi ALL). */
  unrestricted: boolean;
  /** Tài khoản đang gọi — chỉ dùng khi tài khoản **không** gắn doanh nghiệp nào. */
  ownerUserId?: string;
  /** Mã số thuế doanh nghiệp được phân công — phạm vi `OWN` siết theo doanh nghiệp. */
  taxCodes?: string[];
  /** Loại trừ hồ sơ bản nháp (DRAFT) để KPI khớp findPage.total. */
  excludeDraft?: boolean;
}

import { parseFilterEndDate, parseFilterStartDate } from '../../../common/time/vietnam-date';

export { parseFilterEndDate, parseFilterStartDate };

/**
 * Đổi chuỗi ngày trên bộ lọc thành `Date` (mặc định lấy đầu ngày theo giờ VN).
 */
export function parseFilterDate(value?: string): Date | undefined {
  return parseFilterStartDate(value);
}

