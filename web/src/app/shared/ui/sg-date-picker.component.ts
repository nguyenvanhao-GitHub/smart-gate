import { Component, EventEmitter, Input, Output, forwardRef, inject, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

/**
 * Ô chọn ngày. Giá trị trao đổi theo chuẩn ISO `yyyy-MM-dd` để khớp query param của API.
 *
 *   <sg-date-picker [(ngModel)]="filters.fromDate" ariaLabel="Từ ngày" />
 */
@Component({
  selector: 'sg-date-picker',
  standalone: true,
  imports: [MatIconModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SgDatePickerComponent), multi: true }],
  template: `
    <div class="date">
      <input
        class="date__control"
        type="date"
        [attr.aria-label]="resolvedAriaLabel()"
        [attr.min]="min || null"
        [attr.max]="max || null"
        [disabled]="isDisabled()"
        [value]="currentValue()"
        (input)="onInput($event)"
        (change)="onInput($event)"
        (blur)="onTouched()"
      />
      <mat-icon class="date__icon" fontSet="material-icons-round" aria-hidden="true">calendar_today</mat-icon>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .date { position: relative; }
      .date__control {
        width: 100%;
        min-height: var(--sg-control-height);
        padding: 0 var(--sg-space-6) 0 var(--sg-space-3);
        border: 1px solid var(--sg-border-strong);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
        color: var(--sg-text);
        font-family: var(--sg-font-family);
        font-size: var(--sg-body-size);
      }
      /* Trải bộ kích hoạt lịch của trình duyệt phủ TOÀN ô: bấm bất kỳ đâu trong ô đều mở lịch,
         không phải nhắm đúng ~18px vô hình bên phải. Icon custom chỉ để trang trí. */
      .date__control::-webkit-calendar-picker-indicator {
        position: absolute;
        inset: 0;
        width: auto;
        height: auto;
        margin: 0;
        padding: 0;
        opacity: 0;
        cursor: pointer;
      }
      .date__icon {
        position: absolute;
        right: var(--sg-space-3);
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--sg-text-muted);
        pointer-events: none;
      }
      .date__control:disabled { background: var(--sg-bg-subtle); color: var(--sg-text-muted); }
    `,
  ],
})
export class SgDatePickerComponent implements ControlValueAccessor {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  @Input() ariaLabel = '';
  /** Nhãn trợ năng mặc định khi nơi gọi không truyền — phương thức để đọc lại `@Input` mỗi lượt kiểm tra. */
  protected resolvedAriaLabel(): string {
    return this.ariaLabel || this.t('ui.common.chooseDate');
  }
  @Input() min = '';
  @Input() max = '';
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

  protected onInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
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
