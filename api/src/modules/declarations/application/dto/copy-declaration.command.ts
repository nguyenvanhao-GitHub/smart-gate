import { UserAccessContext } from '../../../../common/auth/access-context';

/**
 * Sao chép hồ sơ (CR3). Dựng một hồ sơ **nháp** mới từ hồ sơ nguồn — gồm cả tệp đính kèm — rồi mở
 * màn sửa bản mới. Không sinh mã/QR cũ, không chép trạng thái, không tạo phiên xử lý liên ngành.
 */
export interface CopyDeclarationCommand {
  /** Hồ sơ nguồn cần sao chép. */
  declarationId: string;
  /** Ngữ cảnh quyền — dùng để chặn "đoán id là sao chép được hồ sơ của doanh nghiệp khác". */
  access: UserAccessContext;
  /** Tài khoản thực hiện sao chép, lấy từ token — trở thành người tạo hồ sơ mới. */
  actorId: string;
  /** Danh sách vai trò RBAC của người thực hiện (nối bằng `+`) — chỉ để ghi vào lịch sử hồ sơ. */
  actorRole: string;
}
