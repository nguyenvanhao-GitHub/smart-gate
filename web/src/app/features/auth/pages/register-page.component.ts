import { Component, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../../core/i18n/i18n.service';
import { AccountType, ApiService, RegisterPayload } from '../../../core/services/api.service';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgLanguageSwitchComponent } from '../../../shared/ui/sg-language-switch.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { AppMessageService } from '@core/services/app-message.service';
import { processApiErrors } from '../../../core/forms/field-errors';

interface RegisterErrors {
  username: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  taxCode: string;
  representativeName: string;
  idNumber: string;
  address: string;
  email: string;
  phone: string;
}

const NO_ERRORS: RegisterErrors = {
  username: '',
  password: '',
  confirmPassword: '',
  displayName: '',
  taxCode: '',
  representativeName: '',
  idNumber: '',
  address: '',
  email: '',
  phone: '',
};

/**
 * F00 — Đăng ký tự phục vụ. Dựng đúng template MH02 (register_screen.html):
 * thẻ nổi căn giữa, HERO navy bên TRÁI (khác login là hero bên phải), form khai báo bên PHẢI rộng hơn.
 * Ô nhập dùng khuôn `.input-wrap` (icon dẫn + nút hiện/ẩn mật khẩu) đồng bộ với trang đăng nhập.
 * Tài khoản tạo ra ở trạng thái chờ duyệt (`PENDING`) nên không đăng nhập ngay; gửi thành công thì
 * hiện thông báo chờ duyệt và mời quay lại trang đăng nhập.
 */
@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, SgAlertComponent, SgModalComponent, SgLanguageSwitchComponent],
  template: `
    <main class="page">
      <div class="top-lang-bar">
        <sg-language-switch />
      </div>
      <div class="screen">
        <!-- TRÁI: HERO -->
        <div class="left" aria-hidden="true">
          <div class="eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
            </svg>
            {{ t('ui.register.eyebrow') }}
          </div>

          <div class="left-head">
            <h1>{{ t('ui.login.heroLine1') }}<br />{{ t('ui.login.heroLine2') }}</h1>
            <div class="gate-name">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8a24a" stroke-width="2.4">
                <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
              {{ t('ui.register.brandLocation') }}
            </div>
            <p>{{ t('ui.register.heroLead') }}</p>
          </div>

          <div class="illustration">
            <svg viewBox="0 0 480 260" preserveAspectRatio="none">
              <polygon points="0,180 60,90 120,160 190,60 260,150 330,80 400,170 480,110 480,260 0,260" fill="#7fa8cf" opacity="0.55" />
              <polygon points="0,220 90,140 170,200 250,120 340,190 420,150 480,200 480,260 0,260" fill="#5f8fbb" opacity="0.7" />
              <rect x="40" y="205" width="400" height="14" fill="#9aa7ba" />
              <rect x="150" y="150" width="34" height="55" rx="2" fill="#2d3f57" />
              <rect x="296" y="150" width="34" height="55" rx="2" fill="#2d3f57" />
              <rect x="150" y="150" width="180" height="10" fill="#c8a24a" />
              <rect x="60" y="185" width="70" height="30" rx="3" fill="#1c5fc9" />
              <rect x="60" y="178" width="70" height="8" fill="#0b2545" />
              <rect x="350" y="188" width="55" height="27" rx="3" fill="#d21f2f" />
              <circle cx="75" cy="217" r="6" fill="#0f172a" />
              <circle cx="115" cy="217" r="6" fill="#0f172a" />
              <circle cx="362" cy="217" r="5" fill="#0f172a" />
              <circle cx="394" cy="217" r="5" fill="#0f172a" />

              <!-- Khung quét biển số AI trên xe tải -->
              <g opacity="0.95">
                <path d="M52 178 L52 170 L62 170" stroke="#5be3ff" stroke-width="2" fill="none" />
                <path d="M138 178 L138 170 L128 170" stroke="#5be3ff" stroke-width="2" fill="none" />
                <path d="M52 222 L52 230 L62 230" stroke="#5be3ff" stroke-width="2" fill="none" />
                <path d="M138 222 L138 230 L128 230" stroke="#5be3ff" stroke-width="2" fill="none" />
              </g>

              <!-- Cột camera thông minh phát sóng -->
              <rect x="216" y="118" width="4" height="34" fill="#334155" />
              <rect x="210" y="112" width="16" height="9" rx="2" fill="#334155" />
              <circle cx="218" cy="116.5" r="2.4" fill="#5be3ff" />
              <path d="M222 108a10 10 0 016 6" stroke="#5be3ff" stroke-width="1.6" fill="none" opacity="0.85" />
              <path d="M225 103a17 17 0 0110 10" stroke="#5be3ff" stroke-width="1.6" fill="none" opacity="0.55" />

              <!-- Các nút dữ liệu IoT / mạng -->
              <g fill="#5be3ff">
                <circle cx="205" cy="70" r="2.4" />
                <circle cx="240" cy="55" r="2" />
                <circle cx="270" cy="75" r="2.2" />
              </g>
              <path d="M205 70 L240 55 L270 75" stroke="#5be3ff" stroke-width="1.2" fill="none" opacity="0.65" />

              <!-- Chip bảng dữ liệu cạnh barie -->
              <rect x="185" y="128" width="26" height="17" rx="2" fill="#0b2545" opacity="0.9" />
              <rect x="188" y="131" width="8" height="3" fill="#5be3ff" />
              <rect x="188" y="136" width="14" height="2.2" fill="#93bdfa" />
              <rect x="188" y="139.5" width="10" height="2.2" fill="#93bdfa" />
            </svg>
          </div>

          <div class="benefits">
            <div class="benefit">
              <div class="ic">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e6eefc" stroke-width="2">
                  <path d="M4 19V6a2 2 0 012-2h8l6 6v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
                  <path d="M14 4v6h6" />
                </svg>
              </div>
              <div class="txt">
                <div class="t1">{{ t('ui.register.benefit1') }}</div>
                <div class="t2">{{ t('ui.register.benefit1Sub') }}</div>
              </div>
            </div>
            <div class="benefit">
              <div class="ic">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e6eefc" stroke-width="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4l3 3" />
                </svg>
              </div>
              <div class="txt">
                <div class="t1">{{ t('ui.register.benefit2') }}</div>
                <div class="t2">{{ t('ui.register.benefit2Sub') }}</div>
              </div>
            </div>
            <div class="benefit">
              <div class="ic">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e6eefc" stroke-width="2">
                  <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div class="txt">
                <div class="t1">{{ t('ui.register.benefit3') }}</div>
                <div class="t2">{{ t('ui.register.benefit3Sub') }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- PHẢI: FORM ĐĂNG KÝ -->
        <div class="right">
          <div class="brand">
            <div class="emblem">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2l7 3v6c0 5-3 8.5-7 11-4-2.5-7-6-7-11V5l7-3z" fill="#f4c542" />
              </svg>
            </div>
            <div class="brand-text">
              <div class="name">{{ t('ui.shell.brandFull') }}</div>
              <div class="sub">{{ t('ui.login.tagline') }}</div>
            </div>
          </div>

          <div class="form-title">{{ t('ui.register.title') }}</div>
          <div class="form-sub">{{ t('ui.register.lead') }}</div>

          <form (ngSubmit)="submit()" autocomplete="off" novalidate>
            @if (success()) {
              <div class="alert-slot"><sg-alert type="success" [message]="t('ui.register.success')" /></div>
            }

            @if (!success()) {
              <!-- Loại tài khoản -->
              <div class="seg-group">
                <span class="seg-label">{{ t('ui.register.accountType') }} <span class="req">*</span></span>
                <div class="seg-control">
                  <button type="button" class="seg-btn" [class.active]="form.accountType === 'ENTERPRISE'" (click)="setAccountType('ENTERPRISE')" [disabled]="loading()">
                    <span class="seg-ic">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="7" width="18" height="14" rx="1" />
                        <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </span>
                    <span class="seg-txt">
                      <strong>{{ t('ui.register.accountTypeEnterprise') }}</strong>
                      <small>{{ t('ui.register.accountTypeEnterpriseHint') }}</small>
                    </span>
                  </button>
                  <button type="button" class="seg-btn" [class.active]="form.accountType === 'INDIVIDUAL'" (click)="setAccountType('INDIVIDUAL')" [disabled]="loading()">
                    <span class="seg-ic">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                      </svg>
                    </span>
                    <span class="seg-txt">
                      <strong>{{ t('ui.register.accountTypeIndividual') }}</strong>
                      <small>{{ t('ui.register.accountTypeIndividualHint') }}</small>
                    </span>
                  </button>
                </div>
              </div>

              <!-- Tên đăng nhập (bắt buộc cho việc đăng nhập sau khi được duyệt) -->
              <div class="field">
                <label for="reg-username">{{ t('ui.register.username') }} <span class="req">*</span></label>
                <div class="input-wrap" [class.is-invalid]="!!errors().username">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                  <input id="reg-username" name="username" [(ngModel)]="form.username" [placeholder]="t('ui.register.usernamePlaceholder')" autocomplete="off" autocapitalize="off" spellcheck="false" [disabled]="loading()" />
                </div>
                @if (errors().username) {
                  <span class="field-err">{{ errors().username }}</span>
                } @else {
                  <span class="field-hint">{{ t('ui.register.usernameHint') }}</span>
                }
              </div>

              @if (form.accountType === 'ENTERPRISE') {
                <div class="field">
                  <label for="reg-dn">{{ t('ui.register.enterpriseName') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().displayName">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <rect x="3" y="7" width="18" height="14" rx="1" />
                      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                    <input id="reg-dn" name="displayName" [(ngModel)]="form.displayName" [placeholder]="t('ui.register.enterpriseNamePlaceholder')" autocomplete="organization" [disabled]="loading()" />
                  </div>
                  @if (errors().displayName) { <span class="field-err">{{ errors().displayName }}</span> }
                </div>
                <div class="field">
                  <label for="reg-mst">{{ t('ui.register.taxCode') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().taxCode">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <path d="M8 10h8M8 14h5" />
                    </svg>
                    <input id="reg-mst" name="taxCode" [(ngModel)]="form.taxCode" [placeholder]="t('ui.register.taxCodePlaceholder')" autocomplete="off" [disabled]="loading()" />
                  </div>
                  @if (errors().taxCode) { <span class="field-err">{{ errors().taxCode }}</span> }
                </div>
                <div class="field">
                  <label for="reg-daidien">{{ t('ui.form.representative') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().representativeName">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                    </svg>
                    <input id="reg-daidien" name="representativeName" [(ngModel)]="form.representativeName" [placeholder]="t('ui.register.representativePlaceholder')" autocomplete="off" [disabled]="loading()" />
                  </div>
                  @if (errors().representativeName) { <span class="field-err">{{ errors().representativeName }}</span> }
                </div>
                <div class="field">
                  <label for="reg-diachi-dn">{{ t('ui.common.address') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().address">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
                      <circle cx="12" cy="10" r="2.4" />
                    </svg>
                    <input id="reg-diachi-dn" name="address" [(ngModel)]="form.address" [placeholder]="t('ui.common.addressPlaceholder')" autocomplete="street-address" [disabled]="loading()" />
                  </div>
                  @if (errors().address) { <span class="field-err">{{ errors().address }}</span> }
                </div>
              } @else {
                <div class="field">
                  <label for="reg-hoten">{{ t('ui.register.fullName') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().displayName">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                    </svg>
                    <input id="reg-hoten" name="displayName" [(ngModel)]="form.displayName" [placeholder]="t('ui.profile.fullNamePlaceholder')" autocomplete="name" [disabled]="loading()" />
                  </div>
                  @if (errors().displayName) { <span class="field-err">{{ errors().displayName }}</span> }
                </div>
                <div class="field">
                  <label for="reg-cccd">{{ t('ui.register.idNumber') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().idNumber">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <circle cx="8.5" cy="12" r="2" />
                      <path d="M13 10h5M13 14h3" />
                    </svg>
                    <input id="reg-cccd" name="idNumber" [(ngModel)]="form.idNumber" [placeholder]="t('ui.register.idNumberPlaceholder')" autocomplete="off" [disabled]="loading()" />
                  </div>
                  @if (errors().idNumber) { <span class="field-err">{{ errors().idNumber }}</span> }
                </div>
                <div class="field">
                  <label for="reg-diachi">{{ t('ui.common.address') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().address">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
                      <circle cx="12" cy="10" r="2.4" />
                    </svg>
                    <input id="reg-diachi" name="address" [(ngModel)]="form.address" [placeholder]="t('ui.common.addressPlaceholder')" autocomplete="street-address" [disabled]="loading()" />
                  </div>
                  @if (errors().address) { <span class="field-err">{{ errors().address }}</span> }
                </div>
              }

              <div class="section-divider">{{ t('ui.register.sectionContact') }}</div>

              <div class="two">
                <div class="field">
                  <label for="reg-email">{{ t('ui.common.email') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().email">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <path d="M4 4h16v16H4z" />
                      <path d="M22 6l-10 7L2 6" />
                    </svg>
                    <input id="reg-email" name="email" type="email" [(ngModel)]="form.email" placeholder="ten@congty.vn" autocomplete="email" [disabled]="loading()" />
                  </div>
                  @if (errors().email) { <span class="field-err">{{ errors().email }}</span> }
                </div>
                <div class="field">
                  <label for="reg-phone">{{ t('ui.common.phone') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().phone">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.5 2.1L8 9.7a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.9.3 1.8.5 2.7.6a2 2 0 011.7 2z" />
                    </svg>
                    <input id="reg-phone" name="phone" [(ngModel)]="form.phone" [placeholder]="t('ui.common.phonePlaceholder')" autocomplete="tel" [disabled]="loading()" />
                  </div>
                  @if (errors().phone) { <span class="field-err">{{ errors().phone }}</span> }
                </div>
              </div>

              <div class="two">
                <div class="field">
                  <label for="reg-pass">{{ t('ui.register.password') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().password">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V7a4 4 0 018 0v4" />
                    </svg>
                    <input id="reg-pass" name="password" [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="form.password" [placeholder]="t('ui.login.passwordPlaceholder')" autocomplete="new-password" [disabled]="loading()" />
                    <button class="eye-btn" type="button" [attr.aria-label]="showPassword() ? t('ui.login.hidePassword') : t('ui.login.showPassword')" (click)="showPassword.set(!showPassword())">
                      @if (showPassword()) {
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2"><path d="M17.94 17.94A10.5 10.5 0 0112 20c-7 0-11-8-11-8a18.5 18.5 0 015.06-5.94M9.9 4.24A9.5 9.5 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" /></svg>
                      } @else {
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
                      }
                    </button>
                  </div>
                  @if (errors().password) { <span class="field-err">{{ errors().password }}</span> }
                </div>
                <div class="field">
                  <label for="reg-pass2">{{ t('ui.register.confirmPassword') }} <span class="req">*</span></label>
                  <div class="input-wrap" [class.is-invalid]="!!errors().confirmPassword">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2">
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V7a4 4 0 018 0v4" />
                    </svg>
                    <input id="reg-pass2" name="confirmPassword" [type]="showConfirm() ? 'text' : 'password'" [(ngModel)]="form.confirmPassword" autocomplete="new-password" [disabled]="loading()" />
                    <button class="eye-btn" type="button" [attr.aria-label]="showConfirm() ? t('ui.login.hidePassword') : t('ui.login.showPassword')" (click)="showConfirm.set(!showConfirm())">
                      @if (showConfirm()) {
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2"><path d="M17.94 17.94A10.5 10.5 0 0112 20c-7 0-11-8-11-8a18.5 18.5 0 015.06-5.94M9.9 4.24A9.5 9.5 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" /></svg>
                      } @else {
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
                      }
                    </button>
                  </div>
                  @if (errors().confirmPassword) { <span class="field-err">{{ errors().confirmPassword }}</span> }
                </div>
              </div>
              <div class="hint">{{ t('ui.register.passwordHint') }}</div>

              <label class="terms">
                <input type="checkbox" [formControl]="termsControl" [attr.aria-invalid]="termsControl.touched && termsControl.invalid" />
                <span>
                  {{ t('ui.register.termsPrefix') }}
                  <button type="button" class="terms-link" (click)="openTerms($event)">{{ t('ui.register.termsLinkUse') }}</button>
                  {{ t('ui.register.termsConjunction') }}
                  <button type="button" class="terms-link" (click)="openTerms($event)">{{ t('ui.register.termsLinkPrivacy') }}</button>
                  <span class="req">*</span>
                </span>
              </label>
              @if (termsControl.touched && termsControl.invalid) {
                <p class="terms-error">{{ t('ui.register.termsRequired') }}</p>
              }

              <button class="btn-register-main" type="submit" [disabled]="loading() || termsControl.invalid" [attr.title]="termsControl.invalid ? t('ui.register.submitDisabledHint') : null">
                {{ loading() ? t('ui.register.submitting') : t('ui.register.submit') }}
              </button>
              @if (termsControl.invalid) {
                <p class="submit-hint">{{ t('ui.register.submitDisabledHint') }}</p>
              }
            }

            <a routerLink="/login" class="btn-login-link">
              <span class="muted">{{ t('ui.register.haveAccount') }}</span>{{ t('ui.register.backToLogin') }}
            </a>
          </form>
        </div>
      </div>

      @if (termsOpen()) {
        <sg-modal [title]="t('ui.register.termsModalTitle')" (close)="termsOpen.set(false)">
          <div class="terms-doc">
            <h3>{{ t('ui.register.termsSection1Title') }}</h3>
            <p>{{ t('ui.register.termsSection1Body') }}</p>
            <h3>{{ t('ui.register.termsSection2Title') }}</h3>
            <p>{{ t('ui.register.termsSection2Body') }}</p>
          </div>
          <div modal-footer>
            <button type="button" class="btn-register-main btn-register-main--modal" (click)="termsOpen.set(false)">{{ t('ui.common.close') }}</button>
          </div>
        </sg-modal>
      }
    </main>
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ template MH02 (register_screen.html), khoanh trong :host. */
      :host {
        display: block;
        --navy-900: #0b2545;
        --blue-600: #1c5fc9;
        --blue-500: #2f7bf0;
        --blue-100: #e8f0ff;
        --gold-500: #c8a24a;
        --ink-900: #0f172a;
        --ink-500: #5b6b82;
        --t-line: #e3e8f0;
        --t-bg: #f4f7fb;
        --red-600: #d23b3b;
      }

      .page {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 40px 20px;
        background: var(--t-bg);
        color: var(--ink-900);
      }
      .top-lang-bar {
        position: absolute;
        top: 20px;
        right: 24px;
        z-index: 100;
      }
      .screen {
        display: grid;
        grid-template-columns: 1fr 1.35fr;
        width: 100%;
        max-width: 1180px;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 10px 40px rgba(15, 30, 60, 0.12);
        background: #fff;
        min-height: 760px;
      }

      /* ---------------- HERO (TRÁI) ---------------- */
      .left {
        position: relative;
        background: linear-gradient(165deg, #0b2545 0%, #123f7a 45%, #1c5fc9 100%);
        padding: 40px 36px 30px;
        display: flex;
        flex-direction: column;
        color: #fff;
        overflow: hidden;
      }
      .left::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 15% 15%, rgba(200, 162, 74, 0.25), transparent 45%),
          repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.035) 0 2px, transparent 2px 40px);
        pointer-events: none;
      }
      .eyebrow {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 10.5px;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: var(--gold-500);
        margin-bottom: 12px;
      }
      .left-head { position: relative; z-index: 1; margin-bottom: 18px; }
      .left-head h1 { font-size: 24px; line-height: 1.35; margin: 0 0 6px; font-weight: 800; }
      .left-head .gate-name {
        font-size: 13.5px;
        font-weight: 700;
        color: #fff;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .left-head p { margin: 0; font-size: 13px; color: #cfe0ff; font-weight: 500; line-height: 1.5; }
      .illustration {
        position: relative;
        z-index: 1;
        border-radius: 12px;
        overflow: hidden;
        background: linear-gradient(180deg, #9fc7e8, #dcebf5 55%, #e9dcae 100%);
        min-height: 180px;
        display: flex;
        align-items: flex-end;
      }
      .illustration svg { width: 100%; height: auto; display: block; }
      .benefits { position: relative; z-index: 1; margin-top: 18px; display: flex; flex-direction: column; gap: 10px; }
      .benefit {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        padding: 11px 13px;
      }
      .benefit .ic {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.14);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .benefit .txt .t1 { font-size: 12.5px; font-weight: 700; color: #fff; margin-bottom: 2px; }
      .benefit .txt .t2 { font-size: 11px; color: #cfe0ff; line-height: 1.4; }

      /* ---------------- FORM (PHẢI) ---------------- */
      .right {
        padding: 30px 44px 32px;
        display: flex;
        flex-direction: column;
        overflow: auto;
      }
      .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
      .emblem {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(160deg, #d21f2f, #a5121f);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 0 2px var(--gold-500);
        flex-shrink: 0;
      }
      .emblem svg { width: 22px; height: 22px; }
      .brand-text .name { font-size: 14.5px; font-weight: 700; color: var(--navy-900); line-height: 1.25; }
      .brand-text .sub { font-size: 10.3px; letter-spacing: 0.03em; color: var(--ink-500); font-weight: 600; text-transform: uppercase; }

      .form-title { font-size: 20px; font-weight: 700; color: var(--navy-900); margin: 0 0 4px; }
      .form-sub { font-size: 12.5px; color: var(--ink-500); margin: 0 0 18px; }

      form { display: block; }
      .alert-slot { margin-bottom: 16px; }

      /* Loại tài khoản */
      .seg-group { margin-bottom: 20px; }
      .seg-label { display: block; font-size: 13px; font-weight: 600; color: var(--ink-900); margin-bottom: 8px; }
      .req { color: var(--red-600); }
      .seg-control { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .seg-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1.6px solid var(--t-line);
        border-radius: 10px;
        padding: 12px 14px;
        background: #fff;
        cursor: pointer;
        text-align: left;
        min-height: auto;
        transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
      }
      .seg-btn:disabled { cursor: not-allowed; opacity: 0.6; }
      .seg-btn .seg-ic {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        flex-shrink: 0;
        background: var(--t-bg);
        color: var(--ink-500);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .seg-btn .seg-txt { display: grid; gap: 2px; min-width: 0; }
      .seg-btn .seg-txt strong { font-size: 13px; font-weight: 700; color: var(--ink-900); }
      .seg-btn .seg-txt small { font-size: 10.5px; color: var(--ink-500); font-weight: 500; }
      .seg-btn.active { border-color: var(--blue-500); background: var(--blue-100); box-shadow: 0 0 0 3px rgba(47, 123, 240, 0.12); }
      .seg-btn.active .seg-ic { background: var(--blue-600); color: #fff; }

      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

      .field { margin-bottom: 16px; }
      .field > label { display: block; font-size: 13px; font-weight: 600; color: var(--ink-900); margin-bottom: 7px; }
      .input-wrap {
        position: relative;
        display: flex;
        align-items: center;
        border: 1.5px solid var(--t-line);
        border-radius: 8px;
        background: #fff;
        padding: 0 12px;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .input-wrap:focus-within { border-color: var(--blue-500); box-shadow: 0 0 0 3px rgba(47, 123, 240, 0.14); }
      .input-wrap.is-invalid { border-color: var(--red-600); background: #fffafa; }
      .input-wrap > svg { flex-shrink: 0; opacity: 0.55; }
      .input-wrap input {
        border: none;
        outline: none;
        flex: 1;
        width: auto;
        min-height: auto;
        padding: 12px 10px;
        font-size: 14px;
        color: var(--ink-900);
        background: transparent;
      }
      .input-wrap input:focus-visible { outline: none; }
      .input-wrap input::placeholder { color: #9aa7ba; }
      .eye-btn {
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.55;
        padding: 4px;
        display: flex;
        min-height: auto;
        border-radius: 0;
      }
      .eye-btn:hover { opacity: 0.9; background: none; filter: none; }
      .field-err { display: block; margin-top: 6px; font-size: 11.5px; font-weight: 700; color: var(--red-600); }
      .field-hint { display: block; margin-top: 6px; font-size: 11.5px; color: var(--ink-500); }
      .hint { font-size: 11.5px; color: var(--ink-500); margin: -6px 0 16px; line-height: 1.5; }

      .section-divider {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 2px 0 16px;
        font-size: 11px;
        font-weight: 700;
        color: var(--ink-500);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .section-divider::after { content: ''; flex: 1; height: 1px; background: var(--t-line); }

      .terms {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        font-size: 12.3px;
        color: var(--ink-500);
        margin: 2px 0 18px;
        line-height: 1.5;
        cursor: pointer;
      }
      .terms input {
        margin-top: 2px;
        accent-color: var(--blue-600);
        width: 15px;
        height: 15px;
        min-height: auto;
        flex-shrink: 0;
      }
      .terms-error { margin: -12px 0 16px; color: var(--red-600); font-size: 11.5px; font-weight: 700; }
      .terms-link {
        display: inline;
        padding: 0;
        margin: 0;
        border: 0;
        min-height: auto;
        background: none;
        color: var(--blue-600);
        font-size: inherit;
        font-weight: 700;
        text-decoration: underline;
        cursor: pointer;
      }
      .terms-link:hover { color: var(--blue-500); background: none; filter: none; }
      .submit-hint { margin: 8px 0 0; text-align: center; color: var(--ink-500); font-size: 11.5px; }
      .terms-doc h3 { margin: 0 0 6px; font-size: 14px; color: var(--navy-900); }
      .terms-doc h3 + p { margin: 0 0 16px; }
      .terms-doc p { font-size: 13px; color: var(--ink-500); line-height: 1.6; }
      .btn-register-main--modal { width: auto; padding: 10px 20px; }

      .btn-register-main {
        width: 100%;
        padding: 13px;
        border: none;
        border-radius: 8px;
        background: linear-gradient(180deg, var(--blue-500), var(--blue-600));
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        min-height: auto;
        cursor: pointer;
        box-shadow: 0 6px 16px rgba(28, 95, 201, 0.28);
        transition: transform 0.12s, box-shadow 0.12s;
      }
      .btn-register-main:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(28, 95, 201, 0.34); filter: none; }
      .btn-register-main:disabled { opacity: 0.7; cursor: default; transform: none; }

      .btn-login-link {
        display: block;
        width: 100%;
        text-align: center;
        padding: 12px;
        margin-top: 12px;
        border-radius: 8px;
        border: 1.5px dashed var(--blue-500);
        background: #f3f8ff;
        color: var(--blue-600);
        font-size: 14px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .btn-login-link:hover { background: #e8f1ff; border-color: var(--blue-600); }
      .btn-login-link .muted { font-weight: 500; color: var(--ink-500); margin-right: 4px; }

      @media (max-width: 860px) {
        .screen { grid-template-columns: 1fr; }
        .left { order: -1; min-height: 240px; }
        .two { grid-template-columns: 1fr; }
        .seg-control { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class RegisterPageComponent {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  /** Hàm dịch dùng thẳng trong template; đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;

  protected form = {
    accountType: 'ENTERPRISE' as AccountType,
    username: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    taxCode: '',
    representativeName: '',
    idNumber: '',
    address: '',
    email: '',
    phone: '',
  };
  protected readonly loading = signal(false);
  private readonly appMessages = inject(AppMessageService);

  protected readonly success = signal(false);
  protected readonly errors = signal<RegisterErrors>(NO_ERRORS);


  protected readonly showPassword = signal(false);
  protected readonly showConfirm = signal(false);
  /** Hộp thoại xem Điều khoản sử dụng và Chính sách bảo mật (BUG-077). */
  protected readonly termsOpen = signal(false);

  /** Mở hộp thoại điều khoản; chặn nổi bọt để không vô tình tick/bỏ tick ô đồng ý bao quanh. */
  protected openTerms(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.termsOpen.set(true);
  }

  /**
   * Đồng ý điều khoản — control reactive RIÊNG, cố ý KHÔNG nằm trong `form` nên không lọt vào payload
   * gửi BE (contract POST /auth/register giữ nguyên). `requiredTrue` khóa nút Đăng ký tới khi người
   * dùng tự tick; đây là ràng buộc client-side thuần túy.
   */
  protected readonly termsControl = new FormControl(false, {
    nonNullable: true,
    // Gói trong arrow thay vì truyền tham chiếu `Validators.requiredTrue` trực tiếp — tránh cảnh báo
    // unbound-method (truyền static method chưa bind), vẫn là ValidatorFn hợp lệ.
    validators: (control) => Validators.requiredTrue(control),
  });

  /** Đổi loại tài khoản: xoá lỗi các trường phụ thuộc loại để không giữ lỗi cũ của loại vừa rời. */
  protected setAccountType(type: AccountType): void {
    if (this.loading() || this.form.accountType === type) return;
    this.form.accountType = type;
    this.errors.set({ ...this.errors(), displayName: '', taxCode: '', representativeName: '', idNumber: '' });
  }

  protected submit(): void {
    if (this.loading()) return;

    const errors = this.validate();
    this.errors.set(errors);

    if (Object.values(errors).some((value) => !!value)) return;

    this.loading.set(true);
    const isEnterprise = this.form.accountType === 'ENTERPRISE';
    const payload: RegisterPayload = {
      accountType: this.form.accountType,
      username: this.form.username.trim(),
      password: this.form.password,
      displayName: this.form.displayName.trim(),
      email: this.form.email.trim(),
      phone: this.form.phone.trim(),
      address: this.form.address.trim(),
      // Chỉ gửi trường định danh khớp loại — không lẫn MST/người đại diện vào tài khoản cá nhân và ngược lại.
      ...(isEnterprise
        ? { taxCode: this.form.taxCode.trim(), representativeName: this.form.representativeName.trim() }
        : { idNumber: this.form.idNumber.trim() }),
    };
    this.api
      .register(payload)
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.success.set(true);
        },
        error: (err) => {
          this.loading.set(false);
          const errorMsg = this.i18n.apiError(err, 'ui.register.failed');
          const KNOWN_FIELDS = ['username', 'password', 'confirmPassword', 'email', 'phone', 'address'];
          if (isEnterprise) KNOWN_FIELDS.push('taxCode', 'representativeName');
          else KNOWN_FIELDS.push('idNumber');
          
          const { fieldErrors, unmappedMessages, hasKnownField } = processApiErrors(
            err,
            errorMsg,
            KNOWN_FIELDS,
            (e) => this.i18n.fieldError(e)
          );

          this.errors.update(e => ({ ...e, ...fieldErrors }));

          if (unmappedMessages.length > 0) {
            this.notify(unmappedMessages.join('; '), 'error');
          } else if (!hasKnownField) {
            this.notify(errorMsg, 'error');
          }
        },
      });
  }

  private validateUsername(username: string): string {
    const trimmed = username.trim();

    // 1. Kiểm tra để trống
    if (!trimmed) {
      return this.t('ui.register.usernameRequired');
    }

    // 2. Kiểm tra độ dài (3 - 30 ký tự)
    if (trimmed.length < 3 || trimmed.length > 30) {
      return this.t('ui.register.usernameLengthInvalid');
    }

    // 3. Kiểm tra định dạng (chỉ chữ không dấu, số, dấu _, -, .)
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      return this.t('ui.register.usernamePatternInvalid');
    }

    return '';
  }

  private validate(): RegisterErrors {
    const isEnterprise = this.form.accountType === 'ENTERPRISE';
    const nameRequiredKey = isEnterprise ? 'ui.register.enterpriseNameRequired' : 'ui.register.nameRequired';
    const phoneTrimmed = this.form.phone.trim();
    const taxCodeTrimmed = this.form.taxCode.trim();
    const idNumberTrimmed = this.form.idNumber.trim();
    const password = this.form.password;

    return {
      username: this.validateUsername(this.form.username),
      displayName: this.form.displayName.trim() ? '' : this.t(nameRequiredKey),
      taxCode: !isEnterprise || (taxCodeTrimmed.length >= 10 && taxCodeTrimmed.length <= 14) ? '' : this.t('ui.register.taxCodeRequired'),
      representativeName:
        !isEnterprise || this.form.representativeName.trim() ? '' : this.t('ui.register.representativeRequired'),
      idNumber: isEnterprise
        ? ''
        : !idNumberTrimmed
          ? this.t('ui.register.idNumberRequired')
          : idNumberTrimmed.length >= 6 && idNumberTrimmed.length <= 50
            ? ''
            : this.t('ui.register.idNumberInvalid'),
      address: this.form.address.trim().length >= 3 ? '' : this.t('ui.register.addressRequired'),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim()) ? '' : this.t('ui.register.emailInvalid'),
      phone: /^(0[3|5|7|8|9])[0-9]{8}$/.test(phoneTrimmed) || /^[0-9+\s.-]{8,15}$/.test(phoneTrimmed) ? '' : this.t('ui.register.phoneInvalid'),
      password: (password.length >= 8 && password.length <= 50 && this.scoreOf(password) >= 3) ? '' : this.t('ui.register.weakPassword'),
      confirmPassword: password === this.form.confirmPassword ? '' : this.t('ui.register.confirmMismatch'),
    };
  }

  private scoreOf(value: string): number {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return score;
  }

  private notify(message: string, type: 'success' | 'error' | 'info'): void {
    this.appMessages.show(message, type);
  }
}
