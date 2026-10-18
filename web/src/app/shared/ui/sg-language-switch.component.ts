import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from 'src/app/core/i18n/i18n.service';

@Component({
  selector: 'sg-language-switch',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="lang-switch">
      <button
        type="button"
        class="lang-btn"
        [attr.aria-expanded]="isOpen()"
        [attr.title]="i18n.t('ui.locale.switch')"
        (click)="isOpen.set(!isOpen())"
      >
        <mat-icon fontSet="material-icons-round">language</mat-icon>
        <span>{{ i18n.shortName() }}</span>
        <mat-icon fontSet="material-icons-round" class="arrow">expand_more</mat-icon>
      </button>
      @if (isOpen()) {
        <div class="lang-menu">
          @for (option of i18n.options(); track option.code) {
            <button
              type="button"
              class="lang-item"
              [class.lang-item--active]="option.code === i18n.locale()"
              (click)="selectLanguage(option.code)"
            >
              <span class="code">{{ option.shortName }}</span>
              <span class="name">{{ option.name }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .lang-switch { position: relative; display: inline-block; }
    .lang-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 20px;
      color: #334155;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .lang-btn:hover { background: #f8fafc; border-color: #94a3b8; }
    .lang-btn mat-icon { font-size: 18px; width: 18px; height: 18px; color: #64748b; }
    .lang-btn .arrow { font-size: 16px; width: 16px; height: 16px; margin-left: -2px; }
    .lang-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 100;
      min-width: 140px;
      padding: 4px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
    }
    .lang-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #334155;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .lang-item:hover { background: #f1f5f9; }
    .lang-item--active { background: #eff6ff; color: #2563eb; font-weight: 600; }
    .lang-item .code {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 18px;
      border-radius: 4px;
      background: #e2e8f0;
      font-size: 11px;
      font-weight: 700;
      color: #475569;
    }
    .lang-item--active .code { background: #bfdbfe; color: #1d4ed8; }
  `],
})
export class SgLanguageSwitchComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly isOpen = signal(false);

  protected selectLanguage(code: string): void {
    this.i18n.setLocale(code);
    this.isOpen.set(false);
  }
}
