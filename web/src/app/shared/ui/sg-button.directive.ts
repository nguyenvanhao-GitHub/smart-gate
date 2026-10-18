import { Directive, Input, computed, signal } from '@angular/core';

export type SgButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type SgButtonSize = 'sm' | 'md' | 'lg';

/**
 * Nút bấm 4 cấp theo Design System Handoff.
 * Dùng trên phần tử gốc để giữ được `type="submit"`, `routerLink`, `disabled`...
 *
 *   <button sgButton>Lưu</button>
 *   <button sgButton="secondary" size="sm">Hủy</button>
 *   <a sgButton="tertiary" routerLink="/declarations">Xem danh sách</a>
 *
 * Style nằm ở `src/styles/_components.scss` (lớp .sg-btn) vì directive không mang style riêng.
 */
@Directive({
  selector: '[sgButton]',
  standalone: true,
  host: {
    '[class]': 'classes()',
  },
})
export class SgButtonDirective {
  private readonly variant = signal<SgButtonVariant>('primary');
  private readonly sizeValue = signal<SgButtonSize>('md');
  private readonly blockValue = signal(false);
  private readonly iconOnlyValue = signal(false);

  @Input()
  set sgButton(value: SgButtonVariant | '') {
    this.variant.set(value || 'primary');
  }

  @Input()
  set size(value: SgButtonSize) {
    this.sizeValue.set(value || 'md');
  }

  /** Nút chiếm trọn chiều ngang khối cha. */
  @Input()
  set block(value: boolean | '') {
    this.blockValue.set(value === '' ? true : !!value);
  }

  /** Nút vuông chỉ chứa icon. */
  @Input()
  set iconOnly(value: boolean | '') {
    this.iconOnlyValue.set(value === '' ? true : !!value);
  }

  protected readonly classes = computed(() => {
    const parts = ['sg-btn', `sg-btn--${this.variant()}`];
    if (this.sizeValue() !== 'md') parts.push(`sg-btn--${this.sizeValue()}`);
    if (this.blockValue()) parts.push('sg-btn--block');
    if (this.iconOnlyValue()) parts.push('sg-btn--icon');
    return parts.join(' ');
  });
}
