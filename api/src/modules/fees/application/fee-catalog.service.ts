import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOGGER, AuditLogger } from '../../../common/audit/audit-logger.port';
import { CsvCell, CsvExportResult, buildCsv, csvFileName } from '../../../common/export/csv-export';
import { vietnamDateString } from '../../../common/time/vietnam-date';
import { FEE_CALCULATOR, DossierFeeCalculator } from '../../../common/fees/fee-calculator.port';
import { FEE_SETTLEMENT, FeeSettlementQuery, FeeSettlementSnapshot } from '../../../common/fees/fee-settlement.port';
import { FEE_STEP_GATE, FeeStepGateQuery } from '../../../common/fees/fee-step-gate.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../declarations/application/ports/declaration.repository';
import { WorkflowPolicyService } from '../../declarations/application/workflow-policy.service';
import { Declaration } from '../../declarations/domain/declaration.entity';
import { DeclarationStatus, ForceStatus } from '../../declarations/domain/declaration.enums';
import { appBadRequest, appNotFound } from '../../../common/i18n';
import {
  FEE_ACTION_EFFECTS,
  FEE_SCREENS,
  FEE_SLUGS,
  FeeActionCode,
  FeeScreenDefinition,
  isFeeAction,
  isFeeSlug,
} from './fee.catalog';
import {
  FEE_PAYMENT_DEADLINE_HOURS_ENV,
  isFeeOverdue,
  resolveDeadlineHours,
} from '../domain/fee-deadline.rules';
import { SETTINGS_READER, SettingsReader } from '../../../common/settings/settings-reader.port';
import { SYSTEM_SETTING_KEYS } from '../../system/domain/system-setting.catalog';

/**
 * Trạng thái khoản phí của một dòng, suy **từ nghĩa vụ tài chính thật** (`settlement`) — cùng nguồn số
 * mà màn phí theo hồ sơ (`/declarations/:id/fees`) và quy tắc mở cổng (F39) dùng. Trước đây trạng thái
 * bị suy từ trạng thái hồ sơ và số tiền tính bằng công thức trọng lượng (BUG-008): hai màn báo hai con
 * số khác nhau cho cùng một hồ sơ. Nay chỉ có **một** nguồn: `fee_charges` + `fee_transactions`.
 */
function feeStatusFromSettlement(settlement: FeeSettlementSnapshot, feeStepReached: boolean): ForceStatus {
  if (settlement.total <= 0) {
    // Đã tới bước thu phí mà không phát sinh khoản nào (miễn phí / đã tự tính ra 0) → "Không áp dụng",
    // KHÔNG để "Chờ thanh toán" mâu thuẫn (không có gì để thu, cũng không có nút thu). Chưa tới bước
    // phí (chưa tính) thì vẫn coi là "Chờ thanh toán".
    return feeStepReached ? ForceStatus.NOT_APPLICABLE : ForceStatus.PENDING;
  }
  if (settlement.settled) return ForceStatus.COMPLETED;
  return ForceStatus.PENDING;
}

export interface FeeItemsQuery {
  status?: DeclarationStatus;
  keyword?: string;
}

/** Bộ lọc cho lệnh xuất đối soát phí — khớp các bộ lọc đang xem ở màn thu phí (BUG-028). */
export interface FeeExportQuery {
  keyword?: string;
  /** Nhóm trạng thái phí: `ALL` (mặc định) / `WAITING` / `PAID` / `OVERDUE`. */
  status?: string;
  feeType?: string;
  /** Khoảng ngày lập `YYYY-MM-DD`. */
  from?: string;
  to?: string;
}

/** Một dòng phí (kết quả `toFeeRow`) — khai riêng để bộ lọc/định dạng xuất có kiểu tường minh. */
interface FeeRowView {
  code: string;
  plate: string;
  company: string;
  taxCode: string;
  feeType: string;
  amount: number;
  paid: number;
  outstanding: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  overdue: boolean;
}

/** Nhãn nhóm phí (mã enum cố định, không phải danh mục quản trị) — dùng cho cột tệp xuất. */
const FEE_TYPE_LABELS_VI: Record<string, string> = {
  TAX: 'Thuế',
  INFRASTRUCTURE: 'Hạ tầng',
  PARKING: 'Bến bãi',
  SERVICE: 'Dịch vụ',
  QUARANTINE: 'Kiểm dịch',
};

/** Nhãn trạng thái khoản phí (`ForceStatus`) cho cột tệp xuất. */
const FEE_STATUS_LABELS_VI: Record<string, string> = {
  PENDING: 'Chờ thanh toán',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Đã thu',
  NOT_APPLICABLE: 'Không áp dụng',
  REVISION_REQUIRED: 'Cần bổ sung',
  CANCELLED: 'Đã hủy',
  FAILED: 'Thất bại',
};

const FEE_EXPORT_HEADERS = [
  'Mã hồ sơ',
  'Biển số xe',
  'Doanh nghiệp',
  'Mã số thuế',
  'Loại phí',
  'Tổng phải thu',
  'Đã thu',
  'Còn phải thu',
  'Trạng thái',
  'Ngày lập',
] as const;

/** Nhóm mã trạng thái `ForceStatus` theo bộ lọc trạng thái của màn (khớp `feeRowMatchesStatus` ở web). */
const FEE_STATUS_GROUPS: Record<string, string[]> = {
  WAITING: ['PENDING', 'PROCESSING'],
  PAID: ['COMPLETED'],
};

@Injectable()
export class FeeCatalogService {
  private readonly logger = new Logger(FeeCatalogService.name);

  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly workflow: WorkflowPolicyService,
    private readonly config: ConfigService,
    @Inject(FEE_SETTLEMENT)
    private readonly settlement: FeeSettlementQuery,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(SETTINGS_READER)
    private readonly settings: SettingsReader,
    @Inject(FEE_STEP_GATE)
    private readonly feeStepGate: FeeStepGateQuery,
    @Inject(FEE_CALCULATOR)
    private readonly feeCalculator: DossierFeeCalculator,
  ) {}

  /**
   * Cấu hình màn thu phí — trả **mã**, không trả nhãn tiếng Việt.
   * Tiêu đề, tên menu, nhãn nút và nhãn ô tra cứu do web tra từ từ điển đa ngữ theo mã.
   */
  listScreens() {
    return FEE_SLUGS.map((slug) => {
      const screen = FEE_SCREENS[slug];
      return {
        slug: screen.slug,
        force: screen.force,
        searchFields: screen.searchFields,
        actions: screen.actions,
      };
    });
  }

  /**
   * Danh sách hàng đợi thu phí của một màn — **chỉ hồ sơ đã tới bước thu phí VÀ có phát sinh phí**
   * (quyết định chủ dự án). Hồ sơ chưa tới bước phí chưa phát sinh nghĩa vụ thu; hồ sơ miễn phí
   * (`total = 0`) không có gì để thu/đối soát nên cũng bị ẩn hẳn. Hồ sơ đã thu đủ (`total > 0`, đã
   * settled) vẫn hiện để đối soát "đã thu". Xuất đối soát (`exportItems`) và mọi KPI phái sinh đều đọc
   * từ đây nên số liệu nhất quán.
   *
   * **Tính phí lười (lazy) để tự chữa lành**: mỗi hồ sơ đã tới bước phí được gọi `ensureCalculated`
   * (idempotent — đã có khoản phí thì chỉ 1 read, chưa có thì tính) TRƯỚC khi đọc nghĩa vụ tài chính.
   * Nhờ vậy backlog (hồ sơ tới bước phí trước khi có auto-calc) và các lần auto-calc lỗi trước đó đều
   * được vá ngay khi thu ngân mở danh sách — không còn ca "đang ở bước phí nhưng chưa có khoản phí nên
   * bị `amount > 0` ẩn oan".
   */
  async listItems(slug: string, query: FeeItemsQuery = {}) {
    const screen = this.requireScreen(slug);
    const declarations = await this.declarations.findMany({ status: query.status, keyword: query.keyword });
    const deadlineHours = await this.deadlineHours();
    const now = new Date();
    const rows = await Promise.all(
      declarations.map((item) => this.toFeeRowWithLazyCalc(item, screen, now, deadlineHours)),
    );
    // `row.amount` = `settlement.total`; ẩn hồ sơ chưa tới bước phí và hồ sơ miễn phí (total = 0).
    const validRows = rows.filter((row) => row.feeStepReached === true && row.amount > 0);

    // SG-193 — Sắp xếp danh sách thu phí:
    // 1. Ưu tiên hồ sơ "Chờ thanh toán" (PENDING / còn nợ) đẩy lên ĐẦU danh sách để cán bộ thu phí dễ thấy.
    // 2. Tiếp theo là hồ sơ quá hạn (overdue).
    // 3. Cuối cùng là hồ sơ đã thu đủ (COMPLETED).
    // Trong cùng nhóm trạng thái, sắp xếp theo thời gian mới nhất (updatedAt DESC -> createdAt DESC).
    return validRows.sort((left, right) => {
      const getPriority = (row: typeof validRows[number]): number => {
        if (row.status === ForceStatus.PENDING || row.outstanding > 0) return 0;
        if (row.overdue) return 1;
        return 2;
      };
      const priorityDiff = getPriority(left) - getPriority(right);
      if (priorityDiff !== 0) return priorityDiff;

      const leftTime = new Date(left.updatedAt || left.createdAt).getTime();
      const rightTime = new Date(right.updatedAt || right.createdAt).getTime();
      if (leftTime !== rightTime) return rightTime - leftTime;

      return right.code.localeCompare(left.code);
    });
  }

  /**
   * Dựng một dòng phí cho danh sách, tính phí lười trước khi đọc nghĩa vụ tài chính.
   *
   * Chỉ tính cho hồ sơ **đã tới bước phí** (tránh tạo khoản phí sớm cho hồ sơ chưa tới bước). Bọc
   * try/catch **theo từng hồ sơ**: một hồ sơ tính phí lỗi thì chỉ `warn` và bỏ qua (hồ sơ đó vẫn
   * `total = 0` → bị lọc ẩn — chấp nhận được, là lỗi hệ thống hiếm và đã có nhật ký), KHÔNG làm hỏng
   * cả danh sách.
   */
  private async toFeeRowWithLazyCalc(
    item: Declaration,
    screen: FeeScreenDefinition,
    now: Date,
    deadlineHours: number,
  ) {
    const feeStepReached = await this.feeStepGate.hasReachedFeeStep(item.id);
    if (feeStepReached) {
      try {
        await this.feeCalculator.ensureCalculated(item.id);
      } catch (error) {
        this.logger.warn(
          `Không tự tính được phí cho hồ sơ ${item.id} khi liệt kê (bỏ qua hồ sơ này): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return this.toFeeRow(item, screen, now, deadlineHours, feeStepReached);
  }

  /**
   * Số giờ hạn thu phí — ưu tiên giá trị quản trị viên đặt ở màn "Cấu hình hệ thống"
   * (`fee.paymentDeadlineHours`), rồi đến biến môi trường, cuối cùng rơi về mặc định (72 giờ).
   */
  private async deadlineHours(): Promise<number> {
    const stored = await this.settings.getValue(SYSTEM_SETTING_KEYS.FEE_PAYMENT_DEADLINE_HOURS);
    return resolveDeadlineHours(stored ?? this.config.get<string>(FEE_PAYMENT_DEADLINE_HOURS_ENV));
  }

  async runAction(
    slug: string,
    action: string,
    actor: { id: string; roles: string[] },
    body: { declarationId?: string; feeCode?: string; amount?: number; note?: string },
  ) {
    const screen = this.requireScreen(slug);
    const actionCode = this.requireAction(screen, action);

    const declarations = await this.declarations.findMany({ keyword: body.declarationId ?? body.feeCode });
    const declaration = body.declarationId
      ? await this.declarations.findById(body.declarationId)
      : declarations.find((item) => item.code === body.feeCode || item.feeDeclarationCode === body.feeCode);
    if (!declaration) throw appNotFound('dossier.feeNotFound');

    // Ảnh chụp kiểm toán ghi danh sách vai trò RBAC nối bằng `+`, không phải mã vai trò cũ đơn lẻ.
    const actorRole = actor.roles.join('+');
    const note = `${actionCode} - Số tiền: ${body.amount ?? 0}. ${body.note ?? ''}`.trim();
    const effect = FEE_ACTION_EFFECTS[actionCode];

    // Đường này **KHÔNG thu tiền**: điều kiện tài chính có một nguồn sự thật duy nhất là `settlement`
    // (giao dịch đã xác nhận ở màn phí theo hồ sơ), và bước phí của phiên do cơ quan thu phí duyệt qua
    // `POST /workflow/.../decide`. Ở đây chỉ giữ **kiểm quyền** và **ghi nhật ký** thao tác đối soát.
    if (effect === 'MERGE') {
      declaration.recordFeeMerge(actor.id, actorRole, note);
    } else if (effect === 'CANCEL') {
      declaration.recordOperationAction(actor.id, actorRole, note);
    } else {
      // Giữ kiểm **vai trò** thu phí (`FEE_COLLECTOR`/`SYS_ADMIN`).
      this.workflow.assertCanConfirmFee(declaration, actor.roles);
      declaration.recordOperationAction(actor.id, actorRole, note);
    }

    const saved = await this.declarations.save(declaration);
    // Nhật ký bất biến ở mức ứng dụng (F05/BUG-009): thao tác phí phải vào `audit_logs`, không chỉ vào
    // `declaration.auditTrail`. Ảnh chụp mang mã hành động + số tiền + ghi chú để tra ngược đối soát.
    await this.audit.record({
      action: 'FEE_WORKBENCH_ACTION',
      targetType: 'DECLARATION',
      targetId: saved.id,
      after: {
        feeAction: actionCode,
        slug: screen.slug,
        amount: Math.round(body.amount ?? 0),
        note: body.note?.trim() || null,
      },
    });

    return {
      success: true,
      action: actionCode,
      item: await this.toFeeRow(saved, screen, new Date(), await this.deadlineHours()),
      declaration: saved,
    };
  }

  /**
   * Xuất danh sách đối soát phí ra CSV **ở máy chủ** (F51/F58) — đọc số THẬT từ `settlement` (cùng
   * nguồn với màn danh sách), áp đúng các bộ lọc đang xem rồi ghi nhật ký `REPORT_EXPORT` (BUG-028).
   */
  async exportItems(
    slug: string,
    query: FeeExportQuery,
    _actor: { id: string; roles: string[] },
  ): Promise<CsvExportResult> {
    this.requireScreen(slug);
    const rows = (await this.listItems(slug, { keyword: query.keyword })) as FeeRowView[];
    const filtered = rows.filter((row) => this.matchesExport(row, query));

    const content = buildCsv(FEE_EXPORT_HEADERS, filtered.map((row) => this.toExportRow(row)));
    return { fileName: csvFileName(`doi-soat-phi-${slug}`), content, rowCount: filtered.length };
  }

  /** Áp bộ lọc trạng thái/loại phí/khoảng ngày lên một dòng phí — mã ASCII, không so nhãn hiển thị. */
  private matchesExport(row: FeeRowView, query: FeeExportQuery): boolean {
    const status = String(row.status || '').toUpperCase();
    if (query.status === 'OVERDUE') {
      if (!row.overdue) return false;
    } else if (query.status && FEE_STATUS_GROUPS[query.status]) {
      if (!FEE_STATUS_GROUPS[query.status].includes(status)) return false;
    }
    if (query.feeType && row.feeType !== query.feeType) return false;
    const day = String(row.createdAt || '').slice(0, 10);
    if (query.from && day < query.from) return false;
    if (query.to && day > query.to) return false;
    return true;
  }

  private toExportRow(row: FeeRowView): CsvCell[] {
    const status = String(row.status || '').toUpperCase();
    const statusLabel = FEE_STATUS_LABELS_VI[status] ?? row.status;
    return [
      row.code,
      row.plate,
      row.company,
      row.taxCode,
      FEE_TYPE_LABELS_VI[row.feeType] ?? row.feeType,
      row.amount,
      row.paid,
      row.outstanding,
      row.overdue ? `${statusLabel} (quá hạn)` : statusLabel,
      row.createdAt ? vietnamDateString(new Date(row.createdAt)) : '',
    ];
  }

  // --- Tra danh mục: mã lạ bị từ chối rõ ràng, không rơi mặc định về `taxFee` ---

  private requireScreen(slug: string): FeeScreenDefinition {
    if (!isFeeSlug(slug)) throw appNotFound('fee.screenNotFound', { slug });
    return FEE_SCREENS[slug];
  }

  private requireAction(screen: FeeScreenDefinition, action: string): FeeActionCode {
    if (!isFeeAction(action) || !screen.actions.includes(action)) {
      throw appBadRequest('fee.actionNotFound', { action, slug: screen.slug });
    }
    return action;
  }

  private async toFeeRow(
    item: Declaration,
    screen: FeeScreenDefinition,
    now: Date,
    deadlineHours: number,
    feeStepReachedHint?: boolean,
  ) {
    // Số tiền THẬT từ nghĩa vụ tài chính (F47/F48/F51) — một nguồn duy nhất với màn phí theo hồ sơ.
    // `feeStepReachedHint` do `listItems` truyền vào sau khi đã tính phí lười (tránh đọc cổng 2 lần và
    // bảo đảm `snapshotOf` chạy SAU `ensureCalculated`); đường khác (runAction) tự tra khi thiếu.
    const feeStepReached = feeStepReachedHint ?? (await this.feeStepGate.hasReachedFeeStep(item.id));
    const settlement = await this.settlement.snapshotOf(item.id);
    const status = feeStatusFromSettlement(settlement, feeStepReached);
    // Còn nợ (`outstanding > 0`) và quá hạn thanh toán cấu hình được → gắn cờ quá hạn.
    const overdue = settlement.outstanding > 0 && isFeeOverdue(item.createdAt, now, deadlineHours);
    return {
      declarationId: item.id,
      code: item.feeDeclarationCode || item.code,
      plate: item.vehicle.plateNumber,
      trailer: item.vehicle.trailerNumber || '',
      taxCode: item.enterprise.taxCode,
      company: item.enterprise.name,
      // Nhóm phí (biểu phí) của màn — mã ASCII, web tra nhãn theo mã.
      feeType: screen.feeType,
      // Tổng phải thu / đã thu (đã xác nhận) / còn phải thu — số nguyên đồng, khớp màn phí theo hồ sơ.
      amount: settlement.total,
      paid: settlement.confirmed,
      outstanding: settlement.outstanding,
      // Mã trạng thái (`ForceStatus`), không phải nhãn: web tra nhãn theo mã và đếm theo mã.
      status,
      // Ngày lập khoản phí = thời điểm tạo hồ sơ (ISO) — web hiển thị "Ngày lập" và lọc theo khoảng ngày.
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      // Cờ quá hạn: chỉ khoản còn nợ mới xét, dựa trên hạn thanh toán cấu hình được.
      overdue,
      // Hồ sơ đã tới bước thu phí chưa (quyết định chủ dự án) — web dùng để bật/tắt nút thu.
      feeStepReached,
    };
  }
}
