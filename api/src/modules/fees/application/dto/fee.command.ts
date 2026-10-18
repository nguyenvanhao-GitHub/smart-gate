import { UserAccessContext } from '../../../../common/auth/access-context';
import { FeeTransactionMethod, FeeType, FeeUnit } from '../../domain/fee.enums';

/**
 * Lệnh của phân hệ thu phí (F46–F48) — **thuần dữ liệu**, không biết gì về HTTP.
 *
 * Mọi lệnh đều mang `access` để use-case áp phạm vi dữ liệu qua `DossierScopeService`, đúng nếp
 * của các phân hệ khác: "đoán được id" không có nghĩa là "được xem hồ sơ của doanh nghiệp khác".
 */
export interface GetDossierFeesCommand {
  dossierId: string;
  access: UserAccessContext;
}

export interface CalculateDossierFeesCommand {
  dossierId: string;
  actorId: string;
  access: UserAccessContext;
  /** Thời điểm áp biểu phí; bỏ trống thì lấy hiện tại. Dùng để tính lại theo ngày của hồ sơ cũ. */
  at?: Date;
}

export interface AdjustFeeChargeCommand {
  dossierId: string;
  ruleCode: string;
  amount: number;
  reasonCode: string;
  reasonNote?: string;
  actorId: string;
  access: UserAccessContext;
}

/**
 * Thu phí **một nhịp** (F47 + F48 gộp): ghi thẳng một giao dịch đã xác nhận trong một lần lưu, không
 * để lại giao dịch `PENDING` treo. Lệnh thu phí **duy nhất**, dùng cho cả bàn làm việc thu ngân lẫn
 * màn phí theo hồ sơ. `attachmentId` là chứng từ/biên lai đính kèm (tùy chọn).
 */
export interface CollectFeeCommand {
  dossierId: string;
  amount: number;
  method: FeeTransactionMethod;
  referenceCode?: string;
  attachmentId?: string;
  note?: string;
  actorId: string;
  access: UserAccessContext;
}

export interface ListFeeRulesQuery {
  dossierType?: string;
  /** Ngày áp dụng `YYYY-MM-DD`; bỏ trống thì lấy hôm nay. */
  at?: string;
}

/**
 * Thêm **một bản** biểu phí (F46). Nếu mã đã có bản đang chạy (`effectiveTo` null), use-case
 * **đóng bản cũ** bằng `effectiveTo = previousDay(effectiveFrom)` rồi thêm bản mới — không sửa số
 * tiền của bản đã áp dụng.
 */
export interface CreateFeeRuleCommand {
  code: string;
  name: string;
  feeType: FeeType;
  unit: FeeUnit;
  amount: number;
  currency?: string;
  appliesTo?: string[];
  effectiveFrom: string;
  description?: string;
  sortOrder?: number;
  actorId: string;
}

/**
 * Sửa một bản biểu phí (F46). **Chỉ bản chưa tới hiệu lực** (`effectiveFrom` > hôm nay) mới sửa được
 * các trường ảnh hưởng tiền; bản đã/đang áp dụng chỉ sửa được metadata phi-tiền (name/description/
 * sortOrder). `code` và `effectiveFrom` là khóa của bản nên **không đổi** — muốn đổi mức thì thêm
 * bản mới.
 */
export interface UpdateFeeRuleCommand {
  id: string;
  name?: string;
  description?: string | null;
  sortOrder?: number;
  amount?: number;
  unit?: FeeUnit;
  feeType?: FeeType;
  appliesTo?: string[];
  currency?: string;
  active?: boolean;
  actorId: string;
}
