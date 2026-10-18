import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/message-catalog';
import { formatNotificationContent, groupByTime, notifIcon, notifRoute, notifTone, notifTypeLabel } from '../../../core/models/notification.model';
import { ApiService, NotificationItem } from '../../../core/services/api.service';
import { NotificationStore } from '../../../core/services/notification.store';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';

const PAGE_SIZES = [10, 20, 50];

/** F06 — Danh sách thông báo đầy đủ, có tìm kiếm, lọc, phân trang. */
@Component({
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatIconModule,
    SgButtonDirective,
    SgCardComponent,
    SgPagerComponent,
    SgSearchInputComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.notify.title') }}</h1>
        <p class="head__sub">{{ t('ui.notify.subtitle') }}</p>
      </div>
      <button type="button" sgButton="secondary" [disabled]="unreadCount() === 0" (click)="markAllRead()">
        <mat-icon fontSet="material-icons-round">done_all</mat-icon>{{ t('ui.shell.markAllRead') }}
      </button>
    </section>

    <sg-card [flush]="true">
      <!-- Tab Tất cả / Chưa đọc theo template chủ dự án -->
      <nav class="tabs" role="tablist" [attr.aria-label]="t('ui.notify.tabsAria')">
        <button type="button" role="tab" class="tabs__item" [class.tabs__item--active]="tab() === 'all'" [attr.aria-selected]="tab() === 'all'" (click)="setTab('all')">
          {{ t('ui.notify.tabAll') }}
        </button>
        <button type="button" role="tab" class="tabs__item" [class.tabs__item--active]="tab() === 'unread'" [attr.aria-selected]="tab() === 'unread'" (click)="setTab('unread')">
          {{ t('ui.notify.unread') }}
          @if (unreadCount()) { <span class="tabs__count">{{ unreadCount() }}</span> }
        </button>
      </nav>

      <div class="filters">
        <sg-search-input
          class="filters__search"
          [placeholder]="t('ui.notify.searchPlaceholder')"
          [ariaLabel]="t('ui.notify.searchAria')"
          [(ngModel)]="keyword"
          (search)="applyFilters()"
        />
        <sg-select [ariaLabel]="t('ui.common.pageSizeAria')" [placeholder]="t('ui.common.perPage', { size: 20 })" [options]="pageSizeOptions()" [value]="pageSizeValue()" (valueChange)="changePageSize($event)" />
        <button type="button" sgButton (click)="applyFilters()"><mat-icon fontSet="material-icons-round">search</mat-icon>{{ t('ui.common.search') }}</button>
        <button type="button" sgButton="tertiary" (click)="resetFilters()"><mat-icon fontSet="material-icons-round">restart_alt</mat-icon>{{ t('ui.common.reset') }}</button>
      </div>

      <div class="list">
        @if (loading()) {
          <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.common.loading') }}</p>
        } @else if (!visibleItems().length) {
          <p class="state"><mat-icon fontSet="material-icons-round">inbox</mat-icon>{{ t('ui.notify.empty') }}</p>
        } @else {
          @for (section of sections(); track section.key) {
            <p class="group">{{ groupLabel(section.labelKey) }}</p>
            @for (item of section.items; track item.id) {
              <article class="row" [class.row--unread]="!item.readAt">
                <span class="row__ico" [attr.data-tone]="tone(item.type)" [attr.aria-hidden]="true">
                  <mat-icon fontSet="material-icons-round">{{ icon(item.type) }}</mat-icon>
                </span>
                <div class="row__body">
                  <strong>{{ item.title }}</strong>
                  <p>{{ formatContent(item) }}</p>
                  <div class="row__meta">
                    <time>{{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}</time>
                    @if (item.dossierCode) { <span class="tag">{{ item.dossierCode }}</span> }
                    <span class="tag tag--type">{{ typeLabel(item.type) }}</span>
                  </div>
                </div>
                <div class="row__actions">
                  @if (routeOf(item)) {
                    <button type="button" sgButton="tertiary" size="sm" (click)="open(item)">{{ t('ui.notify.open') }}</button>
                  }
                  @if (!item.readAt) {
                    <button type="button" sgButton="secondary" size="sm" (click)="markRead(item)">{{ t('ui.notify.markRead') }}</button>
                  }
                </div>
              </article>
            }
          }
        }
      </div>

      <div card-footer class="pager">
        <span>{{ summary() }}</span>
        <!-- Khi lọc từ khóa tại chỗ, pager của server không còn ý nghĩa nên ẩn đi (BUG #3). -->
        @if (!isClientFiltered()) {
          <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()" (pageChange)="goToPage($event)" />
        }
      </div>
    </sg-card>
  `,
  styles: [
    `
      :host { display: block; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .head h1 { margin: 0; }
      .head__sub { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); font-size: var(--sg-small-size); }

      /* Tab Tất cả / Chưa đọc */
      .tabs { display: flex; gap: var(--sg-space-1); padding: var(--sg-space-3) var(--sg-space-4) 0; }
      .tabs__item {
        display: inline-flex;
        align-items: center;
        gap: var(--sg-space-1);
        min-height: 40px;
        padding: 0 var(--sg-space-3);
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        background: transparent;
        color: var(--sg-text-muted);
        font-weight: 700;
        cursor: pointer;
      }
      .tabs__item--active { color: var(--sg-primary); border-bottom-color: var(--sg-primary); }
      .tabs__count {
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: var(--sg-radius-pill);
        background: var(--sg-primary-soft);
        color: var(--sg-primary);
        font-size: var(--sg-caption-size);
      }
      .filters {
        display: grid;
        grid-template-columns: minmax(240px, 1.6fr) minmax(160px, .7fr) minmax(140px, .6fr) auto auto;
        gap: var(--sg-space-3);
        align-items: center;
        padding: var(--sg-space-3) var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
      }
      .feedback { display: block; margin: var(--sg-space-3) var(--sg-space-4) 0; }
      .list { display: grid; }
      .group {
        margin: 0;
        padding: var(--sg-space-3) var(--sg-space-4) var(--sg-space-1);
        background: var(--sg-bg-subtle);
        font-size: var(--sg-caption-size);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--sg-text-muted);
      }
      .state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--sg-space-2);
        margin: 0;
        padding: var(--sg-space-8);
        color: var(--sg-text-muted);
      }
      .row {
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-3);
        padding: var(--sg-space-4);
        border-bottom: 1px solid var(--sg-bg-subtle);
      }
      .row:hover { background: var(--sg-bg-subtle); }
      .row--unread { background: var(--sg-primary-soft); }
      .row__ico {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
        border-radius: var(--sg-radius);
        background: var(--sg-info-soft);
        color: var(--sg-info);
      }
      .row__ico mat-icon { width: 20px; height: 20px; font-size: 20px; }
      .row__ico[data-tone='warn'] { background: var(--sg-state-waiting-soft); color: var(--sg-state-waiting-ink); }
      .row__ico[data-tone='danger'] { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }
      .row__ico[data-tone='success'] { background: var(--sg-state-done-soft); color: var(--sg-state-done); }
      .row__ico[data-tone='system'] { background: var(--sg-bg-muted); color: var(--sg-text-muted); }
      .row__body { flex: 1 1 auto; min-width: 0; overflow-wrap: break-word; word-break: break-word; }
      .row__body strong { display: block; color: var(--sg-text); overflow-wrap: break-word; word-break: break-word; }
      .row__body p { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); overflow-wrap: break-word; word-break: break-word; }
      .row__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sg-space-2); margin-top: var(--sg-space-2); font-size: var(--sg-small-size); color: var(--sg-text-muted); }
      .tag { padding: 2px var(--sg-space-2); border-radius: var(--sg-radius-pill); background: var(--sg-bg-muted); font-weight: 700; }
      .tag--type { background: var(--sg-info-soft); color: var(--sg-info); }
      .row__actions { display: flex; gap: var(--sg-space-2); flex: 0 0 auto; }
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
      @media (max-width: 1100px) {
        .filters { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class NotificationsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;
  private readonly router = inject(Router);
  private readonly store = inject(NotificationStore);
  private readonly appMessages = inject(AppMessageService);

  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly loading = signal(false);
  protected readonly unreadCount = this.store.unreadCount;

  protected keyword = '';
  /** Tab đang chọn — thay cho ô lọc "trạng thái đọc" cũ, khớp template (Tất cả / Chưa đọc). */
  protected readonly tab = signal<'all' | 'unread'>('all');

  /** Sắc thái/biểu tượng/nhãn theo mã loại — dùng chung với chuông trên topbar. */
  protected readonly tone = notifTone;
  protected readonly icon = notifIcon;
  protected typeLabel(type: string): string {
    return notifTypeLabel(type, this.t);
  }

  /** Nhãn nhóm thời gian — mã nhóm là ASCII, nhãn tra qua i18n. */
  protected groupLabel(labelKey: string): string {
    return this.t(labelKey as MessageKey);
  }

  // Nhãn của các ô lọc là `computed` nên tự đổi khi người dùng đổi ngôn ngữ.
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: this.t('ui.common.perPage', { size }) })),
  );

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));

  private readonly appliedKeyword = signal('');

  /** Đang lọc từ khóa tại chỗ (client) hay không — API thông báo chưa nhận tham số `keyword`. */
  protected readonly isClientFiltered = computed(() => this.appliedKeyword().trim().length > 0);

  /** Lọc theo từ khóa thực hiện tại chỗ: API thông báo chưa nhận tham số `keyword`. */
  protected readonly visibleItems = computed(() => {
    const keyword = this.appliedKeyword().trim().toLowerCase();
    if (!keyword) return this.items();
    return this.items().filter((item) =>
      [item.title, item.content, item.dossierCode ?? ''].some((value) => value.toLowerCase().includes(keyword)),
    );
  });

  /** Danh sách hiển thị gom theo mốc thời gian: Hôm nay / Hôm qua / Trước đó. */
  protected readonly sections = computed(() => groupByTime(this.visibleItems()));

  protected readonly summary = computed(() => {
    // Khi lọc từ khóa tại chỗ, `total()` của server không còn khớp danh sách đang hiển thị:
    // đếm đúng số dòng client để số liệu nhất quán với việc pager bị ẩn (BUG #3).
    if (this.isClientFiltered()) {
      return this.t('ui.notify.summaryFiltered', { count: this.visibleItems().length });
    }
    if (!this.total()) return this.t('ui.notify.summaryEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.total(), this.page() * this.pageSize());
    return this.t('ui.notify.summary', { start, end, total: this.total() });
  });

  protected formatContent(item: NotificationItem): string {
    return formatNotificationContent(item.content, item.createdAt);
  }

  ngOnInit(): void {
    this.load();
  }

  protected applyFilters(): void {
    this.appliedKeyword.set(this.keyword);
    this.page.set(1);
    this.load();
  }

  /** Đổi tab Tất cả / Chưa đọc → tải lại từ trang đầu với bộ lọc `unreadOnly` tương ứng. */
  protected setTab(tab: 'all' | 'unread'): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.page.set(1);
    this.load();
  }

  protected resetFilters(): void {
    this.keyword = '';
    this.tab.set('all');
    this.appliedKeyword.set('');
    this.page.set(1);
    this.load();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 20);
    this.page.set(1);
    this.load();
  }

  protected goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.page()) return;
    this.page.set(next);
    this.load();
  }

  protected markRead(item: NotificationItem): void {
    this.api.markNotificationRead(item.id).subscribe({
      next: () => {
        this.items.update((list) =>
          list.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)),
        );
        this.store.refreshUnreadCount();
      },
      error: () => this.appMessages.showKey('ui.notify.markReadFailed', 'error'),
    });
  }

  protected markAllRead(): void {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        const now = new Date().toISOString();
        this.items.update((list) => list.map((row) => (row.readAt ? row : { ...row, readAt: now })));
        this.store.refreshUnreadCount();
      },
      error: () => this.appMessages.showKey('ui.notify.markAllFailed', 'error'),
    });
  }

  protected routeOf(item: NotificationItem): string | null {
    return notifRoute(item);
  }

  protected open(item: NotificationItem): void {
    if (!item.readAt) this.markRead(item);
    const route = notifRoute(item);
    if (route) void this.router.navigateByUrl(route);
  }

  private load(): void {
    this.loading.set(true);
    this.api
      .getNotifications({ unreadOnly: this.tab() === 'unread', page: this.page(), pageSize: this.pageSize() })
      .subscribe({
        next: (result) => {
          this.items.set(result?.items ?? []);
          this.total.set(result?.total ?? 0);
          this.loading.set(false);
        },
        error: () => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.appMessages.showKey('ui.notify.loadFailed', 'error');
        },
      });
  }
}
