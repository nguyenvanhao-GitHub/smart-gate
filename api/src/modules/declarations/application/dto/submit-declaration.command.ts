import { UserAccessContext } from '../../../../common/auth/access-context';

export interface SubmitDeclarationCommand {
  declarationId: string;
  actorId: string;
  /** Danh sách vai trò RBAC (nối bằng `+`) — chỉ để ghi vào lịch sử hồ sơ. */
  actorRole: string;
  access: UserAccessContext;
}

/** Kết quả gửi hồ sơ trả về cho web: mã hồ sơ + chuỗi QR để web tự vẽ. */
export interface SubmitDeclarationResult {
  code: string;
  qrCode: string;
  submittedAt: Date;
}

export interface AttachDocumentsCommand {
  declarationId: string;
  attachmentIds: string[];
  access: UserAccessContext;
}
