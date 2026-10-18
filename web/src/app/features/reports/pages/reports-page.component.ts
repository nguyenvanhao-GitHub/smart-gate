import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { exportAndLogFile } from '../../../shared/utils/file-download.util';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import type { EChartsOption } from 'echarts';
import { PERMISSION } from '../../../core/auth/access-control.model';
import { AuthService } from '../../../core/auth/auth.service';
import { extractErrorMessage } from '../../../core/forms/field-errors';
import {
  ReportColumn,
  ReportDefinition,
  ReportFilterDefinition,
  ReportQuery,
  ReportResult,
  ReportRow,
  categoryColumn,
  buildCountSeriesFromRows,
  cleanFilterValues,
  exportFileName,
  formatDuration,
  formatReportCell,
  groupReports,
  pickReportForRoute,
  seriesColumns,
} from '../../../core/models/report.model';
import { ApiService } from '../../../core/services/api.service';
import { chartTheme } from '../../../shared/charts/chart-theme';
import { SgChartComponent, SgChartTable } from '../../../shared/charts/sg-chart.component';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgDatePickerComponent } from '../../../shared/ui/sg-date-picker.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { normalizeText } from '../../../core/models/label.util';

const PAGE_SIZES = [10, 20, 50];

/** Số chuỗi tối đa vẽ lên biểu đồ — nhiều hơn thì biểu đồ rối, bảng số liệu vẫn đủ cả. */
const MAX_CHART_SERIES = 4;

/**
 * UI-12 — Báo cáo, thống kê.
 *
 * Theo SRS UI-12 màn hình gồm: **bộ lọc**, **biểu đồ lưu lượng / thời gian xử lý**,
 * **bảng theo lực lượng** và **xuất Excel**.
 *
 * Hai điều làm nên tính đúng đắn của màn hình này:
 *   1. **Danh mục báo cáo và bộ lọc do API trả** (`GET /reports/catalog`). Biểu mẫu lọc
 *      dựng động từ `filters[]`; web không biết trước có báo cáo nào, ô lọc nào.
 *   2. **Xuất Excel gửi đúng bộ lọc đang xem** — cùng thân yêu cầu với truy vấn vừa chạy,
 *      nếu không thì tệp tải về sẽ khác số liệu trên màn hình.
 *
 * Ba hạng mục của mockup MH12 **cố ý không làm** (quyết định A0): xuất PDF (F58 chỉ quy
 * định Excel), bảng "Top 5 doanh nghiệp" và khối "Thông báo & xu hướng".
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    SgButtonDirective,
    SgCardComponent,
    SgChartComponent,
    SgDatePickerComponent,
    SgFormFieldComponent,
    SgPagerComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ reportTitle(selected()) }}</h1>
        @if (reportDesc(selected())) {
          <p class="head__desc">{{ reportDesc(selected()) }}</p>
        }
      </div>
      <div class="head__actions">
        @if (canExport()) {
          <button type="button" sgButton [disabled]="!selected() || exporting()" (click)="exportExcel()">
            <mat-icon fontSet="material-icons-round">download</mat-icon>{{ exporting() ? t('ui.report.exporting') : t('ui.report.export') }}
          </button>
        }
      </div>
    </section>

    <sg-card [flush]="true">
      <div class="picker">
        <sg-form-field [label]="t('ui.report.group')">
          <sg-select [ariaLabel]="t('ui.report.group')" [placeholder]="t('ui.report.chooseGroup')" [options]="groupOptions()" [value]="selectedGroup()" (valueChange)="chooseGroup($event)" />
        </sg-form-field>
        <sg-form-field [label]="t('ui.report.name')">
          <sg-select [ariaLabel]="t('ui.report.name')" [placeholder]="t('ui.report.chooseReport')" [options]="reportOptions()" [value]="selectedCode()" (valueChange)="chooseReport($event)" />
        </sg-form-field>
      </div>

      @if (selected(); as report) {
        <div class="filters">
          @for (filter of displayFilters(report); track filter.key) {
            <sg-form-field [label]="filterLabel(filter)">
              @switch (filter.type) {
                @case ('date') {
                  <sg-date-picker [ariaLabel]="filterLabel(filter)" [value]="valueOf(filter.key)" (valueChange)="setFilter(filter.key, $event)" />
                }
                @case ('select') {
                  <sg-select
                    [ariaLabel]="filterLabel(filter)"
                    [placeholder]="t('ui.report.filterAll')"
                    [options]="optionsOf(filter)"
                    [value]="valueOf(filter.key)"
                    (valueChange)="setFilter(filter.key, $event)"
                  />
                }
                @default {
                  <input
                    type="text"
                    [attr.aria-label]="filterLabel(filter)"
                    [ngModel]="valueOf(filter.key)"
                    (ngModelChange)="setFilter(filter.key, $event)"
                  />
                }
              }
            </sg-form-field>
          }
          <div class="filters__actions">
            <button type="button" sgButton [disabled]="loading()" (click)="search()">
              <mat-icon fontSet="material-icons-round">manage_search</mat-icon>{{ t('ui.report.run') }}
            </button>
            <button type="button" sgButton="tertiary" [disabled]="loading()" (click)="resetFilters()">
              <mat-icon fontSet="material-icons-round">restart_alt</mat-icon>{{ t('ui.common.reset') }}
            </button>
          </div>
        </div>
      }
    </sg-card>

    @if (summaryCards().length) {
      <section class="summary" [attr.aria-label]="t('ui.report.summaryAria')">
        @for (item of summaryCards(); track item.key) {
          <article class="summary__card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        }
      </section>
    }

    <section class="charts">
      <sg-chart
        [title]="chartTitle()"
        [subtitle]="t('ui.report.chartSubtitle')"
        height="300px"
        [option]="chartOption()"
        [loading]="loading()"
        [error]="chartError()"
        [empty]="!chartTable().rows.length"
        [emptyText]="t('ui.report.chartEmpty')"
        [ariaLabel]="chartAria()"
        (chartClick)="onChartClick($event)"
      />
      @if (isGateEventReport() && result()) {
        <sg-card [flush]="true">
          <table class="action-table">
            <thead>
              <tr>
                <th class="action-col-name">{{ t('ui.report.colAction') }}</th>
                <th class="action-col-count">{{ t('ui.report.actionCount') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of gateActionItems(); track item.key) {
                <tr class="action-table-row" (click)="drilldownGateAction(item.direction, item.decision)">
                  <td class="action-col-name">
                    <span class="action-name">{{ item.label }}</span>
                  </td>
                  <td class="action-col-count">
                    <div class="action-count-wrap">
                      <strong>{{ formatNumber(item.count) }}</strong>
                      <mat-icon fontSet="material-icons-round" class="action-link-icon">open_in_new</mat-icon>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div card-footer class="action-card-footer">
            <button type="button" sgButton="tertiary" size="sm" (click)="openDrilldown()">
              <mat-icon fontSet="material-icons-round">open_in_new</mat-icon>{{ t('ui.report.openSource') }}
            </button>
          </div>
        </sg-card>
      }
    </section>

    @if (!isGateEventReport()) {
      <sg-card [flush]="true">
        <div class="sg-scroll-x">
          <table class="grid">
            <thead>
              <tr>
                @for (column of columns(); track column.key) {
                  <th [attr.data-type]="column.type">{{ columnLabel(column) }}</th>
                }
                @if (!columns().length) {
                  <th>{{ t('ui.report.dataColumn') }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                <tr><td [attr.colspan]="colspan()" class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.report.running') }}</td></tr>
              } @else if (error()) {
                <tr><td [attr.colspan]="colspan()" class="state">{{ t('ui.report.displayError') }}</td></tr>
              } @else if (!rows().length) {
                <tr>
                  <td [attr.colspan]="colspan()" class="state">
                    <mat-icon fontSet="material-icons-round">inbox</mat-icon>
                    {{ t('ui.report.emptyRows') }}
                  </td>
                </tr>
              } @else {
                @for (row of rows(); track $index) {
                  <tr>
                    @for (column of columns(); track column.key) {
                      <td [attr.data-type]="column.type">{{ cell(row, column) }}</td>
                    }
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (hasPagination()) {
          <div card-footer class="pager">
            <span>{{ pageSummary() }}</span>
            <div class="pager__controls">
              <span class="pager__label">{{ t('ui.common.display') }}</span>
              <sg-select class="pager__size" [showEmptyOption]="false" [ariaLabel]="t('ui.common.pageSizeAria')" [options]="pageSizeOptions()" [value]="pageSizeValue()" (valueChange)="changePageSize($event)" />
            </div>
            <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()" (pageChange)="goToPage($event)" />
            @if (result()?.drilldown) {
              <button type="button" sgButton="tertiary" size="sm" (click)="openDrilldown()">
                <mat-icon fontSet="material-icons-round">open_in_new</mat-icon>{{ t('ui.report.openSource') }}
              </button>
            }
          </div>
        } @else if (result()?.drilldown) {
          <div card-footer class="pager-no-pagination">
            <button type="button" sgButton="tertiary" size="sm" (click)="openDrilldown()">
              <mat-icon fontSet="material-icons-round">open_in_new</mat-icon>{{ t('ui.report.openSource') }}
            </button>
          </div>
        }
      </sg-card>
    }

    <p class="note">{{ t('ui.report.note') }}</p>
  `,
  styles: [
    `
      :host { display: block; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .head h1 { margin: 0; }
      .head__desc { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .head__actions { display: flex; gap: var(--sg-space-2); }
      .feedback { display: block; margin: var(--sg-space-3) var(--sg-space-4) 0; }

      .picker {
        display: grid;
        grid-template-columns: minmax(220px, .8fr) minmax(280px, 1.2fr);
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
      }
      .filters {
        display: grid;
        grid-template-columns: repeat(4, minmax(170px, 1fr));
        gap: var(--sg-space-3);
        align-items: end;
        padding: var(--sg-space-3) var(--sg-space-4);
      }
      .filters__actions { display: flex; align-items: end; gap: var(--sg-space-2); }

      .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sg-space-3); margin: var(--sg-space-3) 0; }
      .summary__card {
        padding: var(--sg-space-3) var(--sg-space-4);
        border: 1px solid var(--sg-border);
        border-left: 4px solid var(--sg-primary);
        border-radius: var(--sg-radius-card);
        background: var(--sg-bg-surface);
        box-shadow: var(--sg-shadow-card);
      }
      .summary__card span { display: block; color: var(--sg-text-muted); font-size: var(--sg-small-size); font-weight: 700; }
      .summary__card strong { display: block; margin-top: var(--sg-space-1); font-size: var(--sg-h1-size); line-height: var(--sg-h1-line); }

      .charts { display: grid; gap: var(--sg-space-3); margin: var(--sg-space-3) 0; }

      .action-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        background: var(--sg-bg-surface);
      }
      .action-table th, .action-table td {
        padding: 12px var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
        text-align: left;
        vertical-align: middle;
      }
      .action-table th {
        background: var(--sg-bg-subtle);
        font-size: var(--sg-small-size);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .03em;
        color: var(--sg-text-muted);
      }
      .action-col-name {
        width: 50%;
      }
      .action-col-count {
        width: 50%;
      }
      .action-table-row {
        cursor: pointer;
        transition: background 0.15s ease-in-out;
      }
      .action-table-row:hover {
        background: var(--sg-bg-subtle);
      }
      .action-name {
        font-size: 15px;
        font-weight: 500;
        color: var(--sg-text);
      }
      .action-count-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }
      .action-count-wrap strong {
        font-size: 15px;
        font-weight: 700;
        color: var(--sg-text);
        line-height: 1;
      }
      .action-link-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--sg-primary);
        opacity: 0.6;
        transition: opacity 0.15s;
      }
      .action-table-row:hover .action-link-icon {
        opacity: 1;
      }
      .action-card-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: var(--sg-space-2) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
      }

      .grid { width: 100%; min-width: 960px; border-collapse: collapse; background: var(--sg-bg-surface); }
      .grid th, .grid td { padding: var(--sg-space-2) var(--sg-space-3); border-bottom: 1px solid var(--sg-border); text-align: left; vertical-align: middle; }
      .grid th { background: var(--sg-bg-subtle); font-size: var(--sg-small-size); text-transform: uppercase; letter-spacing: .02em; }
      .grid th[data-type='number'], .grid td[data-type='number'],
      .grid th[data-type='duration'], .grid td[data-type='duration'] { text-align: right; }
      .grid tbody tr:hover { background: var(--sg-bg-subtle); }
      .state { display: flex; align-items: center; justify-content: center; gap: var(--sg-space-2); padding: var(--sg-space-8); color: var(--sg-text-muted); }

      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }
      .pager-no-pagination {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: var(--sg-space-3) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
      }
      .pager__controls { display: inline-flex; align-items: center; gap: 8px; }
      .pager__label { color: var(--sg-text-muted); font-size: var(--sg-small-size); white-space: nowrap; }
      .pager__size { width: 72px; }
      .note { margin: var(--sg-space-3) 0 0; color: var(--sg-text-muted); font-size: var(--sg-caption-size); }

      @media (max-width: 1080px) {
        .picker, .filters { grid-template-columns: 1fr; }
        .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `,
  ],
})
export class ReportsPageComponent implements OnInit {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;
  /**
   * Tham số `/reports/:group` — chỉ dùng để **chọn báo cáo mở đầu**. Đổi báo cáo trên
   * màn hình không ghi lại url: mã báo cáo do API đặt, ép vào đường dẫn sẽ làm mục menu
   * (`/reports/general`) và màn hình lệch nhau.
   */
  @Input() group = '';

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly appMessages = inject(AppMessageService);
  protected readonly i18n = inject(I18nService);

  protected readonly catalog = signal<ReportDefinition[]>([]);
  protected readonly selected = signal<ReportDefinition | null>(null);
  protected readonly result = signal<ReportResult | null>(null);

  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  /** Giữ để biểu đồ/bảng tự hiện trạng thái lỗi của chính chúng; thông báo cho người dùng đi qua toast. */
  protected readonly error = signal('');

  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );

  /** Giá trị các ô lọc hiện tại, khóa theo `filters[].key` do API khai. */
  protected filterValues: Record<string, string> = {};

  protected readonly canExport = computed(() => this.auth.hasPermission(PERMISSION.reportExport));

  protected readonly hasPagination = computed(() => {
    const report = this.selected();
    if (!report) return true;
    const code = (report.code || '').toLowerCase();
    const name = normalizeText(report.name);
    if (
      code.includes('processing-time') ||
      code.includes('decision') ||
      name.includes('thoi gian xu ly theo luc luong') ||
      name.includes('quyet dinh theo luc luong')
    ) {
      return false;
    }
    return true;
  });

  protected readonly groups = computed(() => groupReports(this.catalog(), this.t));
  protected readonly selectedGroup = computed(() => this.selected()?.group || '');
  protected readonly selectedCode = computed(() => this.selected()?.code || '');

  protected groupName(group: string): string {
    if (this.i18n.locale() === 'en') {
      const raw = normalizeText(group);
      if (raw.includes('ho so') || raw.includes('dossier')) return this.t('ui.report.groupDossier');
      if (raw.includes('lien nganh') || raw.includes('interagency')) return this.t('ui.report.groupInterAgency');
      if (raw.includes('cong') || raw.includes('gate')) return this.t('ui.report.groupGate');
      if (raw.includes('kho bai') || raw.includes('yard') || raw.includes('storage')) return this.t('ui.report.groupYard');
      if (raw.includes('hai quan') || raw.includes('customs')) return this.t('ui.report.groupCustoms');
    }
    return group;
  }

  protected reportTitle(report: ReportDefinition | null): string {
    if (!report) return this.t('ui.report.title');
    if (this.i18n.locale() === 'en') {
      const code = (report.code || '').toLowerCase();
      const name = normalizeText(report.name);

      if (code.includes('throughput') || name.includes('luu luong ho so theo ngay')) return this.t('ui.report.dailyTrafficName');
      if (code.includes('processing-time') || name.includes('thoi gian xu ly theo luc luong')) return this.t('ui.report.processingTimeName');
      if (code.includes('decision') || name.includes('quyet dinh theo luc luong')) return this.t('ui.report.decisionByForceName');
      if (code.includes('gate-event') || name.includes('nhat ky qua cong')) return this.t('ui.report.gateLogName');
      if (code.includes('occupancy') || name.includes('ton bai theo khu')) return this.t('ui.report.yardInventoryName');
    }
    return report.name;
  }

  protected reportDesc(report: ReportDefinition | null): string {
    if (!report) return '';
    if (this.i18n.locale() === 'en') {
      const code = (report.code || '').toLowerCase();
      const name = normalizeText(report.name);

      if (code.includes('throughput') || name.includes('luu luong ho so theo ngay')) return this.t('ui.report.dailyTrafficDesc');
      if (code.includes('processing-time') || name.includes('thoi gian xu ly theo luc luong')) return this.t('ui.report.processingTimeDesc');
      if (code.includes('decision') || name.includes('quyet dinh theo luc luong')) return this.t('ui.report.decisionByForceDesc');
      if (code.includes('gate-event') || name.includes('nhat ky qua cong')) return this.t('ui.report.gateLogDesc');
      if (code.includes('occupancy') || name.includes('ton bai theo khu')) return this.t('ui.report.yardInventoryDesc');
    }
    return report.description || '';
  }

  protected columnLabel(col: ReportColumn | { key?: string; label?: string } | null | undefined): string {
    if (!col) return '';
    if (this.i18n.locale() === 'en') {
      const key = (col.key || '').toLowerCase();
      const raw = normalizeText(col.label);

      // Date / Time
      if (key === 'date' || raw === 'ngay' || raw.includes('ngay')) return this.t('ui.report.colDate');
      if (key.includes('time') || key.includes('hour') || raw.includes('thoi diem') || raw.includes('gio') || raw.includes('khung gio')) return this.t('ui.report.categoryTime');
      if (key.includes('duration') || raw.includes('thoi gian') || raw.includes('duration')) return this.t('ui.report.processingTimeName');

      // Dossier status / flow
      if (key === 'created' || raw.includes('ho so tao') || raw.includes('created')) return this.t('ui.report.created');
      if (key === 'submitted' || raw.includes('da gui') || raw.includes('submitted')) return this.t('ui.report.submitted');
      if (key === 'completed' || raw.includes('hoan thanh') || raw.includes('completed')) return this.t('ui.report.completed');
      if (key === 'rejected' || raw.includes('tu choi') || raw.includes('rejected')) return this.t('ui.report.rejected');
      if (raw.includes('chap nhan') || raw.includes('phe duyet') || raw.includes('dong y')) return this.t('ui.report.colApproved');
      if (raw.includes('sua doi') || raw.includes('bo sung') || raw.includes('revision')) return this.t('ui.report.colRevision');
      if (raw.includes('buoc nghiep vu') || raw.includes('nghiep vu') || key.includes('step')) return this.t('ui.report.colStep');

      // Agency / Force
      if (key.includes('agency') || raw.includes('luc luong') || raw.includes('force')) return this.t('ui.dashboard.colForce');
      if (raw.includes('bien phong')) return this.t('ui.force.borderGuard');
      if (raw.includes('hai quan')) return this.t('ui.force.customs');
      if (raw.includes('kiem dich')) return this.t('ui.force.quarantine');
      if (key.includes('type') || raw.includes('loai hinh') || raw.includes('dossier type')) return this.t('ui.report.filterType');

      // Yard
      if (key.includes('zone_code') || raw.includes('ma khu')) return this.t('ui.report.colZoneCode');
      if (key.includes('zone_name') || raw.includes('ten khu')) return this.t('ui.report.colZoneName');
      if (key.includes('capacity') || raw.includes('suc chua')) return this.t('ui.report.colCapacity');
      if (raw.includes('dang mo') || raw.includes('open')) return this.t('ui.report.colOpenSlots');
      if (raw.includes('co xe') || raw.includes('occupied')) return this.t('ui.report.colOccupiedSlots');
      if (raw.includes('con trong') || raw.includes('trong') || raw.includes('available')) return this.t('ui.report.colAvailableSlots');

      // Gate / Vehicle
      if (key.includes('dossier') || raw.includes('ma ho so') || raw.includes('so ho so')) return this.t('ui.report.colDossierCode');
      if (key.includes('plate') || raw.includes('bien so')) return this.t('ui.report.colPlate');
      if (key.includes('gate') || raw === 'cong' || raw.startsWith('cong ') || raw.endsWith(' cong')) return this.t('ui.report.groupGate');
      if (key.includes('direction') || raw.includes('chieu')) return this.t('ui.report.colDirection');
      if (key.includes('result') || raw.includes('ket qua')) return this.t('ui.report.colResult');
      if (key.includes('light') || raw.includes('den')) return this.t('ui.report.colLight');
      if (key.includes('user') || key.includes('recorder') || raw.includes('nguoi ghi nhan') || raw.includes('can bo')) return this.t('ui.report.colRecorder');
      if (key.includes('note') || raw.includes('ghi chu')) return this.t('ui.report.colNote');

      if (key.includes('event') || key.includes('count') || raw.includes('luot') || raw.includes('su kien')) return this.t('ui.report.totalEvents');
    }
    return col.label || '';
  }

  protected readonly groupOptions = computed<SgSelectOption[]>(() =>
    this.groups().map((item) => ({
      value: item.group,
      label: this.t('ui.report.groupOption', { group: this.groupName(item.group), count: item.reports.length }),
    })),
  );

  protected readonly reportOptions = computed<SgSelectOption[]>(() => {
    const group = this.groups().find((item) => item.group === this.selectedGroup());
    if (!group) return [];
    return group.reports.map((report) => ({
      value: report.code,
      label: this.reportTitle(report),
    }));
  });

  protected readonly chartError = computed(() => (this.error() ? this.t('ui.dashboard.chartLoadFailed') : ''));

  protected readonly columns = computed<ReportColumn[]>(() => this.result()?.columns ?? []);
  protected readonly rows = computed<ReportRow[]>(() => {
    const allRows = this.result()?.rows ?? [];
    const report = this.selected();
    if (!report) return allRows;

    // SG-224: Báo cáo theo lực lượng / liên ngành hoặc có cột agency/force -> Lọc bỏ lực lượng "Cơ quan thu phí"
    const code = normalizeText(report.code);
    const group = normalizeText(report.group);
    const name = normalizeText(report.name);
    const isForceReport =
      code.includes('force') ||
      code.includes('luc_luong') ||
      group.includes('force') ||
      group.includes('luc_luong') ||
      group.includes('lien nganh') ||
      name.includes('luc luong') ||
      allRows.some((row) => row['agencyName'] || row['agencyCode'] || row['agency'] || row['force']);

    if (!isForceReport) return allRows;

    return allRows.filter((row) => {
      const agencyVal = [row['agencyName'], row['agencyCode'], row['agency'], row['force']]
        .filter((v): v is string | number => v !== null && v !== undefined && typeof v !== 'object')
        .map((v) => normalizeText(String(v)))
        .join(' ');
      if (agencyVal.includes('co quan thu phi') || agencyVal === 'fee_authority' || agencyVal === 'fee_agency') {
        return false;
      }
      return true;
    });
  });
  protected readonly total = computed(() => this.result()?.total ?? 0);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly colspan = computed(() => Math.max(1, this.columns().length));

  protected readonly pageSummary = computed(() => {
    if (!this.total()) return this.t('ui.report.rowsEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.total(), this.page() * this.pageSize());
    return this.t('ui.report.rowsSummary', { start, end, total: this.total() });
  });

  private summaryLabel(key: string): string {
    const column = this.columns().find((col) => col.key === key);
    if (column) return this.columnLabel(column);
    if (key === 'dossiers' || key === 'total') return this.t('ui.report.totalDossiers');
    if (key === 'events' || key === 'count') return this.t('ui.report.totalEvents');
    if (key === 'actions') return this.t('ui.report.totalActions');
    if (this.i18n.locale() === 'en') {
      const raw = normalizeText(key);
      if (key.includes('open') || raw.includes('dang mo')) return this.t('ui.report.colOpenSlots');
      if (key.includes('occupied') || raw.includes('co xe')) return this.t('ui.report.colOccupiedSlots');
      if (key.includes('available') || raw.includes('con trong') || raw.includes('trong')) return this.t('ui.report.colAvailableSlots');
      if (key.includes('capacity') || raw.includes('suc chua')) return this.t('ui.report.colCapacity');
    }
    return this.columnLabel({ key, label: key });
  }

  protected readonly isGateEventReport = computed(() => this.selected()?.code === 'gate-event');

  protected formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value || 0);
  }

  protected readonly gateActionItems = computed(() => {
    if (!this.isGateEventReport()) return [];
    const summary = this.result()?.summary || {};
    let entryAllow = summary['entryAllow'];
    let entryDeny = summary['entryDeny'];
    let exitAllow = summary['exitAllow'];
    let exitDeny = summary['exitDeny'];

    if (entryAllow === undefined && exitAllow === undefined) {
      const rows = this.rows();
      const isEntry = (r: ReportRow) => {
        const d = typeof r['direction'] === 'string' ? normalizeText(r['direction']) : '';
        return d === 'entry' || d === 'vao';
      };
      const isExit = (r: ReportRow) => {
        const d = typeof r['direction'] === 'string' ? normalizeText(r['direction']) : '';
        return d === 'exit' || d === 'ra';
      };
      const isAllow = (r: ReportRow) => {
        const d = typeof r['decision'] === 'string' ? normalizeText(r['decision']) : '';
        return d === 'allow' || d === 'cho qua';
      };
      const isDeny = (r: ReportRow) => {
        const d = typeof r['decision'] === 'string' ? normalizeText(r['decision']) : '';
        return d === 'deny' || d === 'tu choi';
      };

      entryAllow = rows.filter((r) => isEntry(r) && isAllow(r)).length;
      entryDeny = rows.filter((r) => isEntry(r) && isDeny(r)).length;
      exitAllow = rows.filter((r) => isExit(r) && isAllow(r)).length;
      exitDeny = rows.filter((r) => isExit(r) && isDeny(r)).length;
    }

    return [
      { key: 'entryAllow', label: this.t('ui.report.actionEntryAllow'), count: Number(entryAllow) || 0, direction: 'ENTRY', decision: 'ALLOW' },
      { key: 'entryDeny', label: this.t('ui.report.actionEntryDeny'), count: Number(entryDeny) || 0, direction: 'ENTRY', decision: 'DENY' },
      { key: 'exitAllow', label: this.t('ui.report.actionExitAllow'), count: Number(exitAllow) || 0, direction: 'EXIT', decision: 'ALLOW' },
      { key: 'exitDeny', label: this.t('ui.report.actionExitDeny'), count: Number(exitDeny) || 0, direction: 'EXIT', decision: 'DENY' },
    ];
  });

  /** `summary` chỉ có khóa và số — lấy nhãn và kiểu hiển thị từ cột tương ứng (định dạng thời lượng nếu là duration). */
  protected readonly summaryCards = computed(() => {
    const summary = this.result()?.summary || {};
    const columns = this.columns();
    return Object.entries(summary)
      .filter(([key]) => {
        if (this.isGateEventReport()) {
          return key === 'events';
        }
        return true;
      })
      .map(([key, value]) => {
        const column = columns.find((col) => col.key === key);
        const isDuration =
          column?.type === 'duration' ||
          key.toLowerCase().includes('seconds') ||
          key.toLowerCase().includes('duration');
        const formattedValue = isDuration
          ? formatDuration(value, this.t)
          : new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
        return {
          key,
          label: this.summaryLabel(key),
          value: formattedValue,
        };
      });
  });

  ngOnInit(): void {
    this.loadCatalog();
  }

  // --- Chọn báo cáo ----------------------------------------------------------

  protected chooseGroup(group: string): void {
    const first = this.groups().find((item) => item.group === group)?.reports[0];
    if (first) this.applyReport(first);
  }

  protected chooseReport(code: string): void {
    const report = this.catalog().find((item) => item.code === code);
    if (report) this.applyReport(report);
  }

  /** Đổi báo cáo thì **dựng lại bộ lọc** theo khai báo của báo cáo mới, không giữ ô cũ. */
  private applyReport(report: ReportDefinition): void {
    this.selected.set(report);
    this.filterValues = {};
    (report.filters || []).forEach((filter) => {
      this.filterValues[filter.key] = '';
    });
    this.page.set(1);
    this.result.set(null);
    this.search();
  }

  protected valueOf(key: string): string {
    return this.filterValues[key] || '';
  }

  protected setFilter(key: string, value: string): void {
    const next = value ?? '';
    if (this.filterValues[key] === next) return;
    this.filterValues[key] = next;
    this.page.set(1);
    this.search();
  }

  protected optionsOf(filter: ReportFilterDefinition): SgSelectOption[] {
    const key = (filter.key || '').toLowerCase();
    const isAgency = key.includes('agency') || key.includes('force') || key.includes('luc_luong') || key.includes('lucluong');
    return (filter.options || [])
      .filter((option) => {
        if (isAgency) {
          const val = normalizeText(option.value);
          const lbl = normalizeText(option.label);
          if (val.includes('fee') || val === 'fee_authority' || lbl.includes('thu phi')) {
            return false;
          }
        }
        return true;
      })
      .map((option) => {
        let label = option.label;
        if (!option.value || option.label.trim().toLowerCase() === 'all' || option.label.trim().toLowerCase() === 'tat ca') {
          label = this.t('ui.report.filterAll');
        } else if (this.i18n.locale() === 'en') {
          const raw = normalizeText(option.label);
          if (raw.includes('bien phong') || option.value === 'BORDER_GUARD') label = this.t('ui.force.borderGuard');
          else if (raw.includes('hai quan') || option.value === 'CUSTOMS') label = this.t('ui.force.customs');
          else if (raw.includes('kiem dich') || option.value === 'QUARANTINE') label = this.t('ui.force.quarantine');
        }
        return { value: option.value, label };
      });
  }

  protected filterLabel(filter: ReportFilterDefinition): string {
    if (this.i18n.locale() === 'en') {
      const key = (filter.key || '').toLowerCase();
      const raw = normalizeText(filter.label);
      if (key === 'from' || key.includes('from') || key.includes('tu_ngay') || key.includes('tungay') || raw.includes('tu ngay')) {
        return this.t('ui.dispatch.filterFrom');
      }
      if (key === 'to' || key.includes('to') || key.includes('den_ngay') || key.includes('denngay') || raw.includes('den ngay')) {
        return this.t('ui.dispatch.filterTo');
      }
      if (key === 'type' || key === 'dossiertype' || key.includes('loai_hinh') || key.includes('loaihinh') || raw.includes('loai hinh')) {
        return this.t('ui.report.filterType');
      }
      if (key.includes('agency') || key.includes('force') || key.includes('luc_luong') || raw.includes('luc luong')) {
        return this.t('ui.dashboard.colForce');
      }
      if (key.includes('status') || raw.includes('trang thai')) {
        return this.t('ui.dashboard.colStatus');
      }
      if (key.includes('keyword') || raw.includes('tu khoa')) {
        return this.t('ui.common.searchPlaceholder');
      }
    }
    return filter.label;
  }

  protected displayFilters(report: ReportDefinition): ReportFilterDefinition[] {
    return (report.filters || []).filter((filter) => {
      const key = (filter.key || '').toLowerCase();
      const raw = normalizeText(filter.label);
      if (
        key === 'chot' ||
        key.includes('chot') ||
        key.includes('checkpoint') ||
        key.includes('gate') ||
        key.includes('agency') ||
        key.includes('force') ||
        raw.includes('luc luong')
      ) {
        return false;
      }
      return true;
    });
  }

  protected resetFilters(): void {
    Object.keys(this.filterValues).forEach((key) => {
      this.filterValues[key] = '';
    });
    this.page.set(1);
    this.search();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
    this.search();
  }

  protected goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.page()) return;
    this.page.set(next);
    this.search();
  }

  // --- Truy vấn và xuất Excel ------------------------------------------------

  /** Thân yêu cầu dùng chung cho `/query`; `/export` dùng lại đúng phần bộ lọc này. */
  private buildQuery(withPaging: boolean): ReportQuery {
    const query: ReportQuery = { ...cleanFilterValues(this.filterValues) };
    if (withPaging && this.hasPagination()) {
      query.page = this.page();
      query.pageSize = this.pageSize();
    }
    return query;
  }

  protected search(): void {
    const report = this.selected();
    if (!report) return;

    this.loading.set(true);
    this.error.set('');
    this.api.queryReport(report.code, this.buildQuery(true)).subscribe({
      next: (data) => {
        this.loading.set(false);
        this.result.set(data ?? null);
        if (data?.page) this.page.set(data.page);
        if (data?.pageSize) this.pageSize.set(data.pageSize);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.result.set(null);
        this.error.set(extractErrorMessage(error) || this.t('ui.report.queryFailed'));
        this.appMessages.showApiError(error, 'ui.report.queryFailed');
      },
    });
  }

  /**
   * Xuất Excel (F58) với **đúng bộ lọc đang xem**.
   * Cố ý **không gửi `page`/`pageSize`**: tệp phải chứa toàn bộ dữ liệu theo bộ lọc,
   * không phải mỗi trang đang hiển thị.
   */
  protected exportExcel(): void {
    const report = this.selected();
    if (!report || this.exporting()) return;

    this.exporting.set(true);
    const filter = this.buildQuery(false);

    void exportAndLogFile(
      this.api.exportReport(report.code, filter),
      exportFileName(report.code),
      this.api,
      {
        action: 'REPORT_EXPORT',
        targetType: 'REPORT',
        targetId: report.code,
        reportName: report.name,
        filter,
      },
      () => this.appMessages.showKey('ui.report.exportCancelled', 'info'),
    ).then((res) => {
      if (res === 'SUCCESS') {
        this.appMessages.showKey('ui.report.exported', 'success', { name: report.name });
      } else if (res === 'FAILED') {
        this.appMessages.showKey('ui.report.exportFailed', 'error');
      }
    }).catch((error: unknown) => {
      this.appMessages.showApiError(error, 'ui.report.exportFailed');
    }).finally(() => {
      this.exporting.set(false);
    });
  }

  /** Danh sách nguồn của báo cáo — đường dẫn do API cấp, web không tự suy ra. */
  protected openDrilldown(): void {
    if (this.isGateEventReport()) {
      this.drilldownGateAction();
      return;
    }
    const drilldown = this.result()?.drilldown;
    if (!drilldown?.route) return;
    void this.router.navigate([drilldown.route], { queryParams: drilldown.queryParams || {} });
  }

  /** Điều hướng đến Cổng vào/ra kèm bộ lọc và cuộn xuống Nhật ký qua cổng. */
  protected drilldownGateAction(direction?: string, decision?: string): void {
    const queryParams: Record<string, string> = {};
    if (this.filterValues['from']) queryParams['from'] = this.filterValues['from'];
    if (this.filterValues['to']) queryParams['to'] = this.filterValues['to'];
    if (direction) queryParams['direction'] = direction;
    if (decision) queryParams['decision'] = decision;
    void this.router.navigate(['/operations/vehicles-entered-gate'], {
      queryParams,
      fragment: 'recent-events',
    });
  }

  protected onChartClick(event: unknown): void {
    if (!this.isGateEventReport()) return;
    const evt = event as { name?: string; dataIndex?: number };
    const items = this.gateActionItems();
    let item = items.find((i) => i.label === evt?.name);
    if (!item && typeof evt?.dataIndex === 'number' && items[evt.dataIndex]) {
      item = items[evt.dataIndex];
    }
    if (item) {
      this.drilldownGateAction(item.direction, item.decision);
    }
  }

  // --- Bảng và biểu đồ -------------------------------------------------------

  protected cell(row: ReportRow, column: ReportColumn): string {
    return formatReportCell(row[column.key], column.type, this.t);
  }

  protected chartTitle(): string {
    if (this.isGateEventReport()) {
      return this.t('ui.report.chartByAction');
    }
    const category = categoryColumn(this.columns());
    if (!category) return this.t('ui.report.chartDefaultTitle');
    const label = this.columnLabel(category);
    return this.t('ui.report.chartByCategory', { category: label.toLowerCase() });
  }

  /** Bảng số liệu kèm biểu đồ — cũng là phương án cho người không đọc được biểu đồ. */
  protected readonly chartTable = computed<SgChartTable>(() => {
    if (this.isGateEventReport()) {
      const items = this.gateActionItems();
      return {
        columns: [this.t('ui.report.colAction'), this.t('ui.report.actionCount')],
        rows: items.map((item) => [item.label, item.count]),
      };
    }

    const category = categoryColumn(this.columns());
    const series = seriesColumns(this.columns()).slice(0, MAX_CHART_SERIES);
    if (!category) return { columns: [], rows: [] };

    if (series.length > 0) {
      return {
        columns: [this.columnLabel(category), ...series.map((column) => this.columnLabel(column))],
        rows: this.rows().map((row) => [
          formatReportCell(row[category.key], category.type, this.t),
          ...series.map((column) => Number(row[column.key]) || 0),
        ]),
      };
    }

    // Báo cáo không có cột số sẵn: đếm số bản ghi theo danh mục
    const countData = buildCountSeriesFromRows(this.rows(), category, this.t);
    return {
      columns: [this.columnLabel(category), this.t('ui.report.totalEvents')],
      rows: countData.tableRows,
    };
  });

  protected readonly chartOption = computed<EChartsOption | null>(() => {
    if (this.isGateEventReport()) {
      const items = this.gateActionItems();
      if (!this.rows().length && !items.some((i) => i.count > 0)) return null;
      const theme = chartTheme();
      const seriesLabel = this.t('ui.report.actionCount');
      return {
        color: theme.palette.length ? theme.palette : undefined,
        textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
        grid: { left: 56, right: 16, top: 40, bottom: 40 },
        tooltip: {
          trigger: 'axis',
          formatter: (params: unknown) => {
            const list = Array.isArray(params) ? params : [params];
            if (!list.length) return '';
            const first = list[0] as { name?: string; value?: number; marker?: string };
            const valFormatted = new Intl.NumberFormat('vi-VN').format(Number(first.value) || 0);
            return `<div style="font-weight:600;margin-bottom:4px;color:${theme.text}">${first.name || ''}</div><div>${first.marker || ''}${seriesLabel}: <strong>${valFormatted}</strong></div>`;
          },
        },
        legend: { top: 0, data: [seriesLabel], textStyle: { color: theme.muted } },
        xAxis: {
          type: 'category',
          data: items.map((i) => i.label),
          axisLine: { lineStyle: { color: theme.line } },
          axisLabel: { color: theme.muted, interval: 0 },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: theme.line } },
          axisLabel: {
            color: theme.muted,
            formatter: (val: number) => new Intl.NumberFormat('vi-VN').format(val),
          },
        },
        series: [
          {
            name: seriesLabel,
            type: 'bar' as const,
            barMaxWidth: 36,
            data: items.map((i) => i.count),
          },
        ],
      };
    }

    const category = categoryColumn(this.columns());
    const series = seriesColumns(this.columns()).slice(0, MAX_CHART_SERIES);
    const rows = this.rows();
    if (!category || !rows.length) return null;
    const theme = chartTheme();

    if (series.length > 0) {
      const numberSeries = series.filter((c) => c.type === 'number');
      const durationSeries = series.filter((c) => c.type === 'duration');
      const isDualAxis = numberSeries.length > 0 && durationSeries.length > 0;

      if (isDualAxis) {
        const legendData = series.map((column) => this.columnLabel(column));
        return {
          color: theme.palette.length ? theme.palette : undefined,
          textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
          grid: { left: 56, right: 60, top: 44, bottom: 40 },
          tooltip: {
            trigger: 'axis',
            formatter: (params: unknown) => {
              const items = Array.isArray(params) ? params : [params];
              if (!items.length) return '';
              const categoryName = (items[0] as { name?: string }).name || '';
              const header = `<div style="font-weight:600;margin-bottom:6px;color:${theme.text}">${categoryName}</div>`;
              const lines = items.map((item: { seriesName?: string; seriesIndex?: number; value?: unknown; marker?: string }) => {
                const seriesName = item.seriesName || '';
                const col = (item.seriesIndex !== undefined ? series[item.seriesIndex] : null) || series.find((c) => this.columnLabel(c) === seriesName || c.label === seriesName);
                const val = item.value;
                let formatted = '';
                if (col?.type === 'duration') {
                  const numVal = Number(val) || 0;
                  const timeStr = formatDuration(numVal, this.t);
                  formatted = `${new Intl.NumberFormat('vi-VN').format(numVal)}s (~${timeStr})`;
                } else {
                  formatted = `${new Intl.NumberFormat('vi-VN').format(Number(val) || 0)} ${this.t('ui.report.dossierCount')}`;
                }
                const marker = item.marker || '';
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:2px;"><span>${marker}${seriesName}</span><strong style="margin-left:8px;">${formatted}</strong></div>`;
              });
              return `<div style="font-size:12px;line-height:1.5;padding:2px 4px;">${header}${lines.join('')}</div>`;
            },
          },
          legend: { top: 0, data: legendData, textStyle: { color: theme.muted } },
          xAxis: {
            type: 'category',
            data: rows.map((row) => formatReportCell(row[category.key], category.type, this.t)),
            axisLine: { lineStyle: { color: theme.line } },
            axisLabel: { color: theme.muted, hideOverlap: true },
          },
          yAxis: [
            {
              type: 'value',
              name: this.columnLabel(numberSeries[0]) || this.t('ui.report.processCount'),
              nameTextStyle: { color: theme.muted, fontSize: 12 },
              splitLine: { lineStyle: { color: theme.line } },
              axisLabel: {
                color: theme.muted,
                formatter: (value: number) => new Intl.NumberFormat('vi-VN').format(value),
              },
            },
            {
              type: 'value',
              name: this.t('ui.report.processingTime'),
              nameTextStyle: { color: theme.muted, fontSize: 12 },
              splitLine: { show: false },
              axisLabel: {
                color: theme.muted,
                formatter: (val: number) => {
                  if (val >= 1000) {
                    const k = val / 1000;
                    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
                  }
                  return String(val);
                },
              },
            },
          ],
          series: series.map((column) => {
            const isDuration = column.type === 'duration';
            const colLabel = this.columnLabel(column);
            const lowerKey = column.key.toLowerCase();
            const durationIndex = durationSeries.indexOf(column);

            if (isDuration) {
              const isAvg = lowerKey.includes('avg') || lowerKey.includes('average') || durationIndex === 0;
              const isMax = lowerKey.includes('max') || durationIndex === 1;

              const color = isMax ? '#e63946' : isAvg ? '#2a9d8f' : (theme.palette[1] || '#10b981');
              const lineType = isAvg ? ('dashed' as const) : ('solid' as const);

              return {
                name: colLabel,
                type: 'line' as const,
                yAxisIndex: 1,
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color },
                lineStyle: { type: lineType, width: 2, color },
                data: rows.map((row) => Number(row[column.key]) || 0),
              };
            } else {
              return {
                name: colLabel,
                type: 'bar' as const,
                yAxisIndex: 0,
                barMaxWidth: 36,
                itemStyle: { color: '#184e77' },
                label: {
                  show: true,
                  position: 'top' as const,
                  color: theme.text,
                  fontSize: 12,
                  formatter: (params: { value?: unknown }) => {
                    const num = Number(params.value) || 0;
                    return num ? new Intl.NumberFormat('vi-VN').format(num) : '';
                  },
                },
                data: rows.map((row) => Number(row[column.key]) || 0),
              };
            }
          }),
        };
      }

      return {
        color: theme.palette.length ? theme.palette : undefined,
        textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
        grid: { left: 56, right: 16, top: 40, bottom: 40 },
        tooltip: {
          trigger: 'axis',
          formatter: (params: unknown) => {
            const items = Array.isArray(params) ? params : [params];
            if (!items.length) return '';
            const categoryName = (items[0] as { name?: string }).name || '';
            const header = `<div style="font-weight:600;margin-bottom:4px;color:${theme.text}">${categoryName}</div>`;
            const lines = items.map((item: { seriesName?: string; seriesIndex?: number; value?: unknown; marker?: string }) => {
              const seriesName = item.seriesName || '';
              const col = (item.seriesIndex !== undefined ? series[item.seriesIndex] : null) || series.find((c) => this.columnLabel(c) === seriesName || c.label === seriesName);
              const val = item.value;
              const formatted =
                col?.type === 'duration'
                  ? formatDuration(val, this.t)
                  : new Intl.NumberFormat('vi-VN').format(Number(val) || 0);
              const marker = item.marker || '';
              return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;"><span>${marker}${seriesName}</span><strong style="margin-left:8px;">${formatted}</strong></div>`;
            });
            return `<div style="font-size:12px;line-height:1.5;">${header}${lines.join('')}</div>`;
          },
        },
        legend: { top: 0, data: series.map((column) => this.columnLabel(column)), textStyle: { color: theme.muted } },
        xAxis: {
          type: 'category',
          data: rows.map((row) => formatReportCell(row[category.key], category.type, this.t)),
          axisLine: { lineStyle: { color: theme.line } },
          axisLabel: { color: theme.muted, hideOverlap: true },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: theme.line } },
          axisLabel: {
            color: theme.muted,
            formatter: (value: number) => {
              if (series.length > 0 && series.every((c) => c.type === 'duration')) {
                return formatDuration(value, this.t);
              }
              return new Intl.NumberFormat('vi-VN').format(value);
            },
          },
        },
        series: series.map((column) => ({
          name: this.columnLabel(column),
          type: 'bar' as const,
          barMaxWidth: 28,
          data: rows.map((row) => Number(row[column.key]) || 0),
        })),
      };
    }

    // Báo cáo không có cột số sẵn: đếm số lượt bản ghi theo danh mục
    const countData = buildCountSeriesFromRows(rows, category, this.t);
    const seriesLabel = this.t('ui.report.totalEvents');

    return {
      color: theme.palette.length ? theme.palette : undefined,
      textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
      grid: { left: 56, right: 16, top: 40, bottom: 40 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: [seriesLabel], textStyle: { color: theme.muted } },
      xAxis: {
        type: 'category',
        data: countData.categoryData,
        axisLine: { lineStyle: { color: theme.line } },
        axisLabel: { color: theme.muted, hideOverlap: true },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: theme.line } }, axisLabel: { color: theme.muted } },
      series: [
        {
          name: seriesLabel,
          type: 'bar' as const,
          barMaxWidth: 28,
          data: countData.seriesData,
        },
      ],
    };
  });

  protected chartAria(): string {
    const table = this.chartTable();
    if (!table.rows.length) return this.t('ui.report.chartAriaEmpty');
    return this.t('ui.report.chartAria', {
      name: this.selected()?.name || '',
      groups: table.rows.length,
      category: table.columns[0],
      series: table.columns.slice(1).join(', '),
    });
  }

  // --- Danh mục báo cáo ------------------------------------------------------

  private loadCatalog(): void {
    this.loading.set(true);
    this.api.getReportCatalog().subscribe({
      next: (items) => {
        const list = items || [];
        this.catalog.set(list);
        const report = pickReportForRoute(list, this.group);
        if (report) {
          this.applyReport(report);
        } else {
          this.loading.set(false);
          this.appMessages.showKey('ui.report.noReports', 'warning');
        }
      },
      error: () => {
        this.loading.set(false);
        this.catalog.set([]);
        this.appMessages.showKey('ui.report.catalogFailed', 'error');
      },
    });
  }
}
