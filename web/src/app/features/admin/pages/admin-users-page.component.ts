import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { DATA_SCOPE_LABEL_KEYS, DataScope, dataScopeLabel } from '../../../core/auth/access-control.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { AdminUser, ApiService, CreateUserPayload, Organization, RoleSummary } from '../../../core/services/api.service';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { AppMessageService } from '@core/services/app-message.service';
import { processApiErrors } from '../../../core/forms/field-errors';

const PAGE_SIZES = [10, 20, 50];
const LOCK_REASON_MAX = 200;

interface OrgTab {
  id: string;
  label: string;
  count: number;
}

/** Loại tài khoản chọn trong modal: rỗng = nội bộ (do admin cấp đơn vị + vai trò). */
type UserFormAccountType = '' | 'ENTERPRISE' | 'INDIVIDUAL';

interface UserForm {
  id: string;
  username: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  title: string;
  email: string;
  phone: string;
  organizationId: string;
  accountType: UserFormAccountType;
  taxCode: string;
  representativeName: string;
  idNumber: string;
  address: string;
}

const EMPTY_USER_FORM: UserForm = {
  id: '',
  username: '',
  password: '',
  confirmPassword: '',
  displayName: '',
  title: '',
  email: '',
  phone: '',
  organizationId: '',
  accountType: '',
  taxCode: '',
  representativeName: '',
  idNumber: '',
  address: '',
};

/**
 * UI-13 Quản trị người dùng (theo mockup MH13).
 * Gồm: tab theo đơn vị có badge đếm · bộ lọc · chọn nhiều dòng + hành động hàng loạt ·
 * bảng người dùng có phân trang · gán vai trò cho người dùng.
 * Quản lý vai trò & ma trận phân quyền tách sang màn riêng `RoleManagementPageComponent` (F03).
 */
@Component({
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatIconModule,
    HasPermissionDirective,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgPagerComponent,
    SgSearchInputComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.admin.title') }}</h1>
        <p>{{ t('ui.admin.subtitle') }}</p>
      </div>
      <button type="button" sgButton *hasPermission="'system.create'" (click)="openUserForm()">
        <mat-icon fontSet="material-icons-round">person_add</mat-icon>{{ t('ui.admin.addUser') }}
      </button>
    </section>

    <div class="kpis">
      <div class="kpi">
        <span class="kpi__ico kpi__ico--blue"><mat-icon fontSet="material-icons-round">group</mat-icon></span>
        <div><div class="kpi__label">{{ t('ui.admin.kpiTotal') }}</div><div class="kpi__value">{{ statsTotal() }}</div></div>
      </div>
      <div class="kpi">
        <span class="kpi__ico kpi__ico--green"><mat-icon fontSet="material-icons-round">task_alt</mat-icon></span>
        <div><div class="kpi__label">{{ t('ui.admin.kpiActive') }}</div><div class="kpi__value">{{ statsActive() }}</div></div>
      </div>
      <div class="kpi">
        <span class="kpi__ico kpi__ico--amber"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon></span>
        <div><div class="kpi__label">{{ t('ui.admin.kpiPending') }}</div><div class="kpi__value">{{ statsPending() }}</div></div>
      </div>
      <div class="kpi">
        <span class="kpi__ico kpi__ico--red"><mat-icon fontSet="material-icons-round">lock</mat-icon></span>
        <div><div class="kpi__label">{{ t('ui.admin.kpiLocked') }}</div><div class="kpi__value">{{ statsLocked() }}</div></div>
      </div>
    </div>


    <nav class="orgtabs" [attr.aria-label]="t('ui.admin.orgTabsAria')">
      @for (tab of orgTabs(); track tab.id) {
        <button type="button" class="orgtab" [class.orgtab--active]="filters.organizationId === tab.id" (click)="selectOrg(tab.id)">
          <mat-icon fontSet="material-icons-round">apartment</mat-icon>
          <span>{{ tab.label }}</span>
          <em>{{ tab.count }}</em>
        </button>
      }
    </nav>

    <div class="layout">
      <sg-card [flush]="true">
        <div class="filters">
          <sg-search-input
            class="filters__search"
            [placeholder]="t('ui.admin.searchPlaceholder')"
            [ariaLabel]="t('ui.admin.searchAria')"
            [(ngModel)]="keyword"
            (search)="applyFilters()"
          />
          <sg-select [ariaLabel]="t('ui.common.organization')" [placeholder]="t('ui.admin.allOrgs')" [options]="orgOptions()" [(ngModel)]="filters.organizationId" (valueChange)="applyFilters()" />
          <sg-select [ariaLabel]="t('ui.dossier.status')" [placeholder]="t('ui.dossier.statusAll')" [options]="statusOptions()" [(ngModel)]="filters.status" (valueChange)="applyFilters()" />
          <sg-select [ariaLabel]="t('ui.common.role')" [placeholder]="t('ui.admin.allRoles')" [options]="roleOptions()" [(ngModel)]="filters.role" (valueChange)="applyFilters()" />
          <button type="button" sgButton (click)="applyFilters()"><mat-icon fontSet="material-icons-round">search</mat-icon>{{ t('ui.common.search') }}</button>
          <button type="button" sgButton="tertiary" (click)="resetFilters()"><mat-icon fontSet="material-icons-round">restart_alt</mat-icon>{{ t('ui.common.reset') }}</button>
        </div>

        <div class="bulkbar">
          <label class="bulkbar__count">
            <input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" [attr.aria-label]="t('ui.admin.selectAll')" />
            <span>{{ t('ui.admin.selectedCount', { count: selectedIds().length }) }}</span>
          </label>
          <div class="bulkbar__actions">
            <button type="button" sgButton="tertiary" size="sm" *hasPermission="'system.update'" [disabled]="!selectedIds().length" (click)="openResetPassword()">
              <mat-icon fontSet="material-icons-round">password</mat-icon>{{ t('ui.admin.resetPassword') }}
            </button>
            <button type="button" sgButton="tertiary" size="sm" *hasPermission="'system.update'" [disabled]="!canAssignSelectedRoles()" (click)="openAssignRoles()">
              <mat-icon fontSet="material-icons-round">badge</mat-icon>{{ t('ui.admin.assignRoles') }}
            </button>
            <button type="button" sgButton="tertiary" size="sm" *hasPermission="'system.update'" [disabled]="!selectedIds().length" (click)="openLock()">
              <mat-icon fontSet="material-icons-round">lock</mat-icon>{{ t('ui.admin.lockAccount') }}
            </button>
            <button type="button" sgButton="tertiary" size="sm" *hasPermission="'system.update'" [disabled]="!selectedIds().length" (click)="openUnlock()">
              <mat-icon fontSet="material-icons-round">lock_open</mat-icon>{{ t('ui.admin.activate') }}
            </button>
            <button type="button" sgButton="tertiary" size="sm" *hasPermission="'system.delete'" [disabled]="!selectedIds().length" (click)="openDeleteSelected()">
              <mat-icon fontSet="material-icons-round">delete</mat-icon>{{ t('ui.admin.deleteUser') }}
            </button>
          </div>
        </div>

        <div class="sg-scroll-x">
          <table class="grid">
            <thead>
              <tr>
                <th class="grid__check"></th>
                <th class="grid__col-name">{{ t('ui.common.fullName') }}</th>
                <th class="grid__col-username">{{ t('ui.admin.colUsername') }}</th>
                <th class="grid__col-account-type">{{ t('ui.admin.colAccountType') }}</th>
                <th class="grid__col-org">{{ t('ui.common.organization') }}</th>
                <th class="grid__col-roles">{{ t('ui.common.role') }}</th>
                <th class="grid__col-status">{{ t('ui.dossier.status') }}</th>
                <th class="grid__col-login">{{ t('ui.admin.colLastLogin') }}</th>
                <th class="grid__actions">{{ t('ui.common.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                <tr><td colspan="9" class="state">{{ t('ui.common.loading') }}</td></tr>
              } @else if (!users().length) {
                <tr><td colspan="9" class="state">{{ t('ui.admin.emptyUsers') }}</td></tr>
              } @else {
                @for (user of users(); track user.id) {
                  <tr [class.grid__row--selected]="isSelected(user.id)">
                    <td class="grid__check">
                      <input type="checkbox" [checked]="isSelected(user.id)" (change)="toggleOne(user.id)" [attr.aria-label]="t('ui.admin.selectRow', { name: user.displayName })" />
                    </td>
                    <td class="grid__col-name">
                      <div class="person">
                        <span class="person__avatar">{{ initial(user.displayName) }}</span>
                        <div class="person__info">
                          <strong>{{ user.displayName }}</strong>
                          <span class="person__title">{{ user.email || user.title }}</span>
                        </div>
                      </div>
                    </td>
                    <td class="grid__col-username">
                      <span class="mono">{{ user.username }}</span>
                      @if (user.phone) { <span class="person__title">{{ user.phone }}</span> }
                    </td>
                    <td class="grid__col-account-type">
                      <span class="chip" [attr.data-tone]="accountTypeTone(user)">{{ accountTypeLabel(user) }}</span>
                    </td>
                    <td class="grid__col-org">{{ user.organization?.name || '—' }}</td>
                    <td class="grid__col-roles">
                      <div class="roles-wrap">
                        @for (role of user.roles; track role.code) {
                          <span class="chip">{{ role.name }}</span>
                        } @empty {
                          <span class="muted">{{ t('ui.admin.noRoleAssigned') }}</span>
                        }
                      </div>
                    </td>
                    <td class="grid__col-status">
                      <span class="chip" [attr.data-tone]="statusTone(user.status)">{{ statusLabel(user.status) }}</span>
                    </td>
                    <td class="grid__col-login">{{ user.lastLoginAt ? (user.lastLoginAt | date: 'dd/MM/yyyy HH:mm') : t('ui.admin.neverLoggedIn') }}</td>
                    <td class="grid__actions">
                      <button type="button" class="iconbtn" [title]="t('ui.admin.viewUser')" (click)="openView(user)">
                        <mat-icon fontSet="material-icons-round">visibility</mat-icon>
                      </button>
                      <button type="button" class="iconbtn" *hasPermission="'system.update'" [title]="t('ui.admin.editUser')" (click)="openUserForm(user)">
                        <mat-icon fontSet="material-icons-round">edit</mat-icon>
                      </button>
                      <!-- DN/cá nhân bị khóa ở vai trò Doanh nghiệp — ẩn nút gán vai trò để không gây nhầm. -->
                      @if (!isSelfRegistered(user)) {
                        <button type="button" class="iconbtn" *hasPermission="'system.update'" [title]="t('ui.admin.assignRoles')" (click)="openAssignRoles(user)">
                          <mat-icon fontSet="material-icons-round">badge</mat-icon>
                        </button>
                      }
                      @if (user.status === 'PENDING') {
                        <button type="button" class="iconbtn iconbtn--approve" *hasPermission="'system.update'" [title]="t('ui.admin.approveAccount')" (click)="approve(user)">
                          <mat-icon fontSet="material-icons-round">how_to_reg</mat-icon>
                        </button>
                      } @else if (user.status === 'ACTIVE') {
                        <button type="button" class="iconbtn" *hasPermission="'system.update'" [disabled]="isSelf(user)" [title]="isSelf(user) ? t('ui.admin.cannotLockSelf') : t('ui.admin.lockAccount')" (click)="openLock(user)">
                          <mat-icon fontSet="material-icons-round">lock</mat-icon>
                        </button>
                      } @else {
                        <button type="button" class="iconbtn" *hasPermission="'system.update'" [title]="t('ui.admin.activateAccount')" (click)="openUnlock(user)">
                          <mat-icon fontSet="material-icons-round">lock_open</mat-icon>
                        </button>
                      }
                      <button type="button" class="iconbtn iconbtn--danger" *hasPermission="'system.delete'" [disabled]="isSelf(user)" [title]="isSelf(user) ? t('ui.admin.cannotDeleteSelf') : t('ui.admin.deleteUser')" (click)="askDeleteUser(user)">
                        <mat-icon fontSet="material-icons-round">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <div card-footer class="pager">
          <span>{{ summary() }}</span>
          <div class="pager__controls">
            <span class="pager__label">{{ t('ui.common.display') }}</span>
            <sg-select class="pager__size" [showEmptyOption]="false" [ariaLabel]="t('ui.common.pageSizeAria')" [options]="pageSizeOptions()" [value]="pageSizeValue()" (valueChange)="changePageSize($event)" />
          </div>
          <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()" (pageChange)="goToPage($event)" />
        </div>
      </sg-card>
    </div>

    <!-- Modal: thêm/sửa người dùng -->
    @if (userFormOpen()) {
      <sg-modal size="lg" [bodyGrid]="true" [title]="userForm.id ? t('ui.admin.userFormEdit') : t('ui.admin.userFormNew')" (close)="closeUserForm()">
        <sg-form-field [label]="t('ui.admin.colAccountType')" [required]="true" [error]="userFormErrors()['accountType']">
          <!-- Giá trị rỗng NGHĨA là "Nội bộ": đặt placeholder = nhãn Nội bộ để ô luôn hiện đúng loại
               (kể cả khi sửa tài khoản nội bộ, accountType = ''), thay vì rơi về "Chọn giá trị". -->
          <sg-select [options]="accountTypeFormOptions()" [placeholder]="t('ui.admin.accountTypeInternal')" [(ngModel)]="userForm.accountType" (valueChange)="onAccountTypeChange()" />
        </sg-form-field>
        <!-- Loại tài khoản quyết định vai trò: DN → ENTERPRISE, cá nhân → INDIVIDUAL. -->
        @if (userForm.accountType !== '') {
          <sg-alert class="modal-span-2" type="info" [message]="t('ui.admin.autoRoleNote')" />
        }
        <sg-form-field [label]="t('ui.admin.username')" [required]="true" [error]="userFormErrors()['username']">
          <input [(ngModel)]="userForm.username" [disabled]="!!userForm.id" [placeholder]="t('ui.admin.usernamePlaceholder')" autocomplete="off" />
        </sg-form-field>
        <sg-form-field [label]="userForm.accountType === 'ENTERPRISE' ? t('ui.register.enterpriseName') : t('ui.common.fullName')" [required]="true" [error]="userFormErrors()['displayName']">
          <input [(ngModel)]="userForm.displayName" [placeholder]="t('ui.admin.displayNamePlaceholder')" />
        </sg-form-field>

        <!-- Nhóm trường theo loại tài khoản (mục D LÔ 6) -->
        @if (userForm.accountType === 'ENTERPRISE') {
          <sg-form-field [label]="t('ui.common.taxCode')" [required]="true" [error]="userFormErrors()['taxCode']">
            <input [(ngModel)]="userForm.taxCode" [placeholder]="t('ui.register.taxCodePlaceholder')" autocomplete="off" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.representative')" [required]="true" [error]="userFormErrors()['representativeName']">
            <input [(ngModel)]="userForm.representativeName" [placeholder]="t('ui.register.representativePlaceholder')" />
          </sg-form-field>
          <sg-form-field class="modal-span-2" [label]="t('ui.common.address')" [required]="true" [error]="userFormErrors()['address']">
            <input [(ngModel)]="userForm.address" [placeholder]="t('ui.common.addressPlaceholder')" autocomplete="street-address" />
          </sg-form-field>
        } @else if (userForm.accountType === 'INDIVIDUAL') {
          <sg-form-field [label]="t('ui.register.idNumber')" [required]="true" [error]="userFormErrors()['idNumber']">
            <input [(ngModel)]="userForm.idNumber" [placeholder]="t('ui.register.idNumberPlaceholder')" autocomplete="off" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.common.address')" [required]="true" [error]="userFormErrors()['address']">
            <input [(ngModel)]="userForm.address" [placeholder]="t('ui.common.addressPlaceholder')" autocomplete="street-address" />
          </sg-form-field>
        } @else {
          <sg-form-field [label]="t('ui.common.jobTitle')" [error]="userFormErrors()['title']">
            <input [(ngModel)]="userForm.title" [placeholder]="t('ui.admin.jobTitlePlaceholder')" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.common.organization')" [required]="true" [error]="userFormErrors()['organizationId']">
            <sg-select [placeholder]="t('ui.admin.chooseOrg')" [options]="orgSelectOptions()" [(ngModel)]="userForm.organizationId" />
          </sg-form-field>
        }

        <sg-form-field [label]="t('ui.common.email')" [required]="true" [error]="userFormErrors()['email']">
          <input type="email" [(ngModel)]="userForm.email" placeholder="ten@chc.gov.vn" />
        </sg-form-field>
        <sg-form-field [label]="t('ui.common.phone')" [required]="true" [error]="userFormErrors()['phone']">
          <input [(ngModel)]="userForm.phone" [placeholder]="t('ui.common.phonePlaceholder')" />
        </sg-form-field>
        @if (!userForm.id) {
          <sg-form-field [label]="t('ui.admin.initialPassword')" [required]="true" [hint]="t('ui.admin.passwordHint')" [error]="userFormErrors()['password']">
            <input type="password" [(ngModel)]="userForm.password" autocomplete="new-password" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.register.confirmPassword')" [required]="true" [error]="userFormErrors()['confirmPassword']">
            <input type="password" [(ngModel)]="userForm.confirmPassword" autocomplete="new-password" />
          </sg-form-field>
        }
        <button modal-footer type="button" sgButton="secondary" (click)="closeUserForm()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton [disabled]="saving()" (click)="saveUser()">{{ saving() ? t('ui.common.saving') : t('ui.common.save') }}</button>
      </sg-modal>
    }

    <!-- Modal: khóa tài khoản (bắt buộc nhập lý do) -->
    @if (lockOpen()) {
      <sg-modal size="sm" [title]="t('ui.admin.lockTitle')" (close)="closeLock()">
        <p class="modal__desc">{{ t('ui.admin.lockDesc', { target: lockTargetLabel() }) }}</p>
        <sg-form-field [label]="t('ui.admin.lockReason')" [required]="true" [error]="lockError()">
          <textarea
            name="lockReason"
            rows="3"
            [(ngModel)]="lockReason"
            [attr.maxlength]="lockReasonMax"
            [placeholder]="t('ui.admin.lockReasonPlaceholder')"
          ></textarea>
        </sg-form-field>
        <p class="counter">{{ lockReason.length }}/{{ lockReasonMax }}</p>
        <button modal-footer type="button" sgButton="secondary" (click)="closeLock()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton="danger" [disabled]="saving()" (click)="confirmLock()">{{ t('ui.admin.confirmLock') }}</button>
      </sg-modal>
    }

    <!-- Modal: mở khóa tài khoản (BUG-079 — nhất quán với Khóa/Xóa, có bước xác nhận) -->
    @if (unlockOpen()) {
      <sg-modal size="sm" [title]="t('ui.admin.unlockTitle')" (close)="closeUnlock()">
        <p class="modal__desc">{{ t('ui.admin.unlockDesc', { target: unlockTargetLabel() }) }}</p>
        <button modal-footer type="button" sgButton="secondary" (click)="closeUnlock()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton [disabled]="saving()" (click)="confirmUnlock()">{{ t('ui.admin.confirmUnlock') }}</button>
      </sg-modal>
    }

    <!-- Modal: đặt lại mật khẩu -->
    @if (resetOpen()) {
      <sg-modal size="sm" [title]="t('ui.admin.resetTitle')" (close)="resetOpen.set(false)">
        <p class="modal__desc">{{ t('ui.admin.appliesTo', { count: selectedIds().length }) }}</p>
        <sg-form-field [label]="t('ui.admin.newPassword')" [required]="true" [hint]="t('ui.admin.passwordHint')" [error]="resetError()">
          <input type="password" [(ngModel)]="newPassword" autocomplete="new-password" />
        </sg-form-field>
        <button modal-footer type="button" sgButton="secondary" (click)="resetOpen.set(false)">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton [disabled]="saving()" (click)="confirmResetPassword()">{{ t('ui.common.confirm') }}</button>
      </sg-modal>
    }

    <!-- Modal: gán vai trò -->
    @if (assignOpen()) {
      <sg-modal size="lg" [title]="t('ui.admin.assignRoles')" (close)="assignOpen.set(false)">
        <p class="modal__desc">{{ t('ui.admin.appliesTo', { count: selectedIds().length }) }}</p>
        @if (assignError()) { <sg-alert type="error" [message]="assignError()" /> }
        <div class="rolelist">
          @for (role of roles(); track role.id) {
            <div class="rolelist__row">
              <label>
                <input type="checkbox" [checked]="isRoleChecked(role.code)" [disabled]="isRoleDisabled(role.code)" (change)="toggleRole(role.code)" />
                <span><strong>{{ role.name }}</strong><em>{{ role.code }}</em></span>
              </label>
              <sg-select
                [options]="scopeOptions()"
                [showEmptyOption]="false"
                [value]="scopeOf(role.code)"
                [disabled]="!isRoleChecked(role.code)"
                (valueChange)="setScope(role.code, $event)"
              />
            </div>
          } @empty {
            <p class="state">{{ t('ui.admin.noRoles') }}</p>
          }
        </div>
        <button modal-footer type="button" sgButton="secondary" (click)="assignOpen.set(false)">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton [disabled]="saving()" (click)="confirmAssignRoles()">{{ t('ui.admin.saveRoles') }}</button>
      </sg-modal>
    }

    <!-- Modal: xem chi tiết tài khoản -->
    @if (viewUser(); as user) {
      <sg-modal [title]="t('ui.admin.userDetailTitle')" (close)="closeView()">
        <div class="detail">
          <header class="detail__banner">
            <span class="detail__avatar">{{ initial(user.displayName) }}</span>
            <div class="detail__id">
              <strong>{{ user.displayName }}</strong>
              <span>{{ roleNames(user) }}</span>
            </div>
            <span class="chip" [attr.data-tone]="statusTone(user.status)">{{ statusLabel(user.status) }}</span>
          </header>

          <section class="detail__sec">
            <p class="detail__sec-title">{{ t('ui.admin.detailContact') }}</p>
            <dl class="detail__grid">
              <div class="detail__item detail__item--full"><dt>{{ t('ui.common.email') }}</dt><dd>{{ user.email || '—' }}</dd></div>
              <div class="detail__item"><dt>{{ t('ui.common.phone') }}</dt><dd>{{ user.phone || '—' }}</dd></div>
              <div class="detail__item"><dt>{{ t('ui.admin.colUsername') }}</dt><dd class="mono">{{ user.username }}</dd></div>
            </dl>
          </section>

          <section class="detail__sec">
            <p class="detail__sec-title">{{ t('ui.admin.detailOrgRole') }}</p>
            <dl class="detail__grid">
              <div class="detail__item"><dt>{{ t('ui.common.organization') }}</dt><dd>{{ user.organization?.name || '—' }}</dd></div>
              <div class="detail__item"><dt>{{ t('ui.common.jobTitle') }}</dt><dd>{{ user.title || '—' }}</dd></div>
              <div class="detail__item detail__item--full">
                <dt>{{ t('ui.common.role') }}</dt>
                <dd>
                  @for (role of user.roles; track role.code) {
                    <span class="chip">{{ role.name }}</span>
                  } @empty {
                    <span class="muted">{{ t('ui.admin.noRoleAssigned') }}</span>
                  }
                </dd>
              </div>
            </dl>
          </section>

          @if (user.accountType) {
            <section class="detail__sec">
              <p class="detail__sec-title">{{ t('ui.admin.detailExtra') }}</p>
              <dl class="detail__grid">
                <div class="detail__item"><dt>{{ t('ui.admin.colAccountType') }}</dt><dd>{{ accountTypeLabel(user) }}</dd></div>
                @if (user.accountType === 'ENTERPRISE') {
                  <div class="detail__item"><dt>{{ t('ui.admin.detailTaxCode') }}</dt><dd class="mono">{{ user.taxCode || '—' }}</dd></div>
                  <div class="detail__item"><dt>{{ t('ui.form.representative') }}</dt><dd>{{ user.representativeName || '—' }}</dd></div>
                } @else if (user.accountType === 'INDIVIDUAL') {
                  <div class="detail__item"><dt>{{ t('ui.admin.detailIdNumber') }}</dt><dd class="mono">{{ user.idNumber || '—' }}</dd></div>
                }
                <div class="detail__item detail__item--full"><dt>{{ t('ui.common.address') }}</dt><dd>{{ user.address || '—' }}</dd></div>
              </dl>
            </section>
          }

          <section class="detail__sec">
            <p class="detail__sec-title">{{ t('ui.admin.detailActivity') }}</p>
            <dl class="detail__grid">
              <div class="detail__item"><dt>{{ t('ui.admin.createdAt') }}</dt><dd>{{ user.createdAt ? (user.createdAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</dd></div>
              <div class="detail__item"><dt>{{ t('ui.admin.colLastLogin') }}</dt><dd>{{ user.lastLoginAt ? (user.lastLoginAt | date: 'dd/MM/yyyy HH:mm') : t('ui.admin.neverLoggedIn') }}</dd></div>
            </dl>
          </section>
        </div>

        <button modal-footer type="button" sgButton="secondary" (click)="closeView()">{{ t('ui.common.close') }}</button>
        <button modal-footer type="button" sgButton *hasPermission="'system.update'" (click)="editFromView(user)">{{ t('ui.admin.editUser') }}</button>
      </sg-modal>
    }

    <!-- Modal: xác nhận xóa tài khoản -->
    @if (deleteTarget(); as target) {
      <sg-modal size="sm" [title]="t('ui.admin.deleteConfirmTitle')" (close)="deleteTarget.set(null)">
        <p class="modal__desc">{{ t('ui.admin.deleteConfirmDesc', { username: target.username }) }}</p>
        <button modal-footer type="button" sgButton="secondary" (click)="deleteTarget.set(null)">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton="danger" [disabled]="saving()" (click)="confirmDeleteUser()">{{ t('ui.admin.deleteUser') }}</button>
      </sg-modal>
    }

    <!-- Modal: xác nhận xóa các tài khoản đã chọn -->
    @if (deleteSelectedOpen()) {
      <sg-modal size="sm" [title]="t('ui.admin.deleteConfirmTitle')" (close)="closeDeleteSelected()">
        <p class="modal__desc">{{ t('ui.admin.deleteSelectedConfirmDesc', { count: selectedIds().length }) }}</p>
        <button modal-footer type="button" sgButton="secondary" [disabled]="saving()" (click)="closeDeleteSelected()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton="danger" [disabled]="saving()" (click)="confirmDeleteSelected()">{{ t('ui.admin.deleteUser') }}</button>
      </sg-modal>
    }
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ mẫu user-management; khoanh trong :host, không đụng token --sg-* toàn cục. */
      :host {
        display: block;
        --blue-accent: #2f6fed;
        --blue-50: #e8f3ff;
        --green: #1fa971;
        --green-50: #e7f8f0;
        --red-accent: #e3423f;
        --red-50: #fdecec;
        --amber-accent: #d9930a;
        --amber-50: #fdf3e2;
        --ink-900: #0d1b34;
        --navy-800: #123278;
      }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .head h1 { margin: 0; color: var(--ink-900); }
      .head p { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); }
      .feedback { display: block; margin-bottom: var(--sg-space-3); }

      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .kpi {
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border: 1px solid var(--sg-border);
        border-radius: 12px;
        background: var(--sg-bg-surface);
      }
      .kpi__ico { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; flex: 0 0 auto; }
      .kpi__ico mat-icon { width: 20px; height: 20px; font-size: 20px; }
      .kpi__ico--blue { background: var(--blue-50); color: var(--blue-accent); }
      .kpi__ico--green { background: var(--green-50); color: var(--green); }
      .kpi__ico--red { background: var(--red-50); color: var(--red-accent); }
      .kpi__ico--amber { background: var(--amber-50); color: var(--amber-accent); }
      .kpi__label { color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .kpi__value { font-size: var(--sg-h3-size); font-weight: 700; line-height: 1.2; color: var(--ink-900); }
      .mono { font-family: var(--sg-font-mono, ui-monospace, monospace); }
      @media (max-width: 1024px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 560px) { .kpis { grid-template-columns: 1fr; } }

      .orgtabs { display: flex; flex-wrap: wrap; gap: var(--sg-space-2); margin-bottom: var(--sg-space-3); }
      .orgtab {
        display: inline-flex;
        align-items: center;
        gap: var(--sg-space-2);
        min-height: var(--sg-control-height);
        padding: 0 var(--sg-space-3);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
        color: var(--sg-text-muted);
        font-weight: 700;
        cursor: pointer;
      }
      .orgtab mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .orgtab em {
        font-style: normal;
        min-width: 22px;
        padding: 0 6px;
        border-radius: var(--sg-radius-pill);
        background: var(--sg-bg-muted);
        font-size: var(--sg-caption-size);
      }
      .orgtab--active { border-color: var(--sg-primary); color: var(--sg-primary); background: var(--sg-primary-soft); }
      .orgtab--active em { background: var(--sg-primary); color: var(--sg-text-invert); }

      .layout { display: block; }

      .filters {
        display: grid;
        grid-template-columns: minmax(220px, 1.6fr) repeat(3, minmax(140px, .8fr)) auto auto;
        gap: var(--sg-space-3);
        align-items: center;
        padding: var(--sg-space-3) var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
      }
      .bulkbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--sg-space-2);
        padding: var(--sg-space-2) var(--sg-space-4);
        background: var(--sg-bg-subtle);
        border-bottom: 1px solid var(--sg-border);
      }
      .bulkbar__count { display: inline-flex; align-items: center; gap: var(--sg-space-2); margin: 0; font-weight: 700; }
      .bulkbar__count input { width: 16px; height: 16px; min-height: 16px; margin: 0; padding: 0; }
      .bulkbar__actions { display: flex; flex-wrap: wrap; gap: var(--sg-space-1); }

      .grid { width: 100%; min-width: 1080px; border-collapse: collapse; background: var(--sg-bg-surface); }
      .grid th, .grid td { padding: var(--sg-space-2) var(--sg-space-3); border-bottom: 1px solid var(--sg-border); text-align: left; vertical-align: middle; }
      .grid th { background: var(--sg-bg-subtle); font-size: var(--sg-small-size); text-transform: uppercase; letter-spacing: .02em; white-space: nowrap; }
      .grid tbody tr:hover { background: var(--sg-bg-subtle); }
      .grid__row--selected { background: var(--sg-primary-soft); }
      .grid__check { width: 44px; text-align: center; }
      .grid__check input { width: 16px; height: 16px; min-height: 16px; margin: 0; padding: 0; }
      .grid__actions { width: 160px; min-width: 160px; white-space: nowrap; text-align: right; }
      .state { padding: var(--sg-space-8); text-align: center; color: var(--sg-text-muted); }

      .grid__col-name { min-width: 220px; }
      .grid__col-username { min-width: 130px; white-space: nowrap; }
      .grid__col-account-type { min-width: 130px; white-space: nowrap; }
      .grid__col-org { min-width: 180px; }
      .grid__col-roles { min-width: 180px; max-width: 320px; }
      .grid__col-status { min-width: 110px; white-space: nowrap; }
      .grid__col-login { min-width: 140px; white-space: nowrap; }

      .roles-wrap { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

      .person { display: flex; align-items: flex-start; gap: var(--sg-space-2); }
      .person__avatar {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--blue-accent), var(--navy-800));
        color: #fff;
        font-weight: 700;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .person__info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .person__info strong { line-height: 1.35; color: var(--ink-900); }
      .person__title { display: block; color: var(--sg-text-muted); font-size: var(--sg-small-size); line-height: 1.3; }
      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        margin: 1px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-bg-subtle);
        border: 1px solid var(--sg-border);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
        font-weight: 700;
        white-space: nowrap;
      }
      .chip[data-tone='ok'] { background: var(--green-50); border-color: transparent; color: var(--green); }
      .chip[data-tone='danger'] { background: var(--red-50); border-color: transparent; color: var(--red-accent); }
      .chip[data-tone='pending'] { background: var(--sg-warning-soft, var(--sg-state-waiting-soft)); border-color: transparent; color: var(--sg-warning-ink, var(--sg-state-waiting-ink)); }
      .chip[data-tone='enterprise'] { background: var(--blue-50); border-color: transparent; color: var(--blue-accent); }
      .chip[data-tone='individual'] { background: var(--green-50); border-color: transparent; color: var(--green); }
      .chip[data-tone='internal'] { background: var(--sg-bg-muted); border-color: transparent; color: var(--sg-text-muted); }
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
      .iconbtn--approve:hover { color: var(--sg-success); }
      .iconbtn:disabled { color: var(--sg-border-strong); cursor: not-allowed; }
      .iconbtn:disabled:hover { background: transparent; color: var(--sg-border-strong); }

      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }
      .pager__controls { display: inline-flex; align-items: center; gap: 8px; }
      .pager__label { color: var(--sg-text-muted); font-size: var(--sg-small-size); white-space: nowrap; }
      .pager__size { width: 72px; }

      .modal__stack { display: grid; gap: var(--sg-space-3); }
      .modal-span-2 { grid-column: 1 / -1; }
      .modal__desc { margin: 0 0 var(--sg-space-3); color: var(--sg-text-muted); }
      .counter { margin: var(--sg-space-1) 0 0; text-align: right; color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      textarea { resize: vertical; }

      /* Hộp chi tiết tài khoản — theo mẫu user-management (banner + nhóm liên hệ / hoạt động). */
      .detail { display: grid; gap: var(--sg-space-4); }
      .detail__banner {
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3);
        border-radius: var(--sg-radius);
        background: var(--sg-primary-soft);
      }
      .detail__avatar {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        flex: 0 0 auto;
        background: linear-gradient(135deg, var(--blue-accent), var(--navy-800));
        color: #fff;
        font-size: 18px;
        font-weight: 700;
      }
      .detail__id { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
      .detail__id strong { color: var(--ink-900); }
      .detail__id span { color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .detail__sec-title { margin: 0 0 var(--sg-space-2); font-size: var(--sg-caption-size); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--sg-text-muted); }
      .detail__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sg-space-3); margin: 0; }
      .detail__item { display: grid; gap: 2px; min-width: 0; }
      .detail__item--full { grid-column: 1 / -1; }
      .detail__item dt { color: var(--sg-text-muted); font-size: var(--sg-caption-size); }
      .detail__item dd { margin: 0; color: var(--ink-900); font-weight: 600; overflow-wrap: anywhere; }

      .rolelist { display: grid; gap: var(--sg-space-2); }
      .rolelist__row { display: grid; grid-template-columns: minmax(0, 1fr) 190px; gap: var(--sg-space-3); align-items: center; }
      .rolelist__row label { display: flex; align-items: center; gap: var(--sg-space-2); margin: 0; font-weight: 400; }
      .rolelist__row label input { width: 16px; height: 16px; min-height: 16px; margin: 0; padding: 0; }
      .rolelist__row em { display: block; font-style: normal; color: var(--sg-text-muted); font-size: var(--sg-caption-size); }

      @media (max-width: 1280px) {
        .filters { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class AdminUsersPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;

  // --- Danh sách người dùng --------------------------------------------------
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly selectedIds = signal<string[]>([]);

  // --- Thẻ chỉ số (KPI) ------------------------------------------------------
  // Số liệu toàn cục theo trạng thái. API chưa có endpoint tổng hợp nên đếm bằng
  // truy vấn `pageSize=1` cho từng trạng thái — cùng khuôn `loadOrgCounts`.
  protected readonly statsTotal = signal(0);
  protected readonly statsActive = signal(0);
  protected readonly statsPending = signal(0);
  protected readonly statsLocked = signal(0);

  protected keyword = '';
  protected filters = { organizationId: '', status: '', role: '' };

  protected readonly organizations = signal<Organization[]>([]);
  protected readonly roles = signal<RoleSummary[]>([]);
  protected readonly orgTabs = signal<OrgTab[]>([]);

  // Nhãn của các ô chọn là `computed` nên tự đổi khi người dùng đổi ngôn ngữ.
  // Mục "Tất cả trạng thái" là mục rỗng sẵn có của sg-select (placeholder) — không tự thêm để
  // tránh nhân đôi mục rỗng trong dropdown (khuôn BUG-050).
  protected readonly statusOptions = computed<SgSelectOption[]>(() => [
    { value: 'ACTIVE', label: this.t('ui.admin.statusActive') },
    { value: 'PENDING', label: this.t('ui.admin.statusPending') },
    { value: 'LOCKED', label: this.t('ui.admin.statusLocked') },
  ]);
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );
  protected readonly scopeOptions = computed<SgSelectOption[]>(() =>
    (Object.keys(DATA_SCOPE_LABEL_KEYS) as DataScope[])
      .filter((scope) => scope !== 'ASSIGNMENT')
      .map((scope) => ({
        value: scope,
        label: dataScopeLabel(scope, this.t),
      })),
  );

  // Loại tài khoản trong modal thêm/sửa: doanh nghiệp / cá nhân. "Nội bộ" (giá trị rỗng) là mục
  // rỗng sẵn có của sg-select (placeholder = nhãn "Nội bộ") — không tự thêm để tránh nhân đôi mục rỗng.
  protected readonly accountTypeFormOptions = computed<SgSelectOption[]>(() => [
    { value: 'ENTERPRISE', label: this.t('ui.admin.accountTypeEnterprise') },
    { value: 'INDIVIDUAL', label: this.t('ui.admin.accountTypeIndividual') },
  ]);

  protected readonly orgOptions = computed<SgSelectOption[]>(() =>
    this.organizations().map((org) => ({ value: org.id, label: org.name })),
  );
  protected readonly orgSelectOptions = this.orgOptions;
  protected readonly roleOptions = computed<SgSelectOption[]>(() =>
    this.roles().map((role) => ({ value: role.id, label: role.name })),
  );
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly allSelected = computed(() => this.users().length > 0 && this.selectedIds().length === this.users().length);
  /** Chỉ tài khoản nội bộ mới đi qua luồng gán vai trò riêng. */
  protected readonly canAssignSelectedRoles = computed(() => {
    const ids = new Set(this.selectedIds());
    const selected = this.users().filter((user) => ids.has(user.id));
    return selected.length > 0 && selected.every((user) => !this.isSelfRegistered(user));
  });
  protected readonly summary = computed(() => {
    if (!this.total()) return this.t('ui.admin.usersSummaryEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.total(), this.page() * this.pageSize());
    return this.t('ui.admin.usersSummary', { start, end, total: this.total() });
  });

  // --- Modal -----------------------------------------------------------------
  protected readonly viewUser = signal<AdminUser | null>(null);
  protected readonly userFormOpen = signal(false);
  protected readonly lockOpen = signal(false);
  protected readonly unlockOpen = signal(false);
  protected readonly resetOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly deleteSelectedOpen = signal(false);
  /** Tài khoản đang chờ xác nhận xóa; khác null thì hộp thoại xác nhận hiện lên. */
  protected readonly deleteTarget = signal<AdminUser | null>(null);
  protected readonly lockError = signal('');
  protected readonly resetError = signal('');
  protected readonly assignError = signal('');
  protected readonly lockReasonMax = LOCK_REASON_MAX;
  private readonly appMessages = inject(AppMessageService);
  private readonly route = inject(ActivatedRoute);

  protected userForm: UserForm = { ...EMPTY_USER_FORM };
  protected userFormErrors = signal<Record<string, string>>({});
  protected lockReason = '';
  protected newPassword = '';
  protected assignedRoles = signal<Array<{ roleCode: string; dataScope: DataScope }>>([]);
  private lockTargets: AdminUser[] = [];
  private unlockTargets: AdminUser[] = [];

  ngOnInit(): void {
    this.loadOrganizations();
    this.loadRoles();
    this.loadUserStats();

    this.route.queryParams.subscribe((params) => {
      const keywordParam = params['keyword'] || params['search'] || params['q'];
      if (keywordParam !== undefined) {
        this.keyword = keywordParam;
      }
      if (params['status'] !== undefined) {
        this.filters.status = params['status'];
      }
      this.page.set(1);
      this.loadUsers();
    });
  }

  /**
   * Đếm số tài khoản theo trạng thái cho hàng KPI. API danh sách chưa có endpoint tổng hợp,
   * nên lấy `total` bằng truy vấn `pageSize=1` cho toàn bộ / đang hoạt động / bị khóa.
   */
  private loadUserStats(): void {
    const countOf = (status: string): Observable<number> =>
      this.api.getUsers({ status, page: 1, pageSize: 1 }).pipe(
        map((result) => result?.total ?? 0),
        catchError(() => of(0)),
      );
    // Đếm đủ MỌI trạng thái để hàng KPI đối soát được: Tổng = Hoạt động + Chờ duyệt + Bị khóa.
    forkJoin({
      total: countOf(''),
      active: countOf('ACTIVE'),
      pending: countOf('PENDING'),
      locked: countOf('LOCKED'),
    }).subscribe((counts) => {
      this.statsTotal.set(counts.total);
      this.statsActive.set(counts.active);
      this.statsPending.set(counts.pending);
      this.statsLocked.set(counts.locked);
    });
  }

  // --- Tải dữ liệu -----------------------------------------------------------

  private loadOrganizations(): void {
    this.api.getOrganizations().subscribe({
      next: (items) => {
        this.organizations.set(items ?? []);
        this.loadOrgCounts();
      },
      error: () => this.organizations.set([]),
    });
  }

  /**
   * Số người dùng của từng đơn vị: API danh sách người dùng chưa có endpoint đếm nhóm,
   * nên lấy `total` bằng một truy vấn `pageSize=1` cho mỗi đơn vị gốc.
   */
  private loadOrgCounts(): void {
    const roots = this.organizations().filter((org) => !org.parentId);
    const requests = roots.map((org) =>
      this.api.getUsers({ organizationId: org.id, page: 1, pageSize: 1 }).pipe(
        map((result) => ({ id: org.id, label: org.name, count: result?.total ?? 0 })),
        catchError(() => of({ id: org.id, label: org.name, count: 0 })),
      ),
    );
    if (!requests.length) {
      this.orgTabs.set([{ id: '', label: this.t('ui.admin.allOrgs'), count: this.total() }]);
      return;
    }
    forkJoin(requests).subscribe((tabs) => {
      const all = tabs.reduce((sum, tab) => sum + tab.count, 0);
      this.orgTabs.set([{ id: '', label: this.t('ui.admin.allOrgs'), count: all }, ...tabs]);
    });
  }

  /**
   * Tải danh sách vai trò. `selectId` dùng khi vừa tạo vai trò mới — chọn luôn
   * Vai trò dùng cho bộ lọc danh sách và hộp thoại "Gán vai trò". Quản lý vai trò
   * và ma trận phân quyền nằm ở màn riêng `RoleManagementPageComponent` (F03).
   */
  private loadRoles(): void {
    this.api.getRoles().subscribe({
      next: (items) => this.roles.set(items ?? []),
      error: () => this.roles.set([]),
    });
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.selectedIds.set([]);
    this.api
      .getUsers({
        keyword: this.keyword.trim(),
        organizationId: this.filters.organizationId,
        status: this.filters.status,
        role: this.roleCodeOf(this.filters.role),
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (result) => {
          this.users.set(result?.items ?? []);
          this.total.set(result?.total ?? 0);
          this.loading.set(false);
        },
        error: () => {
          this.users.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.notify(this.t('ui.admin.usersLoadFailed'), 'error');
        },
      });
  }

  // --- Bộ lọc / phân trang ---------------------------------------------------

  protected applyFilters(): void {
    this.page.set(1);
    this.loadUsers();
  }

  protected resetFilters(): void {
    this.keyword = '';
    this.filters = { organizationId: '', status: '', role: '' };
    this.page.set(1);
    this.loadUsers();
  }

  protected selectOrg(organizationId: string): void {
    this.filters.organizationId = organizationId;
    this.applyFilters();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
    this.loadUsers();
  }

  protected goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.page()) return;
    this.page.set(next);
    this.loadUsers();
  }

  // --- Chọn dòng -------------------------------------------------------------

  protected isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  protected toggleOne(id: string): void {
    this.selectedIds.update((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  protected toggleAll(): void {
    this.selectedIds.set(this.allSelected() ? [] : this.users().map((user) => user.id));
  }

  protected initial(name: string): string {
    return (name || 'U').charAt(0).toUpperCase();
  }

  protected statusLabel(status: string): string {
    if (status === 'ACTIVE') return this.t('ui.admin.statusActive');
    if (status === 'PENDING') return this.t('ui.admin.statusPending');
    return this.t('ui.admin.statusLocked');
  }

  protected statusTone(status: string): string {
    if (status === 'ACTIVE') return 'ok';
    if (status === 'PENDING') return 'pending';
    return 'danger';
  }

  /** Nhãn loại tài khoản: DN / cá nhân / nội bộ (accountType rỗng = tài khoản do admin tạo). */
  protected accountTypeLabel(user: AdminUser): string {
    if (user.accountType === 'ENTERPRISE') return this.t('ui.admin.accountTypeEnterprise');
    if (user.accountType === 'INDIVIDUAL') return this.t('ui.admin.accountTypeIndividual');
    return this.t('ui.admin.accountTypeInternal');
  }

  /** Tông màu pill loại tài khoản — mã ASCII trong tập đóng, tra CSS `.chip[data-tone=…]`. */
  protected accountTypeTone(user: AdminUser): string {
    if (user.accountType === 'ENTERPRISE') return 'enterprise';
    if (user.accountType === 'INDIVIDUAL') return 'individual';
    return 'internal';
  }

  /** Tài khoản DN/cá nhân có vai trò tự động theo loại, không cho đổi vai trò qua UI. */
  protected isSelfRegistered(user: AdminUser): boolean {
    return user.accountType === 'ENTERPRISE' || user.accountType === 'INDIVIDUAL';
  }

  /** Kiểm tra có phải chính tài khoản đang đăng nhập hay không. */
  protected isSelf(user: AdminUser): boolean {
    const curr = this.auth.currentUser();
    return !!curr && (user.id === curr.id || user.username === curr.username);
  }

  /** F00 — duyệt tài khoản chờ (PENDING → ACTIVE); sau đó admin dùng nút "Gán vai trò" sẵn có. */
  protected approve(user: AdminUser): void {
    this.api.approveUser(user.id).subscribe({
      next: () => {
        this.loadUsers();
        this.loadUserStats();
        this.loadOrgCounts();
        this.notify(this.t('ui.admin.approved', { username: user.username }), 'success');
      },
      error: () => this.notify(this.t('ui.admin.approveFailed'), 'error'),
    });
  }

  // --- Xem chi tiết tài khoản ------------------------------------------------

  protected openView(user: AdminUser): void {
    this.viewUser.set(user);
  }

  protected closeView(): void {
    this.viewUser.set(null);
  }

  /** Từ hộp chi tiết chuyển sang sửa: đóng chi tiết rồi mở biểu mẫu sửa cùng tài khoản. */
  protected editFromView(user: AdminUser): void {
    this.viewUser.set(null);
    this.openUserForm(user);
  }

  /** Danh sách tên vai trò của một tài khoản, nối bằng dấu phẩy (rỗng → gạch ngang). */
  protected roleNames(user: AdminUser): string {
    return user.roles.length ? user.roles.map((role) => role.name).join(', ') : '—';
  }

  // --- Thêm / sửa người dùng -------------------------------------------------

  protected openUserForm(user?: AdminUser): void {
    this.saving.set(false);
    this.userFormErrors.set({});
    this.userForm = user
      ? {
        id: user.id,
        username: user.username || '',
        password: '',
        confirmPassword: '',
        displayName: user.displayName || '',
        title: user.title || '',
        email: user.email || '',
        phone: user.phone || '',
        organizationId: user.organization?.id || '',
        accountType: (user.accountType as UserFormAccountType) || '',
        taxCode: user.taxCode || '',
        representativeName: user.representativeName || '',
        idNumber: user.idNumber || '',
        address: user.address || '',
      }
      : { ...EMPTY_USER_FORM };
    this.userFormOpen.set(true);
  }

  protected onAccountTypeChange(): void {
    this.userFormErrors.set({});
  }

  private scoreOf(value: string): number {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return score;
  }

  protected closeUserForm(): void {
    this.saving.set(false);
    this.userFormOpen.set(false);
    this.userForm = { ...EMPTY_USER_FORM };
    this.userFormErrors.set({});
  }

  protected saveUser(): void {
    this.userFormErrors.set({});

    const isNew = !this.userForm.id;
    const username = (this.userForm.username || '').trim();
    const displayName = (this.userForm.displayName || '').trim();
    const email = (this.userForm.email || '').trim();
    const phone = (this.userForm.phone || '').trim();
    const password = this.userForm.password || '';
    const confirmPassword = this.userForm.confirmPassword || '';

    // 1. Tên tài khoản (bắt buộc & đúng định dạng khi tạo mới)
    if (isNew) {
      if (!username) {
        this.userFormErrors.update(e => ({ ...e, username: this.t('ui.admin.userRequired') }));
      } else if (username.length > 30 || !/^[A-Za-z0-9._-]+$/.test(username)) {
        this.userFormErrors.update(e => ({ ...e, username: this.t('ui.admin.usernameInvalid') }));
      }
    }

    // 2. Họ tên / Tên doanh nghiệp (bắt buộc cho mọi loại tài khoản)
    if (!displayName) {
      this.userFormErrors.update(e => ({ ...e, displayName: this.t('ui.profile.nameRequired') }));
    } else if (displayName.length > 150) {
      this.userFormErrors.update(e => ({ ...e, displayName: this.t('ui.admin.displayNameTooLong') }));
    }

    // 3. Email (bắt buộc & đúng định dạng)
    if (!email) {
      this.userFormErrors.update(e => ({ ...e, email: this.t('ui.profile.emailRequired') }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.userFormErrors.update(e => ({ ...e, email: this.t('ui.admin.emailInvalid') }));
    }

    // 3.5. Số điện thoại (bắt buộc & đúng định dạng)
    if (!phone) {
      this.userFormErrors.update(e => ({ ...e, phone: this.t('ui.profile.phoneRequired') }));
    } else if (!/^(0[3|5|7|8|9])[0-9]{8}$/.test(phone) && !/^[0-9+\s.-]{8,15}$/.test(phone)) {
      this.userFormErrors.update(e => ({ ...e, phone: this.t('ui.profile.phoneInvalid') }));
    }

    // 4. Mật khẩu khởi tạo (bắt buộc & tối thiểu 8 ký tự khi tạo mới)
    if (isNew) {
      if (!password) {
        this.userFormErrors.update(e => ({ ...e, password: this.t('ui.admin.passwordRequired') }));
      } else if (this.scoreOf(password) <= 3) {
        this.userFormErrors.update(e => ({ ...e, password: this.t('ui.admin.passwordTooShort') }));
      }
      if (!confirmPassword) {
        this.userFormErrors.update(e => ({ ...e, confirmPassword: this.t('ui.admin.confirmPasswordRequired') }));
      } else if (confirmPassword !== password) {
        this.userFormErrors.update(e => ({ ...e, confirmPassword: this.t('ui.register.confirmMismatch') }));
      }
    }

    // 5. Kiểm tra các trường bắt buộc theo loại tài khoản
    if (this.userForm.accountType === 'ENTERPRISE') {
      if (!(this.userForm.taxCode || '').trim()) {
        this.userFormErrors.update(e => ({ ...e, taxCode: this.t('ui.admin.taxCodeRequired') }));
      }
      if (!(this.userForm.representativeName || '').trim()) {
        this.userFormErrors.update(e => ({ ...e, representativeName: this.t('ui.admin.representativeRequired') }));
      }
      if (!(this.userForm.address || '').trim()) {
        this.userFormErrors.update(e => ({ ...e, address: this.t('ui.admin.addressRequired') }));
      }
    } else if (this.userForm.accountType === 'INDIVIDUAL') {
      if (!(this.userForm.idNumber || '').trim()) {
        this.userFormErrors.update(e => ({ ...e, idNumber: this.t('ui.admin.idNumberRequired') }));
      }
      if (!(this.userForm.address || '').trim()) {
        this.userFormErrors.update(e => ({ ...e, address: this.t('ui.admin.addressRequired') }));
      }
    } else {
      // Nội bộ (accountType === '')
      if (!(this.userForm.organizationId || '').trim()) {
        this.userFormErrors.update(e => ({ ...e, organizationId: this.t('ui.admin.orgRequired') }));
      }
    }

    // Nếu thiếu / sai thông tin -> Bôi đỏ các trường thiếu trong modal (qua [error])
    // VÀ KHÔNG thông báo ở góc trên tay phải bằng AppMessageService (messageApp) để nhất quán với trang đăng ký.
    if (Object.keys(this.userFormErrors()).length > 0) {
      this.saving.set(false);
      return;
    }

    this.saving.set(true);
    // Chỉ gửi nhóm trường hợp lệ theo loại tài khoản để không ghi lẫn dữ liệu giữa các loại.
    const payload = this.buildUserPayload();
    const request = this.userForm.id
      ? this.api.updateUser(this.userForm.id, payload)
      : this.api.createUser({ ...payload, username: (this.userForm.username || '').trim(), password: this.userForm.password || '' });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeUserForm();
        this.loadUsers();
        this.loadUserStats();
        this.loadOrgCounts();
        // Phản hồi thao tác qua toast góc màn hình (nhất quán toàn hệ thống).
        this.appMessages.show(this.t('ui.admin.userSaved'), 'success');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const errorMsg = this.i18n.apiError(err, 'ui.admin.userSaveFailed');
        const KNOWN_FIELDS = ['username', 'displayName', 'email', 'phone', 'organizationId', 'accountType', 'title'];
        if (!this.userForm.id) KNOWN_FIELDS.push('password', 'confirmPassword');
        if (this.userForm.accountType === 'ENTERPRISE') KNOWN_FIELDS.push('taxCode', 'representativeName', 'address');
        if (this.userForm.accountType === 'INDIVIDUAL') KNOWN_FIELDS.push('idNumber', 'address');
        
        const { fieldErrors, unmappedMessages, hasKnownField } = processApiErrors(
          err,
          errorMsg,
          KNOWN_FIELDS,
          (e) => this.i18n.fieldError(e)
        );

        this.userFormErrors.update(e => ({ ...e, ...fieldErrors }));

        if (unmappedMessages.length > 0) {
          this.appMessages.show(unmappedMessages.join('; '), 'error');
        } else if (!hasKnownField) {
          this.appMessages.show(errorMsg, 'error');
        }

      },
    });
  }

  /**
   * Dựng payload create/update theo loại tài khoản: chỉ gửi nhóm trường hợp lệ với loại đã chọn.
   * DN → mã số thuế + người đại diện + địa chỉ; cá nhân → CCCD + địa chỉ; nội bộ → chức danh + đơn vị.
   */
  private buildUserPayload(): Omit<CreateUserPayload, 'username' | 'password'> {
    // Chuẩn hóa toàn bộ chuỗi trước khi gửi. Riêng số điện thoại là tùy chọn: chuỗi rỗng được đổi
    // thành `null` để API có thể xóa giá trị cũ khi cập nhật.
    const phone = (this.userForm.phone || '').trim();
    const title = (this.userForm.title || '').trim();
    const email = (this.userForm.email || '').trim();
    const base: Omit<CreateUserPayload, 'username' | 'password'> = {
      displayName: (this.userForm.displayName || '').trim(),
      email,
      title,
      phone: phone || null,
    };

    if (this.userForm.accountType === 'ENTERPRISE') {
      return {
        ...base,
        accountType: 'ENTERPRISE',
        taxCode: (this.userForm.taxCode || '').trim(),
        representativeName: (this.userForm.representativeName || '').trim(),
        address: (this.userForm.address || '').trim(),
      };
    }

    if (this.userForm.accountType === 'INDIVIDUAL') {
      return {
        ...base,
        accountType: 'INDIVIDUAL',
        idNumber: (this.userForm.idNumber || '').trim(),
        address: (this.userForm.address || '').trim(),
      };
    }

    // Nội bộ
    const orgId = (this.userForm.organizationId || '').trim();
    return {
      ...base,
      ...(orgId ? { organizationId: orgId } : {}),
    };
  }

  /** Mở hộp thoại xác nhận xóa; chưa gọi API cho đến khi người dùng bấm xác nhận. */
  protected askDeleteUser(user: AdminUser): void {
    this.deleteTarget.set(user);
  }

  protected confirmDeleteUser(): void {
    const user = this.deleteTarget();
    if (!user) return;
    this.saving.set(true);
    this.api.deleteUser(user.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.loadUsers();
        this.loadUserStats();
        this.loadOrgCounts();
        this.notify(this.t('ui.admin.userDeleted', { username: user.username }), 'success');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.notify(this.i18n.apiError(err, 'ui.admin.userDeleteFailed'), 'error');
      },
    });
  }

  protected openDeleteSelected(): void {
    if (!this.selectedIds().length) return;
    this.deleteSelectedOpen.set(true);
  }

  protected closeDeleteSelected(): void {
    if (this.saving()) return;
    this.deleteSelectedOpen.set(false);
  }

  protected confirmDeleteSelected(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) {
      this.deleteSelectedOpen.set(false);
      return;
    }
    this.runBulk(
      ids.map((id) => this.api.deleteUser(id)),
      this.t('ui.admin.usersDeleted'),
      () => this.deleteSelectedOpen.set(false),
    );
  }

  // --- Khóa / kích hoạt ------------------------------------------------------

  protected openLock(user?: AdminUser): void {
    this.lockTargets = user ? [user] : this.users().filter((item) => this.isSelected(item.id));
    if (!this.lockTargets.length) return;
    this.lockReason = '';
    this.lockError.set('');
    this.lockOpen.set(true);
  }

  protected closeLock(): void {
    this.lockOpen.set(false);
    this.lockTargets = [];
    this.lockReason = '';
  }

  protected lockTargetLabel(): string {
    if (this.lockTargets.length === 1) {
      const target = this.lockTargets[0];
      return `"${target.displayName}" (${target.username})`;
    }
    return this.t('ui.admin.lockTargetMany', { count: this.lockTargets.length });
  }

  protected confirmLock(): void {
    const reason = this.lockReason.trim();
    if (!reason) {
      this.lockError.set(this.t('ui.admin.lockReasonRequired'));
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      setTimeout(() => {
        const field = this.host.nativeElement.querySelector<HTMLTextAreaElement>('textarea[name="lockReason"]');
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.focus();
      });
      return;
    }

    const currentUserId = this.auth.currentUser()?.id;
    const currentUsername = this.auth.currentUser()?.username;
    const isLockingSelf = this.lockTargets.some(
      (u) => (currentUserId && u.id === currentUserId) || (currentUsername && u.username === currentUsername),
    );

    if (isLockingSelf) {
      const selfMsg = this.t('ui.admin.cannotLockSelf');
      this.lockError.set(selfMsg);
      this.appMessages.show(selfMsg, 'error');
      return;
    }

    this.lockError.set('');
    this.saving.set(true);
    forkJoin(this.lockTargets.map((user) => this.api.lockUser(user.id, reason))).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeLock();
        this.loadUsers();
        this.loadRoles();
        this.loadUserStats();
        this.loadOrgCounts();
        this.notify(this.t('ui.admin.locked'), 'success');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const errorMsg = this.i18n.apiError(err, 'ui.admin.lockFailed');
        this.lockError.set(errorMsg);
        this.appMessages.show(errorMsg, 'error');
      },
    });
  }

  /**
   * BUG-079: mở khóa phải qua bước xác nhận (nhất quán với Khóa/Xóa). `user` cho thao tác một dòng;
   * không truyền thì mở khóa các tài khoản đang chọn ở thanh hàng loạt.
   */
  protected openUnlock(user?: AdminUser): void {
    this.unlockTargets = user ? [user] : this.users().filter((item) => this.isSelected(item.id));
    if (!this.unlockTargets.length) return;
    this.unlockOpen.set(true);
  }

  protected closeUnlock(): void {
    this.unlockOpen.set(false);
    this.unlockTargets = [];
  }

  protected unlockTargetLabel(): string {
    if (this.unlockTargets.length === 1) {
      const target = this.unlockTargets[0];
      return `"${target.displayName}" (${target.username})`;
    }
    return this.t('ui.admin.lockTargetMany', { count: this.unlockTargets.length });
  }

  protected confirmUnlock(): void {
    const targets = this.unlockTargets;
    if (!targets.length) return;
    const single = targets.length === 1;
    this.runBulk(
      targets.map((user) => this.api.unlockUser(user.id)),
      single ? this.t('ui.admin.unlocked', { username: targets[0].username }) : this.t('ui.admin.unlockedMany'),
      () => this.closeUnlock(),
    );
  }

  // --- Đặt lại mật khẩu ------------------------------------------------------

  protected openResetPassword(): void {
    if (!this.selectedIds().length) return;
    this.newPassword = '';
    this.resetError.set('');
    this.resetOpen.set(true);
  }

  protected confirmResetPassword(): void {
    if (this.scoreOf(this.newPassword) <= 3) {
      this.resetError.set(this.t('ui.admin.newPasswordTooWeak'));
      return;
    }
    this.resetError.set('');
    this.runBulk(
      this.selectedIds().map((id) => this.api.resetUserPassword(id, this.newPassword)),
      this.t('ui.admin.passwordReset'),
      () => this.resetOpen.set(false),
    );
  }

  // --- Gán vai trò -----------------------------------------------------------

  protected openAssignRoles(user?: AdminUser): void {
    if (user) this.selectedIds.set([user.id]);
    if (!this.canAssignSelectedRoles()) return;
    const current = user?.roles ?? [];
    const initialRoles = current.map((role) => ({ roleCode: role.code, dataScope: role.dataScope }));
    const ids = new Set(this.selectedIds());
    const selectedUsers = this.users().filter((u) => ids.has(u.id));
    const protectedAdminUser = selectedUsers.find((u) => u.isProtected);
    if (protectedAdminUser) {
      const sysRole = protectedAdminUser.roles.find((r) => r.code === 'SYS_ADMIN' || r.code === 'QUAN_TRI');
      const roleCode = sysRole?.code || 'SYS_ADMIN';
      if (!initialRoles.some((r) => r.roleCode === roleCode)) {
        initialRoles.push({ roleCode, dataScope: sysRole?.dataScope || 'ALL' });
      }
    }
    this.assignedRoles.set(initialRoles);
    this.assignError.set('');
    this.assignOpen.set(true);
  }

  protected isRoleDisabled(code: string): boolean {
    if (code !== 'SYS_ADMIN' && code !== 'QUAN_TRI') {
      return false;
    }
    const ids = new Set(this.selectedIds());
    const selectedUsers = this.users().filter((user) => ids.has(user.id));
    return selectedUsers.some((user) => user.isProtected);
  }

  protected isRoleChecked(code: string): boolean {
    return this.assignedRoles().some((role) => role.roleCode === code);
  }

  protected toggleRole(code: string): void {
    if (this.isRoleDisabled(code)) return;
    this.assignedRoles.update((roles) =>
      roles.some((role) => role.roleCode === code)
        ? roles.filter((role) => role.roleCode !== code)
        : [...roles, { roleCode: code, dataScope: 'ALL' }],
    );
  }

  protected scopeOf(code: string): string {
    const scope = this.assignedRoles().find((role) => role.roleCode === code)?.dataScope;
    if (scope === 'ASSIGNMENT') return 'ORGANIZATION';
    return scope || 'ALL';
  }

  protected setScope(code: string, scope: string): void {
    this.assignedRoles.update((roles) =>
      roles.map((role) => (role.roleCode === code ? { ...role, dataScope: scope as DataScope } : role)),
    );
  }

  protected confirmAssignRoles(): void {
    if (!this.assignedRoles().length) {
      this.assignError.set(this.t('ui.admin.roleRequired'));
      return;
    }
    this.assignError.set('');
    this.runBulk(
      this.selectedIds().map((id) => this.api.setUserRoles(id, this.assignedRoles())),
      this.t('ui.admin.rolesAssigned'),
      () => this.assignOpen.set(false),
    );
  }

  // --- Tiện ích --------------------------------------------------------------

  private roleCodeOf(roleId: string): string {
    return this.roles().find((role) => role.id === roleId)?.code || '';
  }

  private runBulk(requests: Array<Observable<unknown>>, successMessage: string, onDone?: () => void): void {
    if (!requests.length) return;
    this.saving.set(true);
    forkJoin(requests).subscribe({
      next: () => {
        this.saving.set(false);
        onDone?.();
        this.loadUsers();
        this.loadRoles();
        this.loadUserStats();
        this.loadOrgCounts();
        this.notify(successMessage, 'success');
      },
      error: () => {
        this.saving.set(false);
        this.notify(this.t('ui.admin.bulkFailed'), 'error');
      },
    });
  }

  private notify(message: string, type: 'success' | 'error'): void {
    this.appMessages.show(message, type);
  }
}
