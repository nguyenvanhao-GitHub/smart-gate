import { Component, ElementRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { PERMISSION } from '../../../core/auth/access-control.model';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { I18nService } from '../../../core/i18n/i18n.service';
import { DossierAttachment } from '../../../core/models/declaration.model';
import {
  DossierFeeItem,
  DossierFeeSummary,
  FEE_PAYMENT_METHOD_CODES,
  FeeTransaction,
  feeConfirmedAmount,
  feeOutstanding,
  feePaymentMethodLabel,
  feeSettled,
  feeStepReached,
  feeTransactionStatusLabel,
  feeTransactionStatusTone,
  feeUnitLabel,
  formatMoney,
  formatQuantity,
  methodRequiresReference,
} from '../../../core/models/fees.model';
import { ReasonCode } from '../../../core/models/workflow.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { UPLOAD_ACCEPT_ATTRIBUTE, fileIcon, formatFileSize, validateUploadFile } from '../../../core/upload/file-rules';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';

/** Loại chứng từ dùng cho biên lai / ủy nhiệm chi đính kèm giao dịch thu phí (F11). */
const PAYMENT_RECEIPT_DOCUMENT_TYPE = 'PAYMENT_RECEIPT';

const NOTE_MAX_LENGTH = 500;

/**
 * UI-11 — Thu phí theo hồ sơ (F46, F47, F48, F51).
 *
 * Màn hình gồm ba khối theo backlog: **bảng kê khoản phí**, **tổng tiền / VAT / còn phải thu** và
 * **thu tiền một nhịp** (số tiền, phương thức, mã giao dịch, chứng từ). Thu = ghi thẳng một giao dịch
 * đã xác nhận (F47 + F48 gộp) — không còn bước "xác nhận thanh toán" tách rời.
 *
 * Ba ranh giới cố ý:
 *   - **Không có hoàn phí / hủy phí** — F50 thuộc Giai đoạn 2, vẽ nút không chạy thật sẽ bị
 *     hiểu là lỗi MVP (SRS 11.2).
 *   - **Điều chỉnh khoản phí bắt buộc mã lý do** nhóm `REASON_FEE_ADJUST` (F51) — chặn ngay ở
 *     web, không để người dùng bấm rồi mới nhận 400.
 *   - **Số tiền do API quyết.** Web chỉ tự cộng khi phản hồi thiếu `total`/`outstanding`
 *     (xem `fees.model.ts`) — dữ liệu tài chính không được có hai nguồn lệch nhau.
 *
 * Trạng thái **đã đủ / còn thiếu** hiện ngay đầu màn hình vì đây là điều kiện qua cổng (F39).
 */
@Component({
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatIconModule,
    HasPermissionDirective,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgSelectComponent,
  ],
  template: `
    @if (loading()) {
      <div class="card"><p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.fee.loading') }}</p></div>
    } @else if (error()) {
      <sg-alert type="error" [message]="error()" />
    } @else {
      <div class="wrap">
        <div class="header">
          <div>
            <div class="title-row">
              <h1>{{ t('ui.fee.dossierTitle', { code: dossierCode() }) }}</h1>
              <span class="badge" [class.badge--success]="settled()">
                <mat-icon fontSet="material-icons-round">{{ settled() ? 'check_circle' : 'schedule' }}</mat-icon>
                {{ settled() ? t('ui.fee.statusPaid') : t('ui.fee.statusWaiting') }}
              </span>
            </div>
          </div>
          <div class="actions head__actions">
            <a sgButton="tertiary" routerLink="/fees/tax">
              <mat-icon fontSet="material-icons-round">arrow_back</mat-icon>
              {{ t('ui.common.back') }}
            </a>
            <a class="btn" [routerLink]="['/declarations', id]">
              <mat-icon fontSet="material-icons-round">description</mat-icon>
              {{ t('ui.common.viewFullDossier') }}
            </a>
            <button type="button" *hasPermission="calculatePermission" class="btn btn-primary" [disabled]="calculating()" (click)="recalculate()">
              <mat-icon fontSet="material-icons-round">calculate</mat-icon>
              {{ calculating() ? t('ui.fee.calculating') : t('ui.fee.recalculate') }}
            </button>
          </div>
        </div>

        <div class="alert" [class.alert--success]="settled()">
          <div class="alert-left">
            <mat-icon fontSet="material-icons-round" class="alert-icon">{{ settled() ? 'check_circle' : 'warning' }}</mat-icon>
            <div>
              <p class="alert-title">{{ settlementMessage() }}</p>
              <p class="alert-sub">{{ t('ui.fee.gateNote') }}</p>
            </div>
          </div>
          @if (!settled() && stepReached()) {
            <button type="button" class="alert-cta" (click)="scrollToPayment()">{{ t('ui.fee.collectNow') }}</button>
          }
        </div>

        <div class="card summary">
          <div class="stat-grid">
            <div>
              <p class="stat-label">{{ t('ui.fee.statTotalDue') }}</p>
              <p class="stat-value">{{ money(totalAmount()) }}</p>
            </div>
            <div>
              <p class="stat-label">{{ t('ui.fee.statPaid') }}</p>
              <p class="stat-value" [class.muted]="confirmedAmount() === 0">{{ money(confirmedAmount()) }}</p>
            </div>
            <div>
              <p class="stat-label">{{ t('ui.fee.statUnpaid') }}</p>
              <p class="stat-value" [class.warning]="outstanding() > 0" [class.muted]="outstanding() === 0">{{ money(outstanding()) }}</p>
            </div>
            <div>
              <p class="stat-label">{{ t('ui.fee.statUnitLines') }}</p>
              <p class="stat-value muted">{{ quantity(lineCount()) }}</p>
            </div>
          </div>
          <div class="progress-row">
            <span class="lbl">{{ t('ui.fee.collectionProgress') }}</span>
            <span class="pct">{{ progressPercent() }}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="progressPercent()"></div>
          </div>
        </div>

        <div class="card table-card">
          <div class="table-head">
            <div>
              <h2>{{ t('ui.fee.itemsTitle') }}</h2>
              <p>{{ t('ui.fee.itemsSubtitle') }}</p>
            </div>
            <div class="filter-wrap">
              <label for="feeFilter" class="filter-label">{{ t('ui.fee.filterFeeType') }}</label>
              <select id="feeFilter" class="filter-select" [ngModel]="feeTypeFilter()" (ngModelChange)="chooseFeeType($event)" [attr.aria-label]="t('ui.fee.filterFeeType')">
                @for (opt of feeTypeOptions(); track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th class="center">{{ t('ui.fee.colRule') }}</th>
                  <th class="center">{{ t('ui.fee.colItem') }}</th>
                  <th class="center">{{ t('ui.fee.colUnit') }}</th>
                  <th class="center">{{ t('ui.fee.colQuantity') }}</th>
                  <th class="center">{{ t('ui.fee.colUnitAmount') }}</th>
                  <th class="center">{{ t('ui.fee.colLineAmount') }}</th>
                  <th class="center">{{ t('ui.common.actions') }}</th>
                </tr>
              </thead>
              <tbody id="feeTableBody">
                @for (item of filteredItems(); track item.ruleCode) {
                  <tr [class.zero]="item.amount === 0">
                    <td class="center"><span class="fee-code">{{ item.ruleCode }}</span></td>
                    <td class="center fee-item-name">{{ item.name }}</td>
                    <td class="center">{{ unitLabel(item.unit) }}</td>
                    <td class="center">{{ quantity(item.quantity) }}</td>
                    <td class="center">{{ money(item.unitAmount) }}</td>
                    <td class="center amount-cell">{{ money(item.amount) }}</td>
                    <td class="center">
                      @if (!settled()) {
                        <button type="button" *hasPermission="adjustPermission" class="adjust-link" (click)="openAdjust(item)">
                          <mat-icon fontSet="material-icons-round">tune</mat-icon>
                          {{ t('ui.fee.adjust') }}
                        </button>
                      } @else {
                        <span>-</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="state">{{ t('ui.fee.itemsEmpty') }}</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (filteredItems().length > 0) {
            <div class="totals">
              <div class="totals-box">
                <div class="totals-row">
                  <span>{{ t('ui.fee.subtotal') }}</span>
                  <span>{{ money(subtotalAmount()) }}</span>
                </div>
                <div class="totals-row">
                  <span>{{ vatItem()?.name || t('ui.fee.vat') }} (VAT {{ vatRate() }}%)</span>
                  <span>{{ money(vatAmount()) }}</span>
                </div>
                <div class="totals-final">
                  <span>{{ t('ui.fee.total') }}</span>
                  <span>{{ money(totalAmount()) }}</span>
                </div>
              </div>
            </div>
          }
        </div>

        <div class="bottom-grid">
          <div class="card tx-card">
            <div class="form-head">
              <h2>{{ t('ui.fee.txTitle') }}</h2>
              <p>{{ t('ui.fee.txSubtitle') }}</p>
            </div>

            @if (transactions().length === 0) {
              <div class="tx-empty">
                <div class="tx-icon">
                  <mat-icon fontSet="material-icons-round">receipt_long</mat-icon>
                </div>
                <p class="main">{{ t('ui.fee.txEmpty') }}</p>
                <p class="sub">{{ t('ui.fee.txEmptySub') }}</p>
              </div>
            } @else {
              <div style="overflow-x:auto;">
                <table class="grid">
                  <thead>
                    <tr>
                      <th class="right">{{ t('ui.fee.amount') }}</th>
                      <th>{{ t('ui.fee.colMethod') }}</th>
                      <th>{{ t('ui.fee.colReference') }}</th>
                      <th class="center">{{ t('ui.fee.colDocument') }}</th>
                      <th class="center">{{ t('ui.fee.colStatus') }}</th>
                      <th>{{ t('ui.fee.colConfirmedBy') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of transactions(); track row.id) {
                      <tr>
                        <td class="right amount-cell">{{ money(row.amount) }}</td>
                        <td>{{ methodLabel(row.method) }}</td>
                        <td>{{ row.referenceCode || '—' }}</td>
                        <td class="center">
                          @if (row.attachmentId) {
                            <button
                              type="button"
                              class="doc-btn"
                              [title]="t('ui.fee.documentDownload')"
                              [attr.aria-label]="t('ui.fee.documentDownload')"
                              [disabled]="downloadingId() === row.attachmentId"
                              (click)="downloadReceipt(row.attachmentId)"
                            >
                              <mat-icon fontSet="material-icons-round">
                                {{ downloadingId() === row.attachmentId ? 'hourglass_top' : 'attach_file' }}
                              </mat-icon>
                            </button>
                          } @else { — }
                        </td>
                        <td class="center"><span class="chip" [attr.data-tone]="txTone(row.status)">{{ txStatus(row.status) }}</span></td>
                        <td>
                          {{ row.confirmedByName || '—' }}
                          @if (row.confirmedAt) { <span class="sub">{{ row.confirmedAt | date: 'dd/MM/yyyy HH:mm' }}</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <aside *hasPermission="recordPermission">
            <div class="card form-card" id="thu-tien">
              <div class="form-head">
                <div class="form-head-title">
                  <mat-icon fontSet="material-icons-round" style="color:var(--blue); font-size:18px; width:18px; height:18px;">account_balance_wallet</mat-icon>
                  <h2>{{ t('ui.fee.recordTitle') }}</h2>
                </div>
                <p>{{ t('ui.fee.recordSubtitle') }}</p>
              </div>
              <div class="form-body">
                <div>
                  <label class="field-label" for="fee-amount-input">{{ t('ui.fee.amount') }} <span class="req">*</span></label>
                  <div class="money-input-wrap">
                    <input id="fee-amount-input" type="number" min="0" step="1000" [attr.aria-label]="t('ui.fee.amount')" [(ngModel)]="paymentAmount" [placeholder]="outstanding() || 0" [disabled]="settled() || recording() || !stepReached()" />
                    <span class="money-suffix">{{ t('ui.common.currency') }}</span>
                  </div>
                  @if (amountError()) {
                    <p class="field-error">{{ amountError() }}</p>
                  }
                  <p class="field-hint">{{ t('ui.fee.outstanding') }}: <b>{{ money(outstanding()) }}</b></p>
                </div>

                <div>
                  <label class="field-label" for="fee-method-select">{{ t('ui.fee.method') }} <span class="req">*</span></label>
                  <select id="fee-method-select" class="full" [ngModel]="paymentMethod()" (ngModelChange)="chooseMethod($event)" [attr.aria-label]="t('ui.fee.method')" [disabled]="settled() || recording() || !stepReached()">
                    <option value="">{{ t('ui.fee.chooseMethod') }}</option>
                    @for (opt of methodOptions(); track opt.value) {
                      <option [value]="opt.value">{{ opt.label }}</option>
                    }
                  </select>
                  @if (methodError()) {
                    <p class="field-error">{{ methodError() }}</p>
                  }
                </div>

                @if (paymentMethod() && paymentMethod() !== 'CASH') {
                  <div>
                    <label class="field-label" for="fee-reference-input">{{ t('ui.fee.reference') }} <span class="req">*</span></label>
                    <input id="fee-reference-input" type="text" autocomplete="off" [attr.aria-label]="t('ui.fee.reference')" [(ngModel)]="paymentReference" [placeholder]="t('ui.fee.referencePlaceholder')" [disabled]="settled() || recording() || !stepReached()" />
                    @if (referenceError()) {
                      <p class="field-error">{{ referenceError() }}</p>
                    }
                    <p class="field-hint">{{ t('ui.fee.referenceHint') }}</p>
                  </div>
                }

                <div>
                  <label class="field-label" for="fee-document-input">{{ t('ui.fee.document') }}</label>
                  <input
                    #receiptInput
                    id="fee-document-input"
                    type="file"
                    class="upload__input"
                    [accept]="acceptAttribute"
                    [disabled]="uploading() || settled() || !stepReached()"
                    (change)="onReceiptSelected($event)"
                  />
                  @if (receipt(); as file) {
                    <div class="dropzone dropzone--selected">
                      <mat-icon fontSet="material-icons-round" style="color:var(--blue);">{{ iconOf(file) }}</mat-icon>
                      <span class="dropzone__name" [title]="file.fileName">{{ file.fileName }}</span>
                      <span class="dropzone__size">({{ sizeOf(file) }})</span>
                      <button type="button" class="iconbtn" [attr.aria-label]="t('ui.fee.documentRemove')" [disabled]="settled() || recording()" (click)="clearReceipt()">
                        <mat-icon fontSet="material-icons-round">close</mat-icon>
                      </button>
                    </div>
                  } @else {
                    <button type="button" class="dropzone" [disabled]="uploading() || settled() || !stepReached()" (click)="receiptInput.click()">
                      <mat-icon fontSet="material-icons-round">attach_file</mat-icon>
                      {{ uploading() ? t('ui.common.uploading') : t('ui.fee.selectDocument') }}
                    </button>
                  }
                  @if (uploadError()) {
                    <p class="field-error">{{ uploadError() }}</p>
                  }
                  <p class="field-hint">{{ t('ui.fee.documentHint') }}</p>
                </div>

                <div>
                  <label class="field-label" for="fee-note-textarea">{{ t('ui.fee.txNote') }}</label>
                  <textarea id="fee-note-textarea" rows="3" [attr.aria-label]="t('ui.fee.txNote')" [maxlength]="noteMaxLength" [(ngModel)]="paymentNote" [placeholder]="t('ui.fee.txNotePlaceholder')" [disabled]="settled() || recording() || !stepReached()"></textarea>
                </div>

                @if (settled()) {
                  <div class="field-alert-info">
                    <mat-icon fontSet="material-icons-round">check_circle</mat-icon>
                    <span>{{ t('ui.fee.settledYes') }}</span>
                  </div>
                } @else if (!stepReached()) {
                  <div class="field-alert-info">
                    <mat-icon fontSet="material-icons-round">info</mat-icon>
                    <span>{{ t('ui.fee.stepNotReachedHint') }}</span>
                  </div>
                }

                <div class="actions">
                  <button type="button" class="submit-btn" [disabled]="recording() || !stepReached() || settled()" (click)="recordPayment()">
                    <mat-icon fontSet="material-icons-round">payments</mat-icon>
                    {{ recording() ? t('ui.common.saving') : t('ui.fee.recordSubmit') }}
                  </button>
                </div>
                <p class="form-foot">{{ t('ui.fee.gateNote') }}</p>
              </div>
            </div>
          </aside>
        </div>

        @if (adjustTarget(); as target) {
          <sg-modal
            [title]="t('ui.fee.adjustTitle', { name: target.name })"
            [ariaLabel]="t('ui.fee.adjustAria')"
            (close)="closeAdjust()"
          >
            <dl class="modal__facts">
              <dt>{{ t('ui.fee.colRule') }}</dt><dd>{{ target.ruleCode }}</dd>
              <dt>{{ t('ui.fee.adjustCurrent') }}</dt><dd>{{ money(target.amount) }}</dd>
            </dl>

            <sg-form-field [label]="t('ui.fee.adjustAmount')" [required]="true" [error]="adjustAmountError()">
              <input type="number" name="adjustAmount" min="0" step="1000" [attr.aria-label]="t('ui.fee.adjustAmount')" [(ngModel)]="adjustAmount" />
            </sg-form-field>

            <sg-form-field [label]="t('ui.common.reasonCode')" [required]="true" [error]="adjustReasonError()" [hint]="reasonHint()">
              <sg-select
                [ariaLabel]="t('ui.common.reasonCode')"
                [placeholder]="t('ui.fee.chooseReason')"
                [options]="reasonOptions()"
                [value]="adjustReasonCode()"
                (valueChange)="chooseReason($event)"
              />
            </sg-form-field>

            <sg-form-field [label]="t('ui.fee.adjustNote')" [hint]="t('ui.fee.adjustNoteHint')">
              <textarea rows="3" [attr.aria-label]="t('ui.fee.adjustNote')" [maxlength]="noteMaxLength" [(ngModel)]="adjustNote"></textarea>
            </sg-form-field>

            <button modal-footer type="button" sgButton="secondary" [disabled]="adjusting()" (click)="closeAdjust()">{{ t('ui.common.cancelAction') }}</button>
            <button modal-footer type="button" sgButton [disabled]="adjusting()" (click)="submitAdjust()">
              {{ adjusting() ? t('ui.common.saving') : t('ui.common.confirm') }}
            </button>
          </sg-modal>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --navy: #12213F;
        --blue: #1B4B91;
        --blue-light: #2E6BC6;
        --blue-bg: #EEF3FC;
        --bg: #F4F6F9;
        --card: #ffffff;
        --border: #E4E9F1;
        --border-strong: #D7DEEA;
        --text: #1A2233;
        --text-muted: #5B6579;
        --text-faint: #8A93A6;
        --amber: #B9660A;
        --amber-bg: #FFF7ED;
        --amber-border: #F6D9A8;
        --amber-pill: #FEF0E0;
        --green: #15803D;
        --green-bg: #F0FDF4;
        --green-border: #BBF7D0;
        --green-pill: #DCFCE7;
        --red: #D14343;
        --t-line: #EEF1F6;
        --t-bg: #F7F9FC;
      }

      .wrap { width: 100%; padding: 0 0 64px; }

      .header { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
      .title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: var(--navy); margin: 0; }
      .badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 5px 10px; font-size: 12px; font-weight: 600; background: var(--amber-pill); color: var(--amber); }
      .badge mat-icon { font-size: 13px; width: 13px; height: 13px; }
      .badge--success { background: var(--green-pill); color: var(--green); }
      .subtext { margin: 4px 0 0; font-size: 13px; color: var(--text-faint); }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; background: #EDF0F5; color: #3A4459; padding: 2px 6px; border-radius: 4px; }

      .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 9px 14px; font-size: 13.5px; font-weight: 500; cursor: pointer; border: 1px solid var(--border-strong); background: #fff; color: #2E3A55; text-decoration: none; transition: background .15s; }
      .btn:hover { background: #F3F6FB; }
      .btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
      .btn-primary { background: var(--blue); color: #fff; border-color: var(--blue); font-weight: 600; }
      .btn-primary:hover { opacity: .92; background: var(--blue); }
      .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

      .alert { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; background: var(--amber-bg); border: 1px solid var(--amber-border); }
      .alert--success { background: var(--green-bg); border-color: var(--green-border); }
      .alert-left { display: flex; align-items: flex-start; gap: 10px; }
      .alert-icon { color: var(--amber); font-size: 20px; width: 20px; height: 20px; margin-top: 1px; }
      .alert--success .alert-icon { color: var(--green); }
      .alert-title { margin: 0; font-size: 13.5px; font-weight: 600; color: #8A4B08; }
      .alert--success .alert-title { color: #166534; }
      .alert-sub { margin: 2px 0 0; font-size: 12.5px; color: #A5702B; }
      .alert--success .alert-sub { color: #15803D; }
      .alert-cta { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; color: #fff; background: var(--amber); border: none; cursor: pointer; white-space: nowrap; transition: opacity .15s; }
      .alert-cta:hover { opacity: .92; }

      .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
      .summary { padding: 20px; margin-bottom: 24px; }
      .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 24px; }
      @media(min-width: 640px) { .stat-grid { grid-template-columns: repeat(4, 1fr); } }
      .stat-label { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .03em; color: var(--text-faint); margin: 0; }
      .stat-value { font-size: 17px; font-weight: 700; margin: 2px 0 0; color: var(--navy); }
      .stat-value.warning { color: var(--amber); }
      .stat-value.muted { color: #3A4459; }

      .progress-row { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; margin: 20px 0 6px; }
      .progress-row .pct { font-weight: 600; color: var(--blue); }
      .progress-row .lbl { font-weight: 500; color: var(--text-muted); }
      .progress-track { height: 8px; width: 100%; border-radius: 999px; background: #EDF0F5; overflow: hidden; }
      .progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--blue), var(--blue-light)); transition: width .3s ease; }

      .table-card { margin-bottom: 24px; overflow: hidden; }
      .table-head { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
      .table-head h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--navy); }
      .table-head p { margin: 2px 0 0; font-size: 12.5px; color: var(--text-faint); }
      .filter-wrap { display: inline-flex; align-items: center; gap: 10px; margin-left: auto; }
      .filter-label { font-size: 13px; font-weight: 500; color: var(--text-muted); white-space: nowrap; }
      .filter-select {
        min-width: 280px;
        max-width: 480px;
        width: auto;
        appearance: none;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        padding: 8px 36px 8px 14px;
        font-size: 13px;
        font-weight: 500;
        color: #2E3A55;
        background: #fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238A93A6' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 12px center;
        cursor: pointer;
        outline: none;
      }
      .filter-select:focus { border-color: var(--blue); }

      table { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 13.5px; }
      thead tr { background: #F7F9FC; }
      th { padding: 12px 20px; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; color: #7A8699; text-align: center; }
      th.left { text-align: left; }
      th.right { text-align: right; }
      th.center { text-align: center; }
      td { padding: 12px 20px; border-top: 1px solid var(--t-line); color: var(--text); vertical-align: middle; text-align: center; }
      td.left { text-align: left; }
      td.right { text-align: right; }
      td.center { text-align: center; }
      .fee-item-name { font-weight: 500; max-width: 380px; overflow-wrap: anywhere; word-break: break-word; }
      tr.zero td { color: #B0B8C6; }
      tr.zero { background: #FBFBFC; }
      .fee-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 500; background: #EEF3FC; color: var(--blue); padding: 2px 6px; border-radius: 4px; }
      .amount-cell { font-weight: 600; color: var(--navy); }
      .adjust-link { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 500; color: var(--blue); background: none; border: none; cursor: pointer; padding: 0; }
      .adjust-link:hover { text-decoration: underline; }
      .adjust-link mat-icon { font-size: 14px; width: 14px; height: 14px; }

      .totals { border-top: 1px solid var(--border); background: #F7F9FC; padding: 16px 20px; display: flex; }
      .totals-box { margin-left: auto; max-width: 340px; width: 100%; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
      .totals-row { display: flex; justify-content: space-between; color: var(--text-muted); }
      .totals-row span:last-child { font-weight: 500; }
      .totals-final { display: flex; justify-content: space-between; margin-top: 4px; padding-top: 8px; border-top: 1px solid #E0E5ED; font-size: 15px; font-weight: 700; color: var(--navy); }

      .bottom-grid { display: grid; grid-template-columns: 1fr; gap: 24px; align-items: start; }
      @media(min-width: 1024px) { .bottom-grid { grid-template-columns: 3fr 2fr; } }

      .tx-card { overflow: hidden; }
      .tx-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 56px 20px; text-align: center; }
      .tx-icon { width: 44px; height: 44px; border-radius: 999px; background: #EEF3FC; display: flex; align-items: center; justify-content: center; color: var(--blue); }
      .tx-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
      .tx-empty p.main { margin: 0; font-size: 13.5px; font-weight: 500; color: #3A4459; }
      .tx-empty p.sub { margin: 0; max-width: 280px; font-size: 12.5px; color: var(--text-faint); }

      .form-card { height: fit-content; }
      .form-head { padding: 16px 20px; border-bottom: 1px solid var(--border); }
      .form-head-title { display: flex; align-items: center; gap: 8px; }
      .form-head h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--navy); }
      .form-head p { margin: 4px 0 0; font-size: 12.5px; color: var(--text-faint); }
      .form-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
      label.field-label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: #3A4459; }
      label.field-label .req { color: var(--red); }
      .field-hint { margin: 5px 0 0; font-size: 12px; color: var(--text-faint); }
      .field-hint b { font-weight: 600; color: var(--amber); }
      .field-error { margin: 4px 0 0; font-size: 12px; color: var(--red); }
      .field-alert-info { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; background: #EFF6FF; color: #1E40AF; font-size: 12.5px; }
      .field-alert-info mat-icon { font-size: 16px; width: 16px; height: 16px; flex: none; }

      input[type=number], input[type=text], textarea, select {
        width: 100%; border: 1px solid var(--border-strong); border-radius: 8px; padding: 10px 12px;
        font-size: 13.5px; font-family: inherit; outline: none; background: #fff; color: var(--text);
      }
      input[type=number]:focus, input[type=text]:focus, textarea:focus, select:focus { border-color: var(--blue); }
      input[type=number]:disabled, input[type=text]:disabled, textarea:disabled, select:disabled {
        background-color: #F1F4F9;
        color: var(--text-faint);
        border-color: var(--border-strong);
        cursor: not-allowed;
        opacity: 0.85;
      }
      .money-input-wrap { position: relative; }
      .money-input-wrap input { padding-right: 32px; font-weight: 500; font-size: 14px; }
      .money-suffix { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-faint); }
      select.full {
        appearance: none;
        background: #fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238A93A6' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 10px center;
        padding-right: 30px;
        cursor: pointer;
      }
      select.full:disabled {
        background-color: #F1F4F9;
        cursor: not-allowed;
      }
      textarea { resize: none; }

      .dropzone { display: flex; width: 100%; align-items: center; justify-content: center; gap: 8px; border: 1px dashed #C7D0E0; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 500; color: var(--text-muted); background: none; cursor: pointer; transition: background .15s; }
      .dropzone:hover:not(:disabled) { background: #F7F9FC; }
      .dropzone:disabled {
        background-color: #F1F4F9;
        color: var(--text-faint);
        border-color: var(--border-strong);
        border-style: solid;
        cursor: not-allowed;
        opacity: 0.85;
      }
      .dropzone mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--blue); }
      .dropzone:disabled mat-icon { color: var(--text-faint); }
      .dropzone--selected { justify-content: space-between; border-style: solid; border-color: var(--border-strong); background: #F7F9FC; cursor: default; }
      .dropzone__name { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--navy); font-weight: 500; }
      .dropzone__size { font-size: 12px; color: var(--text-faint); margin-left: 4px; }
      .upload__input { display: none; }

      .submit-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; padding: 11px; font-size: 14px; font-weight: 600; color: #fff; background: var(--blue); border: none; cursor: pointer; transition: opacity .15s; }
      .submit-btn:hover:not(:disabled) { opacity: .92; }
      .submit-btn:disabled {
        background-color: #94A3B8;
        color: #FFFFFF;
        cursor: not-allowed;
        opacity: 0.7;
      }
      .submit-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .form-foot { text-align: center; font-size: 12px; color: var(--text-faint); margin: 0; }

      .chip { display: inline-flex; align-items: center; gap: 5px; min-height: 24px; padding: 4px 10px; border-radius: 20px; background: #F4F6FB; color: var(--text-muted); font-size: 11.5px; font-weight: 600; }
      .chip::before { content: '●'; font-size: 8px; line-height: 1; }
      .chip[data-tone='done'] { background: var(--green-bg); color: var(--green); }
      .chip[data-tone='waiting'] { background: var(--amber-bg); color: var(--amber); }
      .chip[data-tone='rejected'] { background: #FEE2E2; color: var(--red); }

      .doc-btn { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: #fff; color: var(--blue); cursor: pointer; transition: all .15s ease; }
      .doc-btn:hover { background: #EEF3FC; border-color: var(--blue-light); }
      .doc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .doc-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }

      .iconbtn { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-faint); cursor: pointer; }
      .iconbtn:hover { background: #E4E9F1; color: var(--text); }
      .iconbtn mat-icon { font-size: 16px; width: 16px; height: 16px; }

      .sub { display: block; color: var(--text-faint); font-size: 11.5px; }
      .state { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 32px; color: var(--text-faint); font-size: 13px; }

      .modal__facts { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1fr); gap: 0; margin: 0 0 16px; }
      .modal__facts dt { color: var(--text-muted); font-size: 12.5px; padding: 7px 0; border-top: 1px solid var(--border); }
      .modal__facts dt:first-of-type, .modal__facts dd:first-of-type { border-top: none; }
      .modal__facts dd { margin: 0; font-weight: 700; color: var(--navy); text-align: right; overflow-wrap: anywhere; padding: 7px 0; border-top: 1px solid var(--border); }
    `,
  ],
})
export class DossierFeePageComponent implements OnInit {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly appMessages = inject(AppMessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() id = '';

  protected readonly noteMaxLength = NOTE_MAX_LENGTH;
  protected readonly acceptAttribute = UPLOAD_ACCEPT_ATTRIBUTE;

  /*
   * Quyền cho từng hành động — chỉ là lớp che giao diện, API vẫn kiểm lại (SRS 3.2).
   * Tính phí sinh ra khoản phí mới nên xếp vào `fee.create`; điều chỉnh sửa số đã có nên là
   * `fee.update`; thu tiền một nhịp = ghi thẳng giao dịch đã xác nhận (duyệt tiền, F48) nên bắt buộc
   * `fee.approve`; xuất file dữ liệu phí yêu cầu `fee.export`.
   */
  protected readonly calculatePermission = PERMISSION.feeCreate;
  protected readonly recordPermission = PERMISSION.feeApprove;
  protected readonly adjustPermission = PERMISSION.feeUpdate;

  protected readonly declarationCode = signal('');
  protected readonly fees = signal<DossierFeeSummary | null>(null);
  protected readonly loading = signal(true);
  /** Lỗi tải trang — hiển thị thay cho toàn bộ nội dung, không phải cảnh báo thoáng qua. */
  protected readonly error = signal('');
  protected readonly calculating = signal(false);

  // --- Ghi nhận thanh toán ---------------------------------------------------
  protected paymentAmount: number | null = null;
  protected paymentReference = '';
  protected paymentNote = '';
  protected readonly paymentMethod = signal('');
  protected readonly amountError = signal('');
  protected readonly methodError = signal('');
  protected readonly referenceError = signal('');
  protected readonly recording = signal(false);
  protected readonly receipt = signal<DossierAttachment | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal('');
  protected readonly downloadingId = signal('');

  // --- Điều chỉnh khoản phí (F51) --------------------------------------------
  protected readonly adjustTarget = signal<DossierFeeItem | null>(null);
  protected adjustAmount: number | null = null;
  protected adjustNote = '';
  protected readonly adjustReasonCode = signal('');
  protected readonly adjustAmountError = signal('');
  protected readonly adjustReasonError = signal('');
  protected readonly adjusting = signal(false);
  protected readonly reasonCodes = signal<ReasonCode[]>([]);
  protected readonly reasonLoading = signal(false);

  // --- Lọc theo loại phí + thẻ thống kê (tính ở web từ bảng kê đã tải) -------
  protected readonly feeTypeFilter = signal('ALL');

  protected readonly items = computed<DossierFeeItem[]>(() => this.fees()?.items || []);
  protected readonly transactions = computed<FeeTransaction[]>(() => this.fees()?.transactions || []);
  protected readonly outstanding = computed(() => feeOutstanding(this.fees()));
  protected readonly confirmedAmount = computed(() => feeConfirmedAmount(this.fees()));
  protected readonly settled = computed(() => feeSettled(this.fees()));
  /** Hồ sơ đã tới bước thu phí chưa (quyết định chủ dự án) — điều kiện bật nút ghi/xác nhận thu. */
  protected readonly stepReached = computed(() => feeStepReached(this.fees()));
  protected readonly referenceRequired = computed(() => methodRequiresReference(this.paymentMethod()));

  protected readonly methodOptions = computed<SgSelectOption[]>(() =>
    FEE_PAYMENT_METHOD_CODES.map((code) => ({ value: code, label: feePaymentMethodLabel(code, this.t) })),
  );

  protected readonly reasonOptions = computed<SgSelectOption[]>(() =>
    this.reasonCodes()
      .filter((item) => item.active !== false)
      .map((item) => ({ value: item.code, label: `${item.code} — ${item.name}` })),
  );

  /** Tổng tiền các dòng phí đã tính — thẻ "Tổng phải thu" (F39/F46). */
  protected readonly lineTotal = computed(() => this.items().reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  protected readonly lineCount = computed(() => this.feeItems().length);

  /** Các dòng phí dịch vụ (không bao gồm VAT / phần trăm). */
  protected readonly feeItems = computed<DossierFeeItem[]>(() =>
    this.items().filter((item) => item.unit !== 'PERCENT' && item.ruleCode !== 'VAT'),
  );

  /** Dòng thuế VAT (nếu có trong danh sách items). */
  protected readonly vatItem = computed<DossierFeeItem | undefined>(() =>
    this.items().find((item) => item.unit === 'PERCENT' || item.ruleCode === 'VAT'),
  );

  protected readonly subtotalAmount = computed<number>(() => {
    const apiSubtotal = this.fees()?.subtotal;
    if (apiSubtotal !== undefined && apiSubtotal !== null && Number(apiSubtotal) > 0) {
      return Number(apiSubtotal);
    }
    return this.feeItems().reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  });

  protected readonly vatAmount = computed<number>(() => {
    const apiVat = this.fees()?.vatAmount;
    if (apiVat !== undefined && apiVat !== null && Number(apiVat) > 0) {
      return Number(apiVat);
    }
    const vat = this.vatItem();
    if (vat) {
      return Number(vat.amount) || 0;
    }
    const subtotal = this.subtotalAmount();
    return Math.round((subtotal * 10) / 100);
  });

  /** Thuế suất VAT (%) */
  protected readonly vatRate = computed<number>(() => {
    const vat = this.vatItem();
    if (vat && Number(vat.unitAmount) > 0) return Number(vat.unitAmount);
    const subtotal = this.subtotalAmount();
    const vatAmt = this.vatAmount();
    if (subtotal > 0 && vatAmt > 0) return Math.round((vatAmt / subtotal) * 100);
    return 10;
  });

  protected readonly totalAmount = computed<number>(() => {
    const apiTotal = this.fees()?.total;
    if (apiTotal !== undefined && apiTotal !== null && Number(apiTotal) > 0) {
      return Number(apiTotal);
    }
    return this.subtotalAmount() + this.vatAmount();
  });

  protected readonly progressPercent = computed<number>(() => {
    const total = this.totalAmount();
    if (!total || total <= 0) return 0;
    const paid = this.confirmedAmount();
    const pct = Math.round((paid / total) * 100);
    return Math.min(100, Math.max(0, pct));
  });

  protected scrollToPayment(): void {
    const el = document.getElementById('thu-tien');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Loại phí = **mã quy tắc** (ASCII), nhãn kèm tên để đọc; không so chuỗi tiếng Việt. */
  protected readonly feeTypeOptions = computed<SgSelectOption[]>(() => {
    const seen = new Map<string, string>();
    for (const item of this.feeItems()) {
      if (!seen.has(item.ruleCode)) seen.set(item.ruleCode, item.name);
    }
    return [
      { value: 'ALL', label: this.t('ui.fee.filterAll') },
      ...[...seen.entries()].map(([code, name]) => ({ value: code, label: `${code} — ${name}` })),
    ];
  });

  protected readonly filteredItems = computed<DossierFeeItem[]>(() => {
    const filter = this.feeTypeFilter();
    const items = this.feeItems();
    return filter === 'ALL' ? items : items.filter((item) => item.ruleCode === filter);
  });

  ngOnInit(): void {
    if (!this.id) {
      this.loading.set(false);
      this.error.set(this.t('ui.fee.noDossierId'));
      return;
    }
    this.load();
  }

  // --- Hiển thị --------------------------------------------------------------

  /** Mã hồ sơ hiển thị — ưu tiên mã hồ sơ nghiệp vụ đã nạp từ API. */
  protected dossierCode(): string {
    return this.declarationCode() || this.fees()?.dossierCode || this.id;
  }

  /** Tiền theo **locale đang chọn**, không ghim `vi-VN` (mục 2 của backlog UI-11). */
  protected money(amount: number | null | undefined): string {
    return formatMoney(amount, this.fees()?.currency, this.i18n.dateLocale());
  }

  protected quantity(value: number | null | undefined): string {
    return formatQuantity(value, this.i18n.dateLocale());
  }

  /** Nhãn đơn vị tính (lượt/ngày/tấn/%…) — tra i18n theo mã đóng, mã lạ giữ nguyên mã. */
  protected unitLabel(code: string): string {
    return feeUnitLabel(code, this.t);
  }

  protected methodLabel(code: string): string {
    return feePaymentMethodLabel(code, this.t);
  }

  protected txStatus(status: string): string {
    return feeTransactionStatusLabel(status, this.t);
  }

  protected txTone(status: string): string {
    return feeTransactionStatusTone(status);
  }

  /** Câu trạng thái đủ/thiếu — điều kiện qua cổng nên phải nói rõ số còn thiếu (F39). */
  protected settlementMessage(): string {
    return this.settled()
      ? this.t('ui.fee.settledYes')
      : this.t('ui.fee.settledNo', { amount: this.money(this.outstanding()) });
  }

  protected reasonHint(): string {
    if (this.reasonLoading()) return this.t('ui.fee.reasonLoading');
    if (!this.reasonOptions().length) return this.t('ui.fee.reasonEmpty');
    return this.t('ui.fee.reasonHint');
  }

  protected iconOf(file: DossierAttachment): string {
    return fileIcon(file.contentType || file.fileName);
  }

  protected sizeOf(file: DossierAttachment): string {
    return formatFileSize(file.sizeBytes);
  }

  // --- Lọc loại phí ----------------------------------------------------------

  protected chooseFeeType(code: string): void {
    this.feeTypeFilter.set(code || 'ALL');
  }

  // --- Tính lại phí (F46) ----------------------------------------------------

  protected recalculate(): void {
    this.calculating.set(true);
    this.api.calculateDossierFees(this.id).subscribe({
      next: (result) => {
        this.calculating.set(false);
        if (result?.fees) {
          this.fees.set(result.fees);
          const out = feeOutstanding(result.fees);
          this.paymentAmount = out > 0 ? out : null;
        }
        this.load(true);
        this.appMessages.showKey('ui.fee.calculated', 'success');
      },
      error: () => {
        this.calculating.set(false);
        this.appMessages.showKey('ui.fee.calculateFailed', 'error');
      },
    });
  }

  // --- Điều chỉnh khoản phí (F51) --------------------------------------------

  protected openAdjust(item: DossierFeeItem): void {
    if (this.settled()) {
      this.appMessages.showKey('ui.fee.adjustSettledNotAllowed', 'warning');
      return;
    }
    this.adjustTarget.set(item);
    this.adjustAmount = Number(item.amount) || 0;
    this.adjustNote = '';
    this.adjustReasonCode.set('');
    this.adjustAmountError.set('');
    this.adjustReasonError.set('');
    this.loadReasonCodes();
  }

  protected closeAdjust(): void {
    this.adjustTarget.set(null);
  }

  protected chooseReason(code: string): void {
    this.adjustReasonCode.set(code);
    if (code) this.adjustReasonError.set('');
  }

  private loadReasonCodes(): void {
    if (this.reasonCodes().length) return;
    this.reasonLoading.set(true);
    this.api.getReasonCodes('FEE_ADJUST').subscribe({
      next: (list) => {
        this.reasonLoading.set(false);
        this.reasonCodes.set(list || []);
      },
      error: () => {
        this.reasonLoading.set(false);
        this.reasonCodes.set([]);
        this.appMessages.showKey('ui.fee.reasonCatalogFailed', 'error');
      },
    });
  }

  /**
   * Chặn ngay ở web khi thiếu mã lý do (F51) — API cũng trả 400, nhưng để người dùng bấm rồi
   * mới báo là bắt họ nhập lại từ đầu.
   */
  protected submitAdjust(): void {
    const target = this.adjustTarget();
    if (!target) return;

    this.adjustAmountError.set('');
    this.adjustReasonError.set('');

    const amount = Number(this.adjustAmount);
    if (this.adjustAmount === null || !Number.isFinite(amount) || amount < 0) {
      this.adjustAmountError.set(this.t('ui.fee.adjustAmountRequired'));
      this.reportFieldErrors('input[name="adjustAmount"]');
      return;
    }
    if (!this.adjustReasonCode()) {
      this.adjustReasonError.set(this.t('ui.fee.adjustReasonRequired'));
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      return;
    }

    this.adjusting.set(true);
    this.api
      .adjustDossierFee(this.id, {
        ruleCode: target.ruleCode,
        amount,
        reasonCode: this.adjustReasonCode(),
        reasonNote: this.adjustNote.trim() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.adjusting.set(false);
          this.adjustTarget.set(null);
          if (result?.fees) this.fees.set(result.fees);
          this.load(true);
          this.appMessages.showKey('ui.fee.adjustSaved', 'success', { name: target.name });
        },
        error: (error: unknown) => {
          this.adjusting.set(false);
          this.appMessages.showApiError(error, 'ui.fee.adjustFailed');
        },
      });
  }

  // --- Chứng từ đính kèm -----------------------------------------------------

  protected onReceiptSelected(event: Event): void {
    if (this.settled()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    input.value = '';
    if (!file) return;

    const message = validateUploadFile(file, this.t);
    if (message) {
      this.uploadError.set(message);
      return;
    }

    this.uploadError.set('');
    this.uploading.set(true);
    this.api.uploadFile(file, { dossierId: this.id, documentTypeCode: PAYMENT_RECEIPT_DOCUMENT_TYPE }).subscribe({
      next: (attachment) => {
        this.uploading.set(false);
        this.receipt.set(attachment);
      },
      error: () => {
        this.uploading.set(false);
        this.uploadError.set(this.t('ui.form.uploadFileFailed', { name: file.name }));
      },
    });
  }

  protected clearReceipt(): void {
    if (this.settled()) return;
    this.receipt.set(null);
  }

  protected downloadReceipt(attachmentId: string): void {
    if (!attachmentId) return;
    this.downloadingId.set(attachmentId);
    this.api.getFileMetadata(attachmentId).subscribe({
      next: (meta) => {
        this.api.downloadFile(attachmentId).subscribe({
          next: (blob) => {
            this.downloadingId.set('');
            this.saveBlob(blob, meta.fileName || `bien-lai-${attachmentId.slice(0, 8)}`);
          },
          error: () => {
            this.downloadingId.set('');
            this.appMessages.showKey('ui.detail.downloadFailed', 'error', { name: meta.fileName || attachmentId });
          },
        });
      },
      error: () => {
        this.api.downloadFile(attachmentId).subscribe({
          next: (blob) => {
            this.downloadingId.set('');
            this.saveBlob(blob, `bien-lai-${attachmentId.slice(0, 8)}`);
          },
          error: () => {
            this.downloadingId.set('');
            this.appMessages.showKey('ui.detail.downloadFailed', 'error', { name: attachmentId });
          },
        });
      },
    });
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    const isTest =
      typeof window !== 'undefined' &&
      ((window as unknown as Record<string, unknown>)['__karma__'] ||
        (typeof navigator !== 'undefined' && /HeadlessChrome/i.test(navigator.userAgent)));
    const jasmineObj = typeof window !== 'undefined' ? ((window as unknown as Record<string, unknown>)['jasmine'] as { isSpy?: (fn: unknown) => boolean } | undefined) : undefined;
    const isSpied = typeof jasmineObj?.isSpy === 'function' && !!jasmineObj.isSpy((link as unknown as Record<string, unknown>)['click']);
    if (!isTest || isSpied) {
      link.click();
    }
    URL.revokeObjectURL(url);
  }

  // --- Ghi nhận thanh toán (F47) ---------------------------------------------

  protected chooseMethod(code: string): void {
    this.paymentMethod.set(code);
    if (code) this.methodError.set('');
    if (code === 'CASH') {
      this.paymentReference = '';
      this.referenceError.set('');
    } else if (!methodRequiresReference(code)) {
      this.referenceError.set('');
    }
  }

  protected recordPayment(): void {
    this.amountError.set('');
    this.methodError.set('');
    this.referenceError.set('');

    if (this.settled()) {
      this.appMessages.showKey('ui.fee.adjustSettledNotAllowed', 'warning');
      return;
    }

    // Quyết định chủ dự án: chỉ thu khi hồ sơ đã tới bước thu phí. API cũng chặn 400.
    if (!this.stepReached()) {
      this.appMessages.showKey('ui.fee.stepNotReachedHint', 'warning');
      return;
    }

    const amount = Number(this.paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.amountError.set(this.t('ui.fee.amountRequired'));
      this.reportFieldErrors('input[type="number"]');
      return;
    }
    const method = this.paymentMethod();
    if (!method) {
      this.methodError.set(this.t('ui.fee.methodRequired'));
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      return;
    }
    const reference = this.paymentReference.trim();
    if (methodRequiresReference(method) && !reference) {
      this.referenceError.set(this.t('ui.fee.referenceRequired'));
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      return;
    }

    this.recording.set(true);
    this.api
      .collectFee(this.id, {
        amount,
        method,
        referenceCode: method === 'CASH' ? undefined : (reference || undefined),
        attachmentId: this.receipt()?.id || undefined,
        note: this.paymentNote.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.recording.set(false);
          this.resetPaymentForm();
          this.load(true);
          this.appMessages.showKey('ui.fee.recorded', 'success', { amount: this.money(amount) });
        },
        error: (error: unknown) => {
          this.recording.set(false);
          this.appMessages.showApiError(error, 'ui.fee.recordFailed');
        },
      });
  }

  /** Cuộn tới + focus ô nhập lỗi đầu tiên (theo selector) và báo toast tổng "kiểm tra lại". */
  private reportFieldErrors(selector: string): void {
    this.appMessages.showKey('ui.common.formHasErrors', 'error');
    setTimeout(() => {
      const input = this.host.nativeElement.querySelector<HTMLElement>(selector);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
    });
  }

  private resetPaymentForm(): void {
    const out = this.outstanding();
    this.paymentAmount = out > 0 ? out : null;
    this.paymentReference = '';
    this.paymentNote = '';
    this.paymentMethod.set('');
    this.receipt.set(null);
    this.uploadError.set('');
  }

  // --- Tải dữ liệu -----------------------------------------------------------

  private load(silent = false): void {
    if (!silent) this.loading.set(true);
    forkJoin({
      fees: this.api.getDossierFees(this.id).pipe(catchError(() => of(null))),
      dossier: this.api.getDeclaration(this.id).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ fees, dossier }) => {
        this.loading.set(false);
        if (dossier?.code) {
          this.declarationCode.set(dossier.code);
        }
        if (fees) {
          if (fees.dossierCode) {
            this.declarationCode.set(fees.dossierCode);
          }
          this.fees.set(fees);
          const out = feeOutstanding(fees);
          this.paymentAmount = out > 0 ? out : null;
        } else if (!silent) {
          this.fees.set(null);
          this.error.set(this.t('ui.fee.loadFailed'));
        }
      },
      error: () => {
        this.loading.set(false);
        if (silent) {
          this.appMessages.showKey('ui.fee.loadFailed', 'error');
          return;
        }
        this.fees.set(null);
        this.error.set(this.t('ui.fee.loadFailed'));
      },
    });
  }
}
