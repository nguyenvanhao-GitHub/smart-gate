import { GateDecision } from './gate-event.entity';

/**
 * Mã hành động ghi vết sự kiện qua cổng trong nhật ký kiểm toán (F38 · F05).
 *
 * Là **mã ASCII trong tập đóng** — không dùng chuỗi hiển thị làm logic. Mỗi lượt cho qua/từ chối
 * tại cổng ghi đúng một trong hai mã này; màn "Nhật ký thao tác" tra theo đúng tập này.
 */
export const GateAuditAction = {
  ALLOW: 'GATE_EVENT_ALLOW',
  DENY: 'GATE_EVENT_DENY',
} as const;

export type GateAuditAction = (typeof GateAuditAction)[keyof typeof GateAuditAction];

/** Chọn mã audit theo quyết định của sự kiện cổng. */
export function gateAuditActionFor(decision: GateDecision): GateAuditAction {
  return decision === GateDecision.ALLOW ? GateAuditAction.ALLOW : GateAuditAction.DENY;
}
