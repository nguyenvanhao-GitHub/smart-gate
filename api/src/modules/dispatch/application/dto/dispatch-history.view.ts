import { UserAccessContext } from '../../../../common/auth/access-context';
import { AuditLog } from '../../../audit/domain/audit-log.entity';
import { DispatchAuditAction, DispatchPlacementSnapshot } from '../../domain/dispatch-audit-action';

/** Điều kiện tra cứu lịch sử điều phối (F33). */
export interface DispatchHistoryQuery {
  /** Lọc theo đúng một hồ sơ (id hồ sơ = `targetId` của bản ghi audit). */
  dossierId?: string;
  /** Lọc theo **mã hồ sơ** người dùng nhập; use-case tự dịch sang id. */
  dossierCode?: string;
  /** Khớp mã tài khoản hoặc tên đăng nhập của cán bộ thực hiện. */
  actor?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  access: UserAccessContext;
}

export interface DispatchHistoryTicketSnapshot {
  ticketNumber: number;
  ticketCode: string;
}

export interface DossierHistoryDetail {
  code: string;
  plateNumber: string | null;
}

/** Một dòng lịch sử điều phối: ai, khi nào, hành động gì, vị trí từ → đến. */
export interface DispatchHistoryEntry {
  id: string;
  at: Date;
  action: DispatchAuditAction;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  dossierId: string | null;
  dossierCode: string | null;
  plateNumber: string | null;
  /** Số thứ tự điều phối gần nhất của hồ sơ (BUG-084); `null` nếu hồ sơ chưa được cấp số. */
  ticketNumber: number | null;
  /** Mã số thứ tự đầy đủ gồm ngày và 4 chữ số (VD: '14/08/2026.0001'); `null` nếu chưa cấp số. */
  ticketCode: string | null;
  /** Vị trí trước khi thao tác; `null` với lần gán đầu tiên. */
  from: DispatchPlacementSnapshot | null;
  /** Vị trí sau khi thao tác; `null` khi giải phóng (xe rời vị trí). */
  to: DispatchPlacementSnapshot | null;
}

function readSnapshot(
  value: Record<string, unknown> | null,
  yardNames: Map<string, string> = new Map(),
): DispatchPlacementSnapshot | null {
  if (!value) return null;
  const text = (key: string): string | null => (typeof value[key] === 'string' ? value[key] : null);
  const yardRaw = text('yard');
  const yard = yardRaw ? (yardNames.get(yardRaw) ?? yardRaw) : null;
  return { gate: text('gate'), lane: text('lane'), yard, slot: text('slot') };
}

/** Ghép bản ghi audit với bảng tra mã hồ sơ + số thứ tự để dựng một dòng lịch sử. */
export function toDispatchHistoryEntry(
  log: AuditLog,
  dossiers: Map<string, DossierHistoryDetail>,
  tickets: Map<string, DispatchHistoryTicketSnapshot>,
  yardNames: Map<string, string> = new Map(),
): DispatchHistoryEntry {
  const ticket = log.targetId ? tickets.get(log.targetId) : undefined;
  const dossier = log.targetId ? dossiers.get(log.targetId) : undefined;
  return {
    id: log.id,
    at: log.at,
    action: log.action as DispatchAuditAction,
    actorId: log.actorId,
    actorName: log.actorUsername,
    actorRole: log.actorRole,
    dossierId: log.targetId,
    dossierCode: dossier?.code ?? (log.targetId ? log.targetId : null),
    plateNumber: dossier?.plateNumber ?? (log.after?.plateNumber as string | null) ?? (log.after?.plate as string | null) ?? null,
    ticketNumber: ticket?.ticketNumber ?? null,
    ticketCode: ticket?.ticketCode ?? null,
    from: readSnapshot(log.before, yardNames),
    to: readSnapshot(log.after, yardNames),
  };
}
