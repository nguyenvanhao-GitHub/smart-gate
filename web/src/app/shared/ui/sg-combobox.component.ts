import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  computed,
  forwardRef,
  inject,
  signal,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../core/i18n/i18n.service';
import { SgSelectOption } from './sg-select.component';

export interface SgComboboxSubmitEvent {
  query: string;
  matchedOptions: SgSelectOption[];
  matchedValues: string[];
}

/**
 * Chuẩn hóa chuỗi tiếng Việt (bỏ dấu, chuyển về chữ thường, cắt khoảng trắng thừa) để tìm kiếm.
 */
function normalizeVietnamese(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Dropdown chọn và tìm kiếm (Combobox / Searchable Select).
 *
 * Hỗ trợ:
 * - Tìm kiếm thời gian thực (live search) không phân biệt hoa thường và không dấu tiếng Việt.
 * - Click chọn một mục cụ thể hoặc gõ từ khóa + Enter để tìm partial match trên toàn bộ danh sách.
 * - Điều hướng bàn phím (Arrow Up/Down, Enter, Escape).
 * - Tương thích form hai chiều qua `[(ngModel)]` (`ControlValueAccessor`).
 */
@Component({
  selector: 'sg-combobox',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SgComboboxComponent), multi: true }],
  template: `
    <div class="combobox" [class.combobox--open]="isOpen()" [class.combobox--drop-up]="dropUp()" [class.combobox--disabled]="isDisabled()">
      <!-- Trigger button / Display input -->
      <button
        #triggerBtn
        type="button"
        class="combobox__trigger"
        [attr.aria-label]="ariaLabel || placeholder"
        [attr.aria-expanded]="isOpen()"
        [disabled]="isDisabled()"
        (click)="toggleDropdown()"
        (keydown)="onTriggerKeydown($event)"
      >
        <span class="combobox__display">
          {{ displayLabel() || resolvedPlaceholder() }}
        </span>

        <span class="combobox__icons">
          @if (hasValue() && !isDisabled()) {
            <span
              role="button"
              tabindex="0"
              class="combobox__clear"
              [attr.aria-label]="t('ui.common.clearKeyword')"
              (click)="onClear($event)"
              (keydown.enter)="onClear($event)"
            >
              <mat-icon fontSet="material-icons-round">close</mat-icon>
            </span>
          }
          <span class="combobox__arrow" aria-hidden="true"></span>
        </span>
      </button>

      <!-- Dropdown panel -->
      @if (isOpen()) {
        <div class="combobox__dropdown" [class.combobox__dropdown--up]="dropUp()">
          <!-- Search input box -->
          <div class="combobox__search-wrap">
            <mat-icon class="combobox__search-icon" fontSet="material-icons-round" aria-hidden="true">search</mat-icon>
            <input
              #searchInput
              type="text"
              class="combobox__search-input"
              [placeholder]="resolvedSearchPlaceholder()"
              [attr.aria-label]="resolvedSearchPlaceholder()"
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
              (keydown)="onSearchKeydown($event)"
            />
            @if (searchQuery()) {
              <button
                type="button"
                class="combobox__search-clear"
                [attr.aria-label]="t('ui.common.clearKeyword')"
                (click)="clearSearch()"
              >
                <mat-icon fontSet="material-icons-round">close</mat-icon>
              </button>
            }
          </div>

          <!-- Quick action: Match all query items if user typed keyword -->
          @if (searchQuery().trim() && allowCustomQuery) {
            <button
              type="button"
              class="combobox__option combobox__option--query-all"
              [class.combobox__option--highlighted]="highlightedIndex() === 0"
              (click)="submitCustomQuery()"
              (mouseenter)="highlightedIndex.set(0)"
            >
              <mat-icon fontSet="material-icons-round">manage_search</mat-icon>
              <span class="combobox__option-label">
                {{ t('ui.audit.matchAllActions', { query: searchQuery().trim(), count: filteredOptions().length }) }}
              </span>
            </button>
          }

          <!-- Options list -->
          <div class="combobox__list" role="listbox">
            @if (showEmptyOption && !searchQuery().trim()) {
              <button
                type="button"
                class="combobox__option"
                [class.combobox__option--selected]="!valueSignal() && !customQuerySignal()"
                [class.combobox__option--highlighted]="highlightedIndex() === (allowCustomQuery && searchQuery().trim() ? 1 : 0)"
                (click)="selectEmptyOption()"
                (mouseenter)="highlightedIndex.set(allowCustomQuery && searchQuery().trim() ? 1 : 0)"
              >
                <span class="combobox__option-label">{{ resolvedEmptyLabel() }}</span>
                @if (!valueSignal() && !customQuerySignal()) {
                  <mat-icon class="combobox__check" fontSet="material-icons-round">check</mat-icon>
                }
              </button>
            }

            @if (filteredOptions().length === 0) {
              <div class="combobox__empty">
                {{ t('ui.audit.noMatchingAction') }}
              </div>
            } @else {
              @for (option of filteredOptions(); track option.value; let idx = $index) {
                <button
                  type="button"
                  class="combobox__option"
                  [class.combobox__option--selected]="valueSignal() === option.value"
                  [class.combobox__option--highlighted]="highlightedIndex() === listIndexFor(idx)"
                  [class.combobox__option--disabled]="option.disabled"
                  [disabled]="option.disabled"
                  (click)="selectOption(option)"
                  (mouseenter)="highlightedIndex.set(listIndexFor(idx))"
                >
                  <span class="combobox__option-label">{{ option.label }}</span>
                  @if (valueSignal() === option.value) {
                    <mat-icon class="combobox__check" fontSet="material-icons-round">check</mat-icon>
                  }
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        font-family: var(--sg-font-family);
        font-size: var(--sg-body-size);
        font-weight: 400;
        color: var(--sg-text);
      }
      :host:has(.combobox--open) {
        z-index: 1050;
      }
      button, input {
        font: inherit;
        color: inherit;
      }
      .combobox {
        position: relative;
        width: 100%;
      }
      .combobox--open {
        position: relative;
        z-index: 1050;
      }
      .combobox__trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-2);
        width: 100%;
        min-height: var(--sg-control-height);
        padding: 0 var(--sg-space-3);
        border: 1px solid var(--sg-border-strong);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
        color: var(--sg-text);
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        line-height: var(--sg-body-line);
        text-align: left;
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .combobox__trigger:focus,
      .combobox--open .combobox__trigger {
        border-color: var(--sg-primary-400, #2f6fed);
        box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.18);
      }
      .combobox--disabled .combobox__trigger {
        background: var(--sg-bg-subtle);
        color: var(--sg-text-muted);
        cursor: not-allowed;
      }
      .combobox__display {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .combobox__icons {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
      }
      .combobox__clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        color: var(--sg-text-muted);
        cursor: pointer;
        outline: none;
      }
      .combobox__clear:hover {
        background: var(--sg-bg-subtle);
        color: var(--sg-text);
      }
      .combobox__clear mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
      }
      .combobox__arrow {
        width: 8px;
        height: 8px;
        border-right: 2px solid var(--sg-text-muted);
        border-bottom: 2px solid var(--sg-text-muted);
        transform: rotate(45deg);
        transition: transform 0.2s ease;
        margin-top: -3px;
        pointer-events: none;
      }
      .combobox--open .combobox__arrow {
        transform: rotate(-135deg);
        margin-top: 3px;
      }

      /* Dropdown */
      .combobox__dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 1050;
        background: var(--sg-bg-surface);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.16), 0 3px 8px rgba(0, 0, 0, 0.08);
        overflow: hidden;
        min-width: 240px;
      }
      .combobox__dropdown--up {
        top: auto;
        bottom: calc(100% + 4px);
        box-shadow: 0 -14px 32px rgba(0, 0, 0, 0.16), 0 -3px 8px rgba(0, 0, 0, 0.08);
      }

      /* Search box inside dropdown */
      .combobox__search-wrap {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        padding: var(--sg-space-2) var(--sg-space-3);
        border-bottom: 1px solid var(--sg-border);
        background: var(--sg-bg-subtle);
      }
      .combobox__search-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--sg-text-muted);
        flex-shrink: 0;
      }
      .combobox__search-input {
        flex: 1 1 auto;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        font-family: inherit;
        font-size: var(--sg-small-size, 13px);
      }
      .combobox__search-clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--sg-text-muted);
        cursor: pointer;
        padding: 0;
      }
      .combobox__search-clear mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
      }

      /* Option items */
      .combobox__list {
        max-height: 260px;
        overflow-y: auto;
        padding: 4px 0;
      }
      .combobox__option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-2);
        width: 100%;
        padding: 8px var(--sg-space-3);
        font-family: inherit;
        font-size: var(--sg-small-size, 13px);
        cursor: pointer;
        user-select: none;
        border: none;
        background: transparent;
        text-align: left;
        outline: none;
        transition: background-color 0.1s ease;
      }
      .combobox__option--highlighted {
        background: var(--sg-bg-subtle, #f4f6fb);
      }
      .combobox__option--selected {
        background: var(--sg-primary-soft, #eef3fe);
        color: var(--sg-primary-900, #153e90);
      }
      .combobox__option--selected .combobox__option-label {
        font-weight: 600;
      }
      .combobox__option--disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .combobox__option-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
      }
      .combobox__check {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--sg-primary, #2f6fed);
        flex-shrink: 0;
      }
      .combobox__empty {
        padding: var(--sg-space-3);
        text-align: center;
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size, 13px);
      }

      /* Query all header action */
      .combobox__option--query-all {
        background: var(--sg-primary-soft, #eef3fe);
        color: var(--sg-primary-900, #153e90);
        border-bottom: 1px solid var(--sg-border);
      }
      .combobox__option--query-all .combobox__option-label {
        font-weight: 500;
      }
      .combobox__option--query-all mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--sg-primary, #2f6fed);
        flex-shrink: 0;
      }
    `,
  ],
})
export class SgComboboxComponent implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);
  protected readonly t = inject(I18nService).t;

  private readonly optionsSignal = signal<SgSelectOption[]>([]);

  @Input()
  set options(opts: SgSelectOption[]) {
    this.optionsSignal.set(opts || []);
  }
  get options(): SgSelectOption[] {
    return this.optionsSignal();
  }

  @Input() showEmptyOption = true;
  @Input() placeholder = '';
  @Input() searchPlaceholder = '';
  @Input() emptyOptionLabel = '';
  @Input() ariaLabel = '';
  /** Cho phép gõ từ khóa tự do và bấm Enter để tìm kiếm nhiều mã khớp. */
  @Input() allowCustomQuery = true;

  @Output() valueChange = new EventEmitter<string>();
  @Output() querySubmit = new EventEmitter<SgComboboxSubmitEvent>();
  @Output() search = new EventEmitter<string>();

  @ViewChild('triggerBtn') private readonly triggerBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('searchInput') private readonly searchInput?: ElementRef<HTMLInputElement>;

  readonly isOpen = signal(false);
  readonly dropUp = signal(false);
  readonly searchQuery = signal('');
  protected readonly valueSignal = signal('');
  protected readonly customQuerySignal = signal('');
  protected readonly disabledSignal = signal(false);
  protected readonly highlightedIndex = signal(0);

  readonly isDisabled = this.disabledSignal.asReadonly();

  /** Lọc danh sách tùy chọn dựa trên từ khóa tìm kiếm (bỏ dấu tiếng Việt & case-insensitive). */
  readonly filteredOptions = computed<SgSelectOption[]>(() => {
    const query = normalizeVietnamese(this.searchQuery());
    const opts = this.optionsSignal();
    if (!query) return opts;
    return opts.filter((opt) => {
      const normLabel = normalizeVietnamese(opt.label);
      const normValue = normalizeVietnamese(opt.value);
      return normLabel.includes(query) || normValue.includes(query);
    });
  });

  /** Nhãn hiển thị trên trigger button. */
  readonly displayLabel = computed<string>(() => {
    const val = this.valueSignal();
    const customQuery = this.customQuerySignal();
    const opts = this.optionsSignal();
    if (val) {
      const match = opts.find((opt) => opt.value === val);
      if (match) return match.label;
    }
    if (customQuery) {
      return this.t('ui.audit.matchedActions', { query: customQuery });
    }
    return '';
  });

  readonly hasValue = computed<boolean>(() => {
    return Boolean(this.valueSignal() || this.customQuerySignal());
  });

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  @Input()
  set value(next: string) {
    this.valueSignal.set(next ?? '');
    if (next) {
      this.customQuerySignal.set('');
    }
  }

  @Input()
  set disabled(next: boolean) {
    this.disabledSignal.set(!!next);
  }

  /** Đặt giá trị tìm kiếm tùy chỉnh (từ khóa tự do) từ bên ngoài nếu có. */
  setCustomQuery(query: string): void {
    this.customQuerySignal.set(query ?? '');
    if (query) {
      this.valueSignal.set('');
      this.onChange('');
    }
  }

  protected resolvedPlaceholder(): string {
    return this.placeholder || this.t('ui.common.chooseValue');
  }

  protected resolvedSearchPlaceholder(): string {
    return this.searchPlaceholder || this.t('ui.audit.searchActionPlaceholder');
  }

  protected resolvedEmptyLabel(): string {
    return this.emptyOptionLabel || this.placeholder || this.t('ui.audit.actionAll');
  }

  protected listIndexFor(idx: number): number {
    const hasQueryAll = this.allowCustomQuery && Boolean(this.searchQuery().trim());
    const hasEmptyOption = this.showEmptyOption && !this.searchQuery().trim();
    return idx + (hasQueryAll ? 1 : 0) + (hasEmptyOption ? 1 : 0);
  }

  protected toggleDropdown(): void {
    if (this.isDisabled()) return;
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    this.searchQuery.set('');
    this.highlightedIndex.set(0);
    if (this.triggerBtn?.nativeElement && typeof window !== 'undefined') {
      const rect = this.triggerBtn.nativeElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      this.dropUp.set(spaceBelow < 280 && spaceAbove > spaceBelow);
    } else {
      this.dropUp.set(false);
    }
    this.isOpen.set(true);
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 50);
  }

  close(): void {
    this.isOpen.set(false);
    this.onTouched();
    this.triggerBtn?.nativeElement.focus();
  }

  protected onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
    this.highlightedIndex.set(0);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.highlightedIndex.set(0);
    this.searchInput?.nativeElement.focus();
  }

  protected onClear(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.valueSignal.set('');
    this.customQuerySignal.set('');
    this.searchQuery.set('');
    this.onChange('');
    this.valueChange.emit('');
    this.querySubmit.emit({ query: '', matchedOptions: [], matchedValues: [] });
    this.search.emit('');
  }

  protected selectEmptyOption(): void {
    this.valueSignal.set('');
    this.customQuerySignal.set('');
    this.searchQuery.set('');
    this.onChange('');
    this.valueChange.emit('');
    this.search.emit('');
    this.close();
  }

  protected selectOption(option: SgSelectOption): void {
    if (option.disabled) return;
    this.valueSignal.set(option.value);
    this.customQuerySignal.set('');
    this.searchQuery.set('');
    this.onChange(option.value);
    this.valueChange.emit(option.value);
    this.search.emit(option.value);
    this.close();
  }

  protected submitCustomQuery(): void {
    const q = this.searchQuery().trim();
    if (!q) {
      this.selectEmptyOption();
      return;
    }
    const matches = this.filteredOptions();
    const matchedValues = matches.map((m) => m.value);

    // Nếu chỉ khớp đúng 1 option cụ thể, chọn luôn option đó
    if (matches.length === 1) {
      this.selectOption(matches[0]);
      return;
    }

    this.customQuerySignal.set(q);
    this.valueSignal.set('');
    this.onChange('');
    this.querySubmit.emit({
      query: q,
      matchedOptions: matches,
      matchedValues,
    });
    this.search.emit(q);
    this.close();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
      event.preventDefault();
      this.open();
    }
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    const hasQueryAll = this.allowCustomQuery && Boolean(this.searchQuery().trim());
    const hasEmptyOption = this.showEmptyOption && !this.searchQuery().trim();
    const totalItems = this.filteredOptions().length + (hasQueryAll ? 1 : 0) + (hasEmptyOption ? 1 : 0);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (totalItems > 0) {
        this.highlightedIndex.update((curr) => (curr + 1) % totalItems);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (totalItems > 0) {
        this.highlightedIndex.update((curr) => (curr - 1 + totalItems) % totalItems);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const hIdx = this.highlightedIndex();

      if (hasQueryAll && hIdx === 0) {
        this.submitCustomQuery();
        return;
      }

      if (hasEmptyOption && hIdx === 0) {
        this.selectEmptyOption();
        return;
      }

      const optionIndex = hIdx - (hasQueryAll ? 1 : 0) - (hasEmptyOption ? 1 : 0);
      if (optionIndex >= 0 && optionIndex < this.filteredOptions().length) {
        this.selectOption(this.filteredOptions()[optionIndex]);
      } else {
        this.submitCustomQuery();
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }

  writeValue(value: string): void {
    this.valueSignal.set(value ?? '');
    if (value) {
      this.customQuerySignal.set('');
    }
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
