import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { PERMISSION, ROLE_DESC_KEYS, ROLE_LABEL_KEYS } from '../../../core/auth/access-control.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ApiService, PermissionDefinition, RoleSummary } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';

interface MatrixRow {
  module: string;
  label: string;
  /** action -> mã quyền (rỗng nếu phân hệ không có hành động đó). */
  cells: Record<string, string>;
}

interface RoleForm {
  id: string;
  code: string;
  name: string;
  description: string;
}

const EMPTY_ROLE_FORM: RoleForm = { id: '', code: '', name: '', description: '' };

/** Mã vai trò: chữ in HOA, số và gạch dưới, bắt đầu bằng chữ cái. */
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const ROLE_CODE_MAX = 50;

/**
 * Biểu tượng gợi nhớ cho vai trò, tra CỨNG theo MÃ ASCII của vai trò (không suy từ tên tiếng Việt —
 * tên là dữ liệu quản trị tự sửa, còn mã là định danh trong tập đóng). Vai trò động có mã lạ sẽ rơi
 * về `DEFAULT_ROLE_ICON` trung tính. `tone` chọn trong bộ màu cục bộ khai ở `:host`.
 */
const ROLE_ICONS: Record<string, { icon: string; tone: string }> = {
  SYS_ADMIN: { icon: 'shield', tone: 'purple' },
  ENTERPRISE: { icon: 'business', tone: 'amber' },
  BORDER_GUARD: { icon: 'security', tone: 'green' },
  CUSTOMS: { icon: 'fact_check', tone: 'blue' },
  QUARANTINE: { icon: 'health_and_safety', tone: 'green' },
  DISPATCHER: { icon: 'alt_route', tone: 'blue' },
  YARD_MANAGER: { icon: 'local_parking', tone: 'purple' },
  FEE_COLLECTOR: { icon: 'payments', tone: 'red' },
  MANAGEMENT: { icon: 'account_tree', tone: 'purple' },
  GATE_OFFICER: { icon: 'meeting_room', tone: 'neutral' },
  INDIVIDUAL: { icon: 'badge', tone: 'neutral' },
};
const DEFAULT_ROLE_ICON = { icon: 'badge', tone: 'neutral' };

/** Mã vai trò siêu quản trị — nguồn sự thật cho phân quyền vẫn ở BE; đây chỉ để vô hiệu nút (BUG-059). */
const SYS_ADMIN_ROLE_CODE = 'SYS_ADMIN';

/**
 * Bộ quyền quản trị cốt lõi mà SYS_ADMIN bắt buộc giữ — khớp `SYS_ADMIN_CORE_PERMISSIONS` phía api.
 * Thiếu bất kỳ mã nào thì không còn ai quản trị được hệ thống, nên FE chặn "Bỏ tất cả" và "Lưu".
 */
const SYS_ADMIN_CORE_PERMISSIONS: string[] = [
  PERMISSION.systemView,
  PERMISSION.systemCreate,
  PERMISSION.systemUpdate,
  PERMISSION.systemDelete,
];

/**
 * UI-07 (F03) Quản lý vai trò & phân quyền — màn RIÊNG, tách khỏi UI-13 quản trị người dùng.
 * Gồm: danh sách vai trò (tạo/sửa/xóa, chặn xóa vai trò hệ thống hoặc đang có người dùng) ·
 * ma trận phân quyền phân hệ × hành động (60 quyền) cho vai trò đang chọn, lưu qua `setRolePermissions`.
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    HasPermissionDirective,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgSearchInputComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.admin.roleMgmtTitle') }}</h1>
        <p>{{ t('ui.admin.roleMgmtSubtitle') }}</p>
      </div>
      <button type="button" sgButton *hasPermission="'system.create'" (click)="openRoleForm()">
        <mat-icon fontSet="material-icons-round">add</mat-icon>{{ t('ui.admin.addRole') }}
      </button>
    </section>

    <div class="stats">
      <div class="stat">
        <span class="stat__ico stat__ico--blue"><mat-icon fontSet="material-icons-round">shield</mat-icon></span>
        <div><div class="stat__num">{{ roles().length }}</div><div class="stat__label">{{ t('ui.admin.roleStatTotal') }}</div></div>
      </div>
      <div class="stat">
        <span class="stat__ico stat__ico--purple"><mat-icon fontSet="material-icons-round">toggle_on</mat-icon></span>
        <div><div class="stat__num">{{ activeRoleCount() }}</div><div class="stat__label">{{ t('ui.admin.roleStatActive') }}</div></div>
      </div>
      <div class="stat">
        <span class="stat__ico stat__ico--green"><mat-icon fontSet="material-icons-round">group</mat-icon></span>
        <div><div class="stat__num">{{ assignedUserCount() }}</div><div class="stat__label">{{ t('ui.admin.roleStatUsers') }}</div></div>
      </div>
    </div>

    <div class="layout">
      <!-- Danh sách vai trò -->
      <sg-card [title]="t('ui.admin.rolesTitle')" [subtitle]="t('ui.admin.rolesSubtitle')">
        <sg-search-input
          class="roles__search"
          [placeholder]="t('ui.admin.roleSearchPlaceholder')"
          [ariaLabel]="t('ui.admin.roleSearchAria')"
          [value]="roleKeyword()"
          (valueChange)="roleKeyword.set($event)"
        />

        <div class="roles__filters">
          <sg-select
            [ariaLabel]="t('ui.admin.roleFilterType')"
            [placeholder]="t('ui.admin.roleFilterTypeAll')"
            [options]="roleTypeOptions()"
            [value]="roleTypeFilter()"
            (valueChange)="roleTypeFilter.set($event)"
          />
          <sg-select
            [ariaLabel]="t('ui.admin.roleFilterStatus')"
            [placeholder]="t('ui.admin.roleFilterStatusAll')"
            [options]="roleStatusOptions()"
            [value]="roleStatusFilter()"
            (valueChange)="roleStatusFilter.set($event)"
          />
        </div>

        @if (rolesError()) {
          <sg-alert type="error" [message]="rolesError()" />
        }

        @if (rolesLoading()) {
          <p class="state">{{ t('ui.admin.rolesLoading') }}</p>
        } @else if (!filteredRoles().length) {
          <p class="state">
            {{ hasRoleFilters() ? t('ui.admin.rolesNoMatch') : t('ui.admin.rolesEmpty') }}
          </p>
        } @else {
          <ul class="roles">
            @for (role of filteredRoles(); track role.id) {
              <li class="roles__item" [class.roles__item--active]="role.id === selectedRoleId()">
                <button type="button" class="roles__pick" [attr.aria-pressed]="role.id === selectedRoleId()" (click)="selectRole(role.id)">
                  <span class="roles__ico" [class]="'roles__ico--' + roleIconTone(role.code)">
                    <mat-icon fontSet="material-icons-round">{{ roleIcon(role.code) }}</mat-icon>
                  </span>
                  <span class="roles__body">
                    <span class="roles__name">
                      <strong>{{ roleName(role) }}</strong>
                      @if (role.isSystem) { <span class="tag">{{ t('ui.admin.systemRole') }}</span> }
                      <!-- BUG-080: vai trò đang hoạt động cũng có badge trạng thái, khớp nhãn bộ lọc "Đang hoạt động". -->
                      @if (role.isActive) {
                        <span class="tag tag--active">{{ t('ui.admin.roleActiveBadge') }}</span>
                      } @else {
                        <span class="tag tag--locked">{{ t('ui.admin.roleLockedBadge') }}</span>
                      }
                    </span>
                    <span class="roles__meta">
                      <em>{{ role.code }}</em>
                      <span class="roles__count">
                        <mat-icon fontSet="material-icons-round">group</mat-icon>{{ t('ui.admin.roleUserCount', { count: role.userCount }) }}
                      </span>
                    </span>
                    @if (roleDescription(role)) {
                      <span class="roles__desc">{{ roleDescription(role) }}</span>
                    }
                    <!-- Phạm vi quyền chỉ hiện ở vai trò đang chọn — chỉ vai trò này mới có sẵn danh sách
                         quyền đã cấp (grantedCodes) tải từ getRolePermissions; không gọi thêm API cho vai trò khác. -->
                    @if (role.id === selectedRoleId() && scopeTotal()) {
                      <span class="roles__scope">
                        <span class="roles__scope-head">
                          <span>{{ t('ui.admin.roleScope') }}</span>
                          <span>{{ scopeGranted() }}/{{ scopeTotal() }} {{ t('ui.admin.permissionUnit') }}</span>
                        </span>
                        <span class="roles__scope-bar"><span [style.width.%]="scopePercent()"></span></span>
                      </span>
                    }
                  </span>
                </button>
                <span class="roles__actions">
                  <!-- BUG-081: vai trò hệ thống không được sửa (BE cũng chặn) → vô hiệu nút Sửa; bọc span để
                       tooltip vẫn hiện khi nút bị vô hiệu. -->
                  <span *hasPermission="'system.update'" [title]="role.isSystem ? t('ui.admin.roleSystemCannotEdit') : t('ui.admin.editRole')">
                    <button type="button" class="iconbtn" [disabled]="role.isSystem" (click)="openRoleForm(role)">
                      <mat-icon fontSet="material-icons-round">edit</mat-icon>
                    </button>
                  </span>
                  <!-- Khóa / mở khóa vai trò (F03). Vai trò hệ thống không được khóa → nút Khóa bị vô hiệu;
                       vai trò đã khóa hiện nút Mở khóa. Bọc span để tooltip vẫn hiện khi nút bị vô hiệu. -->
                  @if (role.isActive) {
                    <span *hasPermission="'system.update'" [title]="role.isSystem ? t('ui.admin.roleSystemCannotLock') : t('ui.admin.lockRole')">
                      <button
                        type="button"
                        class="iconbtn iconbtn--danger"
                        [disabled]="role.isSystem"
                        [attr.aria-label]="t('ui.admin.lockRoleAria', { name: roleName(role) })"
                        (click)="openLockRole(role)"
                      >
                        <mat-icon fontSet="material-icons-round">lock</mat-icon>
                      </button>
                    </span>
                  } @else {
                    <button
                      type="button"
                      class="iconbtn"
                      *hasPermission="'system.update'"
                      [title]="t('ui.admin.unlockRole')"
                      [attr.aria-label]="t('ui.admin.unlockRoleAria', { name: roleName(role) })"
                      (click)="openLockRole(role)"
                    >
                      <mat-icon fontSet="material-icons-round">lock_open</mat-icon>
                    </button>
                  }
                  <!-- Bọc bằng span để tooltip vẫn hiện khi nút bị vô hiệu. -->
                  <span *hasPermission="'system.delete'" [title]="deleteRoleTooltip(role)">
                    <button
                      type="button"
                      class="iconbtn iconbtn--danger"
                      [disabled]="!!deleteRoleBlockReason(role)"
                      [attr.aria-label]="t('ui.admin.deleteRoleAria', { name: roleName(role) })"
                      (click)="openDeleteRole(role)"
                    >
                      <mat-icon fontSet="material-icons-round">delete</mat-icon>
                    </button>
                  </span>
                </span>
              </li>
            }
          </ul>
        }
      </sg-card>

      <!-- Ma trận phân quyền -->
      <sg-card [title]="t('ui.admin.matrixTitle')" [subtitle]="t('ui.admin.matrixSubtitle')">
        <div class="matrix__head">
          <div class="matrix__role">
            <span class="matrix__quick-label">{{ t('ui.admin.selectedRole') }}</span>
            @if (selectedRole(); as role) {
              <strong>{{ roleName(role) }}</strong>
              <em>{{ role.code }}</em>
            } @else {
              <span class="muted">{{ t('ui.admin.noRoleSelected') }}</span>
            }
          </div>
          <div class="matrix__quick">
            <span class="matrix__quick-label">{{ t('ui.admin.quickActions') }}</span>
            <div>
              <button type="button" sgButton="secondary" size="sm" [disabled]="!selectedRoleId()" (click)="grantAll(true)">{{ t('ui.admin.grantAll') }}</button>
              <button type="button" sgButton="secondary" size="sm" [disabled]="!selectedRoleId() || isSysAdminSelf()" (click)="grantAll(false)">{{ t('ui.admin.revokeAll') }}</button>
            </div>
          </div>
        </div>

        @if (matrixError()) {
          <sg-alert type="error" [message]="matrixError()" />
        }

        @if (matrixLoading()) {
          <p class="state">{{ t('ui.admin.matrixLoading') }}</p>
        } @else if (!matrixRows().length) {
          <p class="state">{{ t('ui.admin.matrixEmpty') }}</p>
        } @else {
          <div class="sg-scroll-x">
            <table class="grid matrix">
              <thead>
                <tr>
                  <th>{{ t('ui.admin.colModule') }}</th>
                  @for (action of matrixActions(); track action.code) {
                    <th>
                      <label class="matrix__check-label matrix__check-label--center" [title]="t('ui.admin.selectAll') + ' ' + action.label">
                        <input
                          type="checkbox"
                          [checked]="isActionAllGranted(action.code)"
                          [disabled]="!selectedRoleId() || (isSysAdminSelf() && isActionAllGranted(action.code))"
                          [attr.aria-label]="action.label"
                          (change)="toggleActionPermissions(action.code, $event)"
                        />
                        <span>{{ action.label }}</span>
                      </label>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of matrixRows(); track row.module) {
                  <tr>
                    <td class="matrix__module">
                      <label class="matrix__check-label matrix__check-label--left" [title]="t('ui.admin.selectAll') + ' ' + row.label">
                        <input
                          type="checkbox"
                          [checked]="isRowAllGranted(row)"
                          [disabled]="!selectedRoleId()"
                          [attr.aria-label]="row.label"
                          (change)="toggleRowPermissions(row, $event)"
                        />
                        <span>{{ row.label }}</span>
                      </label>
                    </td>
                    @for (action of matrixActions(); track action.code) {
                      <td>
                        @if (row.cells[action.code]) {
                          <input
                            type="checkbox"
                            [checked]="hasGranted(row.cells[action.code])"
                            [disabled]="!selectedRoleId()"
                            [attr.aria-label]="row.label + ' - ' + action.label"
                            (change)="toggleGrant(row.cells[action.code])"
                          />
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (isSysAdminSelf()) {
          <sg-alert class="selflock" type="warning" [message]="t('ui.admin.sysAdminSelfLockHint')" />
        }

        <div card-footer class="matrix__foot">
          <span class="muted">{{ t('ui.admin.matrixNote') }}</span>
          <button
            type="button"
            sgButton
            *hasPermission="'system.update'"
            [disabled]="!selectedRoleId() || savingMatrix() || sysAdminCoreMissing()"
            (click)="saveMatrix()"
          >
            {{ savingMatrix() ? t('ui.common.saving') : t('ui.admin.saveMatrix') }}
          </button>
        </div>
      </sg-card>
    </div>

    <!-- Modal: thêm/sửa vai trò -->
    @if (roleFormOpen()) {
      <sg-modal size="sm" [title]="roleForm.id ? t('ui.admin.roleFormEdit') : t('ui.admin.roleFormNew')" (close)="closeRoleForm()">
        @if (roleFormError()) { <sg-alert type="error" [message]="roleFormError()" /> }
        <div class="modal__stack">
          <sg-form-field
            [label]="t('ui.admin.roleCode')"
            [required]="true"
            [error]="roleCodeError()"
            [hint]="t('ui.admin.roleCodeHint')"
          >
            <input
              name="roleCode"
              [ngModel]="roleForm.code"
              (ngModelChange)="setRoleCode($event)"
              [disabled]="!!roleForm.id"
              [placeholder]="t('ui.admin.roleCodePlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
          </sg-form-field>
          <sg-form-field [label]="t('ui.admin.roleName')" [required]="true" [error]="roleNameError()">
            <input name="roleName" [(ngModel)]="roleForm.name" [placeholder]="t('ui.admin.roleNamePlaceholder')" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.common.description')">
            <textarea rows="3" [(ngModel)]="roleForm.description" [placeholder]="t('ui.admin.roleDescPlaceholder')"></textarea>
          </sg-form-field>
        </div>
        <button modal-footer type="button" sgButton="secondary" (click)="closeRoleForm()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton [disabled]="savingRole()" (click)="saveRole()">{{ savingRole() ? t('ui.common.saving') : t('ui.admin.saveRole') }}</button>
      </sg-modal>
    }

    <!-- Modal: xác nhận xóa vai trò -->
    @if (roleDeleteTarget(); as target) {
      <sg-modal size="sm" [title]="t('ui.admin.deleteRoleTitle')" (close)="roleDeleteTarget.set(null)">
        <p class="modal__desc">{{ t('ui.admin.deleteRoleDesc', { name: roleName(target), code: target.code }) }}</p>
        <button modal-footer type="button" sgButton="secondary" (click)="roleDeleteTarget.set(null)">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton="danger" [disabled]="savingRole()" (click)="confirmDeleteRole()">
          {{ savingRole() ? t('ui.common.deleting') : t('ui.dossier.confirmDelete') }}
        </button>
      </sg-modal>
    }

    <!-- Modal: xác nhận khóa / mở khóa vai trò -->
    @if (roleLockTarget(); as target) {
      <sg-modal
        size="sm"
        [title]="target.isActive ? t('ui.admin.lockRoleTitle') : t('ui.admin.unlockRoleTitle')"
        (close)="roleLockTarget.set(null)"
      >
        <p class="modal__desc">
          @if (target.isActive) {
            {{ t('ui.admin.lockRoleDesc', { name: roleName(target), code: target.code, count: target.userCount }) }}
          } @else {
            {{ t('ui.admin.unlockRoleDesc', { name: roleName(target), code: target.code }) }}
          }
        </p>
        <button modal-footer type="button" sgButton="secondary" (click)="roleLockTarget.set(null)">{{ t('ui.common.cancelAction') }}</button>
        <button
          modal-footer
          type="button"
          [sgButton]="target.isActive ? 'danger' : 'primary'"
          [disabled]="togglingLock()"
          (click)="confirmToggleLock()"
        >
          {{ togglingLock() ? t('ui.common.saving') : (target.isActive ? t('ui.admin.confirmLockRole') : t('ui.admin.confirmUnlockRole')) }}
        </button>
      </sg-modal>
    }
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ mẫu role-management.html; khoanh trong :host, không đụng token --sg-* toàn cục. */
      :host {
        display: block;
        --blue-600: #2f6fed;
        --blue-50: #eef3fe;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --purple-600: #7c5cf0;
        --purple-50: #f1edfe;
        --amber-600: #e0a72e;
        --amber-50: #fbf3e2;
        --red-600: #e5484d;
        --red-50: #fdeced;
        --ink-900: #152040;
        --ink-500: #7885a3;
      }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .head h1 { margin: 0; color: var(--ink-900); }
      .head p { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); }
      .feedback { display: block; margin-bottom: var(--sg-space-3); }

      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sg-space-3); margin: var(--sg-space-3) 0; }
      .stat {
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border: 1px solid var(--sg-border);
        border-radius: 14px;
        background: var(--sg-bg-surface);
      }
      .stat__ico { display: inline-grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; flex: 0 0 auto; }
      .stat__ico mat-icon { width: 20px; height: 20px; font-size: 20px; }
      .stat__ico--blue { background: var(--blue-50); color: var(--blue-600); }
      .stat__ico--purple { background: var(--purple-50); color: var(--purple-600); }
      .stat__ico--green { background: var(--green-50); color: var(--green-600); }
      .stat__num { font-size: var(--sg-h3-size); font-weight: 700; line-height: 1.2; color: var(--ink-900); }
      .stat__label { font-size: var(--sg-small-size); color: var(--sg-text-muted); }
      @media (max-width: 720px) { .stats { grid-template-columns: 1fr; } }

      .layout { display: grid; grid-template-columns: minmax(340px, .95fr) minmax(0, 1.6fr); gap: var(--sg-space-3); align-items: start; }

      .grid { width: 100%; border-collapse: collapse; background: var(--sg-bg-surface); }
      .grid th, .grid td { padding: var(--sg-space-2) var(--sg-space-3); border-bottom: 1px solid var(--sg-border); text-align: left; vertical-align: middle; }
      .grid th { background: var(--sg-bg-subtle); font-size: var(--sg-small-size); text-transform: uppercase; letter-spacing: .02em; }
      .state { padding: var(--sg-space-8); text-align: center; color: var(--sg-text-muted); }
      .muted { color: var(--sg-text-muted); }

      .iconbtn {
        display: inline-grid;
        place-items: center;
        width: 30px;
        min-width: 30px;
        height: 30px;
        min-height: 30px;
        margin-left: 2px;
        padding: 0;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text-muted);
        cursor: pointer;
      }
      .iconbtn:hover { background: var(--sg-bg-muted); color: var(--sg-primary); }
      .iconbtn mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .iconbtn--danger:hover { color: var(--sg-danger); }
      .iconbtn:disabled { color: var(--sg-border-strong); cursor: not-allowed; }
      .iconbtn:disabled:hover { background: transparent; color: var(--sg-border-strong); }

      .roles__search { display: block; margin-bottom: var(--sg-space-2); }
      .roles__filters { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sg-space-2); margin-bottom: var(--sg-space-3); }
      .roles { display: grid; gap: var(--sg-space-1); margin: 0; padding: 0; max-height: 520px; overflow-y: auto; list-style: none; }
      .roles__item {
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-1);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius);
      }
      .roles__item--active { border-color: var(--sg-primary); background: var(--sg-primary-soft); }
      .roles__pick {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-2);
        min-height: 0;
        padding: var(--sg-space-2) var(--sg-space-3);
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text);
        font-weight: 400;
        text-align: left;
        white-space: normal;
        cursor: pointer;
      }
      .roles__pick:hover { background: var(--sg-bg-subtle); }
      .roles__item--active .roles__pick:hover { background: transparent; }
      .roles__ico { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; flex: 0 0 auto; }
      .roles__ico mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .roles__ico--blue { background: var(--blue-50); color: var(--blue-600); }
      .roles__ico--green { background: var(--green-50); color: var(--green-600); }
      .roles__ico--purple { background: var(--purple-50); color: var(--purple-600); }
      .roles__ico--amber { background: var(--amber-50); color: var(--amber-600); }
      .roles__ico--red { background: var(--red-50); color: var(--red-600); }
      .roles__ico--neutral { background: var(--sg-neutral-soft); color: var(--sg-text-muted); }
      .roles__body { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
      .roles__name { display: flex; align-items: center; gap: var(--sg-space-2); min-width: 0; }
      .roles__name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .roles__meta { display: flex; align-items: center; gap: var(--sg-space-3); color: var(--sg-text-muted); font-size: var(--sg-caption-size); }
      .roles__meta em { font-style: normal; font-weight: 700; }
      .roles__count { display: inline-flex; align-items: center; gap: 3px; }
      .roles__count mat-icon { width: 14px; height: 14px; font-size: 14px; }
      .roles__desc { color: var(--sg-text-muted); font-size: var(--sg-small-size); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .roles__scope { display: grid; gap: 3px; margin-top: 4px; }
      .roles__scope-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sg-space-2); font-size: var(--sg-caption-size); color: var(--sg-text-muted); }
      .roles__scope-bar { height: 6px; border-radius: 4px; background: var(--sg-border); overflow: hidden; }
      .roles__scope-bar > span { display: block; height: 100%; background: var(--blue-600); border-radius: 4px; transition: width .2s ease; }
      .roles__actions { display: flex; align-items: center; flex: 0 0 auto; padding: var(--sg-space-1); }
      .tag {
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-neutral-soft);
        color: var(--sg-text-muted);
        font-size: var(--sg-caption-size);
        font-weight: 700;
      }
      .tag--locked { background: var(--red-50); color: var(--red-600); }
      .tag--active { background: var(--green-50); color: var(--green-600); }

      .matrix__head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .matrix__role { display: grid; gap: 2px; min-width: 0; }
      .matrix__role strong { font-size: var(--sg-h3-size); }
      .matrix__role em { font-style: normal; color: var(--sg-text-muted); font-size: var(--sg-caption-size); font-weight: 700; }
      .matrix__quick div { display: flex; align-items: center; gap: var(--sg-space-2); }
      .matrix__select-all-btn { display: inline-flex; align-items: center; gap: var(--sg-space-1); font-size: var(--sg-small-size); font-weight: 600; cursor: pointer; user-select: none; margin-right: 4px; }
      .matrix__check-label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-weight: inherit; }
      .matrix__check-label--left { display: flex; width: 100%; justify-content: flex-start; }
      .matrix__check-label--left input { flex: 0 0 auto; margin-right: 2px; }
      .matrix__check-label--left span { flex: 1 1 auto; text-align: left; }
      .matrix__check-label--center { justify-content: center; }
      .matrix { min-width: 520px; }
      .matrix th, .matrix td { text-align: center; vertical-align: middle; }
      .matrix th:first-child, .matrix__module { text-align: left; padding-left: var(--sg-space-3); }
      .matrix input { width: 16px; height: 16px; min-height: 16px; margin: 0; padding: 0; accent-color: var(--blue-600); cursor: pointer; }
      .matrix__foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
        font-size: var(--sg-small-size);
      }
      .selflock { display: block; margin-top: var(--sg-space-3); }

      .modal__stack { display: grid; gap: var(--sg-space-3); }
      .modal__desc { margin: 0 0 var(--sg-space-3); color: var(--sg-text-muted); }
      textarea { resize: vertical; }

      @media (max-width: 1100px) {
        .layout { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class RoleManagementPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;
  private readonly appMessages = inject(AppMessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Tên vai trò hiển thị song ngữ:
   * - Nếu có mã trong ROLE_LABEL_KEYS và (là vai trò hệ thống HOẶC đang ở giao diện tiếng Anh): dùng nhãn i18n tương ứng.
   * - Nếu là vai trò tùy chỉnh: giữ nguyên `role.name` nhập từ DB.
   */
  protected roleName(role: RoleSummary | null | undefined): string {
    if (!role) return '';
    if (this.i18n.locale() === 'en') {
      const key = ROLE_LABEL_KEYS[role.code];
      if (key) {
        const translated = this.t(key);
        if (translated) return translated;
      }
    }
    return role.name;
  }

  /**
   * Mô tả vai trò hiển thị song ngữ:
   * - Khi ở giao diện tiếng Anh (locale = 'en') và có mã trong ROLE_DESC_KEYS: dùng mô tả i18n tương ứng.
   * - Khi ở tiếng Việt hoặc là vai trò tùy chỉnh: giữ nguyên `role.description` từ cơ sở dữ liệu.
   */
  protected roleDescription(role: RoleSummary | null | undefined): string {
    if (!role) return '';
    if (this.i18n.locale() === 'en') {
      const key = ROLE_DESC_KEYS[role.code];
      if (key) {
        const translated = this.t(key);
        if (translated) return translated;
      }
    }
    return role.description || '';
  }

  // --- Danh sách vai trò -----------------------------------------------------
  protected readonly roles = signal<RoleSummary[]>([]);
  protected readonly rolesLoading = signal(false);
  protected readonly rolesError = signal('');
  protected readonly roleKeyword = signal('');
  /** Bộ lọc phía FE (dữ liệu vai trò đã tải sẵn): loại vai trò và trạng thái hoạt động. */
  protected readonly roleTypeFilter = signal('');
  protected readonly roleStatusFilter = signal('');
  protected readonly roleFormOpen = signal(false);
  protected readonly savingRole = signal(false);
  protected readonly roleFormError = signal('');
  protected readonly roleCodeError = signal('');
  protected readonly roleNameError = signal('');
  protected readonly roleDeleteTarget = signal<RoleSummary | null>(null);
  protected readonly roleLockTarget = signal<RoleSummary | null>(null);
  protected readonly togglingLock = signal(false);
  protected roleForm: RoleForm = { ...EMPTY_ROLE_FORM };

  /** Số vai trò đang hoạt động — thẻ thống kê ở đầu trang. */
  protected readonly activeRoleCount = computed(() => this.roles().filter((role) => role.isActive).length);
  /** Tổng số tài khoản được gán vai trò — cộng dồn `userCount` các vai trò. */
  protected readonly assignedUserCount = computed(() => this.roles().reduce((sum, role) => sum + role.userCount, 0));

  // Danh mục cho 2 ô lọc — mã ASCII trong tập đóng, nhãn tra i18n; là `computed` nên đổi ngôn ngữ vẽ lại ngay.
  protected readonly roleTypeOptions = computed<SgSelectOption[]>(() => [
    { value: 'system', label: this.t('ui.admin.roleTypeSystem') },
    { value: 'custom', label: this.t('ui.admin.roleTypeCustom') },
  ]);
  protected readonly roleStatusOptions = computed<SgSelectOption[]>(() => [
    { value: 'active', label: this.t('ui.admin.roleStatusActive') },
    { value: 'locked', label: this.t('ui.admin.roleStatusLocked') },
  ]);

  /** Có đang áp bộ lọc nào không — để phân biệt "không khớp bộ lọc" với "chưa có vai trò". */
  protected readonly hasRoleFilters = computed(
    () => !!this.roleKeyword().trim() || !!this.roleTypeFilter() || !!this.roleStatusFilter(),
  );

  protected readonly filteredRoles = computed(() => {
    const keyword = this.roleKeyword().trim().toLowerCase();
    const type = this.roleTypeFilter();
    const status = this.roleStatusFilter();
    return this.roles().filter((role) => {
      const name = this.roleName(role);
      const desc = this.roleDescription(role);
      if (keyword && !`${role.name} ${role.code} ${name} ${role.description ?? ''} ${desc}`.toLowerCase().includes(keyword)) return false;
      if (type === 'system' && !role.isSystem) return false;
      if (type === 'custom' && role.isSystem) return false;
      if (status === 'active' && !role.isActive) return false;
      if (status === 'locked' && role.isActive) return false;
      return true;
    });
  });

  // --- Ma trận phân quyền ----------------------------------------------------
  protected readonly permissionCatalog = signal<PermissionDefinition[]>([]);
  protected readonly selectedRoleId = signal('');
  protected readonly selectedRole = computed(() => this.roles().find((role) => role.id === this.selectedRoleId()) ?? null);
  protected readonly grantedCodes = signal<string[]>([]);
  protected readonly matrixLoading = signal(false);
  protected readonly savingMatrix = signal(false);
  protected readonly matrixError = signal('');

  // Phạm vi quyền của vai trò ĐANG CHỌN — tính thuần FE từ dữ liệu đã tải:
  // số quyền đã cấp (grantedCodes) trên tổng số quyền trong danh mục (permissionCatalog).
  protected readonly scopeTotal = computed(() => this.permissionCatalog().length);
  protected readonly scopeGranted = computed(() => this.grantedCodes().length);
  protected readonly scopePercent = computed(() => {
    const total = this.scopeTotal();
    return total ? Math.round((this.scopeGranted() / total) * 100) : 0;
  });

  // BUG-059: chống tự khóa hệ thống. Khi vai trò đang chọn là SYS_ADMIN và chính người đăng nhập mang
  // vai trò đó, không cho "Bỏ tất cả" và không cho "Lưu" nếu ma trận thiếu quyền quản trị cốt lõi.
  // (BE vẫn là nguồn sự thật — trả 400 nếu lách qua; đây chỉ vô hiệu nút cho êm tay.)
  protected readonly isSysAdminSelf = computed(() => {
    const role = this.selectedRole();
    return !!role && role.code === SYS_ADMIN_ROLE_CODE && this.auth.roleCodes().includes(SYS_ADMIN_ROLE_CODE);
  });
  protected readonly sysAdminCoreMissing = computed(() => {
    if (!this.isSysAdminSelf()) return false;
    const granted = this.grantedCodes();
    return SYS_ADMIN_CORE_PERMISSIONS.some((code) => !granted.includes(code));
  });

  protected readonly matrixActions = computed(() => {
    const seen = new Map<string, { code: string; label: string; order: number }>();
    this.permissionCatalog().forEach((item) => {
      if (!seen.has(item.action)) seen.set(item.action, { code: item.action, label: item.actionLabel, order: item.sortOrder });
    });
    return [...seen.values()].sort((a, b) => a.order - b.order);
  });

  protected readonly matrixRows = computed<MatrixRow[]>(() => {
    const rows = new Map<string, MatrixRow>();
    const order = new Map<string, number>();
    this.permissionCatalog().forEach((item) => {
      if (!rows.has(item.module)) {
        rows.set(item.module, { module: item.module, label: item.moduleLabel, cells: {} });
        order.set(item.module, item.sortOrder);
      }
      rows.get(item.module)!.cells[item.action] = item.code;
    });
    return [...rows.values()].sort((a, b) => (order.get(a.module) ?? 0) - (order.get(b.module) ?? 0));
  });

  ngOnInit(): void {
    // Nạp vai trò trước rồi mới nạp danh mục quyền: chọn vai trò đầu tiên (trong `loadRoles`) sẽ
    // xóa `matrixError`, nên lỗi nạp danh mục quyền phải được đặt SAU để không bị ghi đè.
    this.loadRoles();
    this.loadPermissionCatalog();
  }

  // --- Tải dữ liệu -----------------------------------------------------------

  /**
   * Tải danh sách vai trò. `selectId` dùng khi vừa tạo vai trò mới — chọn luôn
   * vai trò đó để mở ma trận phân quyền. Không truyền thì giữ nguyên vai trò
   * đang chọn (nếu còn tồn tại), ngược lại chọn vai trò đầu tiên.
   */
  private loadRoles(selectId?: string): void {
    this.rolesLoading.set(true);
    this.rolesError.set('');
    this.api.getRoles().subscribe({
      next: (items) => {
        this.roles.set(items ?? []);
        this.rolesLoading.set(false);
        const stillExists = this.roles().some((role) => role.id === this.selectedRoleId());
        if (selectId) this.selectRole(selectId);
        else if (!stillExists) this.selectRole(this.roles()[0]?.id || '');
      },
      error: () => {
        this.roles.set([]);
        this.rolesLoading.set(false);
        this.selectRole('');
        this.rolesError.set(this.t('ui.admin.rolesLoadFailed'));
        this.appMessages.showKey('ui.admin.rolesLoadFailed', 'error');
      },
    });
  }

  private loadPermissionCatalog(): void {
    this.matrixLoading.set(true);
    this.api.getPermissionCatalog().subscribe({
      next: (items) => {
        this.permissionCatalog.set(items ?? []);
        this.matrixLoading.set(false);
      },
      error: () => {
        this.permissionCatalog.set([]);
        this.matrixLoading.set(false);
        this.matrixError.set(this.t('ui.admin.permissionCatalogFailed'));
        this.appMessages.showKey('ui.admin.permissionCatalogFailed', 'error');
      },
    });
  }

  // --- Quản lý vai trò -------------------------------------------------------

  protected openRoleForm(role?: RoleSummary): void {
    // BUG-081: vai trò hệ thống không được sửa — chặn ngay cả khi nút bị lách (BE cũng chặn).
    if (role?.isSystem) return;
    this.roleForm = role
      ? { id: role.id, code: role.code, name: role.name, description: role.description || '' }
      : { ...EMPTY_ROLE_FORM };
    this.roleFormError.set('');
    this.roleCodeError.set('');
    this.roleNameError.set('');
    this.roleFormOpen.set(true);
  }

  protected closeRoleForm(): void {
    this.roleFormOpen.set(false);
    this.roleForm = { ...EMPTY_ROLE_FORM };
  }

  /** Mã vai trò luôn viết HOA — chuyển ngay khi người dùng gõ. */
  protected setRoleCode(value: string): void {
    this.roleForm.code = (value || '').toUpperCase();
  }

  protected saveRole(): void {
    const editing = !!this.roleForm.id;
    const code = this.roleForm.code.trim().toUpperCase();
    const name = this.roleForm.name.trim();
    const description = this.roleForm.description.trim();

    this.roleCodeError.set(editing ? '' : this.validateRoleCode(code));
    this.roleNameError.set(name ? '' : this.t('ui.admin.roleNameRequired'));
    if (this.roleCodeError() || this.roleNameError()) {
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      const selector = this.roleCodeError() ? 'input[name="roleCode"]' : 'input[name="roleName"]';
      setTimeout(() => {
        const input = this.host.nativeElement.querySelector<HTMLInputElement>(selector);
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input?.focus();
      });
      return;
    }

    this.savingRole.set(true);
    this.roleFormError.set('');
    // API không nhận `code` khi cập nhật — mã vai trò cố định sau khi tạo.
    const request = editing
      ? this.api.updateRole(this.roleForm.id, { name, description })
      : this.api.createRole({ code, name, description });

    request.subscribe({
      next: (role) => {
        this.savingRole.set(false);
        this.closeRoleForm();
        // Vai trò mới được chọn ngay để quản trị tích quyền trong ma trận bên cạnh.
        this.loadRoles(editing ? undefined : role?.id);
        this.notify(
          editing ? this.t('ui.admin.roleUpdated') : this.t('ui.admin.roleCreated', { code }),
          'success',
        );
      },
      error: () => {
        this.savingRole.set(false);
        this.roleFormError.set(
          editing ? this.t('ui.admin.roleUpdateFailed') : this.t('ui.admin.roleCreateFailed'),
        );
      },
    });
  }

  private validateRoleCode(code: string): string {
    if (!code) return this.t('ui.admin.roleCodeRequired');
    if (code.length > ROLE_CODE_MAX) return this.t('ui.admin.roleCodeTooLong', { max: ROLE_CODE_MAX });
    if (!ROLE_CODE_PATTERN.test(code)) return this.t('ui.admin.roleCodeInvalid');
    if (this.roles().some((role) => role.code === code)) return this.t('ui.admin.roleCodeExists');
    return '';
  }

  /** Lý do không cho xóa — rỗng nghĩa là được phép xóa. */
  protected deleteRoleBlockReason(role: RoleSummary): string {
    if (role.isSystem) return this.t('ui.admin.roleSystemLocked');
    if (role.userCount > 0) return this.t('ui.admin.roleInUse', { count: role.userCount });
    return '';
  }

  protected deleteRoleTooltip(role: RoleSummary): string {
    return this.deleteRoleBlockReason(role) || this.t('ui.admin.deleteRole');
  }

  protected openDeleteRole(role: RoleSummary): void {
    if (this.deleteRoleBlockReason(role)) return;
    this.roleDeleteTarget.set(role);
  }

  protected confirmDeleteRole(): void {
    const target = this.roleDeleteTarget();
    if (!target) return;
    this.savingRole.set(true);
    this.api.deleteRole(target.id).subscribe({
      next: () => {
        this.savingRole.set(false);
        this.roleDeleteTarget.set(null);
        if (this.selectedRoleId() === target.id) this.selectRole('');
        this.loadRoles();
        this.notify(this.t('ui.admin.roleDeleted', { code: target.code }), 'success');
      },
      error: () => {
        this.savingRole.set(false);
        this.roleDeleteTarget.set(null);
        this.notify(this.t('ui.admin.roleDeleteFailed'), 'error');
      },
    });
  }

  // --- Khóa / mở khóa vai trò (F03) ------------------------------------------

  /** Mở modal xác nhận. Vai trò hệ thống không được khóa — chặn ngay ở đây. */
  protected openLockRole(role: RoleSummary): void {
    if (role.isActive && role.isSystem) return;
    this.roleLockTarget.set(role);
  }

  protected confirmToggleLock(): void {
    const target = this.roleLockTarget();
    if (!target) return;
    const locking = target.isActive;
    this.togglingLock.set(true);
    const request = locking ? this.api.lockRole(target.id) : this.api.unlockRole(target.id);
    request.subscribe({
      next: () => {
        this.togglingLock.set(false);
        this.roleLockTarget.set(null);
        this.loadRoles();
        this.notify(
          locking
            ? this.t('ui.admin.roleLocked', { code: target.code })
            : this.t('ui.admin.roleUnlocked', { code: target.code }),
          'success',
        );
      },
      error: () => {
        this.togglingLock.set(false);
        this.roleLockTarget.set(null);
        this.notify(locking ? this.t('ui.admin.roleLockFailed') : this.t('ui.admin.roleUnlockFailed'), 'error');
      },
    });
  }

  // --- Ma trận phân quyền ----------------------------------------------------

  protected selectRole(roleId: string): void {
    this.selectedRoleId.set(roleId);
    this.grantedCodes.set([]);
    this.matrixError.set('');
    if (!roleId) return;
    this.matrixLoading.set(true);
    this.api.getRolePermissions(roleId).subscribe({
      next: (codes) => {
        this.grantedCodes.set(codes ?? []);
        this.matrixLoading.set(false);
      },
      error: () => {
        this.matrixLoading.set(false);
        this.matrixError.set(this.t('ui.admin.rolePermissionsFailed'));
        this.appMessages.showKey('ui.admin.rolePermissionsFailed', 'error');
      },
    });
  }

  protected hasGranted(code: string): boolean {
    return this.grantedCodes().includes(code);
  }

  protected toggleGrant(code: string): void {
    this.grantedCodes.update((codes) => (codes.includes(code) ? codes.filter((item) => item !== code) : [...codes, code]));
  }

  protected grantAll(granted: boolean): void {
    // BUG-059: không cho gỡ sạch quyền của chính vai trò SYS_ADMIN mình đang mang.
    if (!granted && this.isSysAdminSelf()) return;
    this.grantedCodes.set(granted ? this.permissionCatalog().map((item) => item.code) : []);
  }

  /** Kiểm tra xem tất cả quyền trong danh mục đã được cấp chưa. */
  protected isAllGranted(): boolean {
    const total = this.permissionCatalog().length;
    if (!total) return false;
    return this.grantedCodes().length >= total;
  }

  /** Chọn / bỏ chọn toàn bộ quyền trong ma trận qua checkbox tổng. */
  protected toggleAllPermissions(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.grantAll(checked);
  }

  /** Kiểm tra xem tất cả quyền của một hành động (column) đã được cấp chưa. */
  protected isActionAllGranted(actionCode: string): boolean {
    const actionCodes = this.permissionCatalog()
      .filter((item) => item.action === actionCode)
      .map((item) => item.code);
    if (!actionCodes.length) return false;
    const granted = this.grantedCodes();
    return actionCodes.every((code) => granted.includes(code));
  }

  /** Chọn / bỏ chọn toàn bộ quyền của một hành động (cột). */
  protected toggleActionPermissions(actionCode: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const actionCodes = this.permissionCatalog()
      .filter((item) => item.action === actionCode)
      .map((item) => item.code);

    if (checked) {
      this.grantedCodes.update((codes) => Array.from(new Set([...codes, ...actionCodes])));
    } else {
      if (this.isSysAdminSelf()) {
        this.grantedCodes.update((codes) =>
          codes.filter((c) => !actionCodes.includes(c) || SYS_ADMIN_CORE_PERMISSIONS.includes(c)),
        );
      } else {
        this.grantedCodes.update((codes) => codes.filter((c) => !actionCodes.includes(c)));
      }
    }
  }

  /** Kiểm tra xem tất cả quyền trong một phân hệ (row) đã được cấp chưa. */
  protected isRowAllGranted(row: MatrixRow): boolean {
    const rowCodes = Object.values(row.cells).filter(Boolean);
    if (!rowCodes.length) return false;
    const granted = this.grantedCodes();
    return rowCodes.every((code) => granted.includes(code));
  }

  /** Chọn / bỏ chọn toàn bộ quyền của một phân hệ (dòng). */
  protected toggleRowPermissions(row: MatrixRow, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const rowCodes = Object.values(row.cells).filter(Boolean);

    if (checked) {
      this.grantedCodes.update((codes) => Array.from(new Set([...codes, ...rowCodes])));
    } else {
      if (this.isSysAdminSelf()) {
        this.grantedCodes.update((codes) =>
          codes.filter((c) => !rowCodes.includes(c) || SYS_ADMIN_CORE_PERMISSIONS.includes(c)),
        );
      } else {
        this.grantedCodes.update((codes) => codes.filter((c) => !rowCodes.includes(c)));
      }
    }
  }

  protected saveMatrix(): void {
    const roleId = this.selectedRoleId();
    if (!roleId) return;
    // BUG-059: chặn lưu ma trận thiếu quyền quản trị cốt lõi của chính vai trò SYS_ADMIN mình đang mang.
    if (this.sysAdminCoreMissing()) return;
    this.savingMatrix.set(true);
    this.api.setRolePermissions(roleId, this.grantedCodes()).subscribe({
      next: () => {
        this.savingMatrix.set(false);
        this.notify(this.t('ui.admin.matrixSaved'), 'success');
      },
      error: () => {
        this.savingMatrix.set(false);
        this.matrixError.set(this.t('ui.admin.matrixSaveFailed'));
        this.appMessages.showKey('ui.admin.matrixSaveFailed', 'error');
      },
    });
  }

  // --- Tiện ích --------------------------------------------------------------

  /** Biểu tượng của vai trò, tra theo MÃ; mã lạ → biểu tượng mặc định trung tính. */
  protected roleIcon(code: string): string {
    return (ROLE_ICONS[code] ?? DEFAULT_ROLE_ICON).icon;
  }

  /** Tông màu ô biểu tượng, tra theo MÃ; mã lạ → tông trung tính. */
  protected roleIconTone(code: string): string {
    return (ROLE_ICONS[code] ?? DEFAULT_ROLE_ICON).tone;
  }

  private notify(message: string, type: 'success' | 'error'): void {
    this.appMessages.show(message, type);
  }
}
