import { Inject, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../common/auth/access-context';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../declarations/domain/declaration.entity';
import {
  DECLARATION_STATUS_LABELS,
  DeclarationStatus,
  DeclarationType,
} from '../../declarations/domain/declaration.enums';

export interface DashboardKpiDto {
  label: string;
  value: string;
  delta: string;
  tone: 'blue' | 'green' | 'amber' | 'violet';
}

export interface TrafficBarDto {
  hour: string;
  export: number;
  import: number;
}

export interface CheckpointStatusDto {
  name: string;
  note: string;
  value: string;
  status: 'COMPLETED' | 'PROCESSING' | 'REVISION_REQUIRED';
}

export interface DashboardAlertDto {
  title: string;
  detail: string;
  action: string;
}

export interface VehicleFlowDto {
  code: string;
  plate: string;
  flow: string;
  checkpoint: string;
  wait: string;
  status: string;
  statusCode: 'COMPLETED' | 'PROCESSING' | 'REVISION_REQUIRED';
  force: string;
}

export interface SmartGateDashboardDto {
  gateName: string;
  province: string;
  updatedAt: string;
  summary: string;
  kpis: DashboardKpiDto[];
  trafficBars: TrafficBarDto[];
  checkpoints: CheckpointStatusDto[];
  alerts: DashboardAlertDto[];
  vehicleRows: VehicleFlowDto[];
}

@Injectable()
export class DashboardReadModelService {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
  ) {}

  /**
   * ⚠️ Dashboard cũ của màn hình smart gate. Dashboard chính thức của UI-02 là
   * `GET /dashboard/overview` (phân hệ `reports`) — ở đó số liệu có liên kết truy ngược về danh
   * sách nguồn. Giữ endpoint này để web hiện tại không gãy; **không thêm số liệu mới vào đây**.
   *
   * P5 vá một lỗ rò: trước đây hàm gọi `findMany({})` **không kèm phạm vi dữ liệu**, nên tài khoản
   * doanh nghiệp có `report.view` nhìn thấy cả biển số và hồ sơ của doanh nghiệp khác.
   */
  async getChiengKhuongDashboard(access: UserAccessContext): Promise<SmartGateDashboardDto> {
    const items = await this.declarations.findMany({ scope: this.scope.toCriteria(access) });
    const now = new Date();
    const waiting = items.filter((item) =>
      [
        DeclarationStatus.WAITING_GATE,
        DeclarationStatus.WAITING_CALL,
        DeclarationStatus.BUSINESS_PROCESSING,
        DeclarationStatus.WAITING_FOR_FEE,
        DeclarationStatus.SUBMITTED,
        DeclarationStatus.PROCESSING,
      ].includes(item.status),
    ).length;
    const completed = items.filter((item) => item.status === DeclarationStatus.COMPLETED).length;
    const revision = items.filter((item) => item.status === DeclarationStatus.REVISION_REQUIRED).length;
    // Sau khi gỡ cột `forceProgress` (LÔ 5), thống kê đọc thẳng **trạng thái hồ sơ** — nhất quán với
    // vòng đời thật. "Chờ thu phí" thay cho thống kê bảo hiểm cũ (bảo hiểm đã bỏ khỏi luồng, SRS F18/F19).
    const feeWaiting = items.filter((item) => item.status === DeclarationStatus.WAITING_FOR_FEE).length;

    return {
      gateName: 'Cửa khẩu Chiềng Khương',
      province: 'Sơn La',
      updatedAt: now.toISOString(),
      summary: 'Giám sát phương tiện, tờ khai, kiểm dịch và lực lượng xác nhận tại cửa khẩu Chiềng Khương trong ngày.',
      kpis: [
        { label: 'Hồ sơ đã khai báo', value: this.formatNumber(items.length), delta: `${this.todayCount(items)} hồ sơ tạo hôm nay`, tone: 'blue' },
        { label: 'Đang xử lý nghiệp vụ', value: this.formatNumber(waiting), delta: `${this.percent(waiting, items.length)} tổng hồ sơ`, tone: 'green' },
        { label: 'Cần xử lý', value: this.formatNumber(revision), delta: 'Hồ sơ yêu cầu bổ sung/đối soát', tone: 'amber' },
        { label: 'Hoàn tất thủ tục', value: this.formatNumber(completed), delta: `Tỷ lệ ${this.percent(completed, items.length)}`, tone: 'violet' },
      ],
      trafficBars: this.trafficBars(items),
      checkpoints: this.checkpoints(items),
      alerts: [
        { title: `${waiting} hồ sơ đang chờ xử lý`, detail: 'Mở danh sách tờ khai theo trạng thái đang xử lý.', action: 'OPEN_PROCESSING_DECLARATIONS' },
        { title: `${feeWaiting} hồ sơ chờ thanh toán phí`, detail: 'Mở danh sách hồ sơ đang chờ thu phí.', action: 'OPEN_FEE_PENDING' },
        { title: `${revision} hồ sơ cần đối soát`, detail: 'Mở danh sách hồ sơ yêu cầu khai lại/bổ sung.', action: 'OPEN_RECONCILIATION_QUEUE' },
      ],
      vehicleRows: items.slice(0, 12).map((item) => this.toVehicleFlow(item)),
    };
  }

  private trafficBars(items: Declaration[]): TrafficBarDto[] {
    const hours = Array.from({ length: 8 }, (_, index) => 7 + index);
    const max = Math.max(1, ...hours.map((hour) => items.filter((item) => item.createdAt.getHours() === hour).length));
    return hours.map((hour) => {
      const inHour = items.filter((item) => item.createdAt.getHours() === hour);
      const exportCount = inHour.filter((item) => item.type === DeclarationType.EXPORT || item.type === DeclarationType.TRANSSHIPMENT_EXPORT).length;
      const importCount = inHour.filter((item) => item.type === DeclarationType.IMPORT || item.type === DeclarationType.SELF_PROPELLED).length;
      return {
        hour: `${String(hour).padStart(2, '0')}h`,
        export: exportCount ? Math.round((exportCount / max) * 100) : 0,
        import: importCount ? Math.round((importCount / max) * 100) : 0,
      };
    });
  }

  private checkpoints(items: Declaration[]): CheckpointStatusDto[] {
    return [
      this.checkpoint('B1 - Cửa xuất khẩu', 'Xe rời cửa khẩu về TQ', items.filter((item) => item.checkpoint === 'B1')),
      this.checkpoint('B2 - Cửa nhập khẩu', 'Xe VN vào/ra cửa khẩu', items.filter((item) => item.checkpoint === 'B2')),
      this.checkpoint('B5 - Xuất bãi', 'Hải quan xác nhận xe xuất bãi', items.filter((item) => item.checkpoint === 'B5')),
      this.checkpoint('Bãi kiểm hóa', 'Kiểm dịch, bảo hiểm, đối soát hồ sơ', items.filter((item) => item.checkpoint === 'YARD')),
    ];
  }

  private checkpoint(name: string, note: string, items: Declaration[]): CheckpointStatusDto {
    const blocked = items.filter((item) => item.status === DeclarationStatus.REVISION_REQUIRED || item.status === DeclarationStatus.REJECTED).length;
    const processing = items.filter((item) =>
      [
        DeclarationStatus.BUSINESS_PROCESSING,
        DeclarationStatus.PROCESSING,
        DeclarationStatus.WAITING_GATE,
        DeclarationStatus.WAITING_CALL,
        DeclarationStatus.SUBMITTED,
      ].includes(item.status),
    ).length;
    return {
      name,
      note,
      value: blocked ? `${blocked} cần xử lý` : processing ? `${processing} đang xử lý` : 'Ổn định',
      status: blocked ? 'REVISION_REQUIRED' : processing ? 'PROCESSING' : 'COMPLETED',
    };
  }

  private toVehicleFlow(item: Declaration): VehicleFlowDto {
    return {
      code: item.feeDeclarationCode || item.code,
      plate: item.vehicle.plateNumber,
      flow: this.typeLabel(item.type),
      checkpoint: this.checkpointLabel(item.checkpoint),
      wait: this.waitLabel(item.updatedAt),
      status: this.statusLabel(item.status),
      statusCode: this.statusTone(item.status),
      force: this.pendingForce(item),
    };
  }

  /**
   * Lực lượng đang chờ xử lý của một hồ sơ — suy **từ trạng thái hồ sơ** sau khi gỡ cột `forceProgress`
   * (LÔ 5). Trạng thái `WAITING_*` đã chỉ đích danh lực lượng đang giữ hồ sơ; các trạng thái còn lại
   * hiển thị nhãn chung, không bịa lực lượng cụ thể.
   */
  private pendingForce(item: Declaration): string {
    const labels: Partial<Record<DeclarationStatus, string>> = {
      [DeclarationStatus.WAITING_GATE]: 'Biên phòng',
      [DeclarationStatus.WAITING_CALL]: 'Điều phối',
      [DeclarationStatus.BUSINESS_PROCESSING]: 'Liên ngành',
      [DeclarationStatus.WAITING_BORDER_GUARD]: 'Biên phòng',
      [DeclarationStatus.WAITING_CUSTOMS]: 'Hải quan',
      [DeclarationStatus.WAITING_QUARANTINE]: 'Kiểm dịch',
      [DeclarationStatus.WAITING_FOR_FEE]: 'Thu phí',
      [DeclarationStatus.READY_FOR_EXIT]: 'Hoàn tất',
      [DeclarationStatus.EXITED]: 'Hoàn tất',
      [DeclarationStatus.COMPLETED]: 'Hoàn tất',
    };
    return labels[item.status] ?? 'Đang xử lý';
  }

  private statusTone(status: DeclarationStatus): VehicleFlowDto['statusCode'] {
    if (status === DeclarationStatus.COMPLETED || status === DeclarationStatus.PAID) return 'COMPLETED';
    if (status === DeclarationStatus.REVISION_REQUIRED || status === DeclarationStatus.REJECTED) return 'REVISION_REQUIRED';
    return 'PROCESSING';
  }

  private statusLabel(status: DeclarationStatus): string {
    // Nhãn dùng chung ở `declarations/domain/declaration.enums.ts` — thêm trạng thái mới chỉ sửa một nơi.
    return DECLARATION_STATUS_LABELS[status];
  }

  private typeLabel(type: DeclarationType): string {
    const labels: Record<DeclarationType, string> = {
      EXPORT: 'Xuất khẩu',
      IMPORT: 'Nhập khẩu',
      TRANSSHIPMENT_EXPORT: 'Sang tải đầu xuất',
      TRANSSHIPMENT_IMPORT: 'Sang tải đầu nhập',
      SELF_PROPELLED: 'Xe tự hành',
    };
    return labels[type] || type;
  }

  private checkpointLabel(checkpoint: string): string {
    const labels: Record<string, string> = { B1: 'B1 - Cửa xuất', B2: 'B2 - Cửa nhập', B5: 'B5 - Xuất bãi', YARD: 'Bãi kiểm hóa', SMART_GATE: 'Smart gate' };
    return labels[checkpoint] || checkpoint;
  }

  private waitLabel(date: Date): string {
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 60) return `${minutes} phút`;
    return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
  }

  private todayCount(items: Declaration[]): number {
    const today = new Date().toISOString().slice(0, 10);
    return items.filter((item) => item.createdAt.toISOString().startsWith(today)).length;
  }

  private percent(value: number, total: number): string {
    if (!total) return '0%';
    return `${Math.round((value / total) * 100)}%`;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }
}
