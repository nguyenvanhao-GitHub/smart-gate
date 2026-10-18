import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  DOSSIER_TYPE_LABEL_KEYS,
  DossierEnterprise,
  dossierStatusLabel,
  dossierStatusTone,
  dossierTypeLabel,
  formatEnterpriseIdentifierPrefix,
} from '../../../core/models/declaration.model';
import { CatalogItem } from '../../../core/models/admin.model';
import {
  QueueItem,
  WORKFLOW_QUEUE_TABS,
  WorkflowQueueTab,
  isWorkflowQueueTab,
  queueStateLabel,
} from '../../../core/models/workflow.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgDatePickerComponent } from '../../../shared/ui/sg-date-picker.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { I18nService } from '../../../core/i18n/i18n.service';

const PAGE_SIZES = [10, 20, 50];

/** Trạng thái hiển thị ở bộ lọc Xử lý liên ngành (SG-212: loại bỏ DRAFT, WAITING_GATE, WAITING_CALL, REJECTED, CANCELLED). */
const FILTER_STATUSES = [
  'BUSINESS_PROCESSING',
  'REVISION_REQUIRED',
  'WAITING_FOR_FEE',
  'READY_FOR_EXIT',
  'COMPLETED',
];

interface QueueFilters {
  keyword: string;
  type: string;
  status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: QueueFilters = { keyword: '', type: '', status: '', from: '', to: '' };

/**
 * UI-06 — Hàng đợi xử lý liên ngành.
 *
 * Theo CR23–CR27 màn hình gồm: tab *cần xử lý / đã xử lý / chờ bổ sung*, bộ lọc và bảng hồ sơ.
 * **Không** còn cột mức ưu tiên / vào bước lúc / đã trôi qua (CR23), **không** còn nút đánh dấu ưu
 * tiên (CR24), **không** còn khối "Đã xử lý gần đây" (CR25). Cột "Trạng thái" của tab cần xử lý
 * luôn hiển thị trạng thái nghiệp vụ; nút View mở màn xử lý liên ngành (CR27).
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    SgButtonDirective,
    SgCardComponent,
    SgDatePickerComponent,
    SgPagerComponent,
    SgSearchInputComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.workflow.queueTitle') }}</h1>
        <p>{{ t('ui.workflow.queueSubtitle') }}</p>
      </div>
      <button type="button" sgButton="secondary" [disabled]="loading()" (click)="reload()">
        <mat-icon fontSet="material-icons-round">refresh</mat-icon>{{ loading() ? t('ui.common.loadingShort') : t('ui.common.reload') }}
      </button>
    </section>

    <div class="stats">
      <div class="kpi">
        <span class="kpi__ico kpi__ico--blue"><mat-icon fontSet="material-icons-round">inbox</mat-icon></span>
        <div><div class="kpi__label">{{ t('ui.workflow.kpiTotal') }}</div><div class="kpi__value">{{ kpiTodo() }}</div></div>
      </div>
      <div class="kpi">
        <span class="kpi__ico kpi__ico--green"><mat-icon fontSet="material-icons-round">check_circle_outline</mat-icon></span>
        <div><div class="kpi__label">{{ t('ui.workflow.kpiDone') }}</div><div class="kpi__value">{{ kpiDone() }}</div></div>
      </div>
      <div class="kpi">
        <span class="kpi__ico kpi__ico--amber"><mat-icon fontSet="material-icons-round">hourglass_empty</mat-icon></span>
        <div><div class="kpi__label">{{ t('ui.workflow.kpiWaiting') }}</div><div class="kpi__value">{{ kpiWaiting() }}</div></div>
      </div>
    </div>

    <sg-card [flush]="true">
      <nav class="tabs" role="tablist" [attr.aria-label]="t('ui.workflow.tabsAria')">
        @for (tab of tabs; track tab.key) {
          <button
            type="button"
            role="tab"
            class="tabs__item"
            [class.tabs__item--active]="activeTab() === tab.key"
            [attr.aria-selected]="activeTab() === tab.key"
            (click)="changeTab(tab.key)"
          >
            {{ t(tab.labelKey) }}
            @if (activeTab() === tab.key && !loading()) { <span class="tabs__count">{{ total() }}</span> }
          </button>
        }
      </nav>

      <div class="filters">
        <sg-search-input
          class="filters__search"
          [placeholder]="t('ui.workflow.searchPlaceholder')"
          [ariaLabel]="t('ui.workflow.searchAria')"
          [(ngModel)]="filters.keyword"
          (search)="applyFilters()"
        />
        <sg-select [ariaLabel]="t('ui.dossier.type')" [placeholder]="t('ui.dossier.typeAll')" [options]="typeOptions()" [(ngModel)]="filters.type" (valueChange)="applyFilters()" />
        <sg-select [ariaLabel]="t('ui.dossier.status')" [placeholder]="t('ui.dossier.statusAll')" [options]="statusOptions()" [(ngModel)]="filters.status" (valueChange)="applyFilters()" />
        <sg-date-picker [ariaLabel]="t('ui.workflow.filterFrom')" [value]="filters.from" [(ngModel)]="filters.from" (ngModelChange)="applyFilters()" (valueChange)="applyFilters()" />
        <sg-date-picker [ariaLabel]="t('ui.workflow.filterTo')" [value]="filters.to" [(ngModel)]="filters.to" (ngModelChange)="applyFilters()" (valueChange)="applyFilters()" />
        <button type="button" sgButton (click)="applyFilters()"><mat-icon fontSet="material-icons-round">search</mat-icon>{{ t('ui.common.search') }}</button>
        <button type="button" sgButton="tertiary" (click)="resetFilters()"><mat-icon fontSet="material-icons-round">restart_alt</mat-icon>{{ t('ui.common.reset') }}</button>
      </div>

      <div class="sg-scroll-x">
        <table class="grid">
          <thead>
            <tr>
              <th>{{ t('ui.dossier.colCode') }}</th>
              <th>{{ t('ui.dossier.colType') }}</th>
              <th>{{ t('ui.workflow.colVehicle') }}</th>
              <th>{{ t('ui.dossier.colEnterprise') }}</th>
              <th>{{ t('ui.workflow.colAgency') }}</th>
              <th>{{ t('ui.dossier.status') }}</th>
              <th class="grid__actions">{{ t('ui.common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="7" class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.workflow.loadingQueue') }}</td></tr>
            } @else if (error()) {
              <tr><td colspan="7" class="state">{{ t('ui.dossier.displayError') }}</td></tr>
            } @else if (!items().length) {
              <tr>
                <td colspan="7" class="state">
                  <mat-icon fontSet="material-icons-round">inbox</mat-icon>
                  {{ emptyMessage() }}
                </td>
              </tr>
            } @else {
              @for (item of items(); track item.dossierId + '-' + $index) {
                <tr>
                  <td>
                    <div class="code-group">
                      <a class="code" [routerLink]="['/workflow/dossiers', item.dossierId]">{{ item.code }}</a>
                      <button type="button" class="btn-copy-code" [title]="t('ui.dossier.copyCodeHint')" [attr.aria-label]="t('ui.dossier.copyCodeHint')" (click)="copyCode(item.code, $event)">
                        <mat-icon fontSet="material-icons-round">content_copy</mat-icon>
                      </button>
                    </div>
                    @if (item.epidemicFlag) {
                      <span class="epidemic" [title]="t('ui.dossier.epidemicBadgeTitle')">
                        <mat-icon fontSet="material-icons-round">coronavirus</mat-icon>{{ t('ui.dossier.epidemicBadge') }}
                      </span>
                    }
                  </td>
                  <td>{{ typeLabel(item.type) }}</td>
                  <td><strong>{{ item.vehicle.plateNumber }}</strong></td>
                  <td>
                    <strong>{{ item.enterprise.name }}</strong>
                    <span class="sub">{{ enterpriseIdentifier(item.enterprise) }}</span>
                  </td>
                  <td>
                    <strong>{{ displayAgencies(item) }}</strong>
                    <span class="sub">{{ displayStepSubtitle(item) }}</span>
                  </td>
                  <td><span class="chip" [attr.data-tone]="statusTone(item.status)">{{ statusCell(item) }}</span></td>
                  <td class="grid__actions">
                    <a class="iconbtn" [routerLink]="['/workflow/dossiers', item.dossierId]" [title]="t('ui.workflow.pipelineView')" [attr.aria-label]="t('ui.workflow.pipelineView')">
                      <mat-icon fontSet="material-icons-round">visibility</mat-icon>
                    </a>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <div card-footer class="pager">
        <span>{{ summary() }}</span>
        <div class="pager__controls">
          <span class="pager__label">{{ t('ui.common.display') }}</span>
          <sg-select class="pager__size" [showEmptyOption]="false" [ariaLabel]="t('ui.common.pageSizeAria')" [options]="pageSizeOptions()" [value]="pageSizeValue()" (valueChange)="changePageSize($event)" />
        </div>
        <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()" (pageChange)="goToPage($event)" />
      </div>
    </sg-card>

    <p class="note">{{ t('ui.workflow.queueNote') }}</p>
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ template BA (hang-doi-xu-ly.html), khoanh trong :host nên
         không rò ra token --sg-* toàn cục. */
      :host {
        display: block;
        --blue-600: #2f6fed;
        --blue-50: #eef3fe;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --amber-500: #e0a72e;
        --amber-50: #fbf3e2;
        --red-500: #e5484d;
        --red-50: #fdeced;
        --ink-900: #152040;
        --ink-700: #3d4a6b;
        --ink-500: #7885a3;
        --line: #e6e9f3;
        --bg: #f4f6fb;
      }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
      .head h1 { margin: 0; font-size: 20px; font-weight: 700; color: var(--ink-900); }
      .head p { margin: 4px 0 0; color: var(--ink-500); font-size: 13px; }
      .feedback { display: block; margin: 14px 18px 0; }

      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
      .kpi {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #fff;
      }
      .kpi__ico { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; flex: 0 0 auto; }
      .kpi__ico mat-icon { width: 20px; height: 20px; font-size: 20px; }
      .kpi__ico--blue { background: var(--blue-50); color: var(--blue-600); }
      .kpi__ico--amber { background: var(--amber-50); color: var(--amber-500); }
      .kpi__ico--green { background: var(--green-50); color: var(--green-600); }
      .kpi__label { color: var(--ink-500); font-size: 12px; }
      .kpi__value { font-size: 22px; font-weight: 700; line-height: 1.2; color: var(--ink-900); }
      @media (max-width: 720px) { .stats { grid-template-columns: 1fr; } }

      .tabs { display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid var(--line); overflow-x: auto; }
      .tabs__item {
        min-height: 44px;
        padding: 0 14px;
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        background: transparent;
        color: var(--ink-500);
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
      }
      .tabs__item--active { color: var(--blue-600); border-bottom-color: var(--blue-600); }
      .tabs__count {
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 20px;
        margin-left: 5px;
        padding: 0 5px;
        border-radius: 20px;
        background: var(--blue-50);
        color: var(--blue-600);
        font-size: 11px;
      }

      .filters {
        display: grid;
        grid-template-columns: minmax(240px, 1.8fr) repeat(2, minmax(150px, .9fr)) auto auto;
        gap: 10px;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid var(--line);
      }

      .table-container { width: 100%; overflow-x: auto; }
      .grid { width: 100%; border-collapse: collapse; background: #fff; }
      .grid th, .grid td { padding: 12px 16px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
      .grid th { background: var(--bg); color: var(--ink-500); font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
      .grid td { font-size: 12.5px; color: var(--ink-900); }
      .grid tbody tr:hover { background: var(--bg); }
      .grid tbody tr:last-child td { border-bottom: none; }
      .grid__actions { white-space: nowrap; text-align: right; }
      .state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 60px 20px;
        color: var(--ink-500);
      }
      .code-group { display: inline-flex; align-items: center; gap: 6px; }
      .code { color: var(--blue-600); font-weight: 700; text-decoration: none; }
      .code:hover { text-decoration: underline; }
      .btn-copy-code {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 4px;
        background: #fff;
        color: var(--ink-500);
        cursor: pointer;
        transition: all 0.15s ease-in-out;
      }
      .btn-copy-code:hover {
        background: var(--blue-50, #eff6ff);
        color: var(--blue-600, #2563eb);
        border-color: var(--blue-600, #2563eb);
      }
      .btn-copy-code mat-icon { font-size: 14px; width: 14px; height: 14px; }
      .epidemic {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-top: 4px;
        padding: 1px 8px;
        border-radius: 20px;
        background: var(--amber-50, #fbf3e2);
        color: #b34e12;
        font-size: 11.5px;
        font-weight: 700;
      }
      .epidemic mat-icon { width: 14px; height: 14px; font-size: 14px; }
      .sub { display: block; color: var(--ink-500); font-size: 11.5px; }
      .chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 20px;
        background: var(--bg);
        color: var(--ink-500);
        font-size: 11.5px;
        font-weight: 700;
      }
      .chip[data-tone='processing'] { background: var(--blue-50); color: var(--blue-600); }
      .chip[data-tone='done'] { background: var(--green-50); color: var(--green-600); }
      .chip[data-tone='waiting'] { background: var(--amber-50); color: var(--amber-500); }
      .chip[data-tone='warning'] { background: #fdece1; color: #b34e12; }
      .chip[data-tone='rejected'] { background: var(--red-50); color: var(--red-500); }

      .iconbtn {
        display: inline-grid;
        place-items: center;
        width: 28px;
        min-width: 28px;
        height: 28px;
        min-height: 28px;
        margin-left: 4px;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: var(--ink-500);
        cursor: pointer;
      }
      .iconbtn:hover { border-color: var(--blue-600); color: var(--blue-600); }
      .iconbtn mat-icon { width: 16px; height: 16px; font-size: 16px; }

      .pager {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        border-top: 1px solid var(--line);
        color: var(--ink-500);
        font-size: 12.5px;
      }
      .pager__controls { display: inline-flex; align-items: center; gap: 8px; justify-self: center; }
      .pager sg-pager { justify-self: end; }
      .pager__label { color: var(--ink-500); font-size: 12.5px; white-space: nowrap; }
      .pager__size { width: 72px; }

      @media (max-width: 900px) {
        .pager {
          grid-template-columns: 1fr;
          justify-items: center;
          gap: 10px;
          text-align: center;
        }
        .pager sg-pager { justify-self: center; }
      }

      .note { margin: 16px 0 0; color: var(--ink-500); font-size: 11px; }

      @media (max-width: 1280px) {
        .filters { grid-template-columns: 1fr 1fr; }
      }
    `,
  ],
})
export class WorkflowQueuePageComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly appMessages = inject(AppMessageService);

  protected readonly tabs = WORKFLOW_QUEUE_TABS;

  protected readonly items = signal<QueueItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly activeTab = signal<WorkflowQueueTab>('todo');
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected filters: QueueFilters = { ...EMPTY_FILTERS };

  protected readonly dossierTypes = signal<CatalogItem[]>([]);

  // Nhãn của các ô lọc là `computed` nên tự đổi khi người dùng đổi ngôn ngữ.
  protected readonly typeOptions = computed<SgSelectOption[]>(() => {
    const items = this.dossierTypes();
    if (items.length > 0) {
      return items.map((item) => ({ value: item.code, label: item.name }));
    }
    return Object.keys(DOSSIER_TYPE_LABEL_KEYS).map((value) => ({ value, label: dossierTypeLabel(value, this.t) }));
  });
  protected readonly statusOptions = computed<SgSelectOption[]>(() =>
    FILTER_STATUSES.map((value) => ({ value, label: dossierStatusLabel(value, this.t) })),
  );
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );

  protected readonly kpiTodoStats = signal<number | null>(null);
  protected readonly kpiDoneStats = signal<number | null>(null);
  protected readonly kpiWaitingStats = signal<number | null>(null);

  protected readonly kpiTodo = computed(() => this.kpiTodoStats() ?? (this.activeTab() === 'todo' ? this.total() : 0));
  protected readonly kpiDone = computed(() => this.kpiDoneStats() ?? (this.activeTab() === 'done' ? this.total() : 0));
  protected readonly kpiWaiting = computed(() => this.kpiWaitingStats() ?? (this.activeTab() === 'waiting' ? this.total() : 0));

  protected readonly kpiPending = computed(() => this.items().filter((item) => item.status === 'SUBMITTED').length);
  protected readonly kpiProcessing = computed(
    () => this.items().filter((item) => item.status === 'PROCESSING' || item.status === 'IN_PROGRESS').length,
  );

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly summary = computed(() => {
    if (!this.total()) return this.t('ui.dossier.summaryEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.total(), this.page() * this.pageSize());
    return this.t('ui.dossier.summary', { start, end, total: this.total() });
  });

  ngOnInit(): void {
    this.loadDossierTypes();
    // Thông báo và dashboard điều hướng sang đây kèm tab/bộ lọc trên query param.
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') || '';
      this.activeTab.set(isWorkflowQueueTab(tab) ? tab : 'todo');
      this.filters = {
        ...EMPTY_FILTERS,
        keyword: params.get('keyword') || '',
        type: params.get('type') || '',
        status: params.get('status') || '',
        from: params.get('from') || '',
        to: params.get('to') || '',
      };
      this.page.set(1);
      this.load();
    });
  }

  // --- Tab và bộ lọc ---------------------------------------------------------

  protected changeTab(tab: WorkflowQueueTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    if (this.filters.status) {
      if (tab === 'todo' && !['BUSINESS_PROCESSING', 'PROCESSING', 'IN_PROGRESS'].includes(this.filters.status)) {
        this.filters.status = '';
      } else if (tab === 'waiting' && !['REVISION_REQUIRED', 'NEED_SUPPLEMENT'].includes(this.filters.status)) {
        this.filters.status = '';
      } else if (tab === 'done' && !['READY_FOR_EXIT', 'WAITING_FOR_FEE', 'PAID', 'EXITED', 'COMPLETED'].includes(this.filters.status)) {
        this.filters.status = '';
      }
    }
    this.page.set(1);
    this.load();
  }

  protected applyFilters(): void {
    if (this.filters.status) {
      const status = this.filters.status;
      if (status === 'REVISION_REQUIRED' || status === 'NEED_SUPPLEMENT') {
        this.activeTab.set('waiting');
      } else if (['READY_FOR_EXIT', 'WAITING_FOR_FEE', 'PAID', 'EXITED', 'COMPLETED'].includes(status)) {
        this.activeTab.set('done');
      } else if (['BUSINESS_PROCESSING', 'PROCESSING', 'IN_PROGRESS'].includes(status)) {
        this.activeTab.set('todo');
      }
    }
    this.page.set(1);
    this.load();
  }

  protected resetFilters(): void {
    this.filters = { ...EMPTY_FILTERS };
    this.page.set(1);
    this.load();
  }

  protected hasActiveFilters(): boolean {
    return Object.values(this.filters).some((value) => !!value);
  }

  protected reload(): void {
    this.load();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
    this.load();
  }

  protected goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.page()) return;
    this.page.set(next);
    this.load();
  }

  // --- Hiển thị --------------------------------------------------------------

  protected emptyMessage(): string {
    if (this.hasActiveFilters()) return this.t('ui.dossier.emptyFiltered');
    if (this.activeTab() === 'done') return this.t('ui.workflow.emptyDone');
    if (this.activeTab() === 'waiting') return this.t('ui.workflow.emptyWaiting');
    return this.t('ui.workflow.emptyTodo');
  }

  private loadDossierTypes(): void {
    this.api.getDossierTypes().subscribe({
      next: (items) => this.dossierTypes.set(items || []),
      error: () => this.dossierTypes.set([]),
    });
  }

  protected copyCode(code: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        () => this.appMessages.showKey('ui.dossier.copyCodeSuccess', 'success', { code }),
        () => this.fallbackCopyCode(code),
      );
    } else {
      this.fallbackCopyCode(code);
    }
  }

  private fallbackCopyCode(code: string): void {
    const input = document.createElement('input');
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    this.appMessages.showKey('ui.dossier.copyCodeSuccess', 'success', { code });
  }

  protected typeLabel(type: string): string {
    const item = this.dossierTypes().find((i) => i.code === type);
    return dossierTypeLabel(type, this.t, item?.name);
  }

  protected statusTone(status: string): string {
    return dossierStatusTone(status);
  }

  /**
   * Cột "Đơn vị đang chờ":
   * Hiển thị các đơn vị chưa hoàn thành xử lý (có bước đang IN_PROGRESS hoặc WAITING_SUPPLEMENT).
   * Đơn vị nào đã duyệt xong sẽ được tự động loại khỏi danh sách hiển thị trên tất cả các tab.
   */
  protected displayAgencies(item: QueueItem): string {
    if (item.activeSteps && item.activeSteps.length > 0) {
      const agencies = Array.from(new Set(item.activeSteps.map((s) => s.agencyName)));
      if (agencies.length > 0) return agencies.join(', ');
    }
    if (item.currentStep?.agencyName) return item.currentStep.agencyName;
    return this.t('ui.workflow.agencyDone');
  }

  protected displayStepSubtitle(item: QueueItem): string {
    if (item.activeSteps && item.activeSteps.length > 0) {
      if (item.activeSteps.length === 1) return item.activeSteps[0].name;
      return this.t('ui.workflow.multipleSteps');
    }
    if (item.currentStep?.name) return item.currentStep.name;
    return this.t('ui.workflow.noPendingStep');
  }

  /**
   * Tab "Cần xử lý" chỉ chứa hồ sơ đang xử lý nghiệp vụ. Không dùng `currentStep.gate` để ghi đè
   * nhãn tại đây: bước ENTRY/EXIT mô tả nơi đang chờ xử lý, không phải trạng thái của hồ sơ.
   * Các tab còn lại giữ cách hiển thị bước cổng hiện hành.
   */
  protected statusCell(item: QueueItem): string {
    if (this.activeTab() === 'todo') {
      return queueStateLabel('BUSINESS_PROCESSING', this.t);
    }
    const step = item.currentStep;
    if (step?.gate) {
      return this.t(step.gate === 'ENTRY' ? 'ui.workflow.queueGateEntry' : 'ui.workflow.queueGateExit');
    }
    return queueStateLabel(item.status, this.t);
  }

  protected enterpriseIdentifier(enterprise?: Partial<DossierEnterprise> | null): string {
    return formatEnterpriseIdentifierPrefix(enterprise, this.t);
  }

  // --- Tải dữ liệu -----------------------------------------------------------

  private load(): void {
    // Chặn tại chỗ khi Từ ngày muộn hơn Đến ngày (như BUG-052): chuỗi ngày chuẩn `yyyy-MM-dd`.
    if (this.filters.from && this.filters.to && this.filters.from > this.filters.to) {
      this.items.set([]);
      this.total.set(0);
      this.loading.set(false);
      this.error.set(this.t('ui.workflow.invalidDateRange'));
      this.appMessages.showKey('ui.workflow.invalidDateRange', 'error');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api
      .getWorkflowQueue({
        tab: this.activeTab(),
        keyword: this.filters.keyword.trim(),
        type: this.filters.type,
        status: this.filters.status,
        from: this.filters.from,
        to: this.filters.to,
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (result) => {
          this.items.set(result?.items ?? []);
          this.total.set(result?.total ?? 0);
          if (result?.stats) {
            this.kpiTodoStats.set(result.stats['todo'] ?? null);
            this.kpiDoneStats.set(result.stats['done'] ?? null);
            this.kpiWaitingStats.set(result.stats['waiting'] ?? null);
          } else {
            this.kpiTodoStats.set(null);
            this.kpiDoneStats.set(null);
            this.kpiWaitingStats.set(null);
          }
          this.loading.set(false);
        },
        error: () => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.error.set(this.t('ui.workflow.queueLoadFailed'));
          this.appMessages.showKey('ui.workflow.queueLoadFailed', 'error');
        },
      });
  }
}
