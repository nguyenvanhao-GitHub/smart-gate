import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../core/i18n/i18n.service';
import { SgButtonDirective } from './sg-button.directive';

/**
 * Phân trang server-side dùng chung. Nhận `page`/`pageSize`/`total`, tự tính số trang, dựng nút
 * trước/sau kèm dãy số trang, vô hiệu ở biên và phát `pageChange` với số trang mới hợp lệ.
 *
 *   <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()"
 *             (pageChange)="goToPage($event)" />
 */
@Component({
  selector: 'sg-pager',
  standalone: true,
  imports: [MatIconModule, SgButtonDirective],
  template: `
    <nav class="sg-pager" [attr.aria-label]="t('ui.pager.navAria')">
      <button
        type="button"
        sgButton="secondary"
        size="sm"
        [disabled]="disabled || pageValue() <= 1"
        [attr.aria-label]="t('ui.pager.prevAria')"
        (click)="go(pageValue() - 1)"
      >
        <mat-icon fontSet="material-icons-round">chevron_left</mat-icon>
      </button>

      @for (item of pages(); track $index) {
        @if (item === 0) {
          <span class="sg-pager__gap" aria-hidden="true">…</span>
        } @else {
          <button
            type="button"
            class="sg-pager__page"
            [class.sg-pager__page--active]="item === pageValue()"
            [attr.aria-current]="item === pageValue() ? 'page' : null"
            [attr.aria-label]="t('ui.pager.pageAria', { page: item })"
            [disabled]="disabled"
            (click)="go(item)"
          >
            {{ item }}
          </button>
        }
      }

      <button
        type="button"
        sgButton="secondary"
        size="sm"
        [disabled]="disabled || pageValue() >= totalPages()"
        [attr.aria-label]="t('ui.pager.nextAria')"
        (click)="go(pageValue() + 1)"
      >
        <mat-icon fontSet="material-icons-round">chevron_right</mat-icon>
      </button>
    </nav>
  `,
  styles: [
    `
      :host { display: block; }
      .sg-pager { display: flex; align-items: center; gap: var(--sg-space-1); }
      .sg-pager mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .sg-pager__page {
        min-width: 32px;
        min-height: 32px;
        padding: 0 var(--sg-space-2);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
        color: var(--sg-text);
        font-weight: 700;
        cursor: pointer;
      }
      .sg-pager__page:hover:not(:disabled) { border-color: var(--sg-primary); color: var(--sg-primary); }
      .sg-pager__page--active {
        border-color: var(--sg-primary);
        background: var(--sg-primary);
        color: var(--sg-text-invert);
      }
      .sg-pager__page:disabled { cursor: not-allowed; opacity: .6; }
      .sg-pager__gap { min-width: 20px; text-align: center; color: var(--sg-text-muted); }
    `,
  ],
})
export class SgPagerComponent {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  private readonly pageSignal = signal(1);
  private readonly pageSizeSignal = signal(10);
  private readonly totalSignal = signal(0);

  @Input() set page(value: number) {
    this.pageSignal.set(Math.max(1, Math.floor(Number(value)) || 1));
  }

  @Input() set pageSize(value: number) {
    this.pageSizeSignal.set(Math.max(1, Math.floor(Number(value)) || 1));
  }

  @Input() set total(value: number) {
    this.totalSignal.set(Math.max(0, Math.floor(Number(value)) || 0));
  }

  /** Chặn thao tác khi đang tải (nút vẫn hiển thị nhưng không bấm được). */
  @Input() disabled = false;

  @Output() pageChange = new EventEmitter<number>();

  protected readonly pageValue = this.pageSignal.asReadonly();
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalSignal() / this.pageSizeSignal())),
  );
  protected readonly pages = computed(() => buildPageList(this.pageValue(), this.totalPages()));

  protected go(target: number): void {
    const next = Math.min(Math.max(1, target), this.totalPages());
    if (next === this.pageValue() || this.disabled) return;
    this.pageChange.emit(next);
  }
}

/**
 * Dãy số trang hiển thị: luôn có trang đầu, cuối và lân cận trang hiện tại; các quãng bị lược
 * thay bằng `0` (dấu "…"). Ít trang (≤ 7) thì hiện đủ, không lược.
 */
function buildPageList(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const wanted = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: number[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push(0);
    result.push(page);
    previous = page;
  }
  return result;
}
