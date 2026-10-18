import { MessageKey } from '../../../common/i18n/message-catalog';
import { translate } from '../../../common/i18n/translate';
import { DispatchPlacement } from './dispatch-assignment.entity';

/**
 * Luật hình thức của một vị trí điều phối (F29, F31). Thuần TypeScript, không phụ thuộc Nest —
 * use-case nhận danh sách lỗi rồi tự quyết ném ngoại lệ nào.
 *
 * Trả **khóa thông báo** để tầng application ném lỗi có khóa (client tự dịch được).
 */
export function placementViolations(placement: DispatchPlacement): MessageKey[] {
  const errors: MessageKey[] = [];
  const hasGate = !!placement.gateCode;
  const hasLane = !!placement.laneCode;
  const hasYard = !!placement.yardId;
  const hasSlot = !!placement.slotCode;

  if (!hasGate && !hasLane && !hasYard && !hasSlot) errors.push('dispatch.placementRequired');
  if (hasSlot && !hasYard) errors.push('dispatch.slotNeedsYard');
  if (hasYard && !hasSlot) errors.push('dispatch.yardNeedsSlot');
  if (hasLane && !hasGate) errors.push('dispatch.laneNeedsGate');

  return errors;
}

/** Cùng danh sách lỗi nhưng đã dịch sang tiếng Việt — giữ cho các chỗ chỉ cần lời văn. */
export function validatePlacement(placement: DispatchPlacement): string[] {
  return placementViolations(placement).map((key) => translate(key));
}

/** Gộp vị trí mới lên vị trí đang có khi chuyển vị trí — trường không khai thì giữ nguyên. */
export function mergePlacement(current: DispatchPlacement, patch: Partial<DispatchPlacement>): DispatchPlacement {
  return {
    gateCode: patch.gateCode !== undefined ? patch.gateCode : current.gateCode,
    laneCode: patch.laneCode !== undefined ? patch.laneCode : current.laneCode,
    yardId: patch.yardId !== undefined ? patch.yardId : current.yardId,
    slotCode: patch.slotCode !== undefined ? patch.slotCode : current.slotCode,
  };
}

import { DEFAULT_LOCALE } from '../../../common/i18n/locales';

/**
 * Mô tả vị trí bằng lời để đưa vào nội dung thông báo cho doanh nghiệp.
 *
 * Tự động dịch nhãn (cổng / làn / ô đỗ / vị trí mới) theo ngôn ngữ chỉ định.
 */
export function describePlacement(placement: DispatchPlacement, locale: string = DEFAULT_LOCALE): string {
  const parts: string[] = [];
  if (placement.gateCode) parts.push(translate('dispatch.placementGate', { code: placement.gateCode }, locale));
  if (placement.laneCode) parts.push(translate('dispatch.placementLane', { code: placement.laneCode }, locale));
  if (placement.slotCode) parts.push(translate('dispatch.placementSlot', { code: placement.slotCode }, locale));
  return parts.length > 0 ? parts.join(', ') : translate('dispatch.placementDefault', undefined, locale);
}

/** Hai vị trí trỏ vào cùng một ô đỗ hay không — dùng để bỏ qua kiểm trùng khi chuyển tại chỗ. */
export function isSameSlot(left: DispatchPlacement, right: DispatchPlacement): boolean {
  return left.yardId === right.yardId && left.slotCode === right.slotCode;
}
