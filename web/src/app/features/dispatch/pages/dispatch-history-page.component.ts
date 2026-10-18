import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { actorRoleLabel } from '../../../core/auth/access-control.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import {
  DispatchHistoryEntry,
  DispatchHistoryFilters,
  DispatchPlacementSnapshot,
  dispatchHistoryActionLabel,
  placementLabel,
} from '../../../core/models/dispatch.model';
import { formatDateTime } from '../../../core/models/workflow.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgDatePickerComponent } from '../../../shared/ui/sg-date-picker.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { SgTableColumn, SgTableComponent } from '../../../shared/ui/sg-table.component';

/** Ô lọc đang gõ; chỉ áp dụng khi bấm "Tìm" (hoặc Enter). Tách khỏi tham số đã áp dụng. */
interface FilterForm {
  dossierCode: string;
  actor: string;
  from: string;
  to: string;
}

const EMPTY_FILTER: FilterForm = { dossierCode: '', actor: '', from: '', to: '' };
const PAGE_SIZES = [10, 20, 50];

/**
 * F33 — Lịch sử điều phối.
 *
 * Tra được **ai gán/chuyển/bỏ vị trí nào, lúc nào**, với vị trí **từ → đến** (cổng/làn/bãi/ô).
 * Nguồn dữ liệu là nhật ký kiểm toán lọc theo mã hành động `DISPATCH_*`. Đổi bộ lọc thì nạp lại từ
 * trang 1; phân trang server-side qua `sg-pager`.
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
    SgTableComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.dispatchHistory.title') }}</h1>
        <p class="head__desc">{{ t('ui.dispatchHistory.subtitle') }}</p>
      </div>
      <a sgButton="secondary" routerLink="/operations/vehicle-confirmation">
        <mat-icon fontSet="material-icons-round">arrow_back</mat-icon>{{ t('ui.dispatchHistory.backToBoard') }}
      </a>
    </section>

    <sg-card [flush]="true">
      <div class="filters">
        <sg-search-input
          class="filters__search"
          [placeholder]="t('ui.dispatchHistory.filterDossier')"
          [ariaLabel]="t('ui.dispatchHistory.filterDossier')"
          [(ngModel)]="form.dossierCode"
          (search)="applyFilters()"
        />
        <sg-search-input
          [placeholder]="t('ui.dispatchHistory.filterActor')"
          [ariaLabel]="t('ui.dispatchHistory.filterActor')"
          [(ngModel)]="form.actor"
          (search)="applyFilters()"
        />
        <sg-date-picker [value]="form.from" [(ngModel)]="form.from" [ariaLabel]="t('ui.dispatchHistory.filterFrom')" (ngModelChange)="applyFilters()" (valueChange)="applyFilters()" />
        <sg-date-picker [value]="form.to" [(ngModel)]="form.to" [ariaLabel]="t('ui.dispatchHistory.filterTo')" (ngModelChange)="applyFilters()" (valueChange)="applyFilters()" />
        <button type="button" sgButton [disabled]="loading()" (click)="applyFilters()">
          <mat-icon fontSet="material-icons-round">search</mat-icon>{{ t('ui.common.search') }}
        </button>
        <button type="button" sgButton="tertiary" [disabled]="loading()" (click)="resetFilters()">
          <mat-icon fontSet="material-icons-round">restart_alt</mat-icon>{{ t('ui.common.reset') }}
        </button>
      </div>

      <sg-table
        [columns]="columns()"
        [loading]="loading()"
        [loadingText]="t('ui.dispatchHistory.loading')"
        [empty]="rows().length ? '' : t('ui.dispatchHistory.empty')"
        minWidth="900px"
      >
        @for (row of rows(); track row.id) {
          <tr>
            <td>{{ formatAt(row.at) }}</td>
            <td>
              <span class="actor">{{ row.actorName || '—' }}</span>
              @if (row.actorRole) {
                <span class="actor__role">{{ roleLabel(row.actorRole) }}</span>
              }
            </td>
            <td><span class="chip" [attr.data-action]="row.action">{{ actionLabel(row.action) }}</span></td>
            <td>{{ row.dossierCode || row.dossierId || '—' }}</td>
            <td>{{ row.plateNumber || '—' }}</td>
            <td>{{ place(row.from) }}</td>
            <td>{{ place(row.to) }}</td>
          </tr>
        }
      </sg-table>

      <div card-footer class="pager">
        <span>{{ summary() }}</span>
        <div class="pager__controls">
          <span class="pager__label">{{ t('ui.common.display') }}</span>
          <sg-select class="pager__size" [showEmptyOption]="false" [ariaLabel]="t('ui.common.pageSizeAria')" [options]="pageSizeOptions()" [value]="pageSizeValue()" (valueChange)="changePageSize($event)" />
        </div>
        <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()" (pageChange)="goToPage($event)" />
      </div>
    </sg-card>
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ mẫu Hàng đợi (hang-doi-xu-ly.html) để bố cục filter/bảng/pager
         nhìn đồng nhất với màn Xử lý liên ngành. Khoanh trong :host nên không rò ra token toàn cục. */
      :host {
        display: block;
        --blue-600: #2f6fed;
        --ink-900: #152040;
        --ink-500: #7885a3;
        --line: #e6e9f3;
        --bg: #f4f6fb;
      }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
      .head h1 { margin: 0; font-size: 20px; font-weight: 700; color: var(--ink-900); }
      .head__desc { margin: 4px 0 0; color: var(--ink-500); font-size: 12.5px; }
      .feedback { display: block; margin: 14px 18px 0; }

      .filters {
        display: grid;
        grid-template-columns: minmax(220px, 1.6fr) minmax(180px, 1.1fr) minmax(150px, .9fr) minmax(150px, .9fr) auto auto;
        gap: 10px;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid var(--line);
      }

      .actor { display: block; color: var(--ink-900); }
      .actor__role { display: block; color: var(--ink-500); font-size: 11.5px; }
      .ticket { font-weight: 700; color: var(--blue-600); }

      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-state-idle-soft);
        color: var(--sg-state-idle);
        font-size: var(--sg-small-size);
        font-weight: 700;
      }
      .chip[data-action='DISPATCH_ASSIGN'] { background: var(--sg-state-processing-soft); color: var(--sg-state-processing); }
      .chip[data-action='DISPATCH_MOVE'] { background: var(--sg-state-waiting-soft); color: var(--sg-state-waiting-ink); }
      .chip[data-action='DISPATCH_RELEASE'] { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }

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

      @media (max-width: 1080px) {
        .filters { grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 720px) {
        .head { flex-direction: column; }
      }
    `,
  ],
})
export class DispatchHistoryPageComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly appMessages = inject(AppMessageService);

  /** Cột bảng lịch sử — nhãn `computed` để tự dịch lại khi đổi ngôn ngữ. */
  protected readonly columns = computed<SgTableColumn[]>(() => [
    { key: 'time', label: this.t('ui.dispatchHistory.colTime') },
    { key: 'actor', label: this.t('ui.dispatchHistory.colActor') },
    { key: 'action', label: this.t('ui.dispatchHistory.colAction') },
    { key: 'dossier', label: this.t('ui.dispatchHistory.colDossier') },
    { key: 'plate', label: this.t('ui.common.plateNumber') },
    { key: 'from', label: this.t('ui.dispatchHistory.colFrom') },
    { key: 'to', label: this.t('ui.dispatchHistory.colTo') },
  ]);

  /** Ô lọc đang gõ; chỉ áp dụng khi bấm "Tìm" (hoặc Enter). */
  protected form: FilterForm = { ...EMPTY_FILTER };
  /** Bộ lọc đã áp dụng cho lần nạp hiện tại — dùng nguyên khi chuyển trang. */
  private applied: FilterForm = { ...EMPTY_FILTER };

  protected readonly rows = signal<DispatchHistoryEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly loading = signal(false);

  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  /** Tóm tắt "hiển thị a–b / tổng" cho chân trang, giống màn Hàng đợi liên ngành. */
  protected readonly summary = computed(() => {
    if (!this.total()) return this.t('ui.dispatchHistory.summaryEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.total(), this.page() * this.pageSize());
    return this.t('ui.dispatchHistory.summary', { start, end, total: this.total() });
  });

  ngOnInit(): void {
    this.load();
  }

  // --- Lọc & phân trang ------------------------------------------------------

  /** Đổi bộ lọc thì nạp lại từ trang 1 — bộ lọc mới không giữ số trang cũ. */
  protected applyFilters(): void {
    this.applied = { ...this.form };
    this.page.set(1);
    this.load();
  }

  protected resetFilters(): void {
    this.form = { ...EMPTY_FILTER };
    this.applied = { ...EMPTY_FILTER };
    this.page.set(1);
    this.load();
  }

  protected goToPage(next: number): void {
    const target = Math.min(Math.max(1, next), this.totalPages());
    if (target === this.page()) return;
    this.page.set(target);
    this.load();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 20);
    this.page.set(1);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getDispatchHistory(this.buildFilters()).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.rows.set(result?.items ?? []);
        this.total.set(result?.total ?? 0);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.rows.set([]);
        this.total.set(0);
        this.appMessages.showApiError(err, 'ui.dispatchHistory.loadFailed');
      },
    });
  }

  private buildFilters(): DispatchHistoryFilters {
    return {
      dossierCode: this.applied.dossierCode.trim() || undefined,
      actor: this.applied.actor.trim() || undefined,
      from: this.applied.from || undefined,
      to: this.applied.to || undefined,
      page: this.page(),
      pageSize: this.pageSize(),
    };
  }

  // --- Hiển thị --------------------------------------------------------------

  protected formatAt(at: string): string {
    return formatDateTime(at);
  }

  protected actionLabel(action: string): string {
    return dispatchHistoryActionLabel(action, this.t);
  }

  /** Nhãn vai trò của người thao tác — dịch mã (tách '+'), vai trò động lạ giữ mã. */
  protected roleLabel(role: string | null | undefined): string {
    return actorRoleLabel(role, this.t);
  }

  protected place(snapshot: DispatchPlacementSnapshot | null): string {
    return placementLabel(snapshot, this.t);
  }

  /** Số thứ tự điều phối; ưu tiên mã đầy đủ `ticketCode` (VD: '14/08/2026.0001'), hồ sơ chưa cấp số thì hiển thị "—". */
  protected ticketLabel(ticketNumber: number | null, ticketCode?: string | null): string {
    if (ticketCode) return ticketCode;
    return ticketNumber === null || ticketNumber === undefined ? '—' : String(ticketNumber);
  }
}
