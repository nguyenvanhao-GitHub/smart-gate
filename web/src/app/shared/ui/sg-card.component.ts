import { Component, Input } from '@angular/core';

/**
 * Thẻ nội dung theo Design System (bo góc 12px, đổ bóng card).
 *
 *   <sg-card title="Thông tin hồ sơ" subtitle="Cập nhật 10:24">
 *     <button card-actions sgButton="tertiary">Xem tất cả</button>
 *     ...nội dung...
 *   </sg-card>
 */
@Component({
  selector: 'sg-card',
  standalone: true,
  template: `
    <section class="card" [class.card--flush]="flush" [class.card--overflow-visible]="overflowVisible">
      @if (title || subtitle) {
        <header class="card__head">
          <div class="card__titles">
            @if (title) { <h3 class="card__title">{{ title }}</h3> }
            @if (subtitle) { <p class="card__subtitle" [attr.title]="subtitle">{{ subtitle }}</p> }
          </div>
          <div class="card__actions"><ng-content select="[card-actions]" /></div>
        </header>
      }
      <div class="card__body"><ng-content /></div>
      <ng-content select="[card-footer]" />
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .card {
        background: var(--sg-bg-surface);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius-card);
        box-shadow: var(--sg-shadow-card);
        overflow: hidden;
      }
      .card--overflow-visible {
        overflow: visible;
      }
      .card__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--sg-space-3);
        padding: var(--sg-space-4) var(--sg-space-4) 0;
      }
      .card__titles { flex: 1 1 auto; min-width: 0; overflow: hidden; }
      .card__title {
        margin: 0;
        font-size: var(--sg-h3-size);
        line-height: var(--sg-h3-line);
        font-weight: 700;
        color: var(--sg-text);
      }
      .card__subtitle {
        margin: var(--sg-space-1) 0 0;
        font-size: var(--sg-small-size);
        line-height: var(--sg-small-line);
        color: var(--sg-text-muted);
        overflow-wrap: anywhere;
      }
      .card__actions { display: flex; align-items: center; gap: var(--sg-space-2); flex: 0 0 auto; }
      .card__body { padding: var(--sg-space-4); }
      .card--flush .card__body { padding: 0; }
    `,
  ],
})
export class SgCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  /** Bỏ đệm trong thân thẻ — dùng khi nhúng bảng. */
  @Input() flush = false;
  /** Cho phép phần tử con (như dropdown popover) hiển thị tràn ra ngoài thẻ card mà không bị cắt. */
  @Input() overflowVisible = false;
}
