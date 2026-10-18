import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { finalize, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DataScope, dataScopeLabel } from '../../../core/auth/access-control.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ApiService } from '../../../core/services/api.service';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { extractErrorMessageKey } from '../../../core/forms/field-errors';
import { AppMessageService } from '@core/services/app-message.service';

interface ProfileErrors {
  displayName: string;
  title: string;
  email: string;
  phone: string;
  address: string;
  representativeName: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const NO_ERRORS: ProfileErrors = {
  displayName: '',
  title: '',
  email: '',
  phone: '',
  address: '',
  representativeName: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

/** F01 — Hồ sơ cá nhân / doanh nghiệp, đổi ảnh đại diện và đổi mật khẩu. */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
  ],
  template: `
    <section class="head">
      <p class="crumb">{{ t('ui.profile.crumbHome') }} / <b>{{ t('ui.profile.title') }}</b></p>
      <h1>{{ t('ui.profile.title') }}</h1>
      <p class="sub">{{ t('ui.profile.pageSubtitle') }}</p>
    </section>

    @if (message()) {
      <sg-alert class="feedback" [type]="messageType()" [message]="message()" [dismissible]="true" (dismiss)="message.set('')" />
    }

    <div class="grid">
      <!-- Cột trái: tóm tắt tài khoản -->
      <sg-card>
        <div class="summary">
          @if (avatarUrl()) {
            <img class="avatar-lg avatar-lg--img" [src]="avatarUrl()" [alt]="user()?.displayName || ''" />
          } @else {
            <div class="avatar-lg">{{ initials() }}</div>
          }
          <p class="summary__name">{{ user()?.displayName || '—' }}</p>
          <p class="summary__email">{{ user()?.email || '—' }}</p>
          @if (isEnterprise()) {
            <span class="badge"><mat-icon fontSet="material-icons-round">business</mat-icon>{{ t('ui.register.accountTypeEnterprise') }}</span>
          } @else if (roles().length) {
            <span class="badge"><mat-icon fontSet="material-icons-round">shield</mat-icon>{{ roles()[0].name }}</span>
          }
          <button type="button" sgButton="secondary" block (click)="openAvatar()">{{ t('ui.profile.changeAvatar') }}</button>

          <dl class="stats">
            <dt>{{ t('ui.profile.username') }}</dt>
            <dd>{{ user()?.username || '—' }}</dd>
            @if (isEnterprise() || user()?.taxCode) {
              <dt>{{ t('ui.common.taxCode') }}</dt>
              <dd class="mono-stat">{{ user()?.taxCode || '—' }}</dd>
            }
            @if (isEnterprise() && user()?.representativeName) {
              <dt>{{ t('ui.form.representative') }}</dt>
              <dd>{{ user()?.representativeName }}</dd>
            }
            @if (isIndividual() || user()?.idNumber) {
              <dt>{{ t('ui.register.idNumber') }}</dt>
              <dd class="mono-stat">{{ user()?.idNumber || '—' }}</dd>
            }
            @if (!isEnterprise() && !isIndividual() && user()?.organization?.name) {
              <dt>{{ t('ui.common.organization') }}</dt>
              <dd>{{ user()?.organization?.name || t('ui.profile.noOrganization') }}</dd>
            }
            <dt>{{ t('ui.profile.assignments') }}</dt>
            <dd>
              @for (item of assignments(); track item.type + item.code) {
                <span class="chip">{{ item.name }}</span>
              } @empty {
                <span class="muted">{{ t('ui.profile.noAssignment') }}</span>
              }
            </dd>
            <dt>{{ t('ui.dossier.status') }}</dt>
            <dd>
              <span class="chip" [attr.data-tone]="user()?.status === 'ACTIVE' ? 'ok' : 'danger'">
                {{ user()?.status === 'ACTIVE' ? t('ui.profile.statusActive') : t('ui.profile.statusLocked') }}
              </span>
            </dd>
          </dl>
        </div>
      </sg-card>

      <!-- Cột phải: biểu mẫu liền mạch -->
      <sg-card>
        <div class="sections">
          <!-- Loại tài khoản (chỉ đọc) -->
          <section class="sec">
            <p class="sec__label">{{ t('ui.profile.accountType') }}</p>
            <p class="sec__sub">{{ t('ui.profile.accountTypeSubtitle') }}</p>
            <div class="type-row">
              @if (isEnterprise()) {
                <div class="type-chip">
                  <div class="type-chip__ic"><mat-icon fontSet="material-icons-round">business</mat-icon></div>
                  <div>
                    <div class="type-chip__tt">{{ t('ui.register.accountTypeEnterprise') }}</div>
                    <div class="type-chip__ts">{{ user()?.taxCode ? (t('ui.common.taxCode') + ': ' + user()?.taxCode) : t('ui.register.accountTypeEnterpriseHint') }}</div>
                  </div>
                  <mat-icon class="type-chip__lock" fontSet="material-icons-round">lock</mat-icon>
                </div>
              }
              @for (role of roles(); track role.code) {
                <div class="type-chip">
                  <div class="type-chip__ic"><mat-icon fontSet="material-icons-round">badge</mat-icon></div>
                  <div>
                    <div class="type-chip__tt">{{ role.name }}</div>
                    <div class="type-chip__ts">{{ scopeLabel(role.dataScope) }}</div>
                  </div>
                  <mat-icon class="type-chip__lock" fontSet="material-icons-round">lock</mat-icon>
                </div>
              } @empty {
                @if (!isEnterprise()) {
                  <span class="muted">{{ t('ui.profile.noRole') }}</span>
                }
              }
            </div>
          </section>

          @if (isEnterprise()) {
            <!-- Thông tin doanh nghiệp -->
            <section class="sec">
              <p class="sec__title">{{ t('ui.profile.enterpriseInfoTitle') }}</p>
              <p class="sec__sub">{{ t('ui.profile.enterpriseInfoSubtitle') }}</p>
              <div class="form-grid">
                <sg-form-field class="full" [label]="t('ui.register.enterpriseName')" [required]="true" [error]="errors().displayName">
                  <input name="displayName" [(ngModel)]="form.displayName" [placeholder]="t('ui.register.enterpriseNamePlaceholder')" autocomplete="organization" />
                </sg-form-field>
                <sg-form-field [label]="t('ui.common.taxCode')">
                  <input name="taxCode" [value]="user()?.taxCode || '—'" disabled />
                </sg-form-field>
                <sg-form-field [label]="t('ui.form.representative')" [error]="errors().representativeName">
                  <input name="representativeName" [(ngModel)]="form.representativeName" [placeholder]="t('ui.register.representativePlaceholder')" />
                </sg-form-field>
                <sg-form-field class="full" [label]="t('ui.common.address')" [error]="errors().address">
                  <input name="address" [(ngModel)]="form.address" [placeholder]="t('ui.common.addressPlaceholder')" autocomplete="street-address" />
                </sg-form-field>
                <sg-form-field [label]="t('ui.common.phone')" [required]="true" [error]="errors().phone">
                  <input name="phone" [(ngModel)]="form.phone" [placeholder]="t('ui.common.phonePlaceholder')" autocomplete="tel" />
                </sg-form-field>
              </div>
            </section>
          } @else if (isIndividual()) {
            <!-- Thông tin cá nhân -->
            <section class="sec">
              <p class="sec__title">{{ t('ui.profile.tabInfo') }}</p>
              <p class="sec__sub">{{ t('ui.profile.personalInfoSubtitle') }}</p>
              <div class="form-grid">
                <sg-form-field class="full" [label]="t('ui.common.fullName')" [required]="true" [error]="errors().displayName">
                  <input name="displayName" [(ngModel)]="form.displayName" [placeholder]="t('ui.profile.fullNamePlaceholder')" autocomplete="name" />
                </sg-form-field>
                <sg-form-field [label]="t('ui.register.idNumber')">
                  <input name="idNumber" [value]="user()?.idNumber || '—'" disabled />
                </sg-form-field>
                <sg-form-field [label]="t('ui.common.phone')" [required]="true" [error]="errors().phone">
                  <input name="phone" [(ngModel)]="form.phone" [placeholder]="t('ui.common.phonePlaceholder')" autocomplete="tel" />
                </sg-form-field>
                <sg-form-field class="full" [label]="t('ui.common.address')">
                  <input name="address" [(ngModel)]="form.address" [placeholder]="t('ui.common.addressPlaceholder')" autocomplete="street-address" />
                </sg-form-field>
              </div>
            </section>
          } @else {
            <!-- Thông tin cá nhân (nội bộ) -->
            <section class="sec">
              <p class="sec__title">{{ t('ui.profile.tabInfo') }}</p>
              <p class="sec__sub">{{ t('ui.profile.personalInfoSubtitle') }}</p>
              <div class="form-grid">
                <sg-form-field class="full" [label]="t('ui.common.fullName')" [required]="true" [error]="errors().displayName">
                  <input name="displayName" [(ngModel)]="form.displayName" [placeholder]="t('ui.profile.fullNamePlaceholder')" autocomplete="name" />
                </sg-form-field>
                <sg-form-field [label]="t('ui.common.jobTitle')" [error]="errors().title">
                  <input name="title" [(ngModel)]="form.title" [placeholder]="t('ui.profile.titlePlaceholder')" />
                </sg-form-field>
                <sg-form-field [label]="t('ui.common.organization')">
                  <input name="organization" [value]="user()?.organization?.name || ''" disabled />
                </sg-form-field>
                <sg-form-field [label]="t('ui.common.phone')" [required]="true" [error]="errors().phone">
                  <input name="phone" [(ngModel)]="form.phone" [placeholder]="t('ui.common.phonePlaceholder')" autocomplete="tel" />
                </sg-form-field>
                <sg-form-field class="full" [label]="t('ui.common.address')">
                  <input name="address" [(ngModel)]="form.address" [placeholder]="t('ui.common.addressPlaceholder')" autocomplete="street-address" />
                </sg-form-field>
              </div>
            </section>
          }

          <!-- Thông tin liên hệ & bảo mật -->
          <section class="sec">
            <p class="sec__title">{{ t('ui.profile.contactSecurity') }}</p>
            <p class="sec__sub">{{ t('ui.profile.contactSecuritySubtitle') }}</p>
            <div class="form-grid">
              <sg-form-field class="full" [label]="t('ui.common.email')" [required]="true" [error]="errors().email">
                <input name="email" type="email" [(ngModel)]="form.email" placeholder="ten@chc.gov.vn" autocomplete="email" />
              </sg-form-field>
              <sg-form-field class="full" [label]="t('ui.profile.password')" [hint]="t('ui.profile.passwordUpdatedHint')">
                <div class="password-line">
                  <input name="password" type="password" value="••••••••••" disabled />
                  <button type="button" sgButton="secondary" size="sm" (click)="openPassword()">{{ t('ui.profile.changePassword') }}</button>
                </div>
              </sg-form-field>
            </div>
          </section>
        </div>

        <div card-footer class="foot">
          <button type="button" sgButton="secondary" [disabled]="saving()" (click)="resetForm()">{{ t('ui.profile.cancelChanges') }}</button>
          <button type="button" sgButton [disabled]="saving()" (click)="saveProfile()">
            {{ saving() ? t('ui.common.saving') : t('ui.profile.saveInfo') }}
          </button>
        </div>
      </sg-card>
    </div>

    @if (avatarOpen()) {
      <sg-modal [title]="t('ui.profile.changeAvatar')" (close)="closeAvatar()">
        <p class="modal-sub">{{ t('ui.profile.avatarSubtitle') }}</p>
        <!-- SG-210: Khu vực xem trước ảnh hiện tại / chữ cái đầu tên và dòng ghi chú tương ứng -->
        <div class="avatar-preview-row">
          <div class="avatar-preview-container">
            @if (hasCustomAvatar()) {
              <img class="avatar-preview avatar-preview--img" [src]="avatarPreview() || avatarUrl()" [alt]="user()?.displayName || ''" />
              <button
                type="button"
                class="avatar-delete-btn"
                [title]="t('ui.profile.deleteAvatar')"
                [attr.aria-label]="t('ui.profile.deleteAvatar')"
                (click)="removeAvatar()"
              >
                <mat-icon fontSet="material-icons-round">delete</mat-icon>
              </button>
            } @else {
              <div class="avatar-preview">{{ initials() }}</div>
            }
          </div>
          <div class="avatar-preview__text">
            <b>{{ avatarFileName() || user()?.displayName || '—' }}</b>
            @if (avatarFileName()) {
              <span>{{ t('ui.profile.avatarSelectedNote') }}</span>
            } @else if (!hasCustomAvatar()) {
              <span>{{ t('ui.profile.avatarCurrentNote') }}</span>
            }
          </div>
        </div>
        <label class="dropzone">
          <input type="file" class="dropzone__input" accept="image/png,image/jpeg" (change)="onAvatarSelected($event)" />
          <mat-icon fontSet="material-icons-round">image</mat-icon>
          <p class="dz__title">{{ t('ui.profile.avatarDropTitle') }}</p>
          <p class="dz__sub">{{ t('ui.profile.avatarDropHint') }}</p>
        </label>
        @if (avatarError()) {
          <p class="file-hint file-hint--error">{{ avatarError() }}</p>
        } @else {
          <p class="file-hint">{{ t('ui.profile.avatarNote') }}</p>
        }
        <div modal-footer class="modal-actions">
          <button type="button" sgButton="secondary" (click)="closeAvatar()">{{ t('ui.common.cancel') }}</button>
          <button type="button" sgButton [disabled]="!avatarPreview() && !isAvatarDeleted()" (click)="saveAvatar()">{{ t('ui.profile.avatarSave') }}</button>
        </div>
      </sg-modal>
    }

    @if (passwordOpen()) {
      <sg-modal [title]="t('ui.profile.changePassword')" (close)="closePassword()">
        <p class="modal-sub">{{ t('ui.profile.passwordModalSubtitle') }}</p>
        <div class="form form--narrow">
          <sg-form-field [label]="t('ui.profile.currentPassword')" [required]="true" [error]="errors().currentPassword">
            <input
              name="currentPassword"
              type="password"
              [(ngModel)]="password.currentPassword"
              (ngModelChange)="onCurrentPasswordChange()"
              autocomplete="current-password"
            />
          </sg-form-field>
          <sg-form-field [label]="t('ui.profile.newPassword')" [required]="true" [error]="errors().newPassword">
            <input
              name="newPassword"
              type="password"
              [(ngModel)]="password.newPassword"
              (ngModelChange)="onNewPasswordChange($event)"
              autocomplete="new-password"
            />
            <div class="strength-bar">
              @for (i of [0, 1, 2, 3]; track i) {
                <span [class.strength-bar__on]="i < pwStrength()" [attr.data-score]="pwStrength()"></span>
              }
            </div>
          </sg-form-field>
          <sg-form-field [label]="t('ui.profile.confirmPassword')" [required]="true" [error]="errors().confirmPassword">
            <input
              name="confirmPassword"
              type="password"
              [(ngModel)]="password.confirmPassword"
              (ngModelChange)="onConfirmPasswordChange()"
              autocomplete="new-password"
            />
          </sg-form-field>
        </div>
        <ul class="req-list">
          <li><span class="req-dot"></span>{{ t('ui.profile.pwReqLength') }}</li>
          <li><span class="req-dot"></span>{{ t('ui.profile.pwReqCase') }}</li>
          <li><span class="req-dot"></span>{{ t('ui.profile.pwReqNumSpecial') }}</li>
        </ul>
        <button modal-footer type="button" sgButton="secondary" [disabled]="saving()" (click)="closePassword()">{{ t('ui.common.cancel') }}</button>
        <button modal-footer type="button" sgButton [disabled]="saving()" (click)="changePassword()">
          {{ saving() ? t('ui.profile.processing') : t('ui.profile.passwordUpdate') }}
        </button>
      </sg-modal>
    }

    @if (logoutOpen()) {
      <sg-modal [title]="t('ui.profile.logout')" (close)="closeLogout()">
        <p class="modal-sub">{{ t('ui.profile.logoutModalSubtitle') }}</p>
        <p>{{ t('ui.shell.logoutDesc') }}</p>

        <button modal-footer type="button" sgButton="secondary" (click)="closeLogout()">
          {{ t('ui.common.cancel') }}
        </button>
        <button modal-footer type="button" sgButton (click)="confirmLogout()">
          {{ t('ui.profile.logout') }}
        </button>
      </sg-modal>
    }
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ mẫu account-info; khoanh trong :host, không đụng token --sg-* toàn cục. */
      :host {
        display: block;
        --blue-600: #2f6fed;
        --blue-500: #5b8def;
        --ink-900: #152040;
        --ink-500: #7885a3;
      }
      .head { margin-bottom: var(--sg-space-3); }
      .head h1 { margin: 0; color: var(--ink-900); }
      .crumb { margin: 0 0 var(--sg-space-2); color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .crumb b { color: var(--sg-text); font-weight: 600; }
      .sub { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); font-size: var(--sg-body-size); }
      .feedback { display: block; margin-bottom: var(--sg-space-3); }

      .grid { display: grid; grid-template-columns: minmax(280px, 320px) minmax(0, 1fr); gap: var(--sg-space-3); align-items: start; }

      /* Cột trái */
      .summary { display: flex; flex-direction: column; align-items: center; text-align: center; }
      .avatar-lg {
        display: grid;
        place-items: center;
        width: 84px;
        height: 84px;
        margin-bottom: var(--sg-space-3);
        border-radius: 50%;
        background: linear-gradient(135deg, var(--blue-600), var(--blue-500));
        color: var(--sg-text-invert);
        font-size: 26px;
        font-weight: 700;
        box-shadow: 0 8px 18px rgba(47, 111, 237, .3);
      }
      .summary__name { margin: 0; font-size: var(--sg-h3-size); font-weight: 700; color: var(--ink-900); }
      .summary__email { margin: 2px 0 0; color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: var(--sg-space-1);
        margin-top: var(--sg-space-3);
        padding: 5px var(--sg-space-3);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-primary-soft);
        color: var(--sg-primary-900);
        font-size: var(--sg-small-size);
        font-weight: 700;
      }
      .badge mat-icon { width: 16px; height: 16px; font-size: 16px; }
      .summary button { margin-top: var(--sg-space-3); }
      .stats {
        width: 100%;
        margin: var(--sg-space-4) 0 0;
        padding-top: var(--sg-space-3);
        border-top: 1px solid var(--sg-border);
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--sg-space-2) var(--sg-space-3);
        text-align: left;
      }
      .stats dt { color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .stats dd { margin: 0; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--sg-space-1); font-size: var(--sg-small-size); font-weight: 600; }

      /* Cột phải */
      .sections { display: flex; flex-direction: column; }
      .sec + .sec { margin-top: var(--sg-space-4); padding-top: var(--sg-space-4); border-top: 1px solid var(--sg-border); }
      .sec__label { margin: 0 0 var(--sg-space-1); font-size: var(--sg-caption-size); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--sg-text-muted); }
      .sec__title { margin: 0; font-size: var(--sg-h4-size, 1rem); font-weight: 700; }
      .sec__sub { margin: var(--sg-space-1) 0 var(--sg-space-3); color: var(--sg-text-muted); font-size: var(--sg-small-size); }

      .type-row { display: flex; flex-wrap: wrap; gap: var(--sg-space-3); }
      .type-chip {
        flex: 1 1 240px;
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        padding: var(--sg-space-3);
        border: 1px solid var(--sg-primary);
        border-radius: var(--sg-radius);
        background: var(--sg-primary-soft);
      }
      .type-chip__ic { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--sg-radius); background: var(--sg-primary); color: var(--sg-text-invert); flex-shrink: 0; }
      .type-chip__ic mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .type-chip__tt { font-weight: 700; font-size: var(--sg-small-size); color: var(--sg-primary-900); }
      .type-chip__ts { font-size: var(--sg-caption-size); color: var(--sg-text-muted); }
      .type-chip__lock { margin-left: auto; width: 16px; height: 16px; font-size: 16px; color: var(--sg-text-muted); }

      .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sg-space-3) var(--sg-space-4); }
      .form-grid .full { grid-column: 1 / -1; }
      .password-line { display: flex; align-items: center; gap: var(--sg-space-2); }
      .password-line input { flex: 1; letter-spacing: 2px; }

      .foot { display: flex; justify-content: flex-end; gap: var(--sg-space-2); padding: var(--sg-space-3) var(--sg-space-4); border-top: 1px solid var(--sg-border); }

      /* Chip dùng chung */
      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-primary-soft);
        color: var(--sg-primary-900);
        font-size: var(--sg-small-size);
        font-weight: 700;
      }
      .chip[data-tone='ok'] { background: var(--sg-state-done-soft); color: var(--sg-state-done); }
      .chip[data-tone='danger'] { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }
      .muted { color: var(--sg-text-muted); font-size: var(--sg-small-size); }

      .modal-sub { margin: 0 0 var(--sg-space-3); color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--sg-space-3); width: 100%; }
      .form { display: grid; gap: var(--sg-space-3); }
      .form--narrow { grid-template-columns: minmax(0, 1fr); }
      .avatar-preview-row { display: flex; align-items: center; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .avatar-preview-container { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
      .avatar-preview { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--blue-600), var(--blue-500)); color: var(--sg-text-invert); font-size: 22px; font-weight: 700; flex-shrink: 0; box-shadow: 0 8px 18px rgba(47, 111, 237, .3); }
      .avatar-preview--img { object-fit: cover; }
      .avatar-delete-btn {
        position: absolute;
        top: -4px;
        right: -4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border: 1.5px solid var(--sg-bg-surface);
        border-radius: 50%;
        background: #ffffff;
        color: var(--sg-state-rejected);
        cursor: pointer;
        opacity: 0;
        transition: opacity .15s ease-in-out, transform .15s ease-in-out;
        box-shadow: 0 2px 6px rgba(0, 0, 0, .2);
      }
      .avatar-preview-container:hover .avatar-delete-btn { opacity: 1; transform: scale(1.05); }
      .avatar-delete-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
      .avatar-delete-btn:hover { background: #fee2e2; color: #dc2626; }
      .avatar-preview__text { display: grid; gap: 2px; font-size: var(--sg-small-size); color: var(--sg-text-muted); }
      .avatar-preview__text b { color: var(--sg-text); }
      .dropzone {
        display: grid;
        place-items: center;
        gap: var(--sg-space-1);
        padding: var(--sg-space-5) var(--sg-space-4);
        border: 1.5px dashed var(--sg-border-strong);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-subtle);
        text-align: center;
        cursor: pointer;
      }
      .dropzone:hover { border-color: var(--sg-primary); background: var(--sg-primary-soft); }
      .dropzone__input { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; }
      .dropzone mat-icon { width: 26px; height: 26px; font-size: 26px; color: var(--sg-text-muted); }
      .dz__title { margin: 0; font-weight: 700; font-size: var(--sg-small-size); }
      .dz__sub { margin: 0; color: var(--sg-text-muted); font-size: var(--sg-caption-size); }
      .file-hint { margin: var(--sg-space-2) 0 0; text-align: center; color: var(--sg-text-muted); font-size: var(--sg-caption-size); }
      .file-hint--error { color: var(--sg-state-rejected); font-weight: 700; }

      .strength-bar { display: flex; gap: 4px; margin-top: var(--sg-space-1); }
      .strength-bar span { height: 4px; flex: 1; border-radius: 3px; background: var(--sg-border); }
      .strength-bar span.strength-bar__on { background: var(--sg-primary); }
      .strength-bar span.strength-bar__on[data-score='1'] { background: var(--sg-state-rejected); }
      .strength-bar span.strength-bar__on[data-score='2'] { background: var(--sg-warning-ink); }
      .strength-bar span.strength-bar__on[data-score='4'] { background: var(--sg-state-done); }
      .req-list { list-style: none; margin: var(--sg-space-3) 0 0; padding: 0; display: grid; gap: var(--sg-space-1); }
      .req-list li { display: flex; align-items: center; gap: var(--sg-space-2); color: var(--sg-text-muted); font-size: var(--sg-caption-size); }
      .req-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--sg-text-muted); flex-shrink: 0; }

      @media (max-width: 1100px) {
        .grid, .form-grid { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class ProfilePageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = this.auth.currentUser;
  protected readonly roles = this.auth.roles;
  protected readonly assignments = this.auth.assignments;
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly messageType = signal<'success' | 'error' | 'info'>('success');
  protected readonly errors = signal<ProfileErrors>(NO_ERRORS);
  protected readonly avatarOpen = signal(false);
  protected readonly passwordOpen = signal(false);
  /** Điểm sức mạnh mật khẩu mới (0–4) — cập nhật ngay mỗi lần gõ để thanh đo đổi màu (BUG-074). */
  protected readonly pwStrength = signal(0);
  /** Ảnh đại diện vừa chọn (dạng data URL) để xem trước, và lỗi định dạng/dung lượng nếu có (BUG-075). */
  protected readonly avatarPreview = signal<string | null>(null);
  protected readonly avatarFileName = signal('');
  protected readonly avatarError = signal('');
  protected readonly isAvatarDeleted = signal(false);

  protected readonly hasCustomAvatar = computed(() => {
    if (this.isAvatarDeleted()) return false;
    return !!(this.avatarPreview() || this.avatarUrl());
  });

  protected readonly isEnterprise = computed(
    () => this.user()?.accountType === 'ENTERPRISE' || !!this.user()?.taxCode || this.roles().some((r) => r.code === 'ENTERPRISE'),
  );

  protected readonly isIndividual = computed(
    () => this.user()?.accountType === 'INDIVIDUAL' || !!this.user()?.idNumber || this.roles().some((r) => r.code === 'INDIVIDUAL'),
  );

  protected form = { displayName: '', title: '', email: '', phone: '', address: '', representativeName: '' };
  protected password = { currentPassword: '', newPassword: '', confirmPassword: '' };

  /** Giới hạn tệp ảnh đại diện theo NFR-08: JPG/PNG, tối đa 5MB. */
  private static readonly AVATAR_MAX_BYTES = 5 * 1024 * 1024;
  private static readonly AVATAR_TYPES = ['image/png', 'image/jpeg'];
  private readonly appMessages = inject(AppMessageService);

  // Signal quản lý đóng/mở Popup Đăng xuất
  protected readonly logoutOpen = signal(false);

  /** Chữ cái đầu của tên để dựng ảnh đại diện chữ. */
  protected readonly initials = computed(() => {
    const name = (this.user()?.displayName || '').trim();
    if (!name) return '—';
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase() || first.toUpperCase();
  });

  /** Điểm sức mạnh mật khẩu mới (0–4) — dùng cho kiểm hợp lệ khi lưu. Khớp chính sách BUG-010. */
  protected passwordScore(): number {
    return this.scoreOf(this.password.newPassword);
  }

  /** Tính điểm sức mạnh của một chuỗi mật khẩu (0–4): độ dài + hoa/thường + số + ký tự đặc biệt. */
  private scoreOf(value: string): number {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return score;
  }

  /** Xóa lỗi mật khẩu hiện tại khi người dùng nhập lại. */
  protected onCurrentPasswordChange(): void {
    if (this.errors().currentPassword) {
      this.errors.update((prev) => ({ ...prev, currentPassword: '' }));
    }
  }

  /** Cập nhật ô mật khẩu mới và tính lại điểm sức mạnh để thanh đo phản ứng tức thì (BUG-074). */
  protected onNewPasswordChange(value: string): void {
    this.password.newPassword = value;
    this.pwStrength.set(this.scoreOf(value));
    if (this.errors().newPassword) {
      this.errors.update((prev) => ({ ...prev, newPassword: '' }));
    }
  }

  /** Xóa lỗi xác nhận mật khẩu khi người dùng nhập lại. */
  protected onConfirmPasswordChange(): void {
    if (this.errors().confirmPassword) {
      this.errors.update((prev) => ({ ...prev, confirmPassword: '' }));
    }
  }

  protected scopeLabel(scope: DataScope): string {
    return dataScopeLabel(scope, this.t);
  }

  ngOnInit(): void {
    const queryParamMap$ = this.route.queryParamMap ?? of(this.route.snapshot?.queryParamMap);
    queryParamMap$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (!params) return;
      const tab = params.get('tab');
      if (tab === 'password') this.openPassword();
      if (tab === 'logout') this.openLogout();
    });

    this.resetForm();
  }

  private clearTabQueryParam(): void {
    if (this.route.snapshot?.queryParamMap?.has('tab')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  protected openLogout(): void {
    this.logoutOpen.set(true);
  }

  protected closeLogout(): void {
    this.logoutOpen.set(false);
    this.clearTabQueryParam();
  }

  protected confirmLogout(): void {
    this.logoutOpen.set(false);
    this.auth.logout();         // Thực hiện đăng xuất
  }

  protected openAvatar(): void {
    this.resetAvatar();
    this.avatarOpen.set(true);
  }

  protected closeAvatar(): void {
    this.avatarOpen.set(false);
    this.resetAvatar();
  }

  private resetAvatar(): void {
    this.avatarPreview.set(null);
    this.avatarFileName.set('');
    this.avatarError.set('');
    this.isAvatarDeleted.set(false);
  }

  protected removeAvatar(): void {
    this.avatarPreview.set(null);
    this.avatarFileName.set('');
    this.avatarError.set('');
    this.isAvatarDeleted.set(true);
  }

  /** Chọn ảnh đại diện: kiểm định dạng/dung lượng rồi dựng ảnh xem trước (BUG-075). */
  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.avatarPreview.set(null);
    this.avatarFileName.set('');
    this.isAvatarDeleted.set(false);
    if (!ProfilePageComponent.AVATAR_TYPES.includes(file.type)) {
      this.avatarError.set(this.t('ui.profile.avatarInvalidType'));
      input.value = '';
      return;
    }
    if (file.size > ProfilePageComponent.AVATAR_MAX_BYTES) {
      this.avatarError.set(this.t('ui.profile.avatarTooLarge'));
      input.value = '';
      return;
    }
    this.avatarError.set('');
    this.avatarFileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  protected readonly avatarUrl = this.auth.avatarUrl;

  protected saveAvatar(): void {
    if (this.isAvatarDeleted() && !this.avatarPreview()) {
      this.saving.set(true);
      this.api
        .updateProfile({ avatarUrl: '' })
        .pipe(
          switchMap(() => this.auth.refreshProfile()),
          finalize(() => this.saving.set(false)),
        )
        .subscribe({
          next: () => {
            this.auth.updateAvatar('');
            this.closeAvatar();
            this.notify(this.t('ui.profile.avatarDeletedSuccess'), 'success');
          },
          error: () => {
            this.notify(this.t('ui.profile.avatarSavedError'), 'error');
          },
        });
      return;
    }

    const preview = this.avatarPreview();
    if (preview) {
      this.saving.set(true);
      this.api
        .updateProfile({ avatarUrl: preview })
        .pipe(
          switchMap(() => this.auth.refreshProfile()),
          finalize(() => this.saving.set(false)),
        )
        .subscribe({
          next: () => {
            this.auth.updateAvatar(preview);
            this.closeAvatar();
            this.notify(this.t('ui.profile.avatarSavedSuccess'), 'success');
          },
          error: () => {
            this.notify(this.t('ui.profile.avatarSavedError'), 'error');
          },
        });
    } else {
      this.closeAvatar();
    }
  }

  protected openPassword(): void {
    this.password = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.pwStrength.set(0);
    this.errors.set(NO_ERRORS);
    this.passwordOpen.set(true);
  }

  protected closePassword(): void {
    this.passwordOpen.set(false);
    this.password = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.pwStrength.set(0);
    this.errors.set(NO_ERRORS);
    this.clearTabQueryParam();
  }

  protected resetForm(): void {
    const user = this.user();
    this.form = {
      displayName: user?.displayName || '',
      title: user?.title || '',
      email: user?.email || '',
      phone: user?.phone || '',
      address: user?.address || '',
      representativeName: user?.representativeName || '',
    };
    this.errors.set(NO_ERRORS);
  }

  protected saveProfile(): void {
    const isEnt = this.isEnterprise();
    const isInd = this.isIndividual();
    const displayName = this.form.displayName.trim();
    const title = this.form.title.trim();
    const email = this.form.email.trim();
    const phone = this.form.phone.trim();
    const address = this.form.address.trim();
    const representativeName = this.form.representativeName.trim();
    // Email là trường bắt buộc (F01) — không cho xóa trắng; rỗng thì báo bắt buộc, có thì kiểm định dạng.
    let emailError = '';
    if (!email) emailError = this.t('ui.profile.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emailError = this.t('ui.profile.emailInvalid');

    let nameError = '';
    if (displayName.length < 2) {
      nameError = isEnt ? this.t('ui.profile.enterpriseNameRequired') : this.t('ui.profile.nameRequired');
    }

    const errors: ProfileErrors = {
      ...NO_ERRORS,
      displayName: nameError,
      email: emailError,
      phone: !phone || /^[0-9+\s.-]{8,11}$/.test(phone) ? '' : this.t('ui.profile.phoneInvalid'),
    };
    this.errors.set(errors);
    if (this.hasError(errors)) return;

    this.saving.set(true);
    this.api
      .updateProfile({
        displayName,
        title: (isEnt || isInd) ? undefined : title,
        email,
        phone: phone || null,
        address: address || null,
        representativeName: isEnt ? (representativeName || null) : undefined,
      })
      .pipe(
        switchMap(() => this.auth.refreshProfile()),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: () => {
          this.resetForm();
          this.notify(this.t('ui.profile.saved'), 'success');
        },
        error: () => {
          this.notify(this.t('ui.profile.saveFailed'), 'error');
        },
      });
  }

  protected changePassword(): void {
    let newPwError = '';
    if (this.passwordScore() < 4) {
      newPwError = this.t('ui.profile.newPasswordWeak');
    } else if (this.password.currentPassword && this.password.currentPassword === this.password.newPassword) {
      newPwError = this.t('ui.profile.newPasswordSame');
    }

    const errors: ProfileErrors = {
      ...NO_ERRORS,
      currentPassword: this.password.currentPassword ? '' : this.t('ui.profile.currentPasswordRequired'),
      newPassword: newPwError,
      confirmPassword: this.confirmPasswordError(),
    };
    this.errors.set(errors);
    if (this.hasError(errors)) return;

    this.saving.set(true);
    this.api
      .changePassword({ currentPassword: this.password.currentPassword, newPassword: this.password.newPassword })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.password = { currentPassword: '', newPassword: '', confirmPassword: '' };
          this.pwStrength.set(0);
          this.passwordOpen.set(false);
          this.clearTabQueryParam();
          this.notify(this.t('ui.profile.passwordChanged'), 'success');
        },
        error: (err: unknown) => {
          const errorCode = extractErrorMessageKey(err);

          if (errorCode === 'auth.currentPasswordWrong') {
            this.errors.update((prev) => ({
              ...prev,
              currentPassword: this.t('ui.profile.currentPasswordWrong'),
            }));
          } else if (errorCode === 'auth.newPasswordSame') {
            this.errors.update((prev) => ({
              ...prev,
              newPassword: this.t('ui.profile.newPasswordSame'),
            }));
          } else {
            this.notify(this.t('ui.profile.passwordFailed'), 'error');
          }
        },
      });
  }

  /**
   * Lỗi ô "Xác nhận mật khẩu mới" (BUG-066): rỗng thì báo bắt buộc — trước đây hai ô cùng rỗng vẫn
   * khớp nhau nên ô này không hề báo lỗi; có nội dung thì kiểm khớp với mật khẩu mới.
   */
  private confirmPasswordError(): string {
    if (!this.password.confirmPassword) return this.t('ui.profile.confirmRequired');
    return this.password.newPassword === this.password.confirmPassword ? '' : this.t('ui.profile.confirmMismatch');
  }

  private hasError(errors: ProfileErrors): boolean {
    return Object.values(errors).some((value) => !!value);
  }

  private notify(message: string, type: 'success' | 'error' | 'info'): void {
    this.messageType.set(type);
    // this.message.set(message);
    this.appMessages.show(message, type);
  }
}
