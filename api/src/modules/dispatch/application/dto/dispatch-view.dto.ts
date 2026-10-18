import { elapsedSeconds } from '../../../../common/time/elapsed';
import { DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { formatTicketCode } from '../../../queue/domain/queue-ticket.entity';
import { DispatchAssignment } from '../../domain/dispatch-assignment.entity';
import { InspectionStatus } from '../../domain/inspection-status.rules';
import { computeExpectedDeparture, isOverdue } from '../../domain/yard-storage.rules';
import { ParkingSlotStatus, Yard } from '../../domain/yard.entity';
import { DispatchAssignmentWithDossier, DispatchBoardRow } from '../ports/dispatch-assignment.repository';

/** Vị trí điều phối rút gọn, đúng các trường web cần hiển thị trên thẻ phương tiện. */
export interface DispatchAssignmentView {
  id: string;
  gateCode: string | null;
  laneCode: string | null;
  yardId: string | null;
  slotCode: string | null;
}

/** Bản đầy đủ trả về sau khi gán / chuyển / giải phóng / cập nhật kiểm tra. */
export interface DispatchAssignmentDetailView extends DispatchAssignmentView {
  dossierId: string;
  status: string;
  assignedAt: Date;
  releasedAt: Date | null;
  note: string | null;
  inspectionStatus: InspectionStatus;
  inspectionUpdatedAt: Date | null;
}

export interface DispatchCard {
  dossierId: string;
  code: string;
  plateNumber: string;
  enterpriseName: string;
  ticketNumber: number | null;
  /** Mã số thứ tự format: dd/mm/yyyy.0001 */
  ticketCode: string | null;
  /** Loại hồ sơ — web dùng để chỉ hiện cổng đúng chiều luồng (nhập→ENTRY, xuất→EXIT) khi gán vị trí. */
  type: DeclarationType;
  status: DeclarationStatus;
  waitingSeconds: number;
  assignment: DispatchAssignmentView | null;
}

/**
 * Ba khung của bảng điều phối (CR41 — phân theo **giai đoạn workflow** của hồ sơ): **WAITING** = chờ
 * điều phối (đang ở bước cổng vào — giai đoạn `ENTRY_GATE`), **INSPECTING** = đang trong giai đoạn kiểm
 * tra (cụm 3 bước nghiệp vụ — giai đoạn `INSPECTION`), **INSPECTED** = đã kiểm tra xong (bước thu phí
 * hoặc cổng ra — giai đoạn `FEE`/`EXIT_GATE`).
 */
export type DispatchColumnKey = 'WAITING' | 'INSPECTING' | 'INSPECTED';

export interface DispatchColumn {
  key: DispatchColumnKey;
  label: string;
  items: DispatchCard[];
}

export interface DispatchBoardView {
  kpi: { waiting: number; inspecting: number; inspected: number };
  columns: DispatchColumn[];
}

export interface ParkingSlotView {
  code: string;
  status: ParkingSlotStatus;
  /** Ô đang có xe **và** đã quá mốc dự kiến rời bãi (F42/F44). Chỉ đúng khi `status = OCCUPIED`. */
  overdue: boolean;
  /**
   * `id` là **bắt buộc** để UI-10 chuyển vị trí được: chuyển ô phải gọi
   * `PATCH /dispatch/assignments/:id`. Không có `id` thì web buộc phải lách bằng
   * `POST /dispatch/assignments`, mà đường đó bị chỉ mục "1 xe 1 vị trí" chặn bằng 409.
   */
  assignment: {
    id: string;
    dossierId: string;
    code: string;
    plateNumber: string;
    /** Tên doanh nghiệp/cá nhân khai hồ sơ đang chiếm ô; rỗng nếu hồ sơ chưa gắn doanh nghiệp. */
    entity: string;
    since: Date;
    /** Dự kiến rời bãi = giờ vào bãi + giờ lưu tối đa; null khi thiếu mốc vào bãi. */
    expectedDeparture: Date | null;
    /** Trạng thái kiểm tra/tập kết của xe đang đỗ trong ô (F44). */
    inspectionStatus: InspectionStatus;
    /** Mốc lần đổi trạng thái kiểm tra gần nhất; null khi chưa đổi lần nào. */
    inspectionUpdatedAt: Date | null;
  } | null;
}

export interface YardSummaryView {
  id: string;
  code: string;
  name: string;
  capacity: number;
  occupied: number;
  /** Số ô đang có xe đã quá hạn lưu bãi trong khu — dùng cho KPI và viền cảnh báo khu. */
  overdue: number;
}

export interface YardDetailView extends YardSummaryView {
  slots: ParkingSlotView[];
}

export function toAssignmentView(assignment: DispatchAssignment): DispatchAssignmentView {
  return {
    id: assignment.id,
    gateCode: assignment.gateCode,
    laneCode: assignment.laneCode,
    yardId: assignment.yardId,
    slotCode: assignment.slotCode,
  };
}

export function toAssignmentDetailView(assignment: DispatchAssignment): DispatchAssignmentDetailView {
  return {
    ...toAssignmentView(assignment),
    dossierId: assignment.dossierId,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    releasedAt: assignment.releasedAt,
    note: assignment.note,
    inspectionStatus: assignment.inspectionStatus,
    inspectionUpdatedAt: assignment.inspectionUpdatedAt,
  };
}

export function toDispatchCard(row: DispatchBoardRow, now: Date): DispatchCard {
  const ticketCode =
    row.ticketNumber !== null
      ? formatTicketCode(row.ticketIssuedDate ?? row.waitingSince, row.ticketNumber)
      : null;

  return {
    dossierId: row.dossierId,
    code: row.dossierCode,
    plateNumber: row.plateNumber,
    enterpriseName: row.enterpriseName,
    ticketNumber: row.ticketNumber,
    ticketCode,
    type: row.dossierType,
    status: row.dossierStatus,
    waitingSeconds: elapsedSeconds(row.waitingSince, now),
    assignment: row.assignment && row.assignment.isActive ? toAssignmentView(row.assignment) : null,
  };
}

/**
 * Sơ đồ ô đỗ (UI-10). Ô có xe kèm tên doanh nghiệp + dự kiến rời bãi + cờ quá hạn; ô bị khoá
 * (`isActive = false`) hiện trạng thái `MAINTENANCE`. `maxStorageHours` quyết định mốc rời bãi.
 */
export function toYardDetailView(
  yard: Yard,
  occupants: DispatchAssignmentWithDossier[],
  now: Date,
  maxStorageHours: number,
): YardDetailView {
  const bySlot = new Map(
    occupants
      .filter((item) => !!item.assignment.slotCode)
      .map((item) => [item.assignment.slotCode as string, item]),
  );

  const slots: ParkingSlotView[] = yard.slots.map((slot) => {
    const occupant = bySlot.get(slot.code);
    if (!occupant) {
      return {
        code: slot.code,
        status: slot.isActive ? ParkingSlotStatus.FREE : ParkingSlotStatus.MAINTENANCE,
        overdue: false,
        assignment: null,
      };
    }

    const since = occupant.assignment.assignedAt;
    const expectedDeparture = since ? computeExpectedDeparture(since, maxStorageHours) : null;
    return {
      code: slot.code,
      status: ParkingSlotStatus.OCCUPIED,
      overdue: expectedDeparture ? isOverdue(expectedDeparture, now) : false,
      assignment: {
        id: occupant.assignment.id,
        dossierId: occupant.assignment.dossierId,
        code: occupant.dossierCode,
        plateNumber: occupant.plateNumber,
        entity: occupant.enterpriseName,
        since,
        expectedDeparture,
        inspectionStatus: occupant.assignment.inspectionStatus,
        inspectionUpdatedAt: occupant.assignment.inspectionUpdatedAt,
      },
    };
  });

  return {
    id: yard.id,
    code: yard.code,
    name: yard.name,
    capacity: yard.capacity,
    occupied: bySlot.size,
    overdue: slots.filter((slot) => slot.overdue).length,
    slots,
  };
}
