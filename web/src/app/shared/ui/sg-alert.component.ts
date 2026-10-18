import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { MatIconModule } from '@angular/material/icon';

export type SgAlertType = 'success' | 'warning' | 'error' | 'info';

const ICONS: Record<SgAlertType, string> = {
  success: 'check_circle',
  warning: 'warning',
  error: 'error',
  info: 'info',
};

/**
 * Alert / Banner 4 loại theo Design System Handoff.
 *
 *   <sg-alert type="error" title="Lỗi!" message="Đã có lỗi xảy ra, vui lòng thử lại." (dismiss)="..." />
 */
@Component({
  selector: 'sg-alert',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="alert" [attr.data-type]="type" role="status">
      <mat-icon class="alert__icon" fontSet="material-icons-round">{{ icon }}</mat-icon>
      <div class="alert__body">
        @if (title) { <strong class="alert__title">{{ title }}</strong> }
        @if (message) { <span class="alert__message">{{ message }}</span> }
        <ng-content />
      </div>
      @if (dismissible) {
        <button type="button" class="alert__close" [attr.aria-label]="t('ui.common.closeAlert')" (click)="dismiss.emit()">
          <mat-icon fontSet="material-icons-round">close</mat-icon>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .alert {
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border: 1px solid transparent;
        border-radius: var(--sg-radius);
        font-size: var(--sg-body-size);
        line-height: var(--sg-body-line);
      }
      .alert__icon { flex: 0 0 auto; width: 20px; height: 20px; font-size: 20px; }
      .alert__body { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
      .alert__title { font-weight: 700; }
      .alert__message { color: inherit; }
      .alert__close {
        flex: 0 0 auto;
        width: 28px;
        min-width: 28px;
        height: 28px;
        min-height: 28px;
        padding: 0;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .alert__close mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .alert[data-type='success'] { background: var(--sg-success-soft); border-color: var(--sg-success-border); color: var(--sg-success-ink); }
      .alert[data-type='warning'] { background: var(--sg-warning-soft); border-color: var(--sg-warning-border); color: var(--sg-warning-ink); }
      .alert[data-type='error'] { background: var(--sg-danger-soft); border-color: var(--sg-danger-border); color: var(--sg-danger-ink); }
      .alert[data-type='info'] { background: var(--sg-info-soft); border-color: var(--sg-info-border); color: var(--sg-info-ink); }
    `,
  ],
})
export class SgAlertComponent {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  @Input() type: SgAlertType = 'info';
  @Input() title = '';
  @Input() message = '';
  @Input() dismissible = false;
  @Output() dismiss = new EventEmitter<void>();

  protected get icon(): string {
    return ICONS[this.type] || ICONS.info;
  }
}
