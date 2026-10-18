import { Component, Input, booleanAttribute } from '@angular/core';

/**
 * Khung nhãn + gợi ý + thông báo lỗi cho một control bất kỳ.
 * Control (input/select/textarea hoặc component sg-*) được chiếu vào trong.
 *
 *   <sg-form-field label="Tên đăng nhập" [required]="true" [error]="loi()">
 *     <input name="username" [(ngModel)]="username">
 *   </sg-form-field>
 *
 * Ghi chú: style của chính ô nhập nằm ở style toàn cục (`input, select, textarea`)
 * vì nội dung được chiếu không nhận style bao đóng của component này.
 *
 * Về `eslint-disable` trong template: đây là kiểu "label bọc control" — ô nhập được chiếu vào
 * bên trong chính thẻ `<label>` nên liên kết nhãn ↔ control là **ngầm định và hợp lệ**;
 * `label-has-associated-control` không nhìn xuyên được `<ng-content />` nên báo nhầm.
 */
@Component({
  selector: 'sg-form-field',
  standalone: true,
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/label-has-associated-control -->
    <label class="field" [class.field--invalid]="!!error">
      @if (label) {
        <span class="field__label">
          {{ label }}
          @if (required) { <em class="field__required" aria-hidden="true">*</em> }
        </span>
      }
      <ng-content />
      @if (error) {
        <span class="field__error" role="alert">{{ error }}</span>
      } @else if (hint) {
        <span class="field__hint">{{ hint }}</span>
      }
    </label>
  `,
  styles: [
    `
      :host { display: block; }
      .field { display: grid; gap: var(--sg-space-1); }
      .field__label {
        font-size: var(--sg-small-size);
        line-height: var(--sg-small-line);
        font-weight: 700;
        color: var(--sg-text);
      }
      .field__required { color: var(--sg-danger); font-style: normal; margin-left: 2px; }
      .field__hint {
        font-size: var(--sg-caption-size);
        line-height: var(--sg-caption-line);
        color: var(--sg-text-muted);
        font-weight: 400;
      }
      .field__error {
        font-size: var(--sg-caption-size);
        line-height: var(--sg-caption-line);
        color: var(--sg-danger);
        font-weight: 700;
      }
    `,
  ],
})
export class SgFormFieldComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() error = '';
  @Input({ transform: booleanAttribute }) required = false;
}
