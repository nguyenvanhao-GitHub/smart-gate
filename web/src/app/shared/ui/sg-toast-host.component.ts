import { Component, inject } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { AppMessageService } from '../../core/services/app-message.service';
import { SgAlertComponent } from './sg-alert.component';

/**
 * Nơi hiển thị hàng đợi của `AppMessageService`. Đặt một lần duy nhất ở
 * `app.component.ts`, nằm ngoài shell để vẫn hiện được trên trang đăng nhập.
 */
@Component({
  selector: 'sg-toast-host',
  standalone: true,
  imports: [SgAlertComponent],
  template: `
    @if (messages().length) {
      <div class="toasts" role="region" aria-live="polite" [attr.aria-label]="t('ui.common.toastRegion')">
        @for (message of messages(); track message.id) {
          <sg-alert
            [type]="message.tone"
            [message]="message.text"
            [dismissible]="true"
            (dismiss)="dismiss(message.id)"
          />
        }
      </div>
    }
  `,
  styles: [
    `
      .toasts {
        position: fixed;
        top: var(--sg-space-3);
        right: var(--sg-space-3);
        z-index: 1100;
        display: grid;
        gap: var(--sg-space-2);
        width: min(400px, calc(100vw - var(--sg-space-5)));
      }
      .toasts sg-alert { box-shadow: var(--sg-shadow-modal); border-radius: var(--sg-radius); }
    `,
  ],
})
export class SgToastHostComponent {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  private readonly service = inject(AppMessageService);

  protected readonly messages = this.service.messages;

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }
}
