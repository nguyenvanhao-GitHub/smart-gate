import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/i18n/i18n.service';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';

/**
 * Thanh điều hướng con của menu "Hệ thống" (theo submenu MH13): Quản trị người dùng ↔ Nhật ký hệ
 * thống. Menu chính do API trả là phẳng nên các màn quản trị nền tảng liên thông qua thanh này.
 */
@Component({
  selector: 'sg-admin-tabs',
  standalone: true,
  imports: [RouterLink, MatIconModule, HasPermissionDirective],
  template: `
    <nav class="admintabs" [attr.aria-label]="t('ui.admin.tabUsers')">
      <a class="admintab" [class.admintab--active]="active === 'users'" routerLink="/admin/users">
        <mat-icon fontSet="material-icons-round">group</mat-icon>{{ t('ui.admin.tabUsers') }}
      </a>
      <a
        class="admintab"
        [class.admintab--active]="active === 'roles'"
        routerLink="/admin/roles"
        *hasPermission="'system.view'"
      >
        <mat-icon fontSet="material-icons-round">admin_panel_settings</mat-icon>{{ t('ui.admin.tabRoles') }}
      </a>
      <a
        class="admintab"
        [class.admintab--active]="active === 'audit'"
        routerLink="/admin/audit"
        *hasPermission="'system.view'"
      >
        <mat-icon fontSet="material-icons-round">receipt_long</mat-icon>{{ t('ui.admin.tabAudit') }}
      </a>
    </nav>
  `,
  styles: [
    `
      .admintabs { display: flex; gap: var(--sg-space-2); margin-bottom: var(--sg-space-4); border-bottom: 1px solid var(--sg-border); }
      .admintab {
        display: inline-flex;
        align-items: center;
        gap: var(--sg-space-2);
        padding: var(--sg-space-3) var(--sg-space-4);
        color: var(--sg-text-muted);
        font-weight: 600;
        text-decoration: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }
      .admintab mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .admintab--active { color: var(--sg-primary); border-bottom-color: var(--sg-primary); }
    `,
  ],
})
export class AdminTabsComponent {
  @Input() active: 'users' | 'roles' | 'audit' = 'users';
  protected readonly t = inject(I18nService).t;
}
