import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PERMISSION } from '../../../core/auth/access-control.model';
import { AppMessageService, AppMessageTone } from '../../../core/services/app-message.service';
import { extractFieldErrors, toFieldErrorMap } from '../../../core/forms/field-errors';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { CatalogItem } from '../../../core/models/admin.model';
import {
  DOSSIER_TYPE_LABEL_KEYS,
  dossierTypeLabel,
  vehicleTypeLabel,
} from '../../../core/models/declaration.model';
import {
  CreateFeeRulePayload,
  FEE_TYPE_CODES,
  FEE_UNIT_CODES,
  FeeRuleGroup,
  FeeRuleVersion,
  UpdateFeeRulePayload,
  feeRuleStatusLabel,
  feeRuleStatusTone,
  feeTypeLabel,
  feeUnitLabel,
  formatMoney,
  groupFeeRuleVersions,
} from '../../../core/models/fees.model';

/** Trạng thái biểu mẫu thêm/sửa một bản biểu phí. */
interface RuleForm {
  code: string;
  name: string;
  feeType: string;
  unit: string;
  amount: number;
  currency: string;
  effectiveFrom: string;
  description: string;
  appliesTo: string[];
}

const DEFAULT_VEHICLE_CODES = ['TRUCK', 'CONTAINER', 'TRACTOR', 'TANKER', 'EMPTY'];

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, SgAlertComponent, SgModalComponent],
  template: `
    <section class="page-header">
      <div class="page-header__titles">
        <h1>{{ t('ui.feeRule.title') }}</h1>
        <p class="page-header__sub">{{ t('ui.feeRule.subtitle') }}</p>
      </div>
      @if (canManage()) {
        <button
          type="button"
          class="btn-add"
          [title]="t('ui.feeRule.addNew')"
          [attr.aria-label]="t('ui.feeRule.addNew')"
          (click)="openCreate()"
        >
          <mat-icon fontSet="material-icons-round">add</mat-icon>
          <span>{{ t('ui.feeRule.addNew') }}</span>
        </button>
      }
    </section>

    <sg-alert class="op-alert" type="info" [message]="t('ui.feeRule.provisionalBanner')" />

    @if (loading()) {
      <p class="state-note">{{ t('ui.common.loading') }}</p>
    } @else if (error()) {
      <p class="state-note">{{ error() }}</p>
    } @else if (!groups().length) {
      <p class="state-note">{{ t('ui.feeRule.empty') }}</p>
    } @else {
      <section class="stats" [attr.aria-label]="t('ui.feeRule.title')">
        <article class="kpi" data-tone="total">
          <span class="kpi__ico"><mat-icon fontSet="material-icons-round">receipt_long</mat-icon></span>
          <div class="kpi__body">
            <strong>{{ totalTypes() }}</strong>
            <span>{{ t('ui.feeRule.statTotal') }}</span>
            <small class="kpi__hint">{{ t('ui.feeRule.statTotalHint') }}</small>
          </div>
        </article>
        <article class="kpi" data-tone="done">
          <span class="kpi__ico"><mat-icon fontSet="material-icons-round">check_circle</mat-icon></span>
          <div class="kpi__body">
            <strong>{{ activeCount() }}</strong>
            <span>{{ t('ui.feeRule.statActive') }}</span>
            <small class="kpi__hint">{{ t('ui.feeRule.statActiveHint') }}</small>
          </div>
        </article>
        <article class="kpi" data-tone="idle">
          <span class="kpi__ico"><mat-icon fontSet="material-icons-round">pause_circle</mat-icon></span>
          <div class="kpi__body">
            <strong>{{ closedCount() }}</strong>
            <span>{{ t('ui.feeRule.statInactive') }}</span>
            <small class="kpi__hint">{{ t('ui.feeRule.statInactiveHint') }}</small>
          </div>
        </article>
        <article class="kpi" data-tone="money">
          <span class="kpi__ico"><mat-icon fontSet="material-icons-round">payments</mat-icon></span>
          <div class="kpi__body">
            <strong>{{ avgAmountLabel() }}</strong>
            <span>{{ t('ui.feeRule.statAvg') }}</span>
            <small class="kpi__hint">{{ t('ui.feeRule.statAvgHint') }}</small>
          </div>
        </article>
      </section>

      <section class="filter-bar">
        <div class="filter-search-wrap">
          <mat-icon fontSet="material-icons-round" class="filter-search-icon">search</mat-icon>
          <input
            type="search"
            class="filter-search"
            [ngModel]="ruleSearch()"
            (ngModelChange)="ruleSearch.set($event)"
            [placeholder]="t('ui.feeRule.searchPlaceholder')"
            [attr.aria-label]="t('ui.feeRule.searchPlaceholder')"
          />
        </div>
        <div class="filter-control">
          <span class="filter-label">{{ t('ui.feeRule.colType') }}</span>
          <select
            class="filter-select"
            [ngModel]="feeTypeFilter()"
            (ngModelChange)="feeTypeFilter.set($event)"
            [attr.aria-label]="t('ui.feeRule.colType')"
          >
            <option value="">{{ t('ui.feeRule.filterAll') }}</option>
            @for (code of feeTypes; track code) {
              <option [value]="code">{{ typeLabel(code) }}</option>
            }
          </select>
        </div>
        <div class="filter-control">
          <span class="filter-label">{{ t('ui.feeRule.filterVehicleType') }}</span>
          <select
            class="filter-select"
            [ngModel]="vehicleTypeFilter()"
            (ngModelChange)="vehicleTypeFilter.set($event)"
            [attr.aria-label]="t('ui.feeRule.filterVehicleType')"
          >
            <option value="">{{ t('ui.feeRule.filterAll') }}</option>
            @for (code of vehicleTypes(); track code) {
              <option [value]="code">{{ vehicleLabel(code) }}</option>
            }
          </select>
        </div>
        <div class="filter-control">
          <span class="filter-label">{{ t('ui.feeRule.colAppliesTo') }}</span>
          <select
            class="filter-select"
            [ngModel]="scopeFilter()"
            (ngModelChange)="scopeFilter.set($event)"
            [attr.aria-label]="t('ui.feeRule.colAppliesTo')"
          >
            <option value="">{{ t('ui.feeRule.filterAll') }}</option>
            @for (code of dossierTypes(); track code) {
              <option [value]="code">{{ dossierLabel(code) }}</option>
            }
          </select>
        </div>
        <div class="filter-control">
          <span class="filter-label">{{ t('ui.feeRule.colStatus') }}</span>
          <select
            class="filter-select"
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event)"
            [attr.aria-label]="t('ui.feeRule.colStatus')"
          >
            <option value="">{{ t('ui.feeRule.filterAll') }}</option>
            <option value="active">{{ t('ui.feeRule.statActive') }}</option>
            <option value="scheduled">{{ t('ui.feeRule.statScheduled') }}</option>
            <option value="inactive">{{ t('ui.feeRule.statInactive') }}</option>
          </select>
        </div>
      </section>

      @if (!filteredGroups().length) {
        <p class="state-note">{{ t('ui.feeRule.noMatch') }}</p>
      }

      @for (group of filteredGroups(); track group.feeType) {
        <section class="rule-group table-surface">
          <header class="rule-group__head">
            <div class="rule-group__meta">
              <strong>{{ typeLabel(group.feeType) }}</strong>
            </div>
            <span class="rule-group__count">{{ group.versions.length }} {{ t('ui.feeRule.statTotal') }}</span>
          </header>
          <div class="sg-scroll-x">
            <table>
              <thead>
                <tr>
                  <th>{{ t('ui.feeRule.colName') }}</th>
                  <th>{{ t('ui.feeRule.colEffectiveFrom') }}</th>
                  <th>{{ t('ui.feeRule.colEffectiveTo') }}</th>
                  <th class="num-col">{{ t('ui.feeRule.colAmount') }}</th>
                  <th>{{ t('ui.feeRule.colUnit') }}</th>
                  <th>{{ t('ui.feeRule.colVehicleType') }}</th>
                  <th>{{ t('ui.feeRule.colAppliesTo') }}</th>
                  <th>{{ t('ui.feeRule.colStatus') }}</th>
                  @if (canManage()) {
                    <th class="action-col">{{ t('ui.feeRule.colActions') }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (version of group.versions; track version.id) {
                  <tr>
                    <td><strong>{{ version.name }}</strong></td>
                    <td><span class="mono-cell">{{ version.effectiveFrom }}</span></td>
                    <td><span class="mono-cell">{{ version.effectiveTo || t('ui.feeRule.effectiveOpen') }}</span></td>
                    <td class="num-col"><strong>{{ amountLabel(version) }}</strong></td>
                    <td><span class="unit-tag">{{ unitLabel(version.unit) }}</span></td>
                    <td><span class="applies-text">{{ appliesToVehicleLabel(version.appliesTo) }}</span></td>
                    <td><span class="applies-text">{{ appliesToDossierLabel(version.appliesTo) }}</span></td>
                    <td><span class="status" [attr.data-tone]="statusTone(version.status)">{{ statusLabel(version.status) }}</span></td>
                    @if (canManage()) {
                      <td class="actions">
                        <button
                          type="button"
                          class="action-btn"
                          [title]="t('ui.feeRule.edit')"
                          [attr.aria-label]="t('ui.feeRule.edit')"
                          (click)="openEdit(version)"
                        >
                          <mat-icon fontSet="material-icons-round">edit</mat-icon>
                        </button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    }

    @if (modalMode(); as mode) {
      <sg-modal
        [eyebrow]="t('ui.feeRule.eyebrow')"
        [title]="mode === 'create' ? t('ui.feeRule.modalCreateTitle') : t('ui.feeRule.modalEditTitle')"
        size="xl"
        (close)="closeModal()"
      >
        <div class="rule-modal-content">
          @if (mode === 'create') {
            <sg-alert class="form-alert" type="warning" [message]="t('ui.feeRule.closeWarning')" />
          } @else if (editApplied()) {
            <sg-alert class="form-alert" type="info" [message]="t('ui.feeRule.lockNote')" />
          }

          <div class="rule-form-grid">
            <!-- Mã khoản phí -->
            <div class="form-field">
              <label class="form-label" for="ruleCode">
                <span>{{ t('ui.feeRule.fieldCode') }}</span>
                <span class="req">*</span>
              </label>
              <input
                id="ruleCode"
                type="text"
                name="ruleCode"
                class="form-control"
                [class.is-invalid]="!!fieldErrors()['code']"
                [(ngModel)]="form.code"
                (ngModelChange)="clearFieldError('code')"
                [disabled]="mode === 'edit'"
                [placeholder]="t('ui.feeRule.codeHint')"
                autocomplete="off"
              />
              @if (fieldErrors()['code']) {
                <span class="field-error">{{ fieldErrors()['code'] }}</span>
              }
            </div>

            <!-- Ngày hiệu lực -->
            <div class="form-field">
              <label class="form-label" for="ruleEffectiveFrom">
                <span>{{ t('ui.feeRule.fieldEffectiveFrom') }}</span>
                <span class="req">*</span>
              </label>
              <input
                id="ruleEffectiveFrom"
                type="date"
                name="ruleEffectiveFrom"
                class="form-control"
                [class.is-invalid]="!!fieldErrors()['effectiveFrom']"
                [(ngModel)]="form.effectiveFrom"
                (ngModelChange)="clearFieldError('effectiveFrom')"
                [disabled]="mode === 'edit'"
              />
              @if (fieldErrors()['effectiveFrom']) {
                <span class="field-error">{{ fieldErrors()['effectiveFrom'] }}</span>
              }
            </div>

            <!-- Tên khoản phí (2 cột) -->
            <div class="form-field span-2">
              <label class="form-label" for="ruleName">
                <span>{{ t('ui.feeRule.fieldName') }}</span>
                <span class="req">*</span>
              </label>
              <input
                id="ruleName"
                type="text"
                name="ruleName"
                class="form-control"
                [class.is-invalid]="!!fieldErrors()['name']"
                [(ngModel)]="form.name"
                (ngModelChange)="clearFieldError('name')"
                maxlength="160"
                [placeholder]="t('ui.feeRule.ruleNamePlaceholder')"
              />
              @if (fieldErrors()['name']) {
                <span class="field-error">{{ fieldErrors()['name'] }}</span>
              }
            </div>

            <!-- Nhóm phí -->
            <div class="form-field">
              <label class="form-label" for="ruleFeeType">
                <span>{{ t('ui.feeRule.fieldType') }}</span>
              </label>
              <select
                id="ruleFeeType"
                class="form-control form-select"
                [(ngModel)]="form.feeType"
                [disabled]="moneyLocked()"
              >
                @for (code of feeTypes; track code) {
                  <option [ngValue]="code">{{ typeLabel(code) }}</option>
                }
              </select>
            </div>

            <!-- Đơn vị tính -->
            <div class="form-field">
              <label class="form-label" for="ruleUnit">
                <span>{{ t('ui.feeRule.fieldUnit') }}</span>
              </label>
              <select
                id="ruleUnit"
                class="form-control form-select"
                [(ngModel)]="form.unit"
                [disabled]="moneyLocked()"
              >
                @for (code of feeUnits; track code) {
                  <option [ngValue]="code">{{ unitLabel(code) }}</option>
                }
              </select>
            </div>

            <!-- Mức phí -->
            <div class="form-field">
              <label class="form-label" for="ruleAmount">
                <span>{{ t('ui.feeRule.fieldAmount') }}</span>
                <span class="req">*</span>
              </label>
              <input
                id="ruleAmount"
                type="number"
                name="ruleAmount"
                class="form-control"
                [class.is-invalid]="!!fieldErrors()['amount']"
                min="0"
                step="1"
                [(ngModel)]="form.amount"
                (ngModelChange)="clearFieldError('amount')"
                [disabled]="moneyLocked()"
              />
              @if (fieldErrors()['amount']) {
                <span class="field-error">{{ fieldErrors()['amount'] }}</span>
              } @else {
                <small class="field-hint">{{ t('ui.feeRule.amountHint') }}</small>
              }
            </div>

            <!-- Loại tiền tệ -->
            <div class="form-field">
              <label class="form-label" for="ruleCurrency">
                <span>{{ t('ui.feeRule.fieldCurrency') }}</span>
              </label>
              <input
                id="ruleCurrency"
                type="text"
                class="form-control"
                [(ngModel)]="form.currency"
                maxlength="8"
                [disabled]="moneyLocked()"
                placeholder="VND"
              />
            </div>

            <!-- Đối tượng áp dụng: Loại phương tiện (VEHICLE_TYPE) (2 cột) -->
            <div class="form-field span-2">
              <span class="form-label">
                <span>{{ t('ui.feeRule.fieldVehicleTypes') }}</span>
              </span>
              <div class="applies-card" [class.applies-card--disabled]="moneyLocked()">
                <div class="applies-grid">
                  @for (code of vehicleTypes(); track code) {
                    <label
                      class="applies-chip"
                      [class.applies-chip--selected]="hasApplies(code)"
                      [class.applies-chip--disabled]="moneyLocked()"
                    >
                      <input
                        type="checkbox"
                        class="applies-checkbox"
                        [checked]="hasApplies(code)"
                        [disabled]="moneyLocked()"
                        (change)="toggleApplies(code)"
                      />
                      <span class="applies-title">{{ vehicleLabel(code) }}</span>
                    </label>
                  }
                </div>
                <div class="applies-help">
                  <mat-icon fontSet="material-icons-round">local_shipping</mat-icon>
                  <span>{{ t('ui.feeRule.vehicleTypesHint') }}</span>
                </div>
              </div>
            </div>

            <!-- Loại hình hồ sơ áp dụng (DOSSIER_TYPE) (2 cột) -->
            <div class="form-field span-2">
              <span class="form-label">
                <span>{{ t('ui.feeRule.fieldDossierTypes') }}</span>
              </span>
              <div class="applies-card" [class.applies-card--disabled]="moneyLocked()">
                <div class="applies-grid">
                  @for (code of dossierTypes(); track code) {
                    <label
                      class="applies-chip"
                      [class.applies-chip--selected]="hasApplies(code)"
                      [class.applies-chip--disabled]="moneyLocked()"
                    >
                      <input
                        type="checkbox"
                        class="applies-checkbox"
                        [checked]="hasApplies(code)"
                        [disabled]="moneyLocked()"
                        (change)="toggleApplies(code)"
                      />
                      <span class="applies-title">{{ dossierLabel(code) }}</span>
                    </label>
                  }
                </div>
                <div class="applies-help">
                  <mat-icon fontSet="material-icons-round">description</mat-icon>
                  <span>{{ t('ui.feeRule.dossierTypesHint') }}</span>
                </div>
              </div>
            </div>

            <!-- Mô tả chi tiết (2 cột) -->
            <div class="form-field span-2">
              <label class="form-label" for="ruleDescription">
                <span>{{ t('ui.feeRule.fieldDescription') }}</span>
              </label>
              <textarea
                id="ruleDescription"
                class="form-control form-textarea"
                rows="3"
                maxlength="500"
                [(ngModel)]="form.description"
                [placeholder]="t('ui.feeRule.descriptionPlaceholder')"
              ></textarea>
            </div>
          </div>
        </div>

        <button modal-footer type="button" class="sg-btn sg-btn--secondary" (click)="closeModal()">
          <mat-icon fontSet="material-icons-round">close</mat-icon>
          <span>{{ t('ui.common.cancelAction') }}</span>
        </button>
        <button modal-footer type="button" class="sg-btn sg-btn--primary" [disabled]="saving()" (click)="submit()">
          <mat-icon fontSet="material-icons-round">check</mat-icon>
          <span>{{ saving() ? t('ui.common.saving') : t('ui.common.save') }}</span>
        </button>
      </sg-modal>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --blue-600: #2f6fed;
        --blue-500: #4a84f2;
        --blue-50: #eef3fe;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --amber-500: #e0a72e;
        --amber-50: #fbf3e2;
        --purple-600: #7c5cf0;
        --purple-50: #f1edfe;
        --red-500: #e5484d;
        --red-50: #fdeced;
        --ink-900: #152040;
        --ink-700: #3d4a6b;
        --ink-500: #7885a3;
        --t-line: #e2e6f0;
        --t-line-focus: #4a84f2;
        --t-bg: #f5f7fb;
      }

      /* Header trang */
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--sg-space-3);
        margin-bottom: var(--sg-space-4);
      }
      .page-header__titles h1 {
        font-size: 20px;
        font-weight: 700;
        color: var(--ink-900);
        margin: 0;
        line-height: 1.25;
      }
      .page-header__sub {
        color: var(--ink-500);
        font-size: 13px;
        margin: 4px 0 0;
      }

      /* Nút thêm mới nổi bật */
      .btn-add {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 38px;
        min-height: 38px;
        padding: 0 18px;
        border-radius: 9px;
        background: var(--blue-600);
        color: #ffffff !important;
        font-weight: 600;
        font-size: 13.5px;
        border: none;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(47, 111, 237, 0.32);
        transition: all 0.15s ease;
        white-space: nowrap;
        text-decoration: none;
      }
      .btn-add:hover {
        background: #1b5cd8;
        box-shadow: 0 4px 14px rgba(47, 111, 237, 0.45);
        transform: translateY(-1px);
        filter: none;
      }
      .btn-add:active {
        transform: translateY(0);
      }
      .btn-add mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: #ffffff !important;
        line-height: 1;
        margin: 0 !important;
      }
      .btn-add span {
        display: inline !important;
        color: #ffffff !important;
        font-weight: 600 !important;
        font-size: 13.5px !important;
        margin: 0 !important;
      }

      .op-alert {
        display: block;
        margin-bottom: var(--sg-space-4);
      }
      .state-note {
        color: var(--ink-500);
        padding: var(--sg-space-4);
        text-align: center;
        background: #fff;
        border: 1px solid var(--t-line);
        border-radius: 12px;
      }

      /* Thẻ thống kê KPI */
      .stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--sg-space-4);
        margin-bottom: var(--sg-space-4);
      }
      .kpi {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px 18px;
        border: 1px solid var(--t-line);
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .kpi:hover {
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
      }
      .kpi__ico {
        display: inline-grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 11px;
        flex-shrink: 0;
      }
      .kpi__ico mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }
      .kpi__body strong {
        display: block;
        font-size: 19px;
        font-weight: 700;
        color: var(--ink-900);
        line-height: 1.2;
        overflow-wrap: anywhere;
      }
      .kpi__body span {
        display: block;
        margin-top: 2px;
        color: var(--ink-500);
        font-size: 12px;
        font-weight: 500;
      }
      .kpi__hint {
        display: block;
        margin-top: 3px;
        color: var(--ink-500);
        font-size: 11px;
        line-height: 1.3;
        opacity: 0.85;
      }
      .kpi[data-tone='total'] .kpi__ico { background: var(--blue-50); color: var(--blue-600); }
      .kpi[data-tone='done'] .kpi__ico { background: var(--green-50); color: var(--green-600); }
      .kpi[data-tone='idle'] .kpi__ico { background: var(--amber-50); color: var(--amber-500); }
      .kpi[data-tone='money'] .kpi__ico { background: var(--purple-50); color: var(--purple-600); }

      /* Thanh lọc tìm kiếm & dropdown */
      .filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-bottom: var(--sg-space-4);
        padding: 12px 16px;
        background: #fff;
        border: 1px solid var(--t-line);
        border-radius: 12px;
      }
      .filter-search-wrap {
        position: relative;
        flex: 1;
        min-width: 220px;
        display: flex;
        align-items: center;
      }
      .filter-search-icon {
        position: absolute;
        left: 12px;
        color: var(--ink-500);
        font-size: 20px;
        width: 20px;
        height: 20px;
        pointer-events: none;
      }
      .filter-search {
        width: 100%;
        height: 40px;
        padding: 0 12px 0 38px;
        border: 1px solid var(--t-line);
        border-radius: 9px;
        font: inherit;
        font-size: 13.5px;
        color: var(--ink-900);
        background: var(--t-bg);
        transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      }
      .filter-search:focus {
        background: #fff;
        border-color: var(--blue-500);
        box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
        outline: none;
      }
      .filter-control {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .filter-label {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--ink-700);
        white-space: nowrap;
      }
      .filter-select {
        height: 40px;
        padding: 0 30px 0 12px;
        border: 1px solid var(--t-line);
        border-radius: 9px;
        font: inherit;
        font-size: 13px;
        color: var(--ink-900);
        background: var(--t-bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%237885a3'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") no-repeat right 8px center;
        appearance: none;
        cursor: pointer;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      .filter-select:focus {
        background-color: #fff;
        border-color: var(--blue-500);
        outline: none;
        box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
      }

      /* Nhóm bảng biểu phí */
      .rule-group {
        margin-bottom: var(--sg-space-4);
        border-radius: 14px;
        border: 1px solid var(--t-line);
        background: #fff;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
      }
      .rule-group__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-2);
        padding: 14px 18px;
        border-bottom: 1px solid var(--t-line);
        background: #fff;
      }
      .rule-group__meta {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .rule-group__badge {
        font-family: monospace;
        font-size: 12px;
        font-weight: 700;
        padding: 3px 8px;
        background: var(--blue-50);
        color: var(--blue-600);
        border-radius: 6px;
        letter-spacing: 0.02em;
      }
      .rule-group__head strong {
        font-size: 15px;
        color: var(--ink-900);
        font-weight: 700;
      }
      .rule-group__count {
        color: var(--ink-500);
        font-size: 12px;
        font-weight: 500;
        background: var(--t-bg);
        padding: 4px 10px;
        border-radius: 20px;
      }

      .rule-group table {
        width: 100%;
        border-collapse: collapse;
        min-width: 900px;
      }
      .rule-group th {
        text-align: left;
        padding: 11px 16px;
        background: var(--t-bg);
        color: var(--ink-500);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 1px solid var(--t-line);
      }
      .rule-group th.num-col,
      .rule-group td.num-col {
        text-align: right;
      }
      .rule-group th.action-col,
      .rule-group td.actions {
        text-align: center;
        width: 70px;
      }
      .rule-group td {
        text-align: left;
        padding: 13px 16px;
        font-size: 13px;
        color: var(--ink-900);
        border-bottom: 1px solid var(--t-line);
        vertical-align: middle;
      }
      .rule-group tbody tr:hover {
        background: #f9fbff;
      }
      .rule-group tbody tr:last-child td {
        border-bottom: none;
      }

      .mono-cell {
        font-family: monospace;
        font-size: 12.5px;
        color: var(--ink-700);
      }
      .unit-tag {
        display: inline-block;
        padding: 2px 7px;
        background: var(--t-bg);
        border: 1px solid var(--t-line);
        border-radius: 5px;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--ink-700);
      }
      .applies-text {
        color: var(--ink-700);
        font-size: 12.5px;
      }

      /* Nhãn trạng thái dạng viên thuốc */
      .status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 11px;
        border-radius: 20px;
        font-size: 11.5px;
        font-weight: 600;
        background: var(--t-bg);
        color: var(--ink-500);
      }
      .status::before {
        content: '●';
        font-size: 8px;
        line-height: 1;
      }
      .status[data-tone='done'] {
        background: var(--green-50);
        color: var(--green-600);
      }
      .status[data-tone='waiting'] {
        background: var(--amber-50);
        color: var(--amber-500);
      }
      .status[data-tone='idle'] {
        background: var(--t-bg);
        color: var(--ink-500);
      }

      /* Nút thao tác */
      .action-btn {
        display: inline-grid;
        place-items: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 1px solid var(--t-line);
        background: #fff;
        color: var(--ink-500);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .action-btn:hover {
        border-color: var(--blue-500);
        color: var(--blue-600);
        background: var(--blue-50);
      }
      .action-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      /* =========================================================================
         MODAL BIỂU MẪU (FORM THÊM/SỬA BIỂU PHÍ)
         ========================================================================= */
      .rule-modal-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .form-alert {
        display: block;
        margin-bottom: 4px;
      }

      .rule-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 24px;
        row-gap: 16px;
        align-items: start;
      }
      .rule-form-grid .span-2 {
        grid-column: 1 / -1;
      }

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-label {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-700);
        line-height: 1.3;
      }
      .form-label .req {
        color: var(--red-500);
        font-weight: 700;
        font-style: normal;
        margin-left: 1px;
      }

      .form-control {
        width: 100%;
        height: 42px;
        min-height: 42px;
        padding: 0 13px;
        border: 1px solid var(--t-line);
        border-radius: 9px;
        font-family: inherit;
        font-size: 13.5px;
        font-weight: 400;
        color: var(--ink-900);
        background: #fff;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      .form-control::placeholder {
        font-weight: 100;
      }
      .form-control:focus {
        border-color: var(--blue-500);
        box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.12);
        outline: none;
      }
      .form-control.is-invalid {
        border-color: var(--red-500) !important;
        background-color: #fff8f8;
      }
      .form-control.is-invalid:focus {
        border-color: var(--red-500) !important;
        box-shadow: 0 0 0 3px rgba(229, 72, 77, 0.15) !important;
      }
      .field-error {
        font-size: 12px;
        font-weight: 600;
        color: var(--red-500);
        margin-top: 2px;
        line-height: 1.35;
      }
      .form-control:disabled {
        background: var(--t-bg);
        color: var(--ink-500);
        border-color: var(--t-line);
        cursor: not-allowed;
        opacity: 0.85;
      }

      .form-select {
        padding-right: 32px;
        background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%237885a3'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") no-repeat right 10px center;
        appearance: none;
        cursor: pointer;
      }
      .form-select:disabled {
        background-color: var(--t-bg);
        cursor: not-allowed;
      }

      .form-textarea {
        height: auto;
        min-height: 84px;
        padding: 10px 13px;
        line-height: 1.45;
        resize: vertical;
      }

      .field-hint {
        font-size: 11.5px;
        color: var(--ink-500);
        line-height: 1.35;
        font-weight: 400;
        margin-top: 1px;
      }

      /* Khung Áp dụng cho loại hồ sơ / loại phương tiện */
      .applies-card {
        border: 1px solid var(--t-line);
        border-radius: 11px;
        background: #fbfcfe;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: border-color 0.15s ease;
      }
      .applies-card--disabled {
        background: var(--t-bg);
        opacity: 0.85;
      }
      .applies-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 9px 12px;
      }
      .applies-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 13px;
        border-radius: 8px;
        border: 1px solid var(--t-line);
        background: #fff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: var(--ink-700);
        user-select: none;
        transition: all 0.15s ease;
      }
      .applies-chip:hover:not(.applies-chip--disabled) {
        border-color: var(--blue-500);
        background: var(--blue-50);
        color: var(--blue-600);
      }
      .applies-chip--selected {
        border-color: var(--blue-600);
        background: var(--blue-50);
        color: var(--blue-600);
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(47, 111, 237, 0.08);
      }
      .applies-chip--disabled {
        cursor: not-allowed;
        opacity: 0.75;
      }
      .applies-checkbox {
        width: 16px;
        min-width: 16px;
        height: 16px;
        min-height: 16px;
        margin: 0;
        padding: 0;
        accent-color: var(--blue-600);
        cursor: inherit;
      }
      .applies-help {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        color: var(--ink-500);
      }
      .applies-help mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--ink-500);
      }

      @media (max-width: 900px) {
        .stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 680px) {
        .rule-form-grid {
          grid-template-columns: 1fr;
        }
        .page-header {
          flex-direction: column;
          align-items: stretch;
        }
      }
    `,
  ],
})
export class FeeRuleAdminPageComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;
  private readonly appMessages = inject(AppMessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly groups = signal<FeeRuleGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  /** `null` = đóng modal; 'create'/'edit' = đang mở tương ứng. */
  protected readonly modalMode = signal<'create' | 'edit' | null>(null);
  /** Bản đang sửa (edit) — cần id để `PATCH` và biết đã áp dụng hay chưa. */
  private editing: FeeRuleVersion | null = null;

  protected readonly feeTypes = FEE_TYPE_CODES;
  protected readonly feeUnits = FEE_UNIT_CODES;

  protected readonly vehicleTypeItems = signal<CatalogItem[]>([]);
  protected readonly dossierTypeItems = signal<CatalogItem[]>([]);

  /** Danh sách mã loại phương tiện — nạp từ danh mục chung VEHICLE_TYPE. */
  protected readonly vehicleTypes = computed(() => {
    const items = this.vehicleTypeItems();
    if (items.length > 0) return items.map((i) => i.code);
    return DEFAULT_VEHICLE_CODES;
  });

  /** Danh sách mã loại hồ sơ — nạp từ danh mục chung DOSSIER_TYPE. */
  protected readonly dossierTypes = computed(() => {
    const items = this.dossierTypeItems();
    if (items.length > 0) return items.map((i) => i.code);
    return Object.keys(DOSSIER_TYPE_LABEL_KEYS);
  });

  // Bộ lọc client trên dữ liệu đã tải (không gọi API) — bám filter bar của mẫu.
  protected readonly ruleSearch = signal('');
  /** Lọc theo Nhóm phí: rỗng = tất cả, hoặc mã nhóm phí. */
  protected readonly feeTypeFilter = signal('');
  /** Lọc theo Loại phương tiện: rỗng = tất cả, hoặc mã loại xe. */
  protected readonly vehicleTypeFilter = signal('');
  /** Lọc "Áp dụng cho loại hồ sơ": rỗng = tất cả, hoặc mã loại hồ sơ. */
  protected readonly scopeFilter = signal('');
  /** Lọc trạng thái: rỗng = tất cả, `active` = có bản đang hiệu lực, `scheduled` = có bản chưa tới hiệu lực, `inactive` = không có bản đang hiệu lực (hoặc có bản đã đóng). */
  protected readonly statusFilter = signal('');

  /** Nhóm biểu phí sau khi áp bộ lọc — nguồn cho bảng; thẻ thống kê vẫn tính trên toàn danh mục. */
  protected readonly filteredGroups = computed(() => {
    const query = this.ruleSearch().trim().toLowerCase();
    const feeType = this.feeTypeFilter();
    const vehicle = this.vehicleTypeFilter();
    const scope = this.scopeFilter();
    const status = this.statusFilter();

    return this.groups()
      .filter((group) => {
        if (feeType && group.feeType !== feeType) return false;
        return true;
      })
      .map((group) => {
        const matchingVersions = group.versions.filter((version) => {
          if (query) {
            const matchesQuery = version.name.toLowerCase().includes(query);
            if (!matchesQuery) return false;
          }
          if (vehicle) {
            // appliesTo rỗng nghĩa là áp dụng cho mọi đối tượng.
            const matchesVehicle = !version.appliesTo?.length || version.appliesTo.includes(vehicle);
            if (!matchesVehicle) return false;
          }
          if (scope) {
            // appliesTo rỗng nghĩa là áp dụng cho mọi loại hồ sơ → khớp mọi lựa chọn.
            const matchesScope = !version.appliesTo?.length || version.appliesTo.includes(scope);
            if (!matchesScope) return false;
          }
          if (status) {
            const isActive = version.status === 'ACTIVE';
            const isScheduled = version.status === 'SCHEDULED';
            const isClosed = version.status === 'CLOSED';
            if (status === 'active' && !isActive) return false;
            if (status === 'scheduled' && !isScheduled) return false;
            if (status === 'inactive' && (!isClosed || isActive)) return false;
          }
          return true;
        });

        return {
          ...group,
          versions: matchingVersions,
        };
      })
      .filter((group) => group.versions.length > 0);
  });

  /*
   * Thẻ thống kê tính ở web từ danh sách bản đã tải — không endpoint mới.
   * Trạng thái lấy thẳng cột `status` do API trả (ACTIVE/SCHEDULED/CLOSED), cùng nguồn với
   * `statusTone/statusLabel`; không tự suy từ ngày.
   */
  private readonly allVersions = computed(() => this.groups().flatMap((group) => group.versions));
  private readonly activeVersions = computed(() => this.allVersions().filter((version) => version.status === 'ACTIVE'));
  protected readonly totalTypes = computed(() => this.allVersions().length);
  protected readonly activeCount = computed(() => this.activeVersions().length);
  protected readonly closedCount = computed(() => this.allVersions().filter((version) => version.status === 'CLOSED').length);

  /** Mức phí mặc định trung bình = trung bình `amount` của các bản đang hiệu lực. */
  protected readonly avgAmountLabel = computed(() => {
    const actives = this.activeVersions();
    if (!actives.length) return formatMoney(0, 'VND', this.i18n.dateLocale());
    const avg = actives.reduce((sum, version) => sum + (Number(version.amount) || 0), 0) / actives.length;
    return formatMoney(Math.round(avg), actives[0].currency, this.i18n.dateLocale());
  });

  protected form: RuleForm = this.blankForm();

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadCatalogs();
    this.load();
  }

  private loadCatalogs(): void {
    this.loadDossierTypes();
    this.loadVehicleTypes();
  }

  private loadDossierTypes(): void {
    this.api.getDossierTypes().subscribe({
      next: (items) => this.dossierTypeItems.set(items || []),
      error: () => this.dossierTypeItems.set([]),
    });
  }

  private loadVehicleTypes(): void {
    this.api.getVehicleTypes().subscribe({
      next: (items) => this.vehicleTypeItems.set(items || []),
      error: () => this.vehicleTypeItems.set([]),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getFeeRuleVersions().subscribe({
      next: (versions) => {
        this.groups.set(groupFeeRuleVersions(versions, this.t));
        this.loading.set(false);
      },
      error: () => {
        this.groups.set([]);
        this.loading.set(false);
        this.error.set(this.t('ui.feeRule.loadFailed'));
        this.appMessages.showKey('ui.feeRule.loadFailed', 'error');
      },
    });
  }

  protected canManage(): boolean {
    return this.auth.hasPermission(PERMISSION.feeApprove);
  }

  // --- Nhãn ------------------------------------------------------------------

  protected typeLabel(code: string): string {
    return feeTypeLabel(code, this.t);
  }

  protected unitLabel(code: string): string {
    return feeUnitLabel(code, this.t);
  }

  protected statusLabel(code: string): string {
    return feeRuleStatusLabel(code, this.t);
  }

  protected statusTone(code: string): string {
    return feeRuleStatusTone(code);
  }

  protected vehicleLabel(code: string): string {
    const item = this.vehicleTypeItems().find((i) => i.code === code);
    return vehicleTypeLabel(code, this.t, item?.name);
  }

  protected dossierLabel(code: string): string {
    const item = this.dossierTypeItems().find((i) => i.code === code);
    return dossierTypeLabel(code, this.t, item?.name);
  }

  /** Mức phí hiển thị: đơn vị PERCENT là "10%", còn lại định dạng tiền theo locale. */
  protected amountLabel(version: FeeRuleVersion): string {
    if (version.unit === 'PERCENT') return `${version.amount}%`;
    return formatMoney(version.amount, version.currency, this.i18n.dateLocale());
  }

  protected appliesToVehicleLabel(appliesTo: string[]): string {
    if (!appliesTo?.length) return this.t('ui.feeRule.appliesToAllVehicles');
    const vehicles = appliesTo.filter((code) => {
      const vItem = this.vehicleTypeItems().find((i) => i.code === code);
      return vItem || DEFAULT_VEHICLE_CODES.includes(code);
    });
    if (!vehicles.length) return this.t('ui.feeRule.appliesToAllVehicles');
    
    const vehicleSet = new Set(vehicles);
    const hasAll = this.vehicleTypes().length > 0 && this.vehicleTypes().every((c) => vehicleSet.has(c));
    if (hasAll) return this.t('ui.feeRule.appliesToAllVehicles');
    
    return Array.from(vehicleSet).map((code) => this.vehicleLabel(code)).join(', ');
  }

  protected appliesToDossierLabel(appliesTo: string[]): string {
    if (!appliesTo?.length) return this.t('ui.feeRule.appliesToAll');
    const dossiers = appliesTo.filter((code) => {
      const dItem = this.dossierTypeItems().find((i) => i.code === code);
      return dItem || Object.keys(DOSSIER_TYPE_LABEL_KEYS).includes(code);
    });
    if (!dossiers.length) return this.t('ui.feeRule.appliesToAll');
    
    const dossierSet = new Set(dossiers);
    const hasAll = this.dossierTypes().length > 0 && this.dossierTypes().every((c) => dossierSet.has(c));
    if (hasAll) return this.t('ui.feeRule.appliesToAll');
    
    return Array.from(dossierSet).map((code) => this.dossierLabel(code)).join(', ');
  }

  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected clearFieldError(field: string): void {
    const current = { ...this.fieldErrors() };
    if (current[field]) {
      delete current[field];
      this.fieldErrors.set(current);
    }
  }

  // --- Modal -----------------------------------------------------------------

  protected openCreate(): void {
    this.editing = null;
    this.form = this.blankForm();
    this.fieldErrors.set({});
    this.modalMode.set('create');
  }

  protected openEdit(version: FeeRuleVersion): void {
    this.editing = version;
    this.form = {
      code: version.code,
      name: version.name,
      feeType: version.feeType,
      unit: version.unit,
      amount: version.amount,
      currency: version.currency,
      effectiveFrom: version.effectiveFrom,
      description: version.description || '',
      appliesTo: [...(version.appliesTo || [])],
    };
    this.fieldErrors.set({});
    this.modalMode.set('edit');
  }

  protected closeModal(): void {
    this.modalMode.set(null);
    this.editing = null;
    this.fieldErrors.set({});
  }

  /** Bản đang sửa đã tới/qua ngày hiệu lực chưa — quyết định có khóa trường tiền không. */
  protected editApplied(): boolean {
    return !!this.editing && this.editing.effectiveFrom <= this.todayStr();
  }

  /** Trường ảnh hưởng tiền bị khóa khi sửa một bản đã/đang áp dụng. */
  protected moneyLocked(): boolean {
    return this.modalMode() === 'edit' && this.editApplied();
  }

  protected hasApplies(code: string): boolean {
    return this.form.appliesTo.includes(code);
  }

  protected toggleApplies(code: string): void {
    this.form.appliesTo = this.hasApplies(code)
      ? this.form.appliesTo.filter((item) => item !== code)
      : [...this.form.appliesTo, code];
  }

  protected submit(): void {
    if (this.modalMode() === 'create') this.submitCreate();
    else this.submitEdit();
  }

  private submitCreate(): void {
    this.fieldErrors.set({});
    const errs: Record<string, string> = {};

    const code = (this.form.code || '').trim().toUpperCase();
    if (!code) {
      errs['code'] = this.t('ui.feeRule.valCodeRequired');
    } else if (!/^[A-Z0-9_]{2,32}$/.test(code)) {
      errs['code'] = this.t('ui.feeRule.valCode');
    }

    if (!this.form.name || !this.form.name.trim()) {
      errs['name'] = this.t('ui.feeRule.valName');
    }

    if (this.form.amount === null || this.form.amount === undefined || !Number.isInteger(this.form.amount) || this.form.amount < 0) {
      errs['amount'] = this.t('ui.feeRule.valAmount');
    }

    if (!this.form.effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(this.form.effectiveFrom)) {
      errs['effectiveFrom'] = this.t('ui.feeRule.valEffectiveFrom');
    }

    if (Object.keys(errs).length > 0) {
      this.fieldErrors.set(errs);
      this.failFirstField(errs);
      return;
    }

    const payload: CreateFeeRulePayload = {
      code,
      name: this.form.name.trim(),
      feeType: this.form.feeType,
      unit: this.form.unit,
      amount: this.form.amount,
      currency: this.form.currency.trim() || undefined,
      appliesTo: this.form.appliesTo,
      effectiveFrom: this.form.effectiveFrom,
      description: this.form.description.trim() || undefined,
    };
    this.saving.set(true);
    this.api.createFeeRule(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.notify(this.t('ui.feeRule.createOk'), 'success');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        const serverFieldErrors = toFieldErrorMap(extractFieldErrors(err));
        if (Object.keys(serverFieldErrors).length > 0) {
          this.fieldErrors.set(serverFieldErrors);
        }
        this.notify(this.i18n.apiError(err, 'ui.feeRule.createFailed'), 'error');
      },
    });
  }

  private submitEdit(): void {
    const version = this.editing;
    if (!version) return;

    this.fieldErrors.set({});
    const errs: Record<string, string> = {};

    if (!this.form.name || !this.form.name.trim()) {
      errs['name'] = this.t('ui.feeRule.valName');
    }

    if (!this.editApplied()) {
      if (this.form.amount === null || this.form.amount === undefined || !Number.isInteger(this.form.amount) || this.form.amount < 0) {
        errs['amount'] = this.t('ui.feeRule.valAmount');
      }
    }

    if (Object.keys(errs).length > 0) {
      this.fieldErrors.set(errs);
      this.failFirstField(errs);
      return;
    }

    // Bản đã áp dụng chỉ gửi metadata phi-tiền; bản chưa tới hiệu lực gửi đủ.
    const payload: UpdateFeeRulePayload = {
      name: this.form.name.trim(),
      description: this.form.description.trim(),
    };
    if (!this.editApplied()) {
      payload.amount = this.form.amount;
      payload.unit = this.form.unit;
      payload.feeType = this.form.feeType;
      payload.appliesTo = this.form.appliesTo;
      payload.currency = this.form.currency.trim() || undefined;
    }

    this.saving.set(true);
    this.api.updateFeeRule(version.id, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.notify(this.t('ui.feeRule.updateOk'), 'success');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        const serverFieldErrors = toFieldErrorMap(extractFieldErrors(err));
        if (Object.keys(serverFieldErrors).length > 0) {
          this.fieldErrors.set(serverFieldErrors);
        }
        this.notify(this.i18n.apiError(err, 'ui.feeRule.updateFailed'), 'error');
      },
    });
  }

  private blankForm(): RuleForm {
    return {
      code: '',
      name: '',
      feeType: this.feeTypes[0],
      unit: this.feeUnits[0],
      amount: 0,
      currency: 'VND',
      effectiveFrom: this.todayStr(),
      description: '',
      appliesTo: [],
    };
  }

  private todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private notify(text: string, type: AppMessageTone): void {
    this.appMessages.show(text, type);
  }

  /** Lỗi validate các ô trong biểu mẫu → tô đỏ ô lỗi trên sg-form-field + cuộn/focus ô đầu tiên lỗi. */
  private failFirstField(errs: Record<string, string>): void {
    const firstKey = Object.keys(errs)[0];
    const selectorMap: Record<string, string> = {
      code: 'input[name="ruleCode"]',
      effectiveFrom: 'input[name="ruleEffectiveFrom"]',
      name: 'input[name="ruleName"]',
      amount: 'input[name="ruleAmount"]',
    };
    const selector = selectorMap[firstKey] || `input[name="rule${firstKey.charAt(0).toUpperCase() + firstKey.slice(1)}"]`;
    setTimeout(() => {
      const input = this.host.nativeElement.querySelector<HTMLInputElement>(selector);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
    });
  }
}
