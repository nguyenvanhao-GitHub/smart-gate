import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, forwardRef, inject, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

/**
 * Ô tìm kiếm có icon, nút xóa nhanh và gợi ý phím tắt (ví dụ `Ctrl + K`).
 *
 *   <sg-search-input placeholder="Tìm nhanh hồ sơ, phương tiện..." shortcut="Ctrl + K"
 *                    [(ngModel)]="keyword" (search)="timKiem($event)" />
 */
@Component({
  selector: 'sg-search-input',
  standalone: true,
  imports: [MatIconModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SgSearchInputComponent), multi: true }],
  template: `
    <div class="search" [class.search--dark]="dark">
      <mat-icon class="search__icon" fontSet="material-icons-round" aria-hidden="true">search</mat-icon>
      <input
        #control
        class="search__control"
        type="search"
        [attr.aria-label]="ariaLabel || placeholder"
        [placeholder]="resolvedPlaceholder()"
        [disabled]="isDisabled()"
        [value]="currentValue()"
        (input)="onInput($event)"
        (keydown.enter)="search.emit(currentValue())"
        (keydown.escape)="clear()"
        (blur)="onTouched()"
      />
      @if (currentValue()) {
        <button type="button" class="search__clear" [attr.aria-label]="t('ui.common.clearKeyword')" (click)="clear()">
          <mat-icon fontSet="material-icons-round">close</mat-icon>
        </button>
      } @else if (shortcut) {
        <kbd class="search__shortcut">{{ shortcut }}</kbd>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .search {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: var(--sg-control-height);
        padding: 0 var(--sg-space-2) 0 var(--sg-space-3);
        border: 1px solid var(--sg-border-strong);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
      }
      .search:focus-within { border-color: var(--sg-primary-400); box-shadow: 0 0 0 3px rgba(66, 165, 245, .18); }
      .search__icon { width: 18px; height: 18px; font-size: 18px; color: var(--sg-text-muted); flex: 0 0 auto; }
      .search__control {
        flex: 1 1 auto;
        min-width: 0;
        border: 0;
        outline: none;
        padding: 0;
        background: transparent;
        color: var(--sg-text);
        font-family: var(--sg-font-family);
        font-size: var(--sg-body-size);
      }
      .search__control::-webkit-search-cancel-button { display: none; }
      .search__clear {
        width: 26px;
        min-width: 26px;
        height: 26px;
        min-height: 26px;
        padding: 0;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text-muted);
        cursor: pointer;
      }
      .search__clear mat-icon { width: 16px; height: 16px; font-size: 16px; }
      .search__shortcut {
        flex: 0 0 auto;
        padding: 2px var(--sg-space-2);
        border: 1px solid var(--sg-border);
        border-radius: 6px;
        background: var(--sg-bg-subtle);
        color: var(--sg-text-muted);
        font-family: var(--sg-font-family);
        font-size: var(--sg-caption-size);
        line-height: var(--sg-caption-line);
      }
      .search--dark { background: rgba(255, 255, 255, .12); border-color: rgba(255, 255, 255, .24); }
      .search--dark .search__icon,
      .search--dark .search__clear { color: rgba(255, 255, 255, .8); }
      .search--dark .search__control { color: var(--sg-text-invert); }
      .search--dark .search__control::placeholder { color: rgba(255, 255, 255, .7); }
      .search--dark .search__shortcut {
        background: rgba(255, 255, 255, .14);
        border-color: rgba(255, 255, 255, .26);
        color: rgba(255, 255, 255, .85);
      }
    `,
  ],
})
export class SgSearchInputComponent implements ControlValueAccessor {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  @Input() placeholder = '';
  /** Gợi ý mặc định khi nơi gọi không truyền — là phương thức để đọc lại `@Input` mỗi lượt kiểm tra. */
  protected resolvedPlaceholder(): string {
    return this.placeholder || this.t('ui.common.searchPlaceholder');
  }
  @Input() ariaLabel = '';
  @Input() shortcut = '';
  /** Biến thể dùng trên nền tối (topbar). */
  @Input() dark = false;
  @Output() valueChange = new EventEmitter<string>();
  @Output() search = new EventEmitter<string>();

  @ViewChild('control') private readonly control?: ElementRef<HTMLInputElement>;

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

  focus(): void {
    this.control?.nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.setValue((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.setValue('');
    this.focus();
  }

  private setValue(next: string): void {
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
