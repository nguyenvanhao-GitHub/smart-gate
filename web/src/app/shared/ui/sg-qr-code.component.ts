import { Component, Input, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { encodeQrCode, qrMatrixToSvgPath } from '../util/qr-code';

/**
 * Vẽ mã QR từ chuỗi do API trả về (F14). Không dùng thư viện ngoài — ma trận do
 * `shared/util/qr-code.ts` sinh, ở đây chỉ kết xuất SVG nên in ra giấy vẫn nét.
 *
 *   <sg-qr-code [value]="hoSo.qrCode" [size]="180" caption="HS-250519-0015" />
 */
@Component({
  selector: 'sg-qr-code',
  standalone: true,
  template: `
    @if (path(); as d) {
      <svg
        class="qr"
        [attr.width]="size"
        [attr.height]="size"
        [attr.viewBox]="viewBox()"
        role="img"
        [attr.aria-label]="ariaLabel || t('ui.common.qrAria')"
      >
        <rect class="qr__bg" width="100%" height="100%" />
        <path [attr.d]="d" />
      </svg>
      @if (caption) { <span class="qr__caption">{{ caption }}</span> }
    } @else {
      <span class="qr__empty">{{ errorText() }}</span>
    }
  `,
  styles: [
    `
      :host { display: inline-grid; justify-items: center; gap: var(--sg-space-2); }
      .qr { display: block; border-radius: var(--sg-radius); }
      .qr__bg { fill: var(--sg-bg-surface); }
      .qr path { fill: var(--sg-text); }
      .qr__caption { color: var(--sg-text-muted); font-size: var(--sg-small-size); font-weight: 700; letter-spacing: .04em; }
      .qr__empty {
        display: grid;
        place-items: center;
        min-width: 120px;
        min-height: 120px;
        padding: var(--sg-space-3);
        border: 1px dashed var(--sg-border-strong);
        border-radius: var(--sg-radius);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
        text-align: center;
      }
    `,
  ],
})
export class SgQrCodeComponent {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  /** Cạnh của ảnh QR tính bằng pixel. */
  @Input() size = 160;
  @Input() caption = '';
  @Input() ariaLabel = '';

  @Input()
  set value(next: string) {
    this.valueSignal.set(next || '');
  }

  private readonly valueSignal = signal('');
  private readonly quietZone = 4;

  private readonly matrix = computed(() => {
    const value = this.valueSignal();
    if (!value) return null;
    try {
      return encodeQrCode(value);
    } catch {
      return null;
    }
  });

  protected readonly path = computed(() => {
    const matrix = this.matrix();
    return matrix ? qrMatrixToSvgPath(matrix, this.quietZone) : '';
  });

  protected readonly viewBox = computed(() => {
    const matrix = this.matrix();
    const total = (matrix?.size ?? 0) + this.quietZone * 2;
    return `0 0 ${total} ${total}`;
  });

  protected readonly errorText = computed(() =>
    this.valueSignal() ? this.t('ui.common.qrFailed') : this.t('ui.common.qrMissing'),
  );
}
