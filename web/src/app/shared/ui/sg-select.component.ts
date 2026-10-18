import { Component, EventEmitter, Input, Output, forwardRef, inject, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SgSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Ô chọn giá trị. Dùng `<select>` gốc để giữ tính năng bàn phím và trợ năng.
 *
 *   <sg-select [options]="dsTrangThai" [(ngModel)]="filters.status" placeholder="Tất cả" />
 */
@Component({
  selector: 'sg-select',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SgSelectComponent), multi: true }],
  template: `
    <div class="select">
      <select
        class="select__control"
        [class.select__control--invalid]="invalid"
        [attr.aria-label]="ariaLabel || placeholder"
        [disabled]="isDisabled()"
        [value]="currentValue()"
        (change)="onSelect($event)"
        (blur)="onTouched()"
      >
        @if (showEmptyOption) {
          <option value="" [selected]="!currentValue()">{{ resolvedPlaceholder() }}</option>
        }
        @for (option of options; track option.value) {
          <option [value]="option.value" [selected]="option.value === currentValue()" [disabled]="!!option.disabled">{{ option.label }}</option>
        }
      </select>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .select { position: relative; }
      .select__control {
        width: 100%;
        min-height: var(--sg-control-height);
        padding: 0 var(--sg-space-6) 0 var(--sg-space-3);
        border: 1px solid var(--sg-border-strong);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
        color: var(--sg-text);
        font-family: var(--sg-font-family);
        font-size: var(--sg-body-size);
        appearance: none;
      }
      .select__control--invalid {
        border-color: var(--sg-danger, #ef4444) !important;
        background: #fef2f2 !important;
      }
      .select::after {
        content: '';
        position: absolute;
        right: var(--sg-space-3);
        top: 50%;
        width: 8px;
        height: 8px;
        margin-top: -6px;
        border-right: 2px solid var(--sg-text-muted);
        border-bottom: 2px solid var(--sg-text-muted);
        transform: rotate(45deg);
        pointer-events: none;
      }
      .select__control:disabled { background: var(--sg-bg-subtle); color: var(--sg-text-muted); cursor: not-allowed; }
    `,
  ],
})
export class SgSelectComponent implements ControlValueAccessor {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  @Input() invalid = false;

  @Input() options: SgSelectOption[] = [];
  @Input() showEmptyOption = true;
  @Input() placeholder = '';
  /** Gợi ý mặc định khi nơi gọi không truyền — là phương thức để đọc lại `@Input` mỗi lượt kiểm tra. */
  protected resolvedPlaceholder(): string {
    return this.placeholder || this.t('ui.common.chooseValue');
  }
  @Input() ariaLabel = '';
  @Output() valueChange = new EventEmitter<string>();

  @Input()
  set value(next: string) {
    this.valueSignal.set(next ?? '');
  }

  @Input()
  set disabled(next: boolean) {
    this.disabledSignal.set(!!next);
  }

  private readonly valueSignal = signal('');
  private readonly disabledSignal = signal(false);
  protected readonly currentValue = this.valueSignal.asReadonly();
  protected readonly isDisabled = this.disabledSignal.asReadonly();

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected onSelect(event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    this.valueSignal.set(next);
    this.onChange(next);
    this.valueChange.emit(next);
  }

  writeValue(value: string): void {
    this.valueSignal.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledSignal.set(isDisabled);
  }
}
