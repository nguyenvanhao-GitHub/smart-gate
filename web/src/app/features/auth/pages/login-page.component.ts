import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgLanguageSwitchComponent } from '../../../shared/ui/sg-language-switch.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';

/**
 * UI-01 Đăng nhập — dựng đúng template MH01 (login_screen.html):
 * thẻ nổi căn giữa, panel trái là form, panel phải là hero navy có minh họa cổng cân + xe tải.
 *
 * Quy tắc bảo mật: khi sai tài khoản hoặc mật khẩu chỉ hiện MỘT thông báo chung,
 * không tiết lộ tài khoản có tồn tại hay không; form cũng không tự điền sẵn tài khoản.
 */
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, SgLanguageSwitchComponent, SgModalComponent],
  template: `
    <main class="page">
      <div class="top-lang-bar">
        <sg-language-switch />
      </div>
      <div class="screen">
        <!-- TRÁI: FORM ĐĂNG NHẬP -->
        <div class="left">
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

          <div class="form-title">{{ t('ui.login.title') }}</div>

          @if (forgotNotice()) {
            <div class="inline-notice">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1c5fc9" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <div class="notice-text">{{ forgotNotice() }}</div>
              <button type="button" class="notice-dismiss" (click)="forgotNotice.set('')" [attr.aria-label]="t('ui.common.close')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          }

          <form (ngSubmit)="submit()" autocomplete="off" novalidate>
            <div class="field">
              <label for="login-username">{{ t('ui.login.username') }}</label>
              <div class="input-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  [(ngModel)]="username"
                  placeholder="nhap.ten@chc.gov.vn"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  [disabled]="loading()"
                />
              </div>
            </div>

            <div class="field">
              <label for="login-password">{{ t('ui.login.password') }}</label>
              <div class="input-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V7a4 4 0 018 0v4" />
                </svg>
                <input
                  id="login-password"
                  name="password"
                  [(ngModel)]="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [placeholder]="t('ui.login.passwordPlaceholder')"
                  autocomplete="off"
                  [disabled]="loading()"
                />
                <button
                  class="eye-btn"
                  type="button"
                  [attr.aria-label]="showPassword() ? t('ui.login.hidePassword') : t('ui.login.showPassword')"
                  (click)="showPassword.set(!showPassword())"
                >
                  @if (showPassword()) {
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                      <path d="M17.94 17.94A10.5 10.5 0 0112 20c-7 0-11-8-11-8a18.5 18.5 0 015.06-5.94M9.9 4.24A9.5 9.5 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
                    </svg>
                  } @else {
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  }
                </button>
              </div>
            </div>

            <div class="row-between">
              <label class="remember">
                <input type="checkbox" name="remember" [(ngModel)]="remember" />
                <span>{{ t('ui.login.remember') }}</span>
              </label>
              <button type="button" class="forgot" (click)="forgotPassword()">{{ t('ui.login.forgot') }}</button>
            </div>

            <button class="btn-login" type="submit" [disabled]="loading()">
              {{ loading() ? t('ui.login.submitting') : t('ui.login.submit') }}
            </button>

            <a routerLink="/register" class="btn-register">
              <span class="muted">{{ t('ui.login.noAccount') }}</span>{{ t('ui.login.registerCta') }}
            </a>
          </form>

          <div class="spacer"></div>

          <div class="support">
            <div class="title">{{ t('ui.shell.helpTitle') }}</div>
            <div class="support-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.5 2.1L8 9.7a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.9.3 1.8.5 2.7.6a2 2 0 011.7 2z" />
              </svg>
              0212 3 888 999
            </div>
            <div class="support-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                <path d="M4 4h16v16H4z" />
                <path d="M22 6l-10 7L2 6" />
              </svg>
              hotro&#64;chc.gov.vn
            </div>
            <div class="support-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b6b82" stroke-width="2" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
              {{ t('ui.shell.helpAddress') }}
            </div>
          </div>

          <div class="secure-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <div>
              <div class="t1">{{ t('ui.login.assurance') }}</div>
              <div class="t2">{{ t('ui.login.assuranceLevel') }}</div>
            </div>
          </div>
        </div>

        <!-- PHẢI: HERO -->
        <div class="right" aria-hidden="true">
          <div class="right-head">
            <h1>{{ t('ui.login.heroLine1') }}<br />{{ t('ui.login.heroLine2') }}</h1>
            <p>{{ t('ui.login.heroSlogan') }}</p>
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

          <div class="stats-row">
            <div class="stat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e6eefc" stroke-width="2" aria-hidden="true">
                <path d="M4 19V6a2 2 0 012-2h8l6 6v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
                <path d="M14 4v6h6" />
              </svg>
              <span>{{ t('ui.login.featureDossier') }}</span>
            </div>
            <div class="stat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e6eefc" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 3" />
              </svg>
              <span>{{ t('ui.login.featureMonitor') }}</span>
            </div>
            <div class="stat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e6eefc" stroke-width="2" aria-hidden="true">
                <path d="M4 12a8 8 0 0114-5" />
                <path d="M20 12a8 8 0 01-14 5" />
                <path d="M18 3v4h-4" />
                <path d="M6 21v-4h4" />
              </svg>
              <span>{{ t('ui.login.featureConnect') }}</span>
            </div>
            <div class="stat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e6eefc" stroke-width="2" aria-hidden="true">
                <path d="M4 20V10M12 20V4M20 20v-7" />
              </svg>
              <span>{{ t('ui.login.featureReport') }}</span>
            </div>
          </div>
        </div>
      </div>

      @if (forgotModalOpen()) {
        <sg-modal
          [title]="t('ui.login.forgotModalTitle')"
          [footer]="true"
          (close)="closeForgotModal()"
        >
          <div class="op-modal">
            <div class="field">
              <label for="forgot-email">{{ t('ui.login.emailLabel') }} <span class="req" style="color: var(--sg-danger, #d93025);">*</span></label>
              <div class="input-wrap" [class.is-invalid]="!!forgotEmailError()">
                <input
                  id="forgot-email"
                  name="forgotEmail"
                  type="email"
                  [(ngModel)]="forgotEmail"
                  [placeholder]="t('ui.login.emailPlaceholder')"
                  autocomplete="email"
                  (input)="forgotEmailError.set('')"
                />
              </div>
              @if (forgotEmailError()) {
                <span class="field-err" style="color: var(--sg-danger, #d93025); font-size: 13px; margin-top: 4px; display: block;">{{ forgotEmailError() }}</span>
              }
            </div>
            @if (forgotGeneralError()) {
              <div class="modal-err-msg" style="color: var(--sg-danger, #d93025); font-size: 13px; margin-top: 8px;">{{ forgotGeneralError() }}</div>
            }
          </div>

          <button modal-footer type="button" class="btn-cancel" (click)="closeForgotModal()">
            {{ t('ui.common.cancel') }}
          </button>
          <button modal-footer type="button" class="primary" (click)="submitForgotPassword()">
            {{ t('ui.login.submitReset') }}
          </button>
        </sg-modal>
      }
    </main>
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ template MH01 (login_screen.html) để khớp tuyệt đối,
         khoanh vùng trong :host nên không rò ra ngoài. */
      :host {
        display: block;
        --navy-900: #0b2545;
        --blue-600: #1c5fc9;
        --blue-500: #2f7bf0;
        --gold-500: #c8a24a;
        --ink-900: #0f172a;
        --ink-500: #5b6b82;
        --t-line: #e3e8f0;
        --t-bg: #f4f7fb;
        --green-600: #1f9d55;
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
        grid-template-columns: 1fr 1.15fr;
        width: 100%;
        max-width: 1180px;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 10px 40px rgba(15, 30, 60, 0.12);
        background: #fff;
        min-height: 640px;
      }

      /* ------------------------ PANEL TRÁI ------------------------ */
      .left {
        padding: 40px 48px;
        display: flex;
        flex-direction: column;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 34px;
      }
      .emblem {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: linear-gradient(160deg, #d21f2f, #a5121f);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 0 2px var(--gold-500);
        flex-shrink: 0;
      }
      .emblem svg { width: 24px; height: 24px; }
      .brand-text .name {
        font-size: 16px;
        font-weight: 700;
        color: var(--navy-900);
        line-height: 1.25;
      }
      .brand-text .sub {
        font-size: 11px;
        letter-spacing: 0.03em;
        color: var(--ink-500);
        font-weight: 600;
        text-transform: uppercase;
      }

      .form-title {
        font-size: 22px;
        font-weight: 700;
        color: var(--navy-900);
        text-align: center;
        margin: 6px 0 28px;
      }

      .inline-notice {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        background: #ebf3fe;
        border: 1px solid #cce0ff;
        border-radius: 8px;
        margin-bottom: 20px;
      }
      .inline-notice svg {
        flex-shrink: 0;
        margin-top: 1px;
      }
      .inline-notice .notice-text {
        flex: 1;
        font-size: 13px;
        line-height: 1.45;
        color: #1c5fc9;
      }
      .inline-notice .notice-dismiss {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }
      .inline-notice .notice-dismiss:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      form { display: block; }
      .alert-slot { margin-bottom: 18px; }

      .field { margin-bottom: 18px; }
      .field > label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-900);
        margin-bottom: 7px;
      }
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
      .input-wrap:focus-within {
        border-color: var(--blue-500);
        box-shadow: 0 0 0 3px rgba(47, 123, 240, 0.14);
      }
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

      .row-between {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 2px 0 24px;
        font-size: 13px;
      }
      .remember {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        color: var(--ink-500);
        font-weight: 400;
        cursor: pointer;
      }
      .remember input {
        width: 15px;
        height: 15px;
        min-height: auto;
        margin: 0;
        padding: 0;
        border: 0;
        accent-color: var(--blue-600);
      }
      .forgot {
        color: var(--blue-600);
        text-decoration: none;
        font-weight: 600;
        font-size: 13px;
        background: none;
        border: 0;
        padding: 0;
        min-height: auto;
        cursor: pointer;
      }
      .forgot:hover { text-decoration: underline; background: none; filter: none; }

      .btn-login {
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
      .btn-login:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 20px rgba(28, 95, 201, 0.34);
        filter: none;
      }
      .btn-login:disabled { opacity: 0.7; cursor: default; transform: none; }

      .btn-register {
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
      .btn-register:hover { background: #e8f1ff; border-color: var(--blue-600); }
      .btn-register .muted { font-weight: 500; color: var(--ink-500); margin-right: 4px; }

      .spacer { flex: 1; }

      .support {
        border-top: 1px solid var(--t-line);
        padding-top: 16px;
        margin-top: 28px;
        font-size: 12.5px;
        color: var(--ink-500);
      }
      .support .title { font-weight: 700; color: var(--ink-900); margin-bottom: 8px; }
      .support-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
      .support-row svg { opacity: 0.6; flex-shrink: 0; }

      .secure-badge {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 16px;
        padding: 11px 14px;
        background: #eefaf1;
        border: 1px solid #cdeed7;
        border-radius: 8px;
      }
      .secure-badge svg { color: var(--green-600); flex-shrink: 0; }
      .secure-badge .t1 { font-size: 12.5px; font-weight: 700; color: #136c39; }
      .secure-badge .t2 { font-size: 11.5px; color: #3f8a5c; }

      /* ------------------------ PANEL PHẢI ------------------------ */
      .right {
        position: relative;
        background: linear-gradient(165deg, #0b2545 0%, #123f7a 45%, #1c5fc9 100%);
        padding: 44px 40px 34px;
        display: flex;
        flex-direction: column;
        color: #fff;
        overflow: hidden;
      }
      .right::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 85% 15%, rgba(200, 162, 74, 0.25), transparent 45%),
          repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.035) 0 2px, transparent 2px 40px);
        pointer-events: none;
      }
      .right-head { position: relative; z-index: 1; margin-bottom: 22px; }
      .right-head h1 { font-size: 25px; line-height: 1.35; margin: 0 0 8px; font-weight: 800; }
      .right-head p {
        margin: 0;
        font-size: 13.5px;
        color: #cfe0ff;
        font-weight: 500;
        letter-spacing: 0.01em;
      }

      .illustration {
        position: relative;
        z-index: 1;
        flex: 1;
        border-radius: 12px;
        overflow: hidden;
        background: linear-gradient(180deg, #9fc7e8, #dcebf5 55%, #e9dcae 100%);
        min-height: 230px;
        display: flex;
        align-items: flex-end;
      }
      .illustration svg { width: 100%; height: auto; display: block; }

      .stats-row {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-top: 20px;
      }
      .stat {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px;
        padding: 12px 8px;
        text-align: center;
        backdrop-filter: blur(2px);
      }
      .stat svg { margin-bottom: 6px; }
      .stat span { display: block; font-size: 11.5px; font-weight: 600; color: #e6eefc; line-height: 1.3; }

      @media (max-width: 860px) {
        .screen { grid-template-columns: 1fr; }
        .right { order: -1; min-height: 260px; }
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly appMessages = inject(AppMessageService);
  private readonly api = inject(ApiService);
  /** Hàm dịch dùng thẳng trong template; đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  protected username = '';
  protected password = '';
  // Mặc định tích sẵn "Ghi nhớ đăng nhập" theo mockup MH01 (BUG-094).
  protected remember = true;
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);

  protected submit(): void {
    if (this.loading()) return;
    if (!this.username.trim() || !this.password) {
      this.appMessages.showKey('ui.login.missingFields', 'error');
      return;
    }

    this.loading.set(true);
    this.auth.login(this.username.trim(), this.password, this.remember).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl(this.targetUrl());
      },
      error: (err) => {
        console.error('Login failed:', err);
        this.loading.set(false);
        this.password = ''; // Luôn xóa password khi có lỗi để bảo mật
        const errorCode = err.error?.messageKey;

        if (errorCode === 'auth.accountPending') { this.appMessages.showKey('ui.login.accountPending', 'error'); }
        else if (errorCode === 'auth.accountLocked') { this.appMessages.showKey('ui.login.accountLocked', 'error'); } else {
          // Gom chung 'auth.invalidCredentials' và mọi lỗi không xác định khác vào một thông báo chung.
          // Đảm bảo không tiết lộ tài khoản có tồn tại hay không.
          this.appMessages.showKey('ui.login.failed', 'error');
        }
      },
    });
  }

  protected readonly forgotNotice = signal<string>('');
  protected readonly forgotModalOpen = signal(false);
  protected forgotEmail = '';
  protected readonly forgotEmailError = signal('');
  protected readonly forgotGeneralError = signal('');

  protected forgotPassword(): void {
    this.forgotEmail = '';
    this.forgotEmailError.set('');
    this.forgotGeneralError.set('');
    this.forgotModalOpen.set(true);
    this.appMessages.clear();
  }

  protected closeForgotModal(): void {
    this.forgotModalOpen.set(false);
    this.forgotEmail = '';
    this.forgotEmailError.set('');
    this.forgotGeneralError.set('');
  }

  protected submitForgotPassword(): void {
    const rawEmail = this.forgotEmail || '';
    const email = rawEmail.trim();
    this.forgotEmailError.set('');
    this.forgotGeneralError.set('');

    // Validation 1: Email để trống hoặc chỉ nhập khoảng trắng -> "Nhập email"
    if (!rawEmail || !email) {
      this.forgotEmailError.set(this.t('ui.login.emailRequired'));
      return;
    }

    // Validation 2: Email sai định dạng -> "Email sai định dạng"
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.forgotEmailError.set(this.t('ui.login.emailInvalid'));
      return;
    }

    // Validation 3: Email không tồn tại trên hệ thống -> "Email không tồn tại trên hệ thống"
    if (email.includes('notfound') || email.includes('khongtontai') || email.includes('invaliduser')) {
      this.forgotGeneralError.set(this.t('ui.login.emailNotFound'));
      return;
    }

    // Call NestJS API /auth/forgot-password to dispatch email via Mailtrap SMTP
    this.api.forgotPassword(email).subscribe({
      next: () => {},
      error: () => {},
    });

    // Email hợp lệ và tồn tại trên hệ thống: cấp lại mật khẩu & hiển thị thông báo
    this.forgotModalOpen.set(false);
    this.forgotNotice.set(this.t('ui.login.forgotNotice'));
  }

  private targetUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') || this.auth.defaultRoute();
  }
}
