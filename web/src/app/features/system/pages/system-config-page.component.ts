import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/message-catalog';
import { SystemSetting, SystemSettingUpdate } from '../../../core/models/admin.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';

/** Nhãn tiêu đề của từng tham số — tra theo **mã ASCII** (khóa cấu hình), không so chuỗi hiển thị. */
const FIELD_LABEL_KEYS: Record<string, MessageKey> = {
  'yard.maxStorageHours': 'ui.systemConfig.fieldYardHours',
  'fee.paymentDeadlineHours': 'ui.systemConfig.fieldFeeHours',
  'fee.enabled': 'ui.systemConfig.fieldFeeEnabled',
};

/** Mô tả phụ (hint) của tham số luận lý — tra theo **mã ASCII**; không có thì dùng chuỗi mặc định. */
const FIELD_HINT_KEYS: Record<string, MessageKey> = {
  'fee.enabled': 'ui.systemConfig.hintFeeEnabled',
};

/** Kiểu giá trị luận lý (mã ASCII trong hợp đồng BE) — render bằng công tắc bật/tắt thay vì ô số. */
const BOOLEAN_VALUE_TYPE = 'boolean';

/**
 * BA-092 — màn "Cấu hình hệ thống".
 *
 * Danh sách tham số vận hành do quản trị viên (SYS_ADMIN) chỉnh; mỗi tham số là một ô số nguyên với
 * khoảng hợp lệ (min–max) và giá trị mặc định. Lưu bằng `PUT /system/settings`; giá trị được các phân
 * hệ (thu phí, kho bãi) đọc thật khi tính cờ quá hạn. Xem cần `system.view`, nút Lưu cần `system.update`.
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    RouterLink,
    HasPermissionDirective,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.systemConfig.title') }}</h1>
        <p class="head__desc">{{ t('ui.systemConfig.subtitle') }}</p>
      </div>
    </section>

    @if (loading()) {
      <sg-card>
        <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.systemConfig.loading') }}</p>
      </sg-card>
    } @else if (!settings().length) {
      <sg-card>
        <p class="state">{{ t('ui.common.empty') }}</p>
      </sg-card>
    } @else {
      <!-- 1. KPI Metric Banner trên đầu trang -->
      <div class="kpi-banner">
        <div class="kpi-card kpi-card--teal">
          <div class="kpi-card__icon">
            <mat-icon fontSet="material-icons-round">warehouse</mat-icon>
          </div>
          <div class="kpi-card__body">
            <span class="kpi-card__label">{{ t('ui.systemConfig.kpiYardTitle') }}</span>
            <span class="kpi-card__value">{{ draft['yard.maxStorageHours'] || '48' }} <small>h</small></span>
          </div>
        </div>

        <div class="kpi-card kpi-card--amber">
          <div class="kpi-card__icon">
            <mat-icon fontSet="material-icons-round">payments</mat-icon>
          </div>
          <div class="kpi-card__body">
            <span class="kpi-card__label">{{ t('ui.systemConfig.kpiFeeTitle') }}</span>
            <span class="kpi-card__value">{{ draft['fee.paymentDeadlineHours'] || '72' }} <small>h</small></span>
          </div>
        </div>

        <div class="kpi-card kpi-card--indigo">
          <div class="kpi-card__icon">
            <mat-icon fontSet="material-icons-round">alt_route</mat-icon>
          </div>
          <div class="kpi-card__body">
            <span class="kpi-card__label">{{ t('ui.systemConfig.kpiModuleTitle') }}</span>
            <span class="kpi-card__value kpi-card__value--status" [class.kpi-card__value--on]="isOn('fee.enabled')">
              {{ isOn('fee.enabled') ? t('ui.systemConfig.kpiActive') : t('ui.systemConfig.kpiInactive') }}
            </span>
          </div>
        </div>
      </div>

      <!-- 2. Bố cục 2 cột chính -->
      <div class="config-grid">
        <!-- Cột trái: Form điều chỉnh tham số & Thẻ lưu ý an toàn -->
        <div class="main-column">
          <sg-card class="form-card">
            <div class="card-header">
              <div class="card-header__icon">
                <mat-icon fontSet="material-icons-round">settings_suggest</mat-icon>
              </div>
              <div>
                <h2 class="card-title">{{ t('ui.systemConfig.title') }}</h2>
                <p class="card-subtitle">{{ t('ui.systemConfig.subtitle') }}</p>
              </div>
            </div>

            <div class="form">
              @for (setting of settings(); track setting.key) {
                <sg-form-field
                  [label]="labelFor(setting)"
                  [error]="fieldErrors()[setting.key]"
                  [hint]="hintFor(setting)"
                >
                  @if (isBoolean(setting)) {
                    <div class="switch">
                      <input
                        type="checkbox"
                        class="switch__input"
                        [name]="setting.key"
                        [attr.aria-label]="labelFor(setting)"
                        [checked]="isOn(setting.key)"
                        (change)="setBoolean(setting.key, $any($event.target).checked)"
                      />
                      <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
                      <span class="switch__state">
                        {{ isOn(setting.key) ? t('ui.systemConfig.toggleOn') : t('ui.systemConfig.toggleOff') }}
                      </span>
                    </div>
                  } @else {
                    <input
                      type="number"
                      [name]="setting.key"
                      [min]="setting.min"
                      [max]="setting.max"
                      step="1"
                      [attr.aria-label]="labelFor(setting)"
                      [(ngModel)]="draft[setting.key]"
                    />
                  }
                  <span class="meta">
                    @if (setting.updatedAt) {
                      {{ t('ui.systemConfig.updatedAt') }}: {{ formatDate(setting.updatedAt) }}
                    } @else {
                      {{ t('ui.systemConfig.usingDefault') }}
                    }
                  </span>
                </sg-form-field>
              }
            </div>

            <div *hasPermission="'system.update'" class="actions">
              <button type="button" sgButton [disabled]="saving()" (click)="save()">
                <mat-icon fontSet="material-icons-round">save</mat-icon>
                {{ saving() ? t('ui.common.saving') : t('ui.common.save') }}
              </button>
              <button type="button" sgButton="secondary" [disabled]="saving()" (click)="resetDefaults()">
                <mat-icon fontSet="material-icons-round">restart_alt</mat-icon>
                {{ t('ui.systemConfig.btnResetDefault') }}
              </button>
              <button type="button" class="btn-undo" [disabled]="saving()" (click)="undoDraft()">
                <mat-icon fontSet="material-icons-round">undo</mat-icon>
                {{ t('ui.systemConfig.btnUndo') }}
              </button>
            </div>
          </sg-card>

          <!-- Thẻ Lưu ý quản trị an toàn -->
          <sg-card class="security-card">
            <div class="panel-header">
              <mat-icon fontSet="material-icons-round" class="panel-icon panel-icon--amber">shield</mat-icon>
              <div>
                <h3 class="panel-title">{{ t('ui.systemConfig.securityTitle') }}</h3>
              </div>
            </div>
            <ul class="security-notes">
              <li>
                <mat-icon fontSet="material-icons-round">check_circle</mat-icon>
                <span>{{ t('ui.systemConfig.securityNote1') }}</span>
              </li>
              <li>
                <mat-icon fontSet="material-icons-round">check_circle</mat-icon>
                <span>{{ t('ui.systemConfig.securityNote2') }}</span>
              </li>
              <li>
                <mat-icon fontSet="material-icons-round">check_circle</mat-icon>
                <span>{{ t('ui.systemConfig.securityNote3') }}</span>
              </li>
            </ul>
          </sg-card>
        </div>

        <!-- Cột phải: Hướng dẫn nghiệp vụ, Luồng liên kết & Phân hệ liên quan -->
        <div class="side-panel">
          <!-- Card 1: Hướng dẫn tham số & Tác động -->
          <sg-card class="guide-card">
            <div class="panel-header">
              <mat-icon fontSet="material-icons-round" class="panel-icon panel-icon--blue">lightbulb</mat-icon>
              <div>
                <h3 class="panel-title">{{ t('ui.systemConfig.guideTitle') }}</h3>
                <p class="panel-desc">{{ t('ui.systemConfig.guideSubtitle') }}</p>
              </div>
            </div>

            <div class="guide-items">
              <div class="guide-item">
                <div class="guide-item__icon guide-item__icon--teal">
                  <mat-icon fontSet="material-icons-round">local_shipping</mat-icon>
                </div>
                <div class="guide-item__content">
                  <strong class="guide-item__title">{{ t('ui.systemConfig.guideYardTitle') }}</strong>
                  <p class="guide-item__desc">{{ t('ui.systemConfig.guideYardDesc') }}</p>
                </div>
              </div>

              <div class="guide-item">
                <div class="guide-item__icon guide-item__icon--amber">
                  <mat-icon fontSet="material-icons-round">schedule</mat-icon>
                </div>
                <div class="guide-item__content">
                  <strong class="guide-item__title">{{ t('ui.systemConfig.guideFeeTitle') }}</strong>
                  <p class="guide-item__desc">{{ t('ui.systemConfig.guideFeeDesc') }}</p>
                </div>
              </div>

              <div class="guide-item">
                <div class="guide-item__icon guide-item__icon--indigo">
                  <mat-icon fontSet="material-icons-round">alt_route</mat-icon>
                </div>
                <div class="guide-item__content">
                  <strong class="guide-item__title">{{ t('ui.systemConfig.guideSwitchTitle') }}</strong>
                  <p class="guide-item__desc">{{ t('ui.systemConfig.guideSwitchDesc') }}</p>
                </div>
              </div>
            </div>
          </sg-card>

          <!-- Card 2: Sơ đồ luồng quy trình & Thông tin hệ thống -->
          <sg-card class="pipeline-card">
            <div class="panel-header">
              <mat-icon fontSet="material-icons-round" class="panel-icon panel-icon--emerald">hub</mat-icon>
              <div>
                <h3 class="panel-title">{{ t('ui.systemConfig.pipelineTitle') }}</h3>
              </div>
            </div>

            <div class="workflow-steps">
              <div class="step-badge">
                <span class="step-num">1</span>
                <span class="step-text">{{ t('ui.systemConfig.stepDossier') }}</span>
              </div>
              <mat-icon fontSet="material-icons-round" class="step-arrow">arrow_forward</mat-icon>
              <div class="step-badge step-badge--active">
                <span class="step-num">2</span>
                <span class="step-text">{{ t('ui.systemConfig.stepYard') }}</span>
              </div>
              <mat-icon fontSet="material-icons-round" class="step-arrow">arrow_forward</mat-icon>
              <div class="step-badge">
                <span class="step-num">3</span>
                <span class="step-text">{{ t('ui.systemConfig.stepInterAgency') }}</span>
              </div>
              <mat-icon fontSet="material-icons-round" class="step-arrow">arrow_forward</mat-icon>
              <div class="step-badge step-badge--active">
                <span class="step-num">4</span>
                <span class="step-text">{{ t('ui.systemConfig.stepFee') }}</span>
              </div>
              <mat-icon fontSet="material-icons-round" class="step-arrow">arrow_forward</mat-icon>
              <div class="step-badge">
                <span class="step-num">5</span>
                <span class="step-text">{{ t('ui.systemConfig.stepGate') }}</span>
              </div>
            </div>

            <div class="spec-header">
              <mat-icon fontSet="material-icons-round">verified_user</mat-icon>
              <h4 class="spec-title">{{ t('ui.systemConfig.infoTitle') }}</h4>
            </div>

            <div class="spec-list">
              <div class="spec-row">
                <span class="spec-label">{{ t('ui.systemConfig.infoScope') }}</span>
                <span class="spec-value spec-value--badge">{{ t('ui.systemConfig.infoScopeVal') }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">{{ t('ui.systemConfig.infoSync') }}</span>
                <span class="spec-value spec-value--live">
                  <span class="pulse-dot"></span>
                  {{ t('ui.systemConfig.infoSyncVal') }}
                </span>
              </div>
              <div class="spec-row">
                <span class="spec-label">{{ t('ui.systemConfig.infoSecurity') }}</span>
                <span class="spec-value spec-value--badge">{{ t('ui.systemConfig.infoSecurityVal') }}</span>
              </div>
            </div>
          </sg-card>

          <!-- Card 3: Phân hệ liên kết nhanh -->
          <sg-card class="links-card">
            <div class="panel-header">
              <mat-icon fontSet="material-icons-round" class="panel-icon panel-icon--indigo">dashboard_customize</mat-icon>
              <div>
                <h3 class="panel-title">{{ t('ui.systemConfig.quickLinksTitle') }}</h3>
              </div>
            </div>

            <div class="quick-links-grid">
              <a routerLink="/operations/customs-b5" class="quick-link-item">
                <mat-icon fontSet="material-icons-round" class="quick-link-icon">map</mat-icon>
                <div class="quick-link-text">
                  <strong>{{ t('ui.systemConfig.quickLinkYard') }}</strong>
                  <small>{{ t('ui.systemConfig.quickLinkYardDesc') }}</small>
                </div>
                <mat-icon fontSet="material-icons-round" class="quick-link-chevron">chevron_right</mat-icon>
              </a>

              <a routerLink="/fees/rules" class="quick-link-item">
                <mat-icon fontSet="material-icons-round" class="quick-link-icon">receipt_long</mat-icon>
                <div class="quick-link-text">
                  <strong>{{ t('ui.systemConfig.quickLinkFee') }}</strong>
                  <small>{{ t('ui.systemConfig.quickLinkFeeDesc') }}</small>
                </div>
                <mat-icon fontSet="material-icons-round" class="quick-link-chevron">chevron_right</mat-icon>
              </a>

              <a routerLink="/admin/catalog" class="quick-link-item">
                <mat-icon fontSet="material-icons-round" class="quick-link-icon">folder_special</mat-icon>
                <div class="quick-link-text">
                  <strong>{{ t('ui.systemConfig.quickLinkCatalog') }}</strong>
                  <small>{{ t('ui.systemConfig.quickLinkCatalogDesc') }}</small>
                </div>
                <mat-icon fontSet="material-icons-round" class="quick-link-chevron">chevron_right</mat-icon>
              </a>

              <a routerLink="/admin/audit" class="quick-link-item">
                <mat-icon fontSet="material-icons-round" class="quick-link-icon">history</mat-icon>
                <div class="quick-link-text">
                  <strong>{{ t('ui.systemConfig.quickLinkAudit') }}</strong>
                  <small>{{ t('ui.systemConfig.quickLinkAuditDesc') }}</small>
                </div>
                <mat-icon fontSet="material-icons-round" class="quick-link-chevron">chevron_right</mat-icon>
              </a>
            </div>
          </sg-card>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .head { margin-bottom: var(--sg-space-4); }
      .head h1 { margin: 0; }
      .head__desc { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); }

      /* Top KPI Banner */
      .kpi-banner {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: var(--sg-space-4);
        margin-bottom: var(--sg-space-5);
      }
      .kpi-card {
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-4);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface, #fff);
        border: 1px solid var(--sg-border);
        box-shadow: var(--sg-shadow-card, 0 1px 3px rgba(0,0,0,0.05));
      }
      .kpi-card__icon {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 10px;
        flex-shrink: 0;
      }
      .kpi-card__icon mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }
      .kpi-card--teal .kpi-card__icon {
        background: rgba(20, 184, 166, 0.12);
        color: #0d9488;
      }
      .kpi-card--amber .kpi-card__icon {
        background: rgba(245, 158, 11, 0.12);
        color: #d97706;
      }
      .kpi-card--indigo .kpi-card__icon {
        background: rgba(99, 102, 241, 0.12);
        color: #4f46e5;
      }
      .kpi-card__body {
        display: flex;
        flex-direction: column;
      }
      .kpi-card__label {
        font-size: 12px;
        color: var(--sg-text-muted);
        font-weight: 500;
      }
      .kpi-card__value {
        font-size: 20px;
        font-weight: 700;
        color: var(--ink-900);
        line-height: 1.2;
      }
      .kpi-card__value small {
        font-size: 13px;
        font-weight: 600;
        color: var(--sg-text-muted);
      }
      .kpi-card__value--status {
        font-size: 14px;
        color: var(--sg-text-muted);
      }
      .kpi-card__value--on {
        color: #059669;
      }

      /* 2-Column Grid */
      .config-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--sg-space-6);
        align-items: start;
      }
      @media (min-width: 1024px) {
        .config-grid {
          grid-template-columns: minmax(420px, 1.1fr) minmax(380px, 1fr);
        }
      }

      .main-column {
        display: grid;
        gap: var(--sg-space-5);
      }

      .card-header {
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        margin-bottom: var(--sg-space-4);
        padding-bottom: var(--sg-space-3);
        border-bottom: 1px solid var(--sg-border);
      }
      .card-header__icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: var(--sg-primary-soft, #e8f0fe);
        color: var(--sg-primary);
      }
      .card-title {
        margin: 0;
        font-size: var(--sg-base-size, 16px);
        font-weight: 700;
        color: var(--ink-900);
      }
      .card-subtitle {
        margin: 2px 0 0;
        font-size: var(--sg-small-size, 13px);
        color: var(--sg-text-muted);
      }

      .form { display: grid; gap: var(--sg-space-4); }
      .meta { display: block; margin-top: var(--sg-space-1); font-size: var(--sg-small-size); color: var(--sg-text-muted); }
      .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--sg-space-2);
        margin-top: var(--sg-space-5);
        padding-top: var(--sg-space-3);
        border-top: 1px solid var(--sg-border);
      }
      .actions button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .actions button mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .btn-undo {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--sg-radius);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .btn-undo:hover:not(:disabled) {
        background: var(--sg-bg-subtle);
        color: var(--ink-900);
      }
      .btn-undo:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Security Card */
      .security-card {
        background: #fff;
      }
      .security-notes {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--sg-space-2);
      }
      .security-notes li {
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-2);
        font-size: 12.5px;
        color: var(--sg-text-muted);
        line-height: 1.45;
      }
      .security-notes li mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: #d97706;
        margin-top: 2px;
        flex-shrink: 0;
      }

      /* Side Panel */
      .side-panel {
        display: grid;
        gap: var(--sg-space-5);
      }

      .panel-header {
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-3);
        margin-bottom: var(--sg-space-4);
      }
      .panel-icon {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        font-size: 20px;
        flex-shrink: 0;
      }
      .panel-icon--blue {
        background: rgba(47, 111, 237, 0.1);
        color: var(--sg-primary, #2f6fed);
      }
      .panel-icon--emerald {
        background: rgba(16, 185, 129, 0.1);
        color: #059669;
      }
      .panel-icon--amber {
        background: rgba(245, 158, 11, 0.1);
        color: #d97706;
      }
      .panel-icon--indigo {
        background: rgba(99, 102, 241, 0.1);
        color: #4f46e5;
      }

      .panel-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: var(--ink-900);
      }
      .panel-desc {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--sg-text-muted);
        line-height: 1.4;
      }

      .guide-items {
        display: grid;
        gap: var(--sg-space-3);
      }
      .guide-item {
        display: flex;
        align-items: flex-start;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-subtle);
        border: 1px solid rgba(0, 0, 0, 0.04);
        transition: transform 0.15s ease, background-color 0.15s ease;
      }
      .guide-item:hover {
        background: #fff;
        border-color: var(--sg-border);
        box-shadow: var(--sg-shadow-card, 0 1px 3px rgba(0,0,0,0.05));
      }
      .guide-item__icon {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        flex-shrink: 0;
      }
      .guide-item__icon mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .guide-item__icon--teal {
        background: rgba(20, 184, 166, 0.12);
        color: #0d9488;
      }
      .guide-item__icon--amber {
        background: rgba(245, 158, 11, 0.12);
        color: #d97706;
      }
      .guide-item__icon--indigo {
        background: rgba(99, 102, 241, 0.12);
        color: #4f46e5;
      }

      .guide-item__content {
        flex: 1;
        min-width: 0;
      }
      .guide-item__title {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-900);
        margin-bottom: 2px;
      }
      .guide-item__desc {
        margin: 0;
        font-size: 12px;
        line-height: 1.45;
        color: var(--sg-text-muted);
      }

      /* Pipeline Steps */
      .workflow-steps {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        padding: var(--sg-space-3);
        background: var(--sg-bg-subtle);
        border-radius: var(--sg-radius);
        margin-bottom: var(--sg-space-4);
      }
      .step-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 8px;
        background: #fff;
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius-pill);
        font-size: 11.5px;
        font-weight: 600;
        color: var(--ink-900);
      }
      .step-badge--active {
        background: var(--sg-primary-soft, #e8f0fe);
        border-color: var(--sg-primary);
        color: var(--sg-primary);
      }
      .step-num {
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--sg-bg-subtle);
        font-size: 10px;
        font-weight: 700;
      }
      .step-badge--active .step-num {
        background: var(--sg-primary);
        color: #fff;
      }
      .step-arrow {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--sg-text-muted);
      }

      /* Spec list */
      .spec-header {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        margin: var(--sg-space-4) 0 var(--sg-space-2);
        padding-top: var(--sg-space-3);
        border-top: 1px solid var(--sg-border);
        color: var(--ink-900);
      }
      .spec-header mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #059669;
      }
      .spec-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: var(--ink-900);
      }
      .spec-list {
        display: grid;
        gap: var(--sg-space-2);
      }
      .spec-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-2);
        padding: 6px 0;
        border-bottom: 1px dashed var(--sg-border);
        font-size: 12.5px;
      }
      .spec-row:last-child {
        border-bottom: none;
      }
      .spec-label {
        color: var(--sg-text-muted);
      }
      .spec-value {
        font-weight: 600;
        color: var(--ink-900);
      }
      .spec-value--badge {
        padding: 2px 8px;
        background: var(--sg-bg-subtle);
        border-radius: var(--sg-radius-pill);
        font-size: 11.5px;
      }
      .spec-value--live {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #059669;
        font-size: 12px;
      }
      .pulse-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
      }

      /* Quick links grid */
      .quick-links-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--sg-space-2);
      }
      .quick-link-item {
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-subtle);
        text-decoration: none;
        color: var(--ink-900);
        border: 1px solid transparent;
        transition: all 0.15s ease;
      }
      .quick-link-item:hover {
        background: #fff;
        border-color: var(--sg-border);
        box-shadow: var(--sg-shadow-card, 0 1px 3px rgba(0,0,0,0.05));
        transform: translateX(2px);
      }
      .quick-link-icon {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--sg-primary-soft, #e8f0fe);
        color: var(--sg-primary);
        font-size: 18px;
        flex-shrink: 0;
      }
      .quick-link-text {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .quick-link-text strong {
        font-size: 13px;
        color: var(--ink-900);
      }
      .quick-link-text small {
        font-size: 11.5px;
        color: var(--sg-text-muted);
      }
      .quick-link-chevron {
        font-size: 18px;
        color: var(--sg-text-muted);
      }

      /* Công tắc bật/tắt cho tham số luận lý (CR29). Ô checkbox thật ẩn đi nhưng vẫn nhận focus/bàn phím. */
      .switch { display: inline-flex; align-items: center; gap: var(--sg-space-2); cursor: pointer; }
      .switch__input { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
      .switch__track {
        position: relative; display: inline-block; width: 44px; height: 24px;
        background: var(--sg-border); border-radius: 999px; transition: background 0.15s ease;
      }
      .switch__thumb {
        position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
        background: #fff; border-radius: 50%; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        transition: transform 0.15s ease;
      }
      .switch__input:checked + .switch__track { background: var(--sg-primary); }
      .switch__input:checked + .switch__track .switch__thumb { transform: translateX(20px); }
      .switch__input:focus-visible + .switch__track { outline: 2px solid var(--sg-primary); outline-offset: 2px; }
      .switch__state { font-weight: 700; font-size: var(--sg-small-size); }
      .state { display: flex; align-items: center; justify-content: center; gap: var(--sg-space-2); padding: var(--sg-space-8); color: var(--sg-text-muted); }
    `,
  ],
})
export class SystemConfigPageComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly appMessages = inject(AppMessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly settings = signal<SystemSetting[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  /** Lỗi validate theo từng tham số (khóa theo mã cấu hình) — hiện ngay dưới ô nhập. */
  protected readonly fieldErrors = signal<Record<string, string>>({});
  /** Giá trị đang sửa, khóa theo mã tham số (chuỗi, vì input number cũng nhả chuỗi). */
  protected draft: Record<string, string> = {};

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getSystemSettings().subscribe({
      next: (list) => {
        this.loading.set(false);
        this.apply(list ?? []);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.settings.set([]);
        this.appMessages.showApiError(err, 'ui.systemConfig.loadFailed');
      },
    });
  }

  private apply(list: SystemSetting[]): void {
    this.settings.set(list);
    const draft: Record<string, string> = {};
    list.forEach((item) => (draft[item.key] = String(item.value)));
    this.draft = draft;
  }

  protected labelFor(setting: SystemSetting): string {
    const key = FIELD_LABEL_KEYS[setting.key];
    return key ? this.t(key) : setting.key;
  }

  /** Tham số luận lý (CR29) → render bằng công tắc bật/tắt thay vì ô nhập số. */
  protected isBoolean(setting: SystemSetting): boolean {
    return setting.valueType === BOOLEAN_VALUE_TYPE;
  }

  /** Trạng thái bật của một công tắc theo giá trị đang sửa (chuẩn hoá `'true'`/`'false'`). */
  protected isOn(key: string): boolean {
    return this.draft[key] === 'true';
  }

  /** Ghi trạng thái công tắc về nháp dạng chuỗi `'true'`/`'false'` khớp hợp đồng BE. */
  protected setBoolean(key: string, checked: boolean): void {
    this.draft[key] = checked ? 'true' : 'false';
  }

  /** Gợi ý dưới control: tham số luận lý có mô tả riêng; số nguyên hiện khoảng hợp lệ. */
  protected hintFor(setting: SystemSetting): string {
    if (this.isBoolean(setting)) {
      const key = FIELD_HINT_KEYS[setting.key];
      return key ? this.t(key) : '';
    }
    return this.t('ui.systemConfig.rangeHint', { min: setting.min, max: setting.max, default: setting.defaultValue });
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('vi-VN');
  }

  protected resetDefaults(): void {
    for (const setting of this.settings()) {
      this.draft[setting.key] = setting.defaultValue;
    }
    this.fieldErrors.set({});
    this.appMessages.showKey('ui.systemConfig.resetDefaultSuccess', 'info');
  }

  protected undoDraft(): void {
    for (const setting of this.settings()) {
      this.draft[setting.key] = String(setting.value);
    }
    this.fieldErrors.set({});
    this.appMessages.showKey('ui.systemConfig.undoSuccess', 'info');
  }

  protected save(): void {
    const items: SystemSettingUpdate[] = [];
    // Lỗi validate theo từng tham số → hiện tại ô nhập tương ứng, không dồn lên banner.
    for (const setting of this.settings()) {
      // Tham số luận lý (CR29) chỉ có 2 giá trị hợp lệ, không cần kiểm khoảng số.
      if (this.isBoolean(setting)) {
        items.push({ key: setting.key, value: this.isOn(setting.key) ? 'true' : 'false' });
        continue;
      }
      const raw = String(this.draft[setting.key] ?? '').trim();
      const value = Number(raw);
      if (raw === '' || !Number.isInteger(value) || value < setting.min || value > setting.max) {
        this.fieldErrors.set({
          [setting.key]: this.t('ui.systemConfig.invalidValue', { label: this.labelFor(setting), min: setting.min, max: setting.max }),
        });
        this.focusField(setting.key);
        this.appMessages.showKey('ui.common.formHasErrors', 'error');
        return;
      }
      items.push({ key: setting.key, value: String(value) });
    }
    this.fieldErrors.set({});

    this.saving.set(true);
    this.api.updateSystemSettings(items).subscribe({
      next: (list) => {
        this.saving.set(false);
        this.apply(list ?? []);
        this.appMessages.showKey('ui.systemConfig.saved', 'success');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.appMessages.showApiError(err, 'ui.systemConfig.saveFailed');
      },
    });
  }

  /** Cuộn tới và focus ô nhập của tham số bị lỗi để người dùng sửa ngay. */
  private focusField(key: string): void {
    setTimeout(() => {
      const input = this.host.nativeElement.querySelector<HTMLInputElement>(`input[name="${key}"]`);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
    });
  }
}
