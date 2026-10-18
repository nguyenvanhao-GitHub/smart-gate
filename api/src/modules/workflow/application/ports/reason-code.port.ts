import { ReasonCodeView, ReasonScope } from '../../../catalog/domain/reason-code.catalog';

export const REASON_CODE_CATALOG = Symbol('REASON_CODE_CATALOG');

export interface ReasonCodeCatalogPort {
  /** Trả mục đang hiệu lực theo mã. Mục đã khóa coi như không tồn tại khi ghi nhận mới. */
  findActive(scope: ReasonScope, code: string): Promise<ReasonCodeView | null>;
}
