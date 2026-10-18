import { Inject, Injectable } from '@nestjs/common';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { toIssuedDate } from '../../../queue/domain/queue-ticket.entity';
import { WorkflowStage, currentStageFromOpenSteps } from '../../../workflow/domain/workflow-route';
import { GetDispatchBoardCommand } from '../dto/assign-dispatch.command';
import {
  DispatchBoardView,
  DispatchCard,
  DispatchColumn,
  DispatchColumnKey,
  toDispatchCard,
} from '../dto/dispatch-view.dto';
import {
  DISPATCH_ASSIGNMENT_REPOSITORY,
  DispatchAssignmentRepository,
  DispatchBoardRow,
} from '../ports/dispatch-assignment.repository';

const COLUMN_LABELS: Record<DispatchColumnKey, string> = {
  WAITING: 'Chờ điều phối',
  INSPECTING: 'Đang trong giai đoạn kiểm tra',
  INSPECTED: 'Đã kiểm tra xong',
};

/**
 * Ánh xạ **giai đoạn workflow** của hồ sơ sang khung điều phối (CR41 — định nghĩa mới theo giai đoạn):
 * cổng vào / WAITING_CALL / WAITING_GATE → Chờ điều phối, cụm nghiệp vụ → Đang kiểm tra, thu phí/cổng ra → Đã kiểm tra xong. Giai
 * đoạn khai báo (`DECLARATION`) và phiên đã đóng (không có bước mở) **không** lên bảng.
 */
const STAGE_COLUMN: Partial<Record<WorkflowStage, DispatchColumnKey>> = {
  [WorkflowStage.ENTRY_GATE]: 'WAITING',
  [WorkflowStage.INSPECTION]: 'INSPECTING',
  [WorkflowStage.FEE]: 'INSPECTED',
  [WorkflowStage.EXIT_GATE]: 'INSPECTED',
};

/**
 * Bảng điều phối dạng cột (UI-08 · F29) — **3 khung** theo nghiệp vụ mới (CR41): chờ điều phối →
 * đang kiểm tra → đã kiểm tra xong. Không còn mô hình 4 cột theo trạng thái vị trí.
 *
 * Cố ý **không** làm sơ đồ flow và **không** cảnh báo ùn tắc: quyết định A0 loại hai hạng mục đó
 * khỏi phạm vi MVP (F57 thuộc Giai đoạn 2).
 */
@Injectable()
export class GetDispatchBoardUseCase {
  constructor(
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: GetDispatchBoardCommand): Promise<DispatchBoardView> {
    const scope = this.scope.toCriteria(command.access);
    const rows = await this.assignments.findBoard({
      checkpoint: command.checkpoint,
      date: command.date || toIssuedDate(new Date()),
      from: command.from,
      to: command.to,
      search: command.search,
      unrestricted: scope.unrestricted,
      ownerUserId: scope.ownerUserId,
      taxCodes: scope.taxCodes,
    });

    const now = new Date();
    const buckets: Record<DispatchColumnKey, DispatchCard[]> = { WAITING: [], INSPECTING: [], INSPECTED: [] };
    rows.forEach((row) => {
      const key = this.columnOf(row);
      if (key) buckets[key].push(toDispatchCard(row, now));
    });

    const columns: DispatchColumn[] = (Object.keys(buckets) as DispatchColumnKey[]).map((key) => ({
      key,
      label: COLUMN_LABELS[key],
      items: buckets[key],
    }));

    return {
      kpi: {
        waiting: buckets.WAITING.length,
        inspecting: buckets.INSPECTING.length,
        inspected: buckets.INSPECTED.length,
      },
      columns,
    };
  }

  /**
   * Khung của một thẻ phương tiện theo **trạng thái & giai đoạn workflow hiện hành** của hồ sơ:
   * nếu trạng thái hồ sơ là WAITING_CALL hoặc WAITING_GATE (vừa vào cổng, đang chờ điều phối gọi xe) -> cột WAITING.
   * Nếu không, suy từ **tập bước đang mở** của phiên (`currentStageFromOpenSteps`), rồi ánh xạ qua `STAGE_COLUMN`.
   * Trả `null` khi hồ sơ **không** thuộc bảng điều phối — đang ở giai đoạn khai báo (chưa vào cửa khẩu)
   * hoặc phiên đã đóng (đã ra khỏi cửa khẩu / hoàn tất).
   */
  private columnOf(row: DispatchBoardRow): DispatchColumnKey | null {
    if (
      row.dossierStatus === DeclarationStatus.WAITING_CALL ||
      row.dossierStatus === DeclarationStatus.WAITING_GATE
    ) {
      return 'WAITING';
    }
    const stage = currentStageFromOpenSteps(row.activeStepCodes);
    return stage ? (STAGE_COLUMN[stage] ?? null) : null;
  }
}
