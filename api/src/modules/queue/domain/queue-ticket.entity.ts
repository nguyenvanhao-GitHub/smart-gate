import { randomUUID } from 'crypto';
import { vietnamDateString } from '../../../common/time/vietnam-date';
import { DeclarationType } from '../../declarations/domain/declaration.enums';

/**
 * Luồng nghiệp vụ của hồ sơ được cấp số (F27).
 *
 * Dùng chung hai từ với `GateDirection` cho đỡ rối giao diện, nhưng **khác chủ thể**:
 * `flow` gắn với **hồ sơ** (hàng nhập hay hàng xuất), còn `direction` gắn với **cổng**
 * (xe đi vào hay đi ra).
 */
export enum QueueFlow {
  /** Luồng nhập — hồ sơ nhập khẩu và xe tự hành. */
  ENTRY = 'ENTRY',
  /** Luồng xuất — hồ sơ xuất khẩu và sang tải. */
  EXIT = 'EXIT',
}

export function flowForDossierType(type: DeclarationType): QueueFlow {
  return type === DeclarationType.EXPORT || type === DeclarationType.TRANSSHIPMENT_EXPORT
    ? QueueFlow.EXIT
    : QueueFlow.ENTRY;
}

/**
 * Ngày cấp số dạng `YYYY-MM-DD` theo **giờ Việt Nam** (UTC+7), không phải UTC hay giờ máy chủ:
 * số thứ tự được đánh lại từ đầu mỗi ngày làm việc tại cửa khẩu. Cắt ngày theo UTC (hoặc theo
 * múi giờ ngẫu nhiên của máy chủ) khiến ca đêm nhảy sang ngày khác và cấp số sai mốc — dùng chung
 * `vietnamDateString` với mã hồ sơ (F14) và mốc khung giờ (F28) cho nhất quán.
 */
export function toIssuedDate(at: Date): string {
  return vietnamDateString(at);
}

/**
 * Định dạng mã số thứ tự phục vụ tại cửa khẩu theo format: `dd/mm/yyyy.0001`
 * Ví dụ: issuedDate = '2026-08-13', ticketNumber = 1 -> '13/08/2026.0001'
 */
export function formatTicketCode(issuedDate: string | Date, ticketNumber: number): string {
  let datePart = '';
  if (typeof issuedDate === 'string') {
    if (issuedDate.includes('-')) {
      const parts = issuedDate.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        datePart = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      } else {
        datePart = issuedDate;
      }
    } else {
      datePart = issuedDate;
    }
  } else if (issuedDate instanceof Date) {
    const vnStr = vietnamDateString(issuedDate);
    const [year, month, day] = vnStr.split('-');
    datePart = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  const numPart = String(ticketNumber).padStart(4, '0');
  return `${datePart}.${numPart}`;
}

export interface QueueTicketIssueInput {
  dossierId: string;
  flow: QueueFlow;
  checkpoint: string;
  ticketNumber: number;
  issuedById: string | null;
  at?: Date;
}

/**
 * Số thứ tự phục vụ tại cửa khẩu — bảng `queue_tickets` (F27).
 *
 * Số thứ tự là **một con số thuần** gắn với hồ sơ, không mang vòng đời/trạng thái gọi. Tính duy
 * nhất theo **ngày** (`issued_date, ticket_number`) được bảo đảm bằng **chỉ mục duy nhất trong database**
 * (`uq_queue_tickets_number`), không phải bằng kiểm tra trong mã: hai yêu cầu cùng lúc đều đọc được
 * cùng một số lớn nhất, chỉ ràng buộc ở tầng dữ liệu mới chặn được. Một hồ
 * sơ chỉ giữ **một số mỗi ngày** (`uq_queue_tickets_dossier_active` trên `dossier_id, issued_date`).
 */
export class QueueTicket {
  constructor(
    public readonly id: string,
    public readonly dossierId: string,
    public ticketNumber: number,
    public readonly issuedDate: string,
    public readonly flow: QueueFlow,
    public readonly checkpoint: string,
    public readonly issuedAt: Date,
    public readonly issuedById: string | null,
  ) {}

  get ticketCode(): string {
    return formatTicketCode(this.issuedDate, this.ticketNumber);
  }

  static issue(input: QueueTicketIssueInput): QueueTicket {
    const at = input.at ?? new Date();
    return new QueueTicket(
      randomUUID(),
      input.dossierId,
      input.ticketNumber,
      toIssuedDate(at),
      input.flow,
      input.checkpoint,
      at,
      input.issuedById,
    );
  }

  /** Cấp lại số khi lần ghi trước đụng chỉ mục duy nhất — chỉ dùng trong vòng thử lại của use-case. */
  reassignNumber(ticketNumber: number): void {
    this.ticketNumber = ticketNumber;
  }
}
