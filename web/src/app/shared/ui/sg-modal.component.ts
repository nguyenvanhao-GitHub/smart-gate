import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../core/i18n/i18n.service';

let modalSeq = 0;

export type SgModalSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Hộp thoại dùng chung — gom lớp nền + thân, bẫy tiêu điểm và đóng bằng phím Escape.
 *
 * Sửa dứt điểm nhóm cảnh báo trợ năng của các hộp thoại cũ: đóng bằng Esc
 * (`document:keydown.escape`), bấm nền để đóng, `role="dialog"` + `aria-modal` + `aria-labelledby`,
 * giữ tiêu điểm trong hộp và trả về phần tử mở khi đóng.
 *
 *   <sg-modal [title]="'Xóa hồ sơ'" (close)="target.set(null)">
 *     ...nội dung...
 *     <div modal-footer>
 *       <button sgButton="secondary" (click)="target.set(null)">Hủy</button>
 *       <button sgButton="danger" (click)="confirm()">Xóa</button>
 *     </div>
 *   </sg-modal>
 */
@Component({
  selector: 'sg-modal',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="sg-modal__backdrop" (pointerdown)="onBackdropPointerDown($event)">
      <section
        #panel
        class="sg-modal__panel"
        [class]="'sg-modal__panel--' + size"
        [class.sg-modal__panel--tall]="tall"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        [attr.aria-labelledby]="title ? titleId : null"
        [attr.aria-label]="title ? null : ariaLabel || null"
        (keydown)="onKeydown($event)"
      >
        <header class="sg-modal__head">
          <div class="sg-modal__titles">
            @if (eyebrow) { <p class="sg-modal__eyebrow">{{ eyebrow }}</p> }
            <h2 class="sg-modal__title" [id]="titleId">{{ title }}</h2>
          </div>
          <button type="button" class="sg-modal__close" [attr.aria-label]="t('ui.common.close')" (click)="close.emit()">
            <mat-icon fontSet="material-icons-round">close</mat-icon>
          </button>
        </header>

        <div class="sg-modal__body" [class.sg-modal__body--grid]="bodyGrid"><ng-content /></div>

        @if (footer) {
          <footer class="sg-modal__foot"><ng-content select="[modal-footer]" /></footer>
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host { display: contents; }
      .sg-modal__backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        place-items: center;
        padding: var(--sg-space-5);
        background: var(--sg-overlay);
      }
      .sg-modal__panel {
        width: min(560px, 100%);
        max-height: calc(100vh - 80px);
        display: flex;
        flex-direction: column;
        background: var(--sg-bg-surface);
        border-radius: var(--sg-radius-card);
        box-shadow: var(--sg-shadow-modal);
        overflow: hidden;
        outline: none;
      }
      .sg-modal__panel--sm { width: min(480px, 100%); }
      .sg-modal__panel--md { width: min(560px, 100%); }
      .sg-modal__panel--lg { width: min(720px, 100%); }
      .sg-modal__panel--xl { width: min(920px, 100%); }
      .sg-modal__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-3);
        padding: var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
      }
      .sg-modal__titles { min-width: 0; }
      .sg-modal__eyebrow { margin: 0 0 var(--sg-space-1); color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .sg-modal__title { margin: 0; font-size: var(--sg-h3-size); }
      .sg-modal__close {
        display: inline-grid;
        place-items: center;
        width: 30px;
        min-width: 30px;
        height: 30px;
        min-height: 30px;
        padding: 0;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text-muted);
        cursor: pointer;
      }
      .sg-modal__close:hover { background: var(--sg-bg-muted); color: var(--sg-primary); }
      .sg-modal__close mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .sg-modal__body { padding: var(--sg-space-4); overflow-y: auto; }
      .sg-modal__body--grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sg-space-3) var(--sg-space-4); }
      .sg-modal__foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--sg-space-3);
        padding: var(--sg-space-4) var(--sg-space-5) var(--sg-space-5);
        border-top: 1px solid var(--sg-border);
      }
      :host ::ng-deep .sg-modal__foot :where([modal-footer]:not(button):not(a)) {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--sg-space-3);
        width: 100%;
      }
      @media (max-width: 640px) {
        .sg-modal__body--grid { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class SgModalComponent implements AfterViewInit, OnDestroy {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  @Input() title = '';
  @Input() eyebrow = '';
  /** Nhãn trợ năng khi không có tiêu đề chữ. */
  @Input() ariaLabel = '';
  @Input() size: SgModalSize = 'md';
  /** Thân dạng lưới 2 cột (biểu mẫu nhiều trường). */
  @Input() bodyGrid = false;
  /** Có hiện chân hộp thoại hay không — tắt cho hộp chỉ xem. */
  @Input() footer = true;
  /** Cho thân cao kịch trần màn hình (bảng dài). */
  @Input() tall = false;

  @Output() close = new EventEmitter<void>();

  @ViewChild('panel') private readonly panel?: ElementRef<HTMLElement>;

  protected readonly titleId = `sg-modal-title-${++modalSeq}`;
  private previouslyFocused: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    const target = this.firstFocusable() ?? this.panel?.nativeElement;
    target?.focus();
  }

  ngOnDestroy(): void {
    // Trả tiêu điểm về phần tử đã mở hộp thoại (thường là nút vừa bấm).
    this.previouslyFocused?.focus?.();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close.emit();
  }

  protected onBackdropPointerDown(event: PointerEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusables = this.focusableElements();
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && active === last) {
      first.focus();
      event.preventDefault();
    }
  }

  private focusableElements(): HTMLElement[] {
    const root = this.panel?.nativeElement;
    if (!root) return [];
    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );
  }

  private firstFocusable(): HTMLElement | null {
    return this.focusableElements()[0] ?? null;
  }
}
