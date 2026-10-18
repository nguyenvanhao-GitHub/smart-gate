import { Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { exportAndLogFile, saveFileWithPicker } from '../../../shared/utils/file-download.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ApiService, FeeScreenConfig } from '../../../core/services/api.service';
import { DossierAttachment } from '../../../core/models/declaration.model';
import { AuthService } from '../../../core/auth/auth.service';
import { PERMISSION } from '../../../core/auth/access-control.model';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { AppMessageService, AppMessageTone } from '../../../core/services/app-message.service';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import {
  FEE_ACTION_VIEWS,
  FeeActionCode,
  FeeModalMode,
  FeeRow,
  FeeStatusFilter,
  FeeTransaction,
  distinctFeeTypes,
  feeActionLabel,
  feeAmountOverdue,
  feeAmountPaid,
  feeAmountTotal,
  feeAmountUnpaid,
  feeCountOverdue,
  feeCountUnpaid,
  feePaymentMethodLabel,
  feeRowMatchesStatus,
  feeScreenView,
  feeSearchFieldLabel,
  feeStatusLabel,
  feeTransactionStatusLabel,
  feeTransactionStatusTone,
  feeTypeLabel,
  formatMoney,
} from '../../../core/models/fees.model';

interface FeeModal {
  action: FeeActionCode;
  row: FeeRow;
  mode: FeeModalMode;
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatIconModule,
    HasPermissionDirective,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgModalComponent,
    SgPagerComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="page-header">
      <div><h1>{{ screenTitle() }}</h1><span>{{ screenMenu() }}</span><p class="sub">{{ t('ui.fee.workbenchSubtitle') }}</p><p class="hint">{{ t('ui.fee.workbenchCollectHint') }}</p></div>
      <button type="button" *hasPermission="exportPermission" class="ghost icon-btn" [title]="t('ui.fee.exportReport')" [attr.aria-label]="t('ui.fee.exportReport')" (click)="exportCsv()"><mat-icon fontSet="material-icons-round">download</mat-icon></button>
    </section>

    <section class="stats" [attr.aria-label]="t('ui.fee.eyebrow')">
      <article class="kpi" data-tone="total">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">account_balance_wallet</mat-icon></span>
        <div class="kpi__body"><strong>{{ money(kpiTotalDue()) }}</strong><span>{{ t('ui.fee.statTotalDue') }}</span></div>
      </article>
      <article class="kpi" data-tone="done">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">check_circle</mat-icon></span>
        <div class="kpi__body"><strong>{{ money(kpiPaid()) }}</strong><span>{{ t('ui.fee.statPaid') }}</span></div>
      </article>
      <article class="kpi" data-tone="processing">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">schedule</mat-icon></span>
        <div class="kpi__body"><strong>{{ t('ui.fee.ticketCount', { count: kpiUnpaidCount() }) }}</strong><span>{{ t('ui.fee.statUnpaid') }}</span></div>
      </article>
      <article class="kpi" data-tone="danger">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">warning</mat-icon></span>
        <div class="kpi__body"><strong>{{ t('ui.fee.ticketCount', { count: kpiOverdueCount() }) }}</strong><span>{{ t('ui.fee.statOverdue') }}</span></div>
      </article>
    </section>

    <section class="filter-panel">
      @for (field of searchFields(); track field) { <label>{{ feeFieldLabel(field) }} <input type="search" [name]="field" [ngModel]="feeFilters[field]" (ngModelChange)="updateFeeFilter(field, $event)" (keyup.enter)="searchFees()"></label> }
      <label class="status-filter">{{ t('ui.fee.filterStatus') }}
        <select [ngModel]="statusFilter()" (ngModelChange)="changeStatusFilter($event)">
          <option value="ALL">{{ t('ui.fee.filterAll') }}</option>
          <option value="WAITING">{{ t('ui.fee.statusWaiting') }}</option>
          <option value="PAID">{{ t('ui.fee.statusPaid') }}</option>
          <option value="OVERDUE">{{ t('ui.fee.statOverdue') }}</option>
        </select>
      </label>
      <label class="status-filter">{{ t('ui.fee.filterFeeType') }}
        <select [ngModel]="feeTypeFilter()" (ngModelChange)="changeFeeTypeFilter($event)">
          <option value="">{{ t('ui.fee.filterAll') }}</option>
          @for (code of feeTypeOptions(); track code) { <option [value]="code">{{ feeTypeName(code) }}</option> }
        </select>
      </label>
      <label class="date-filter">{{ t('ui.fee.dateFrom') }} <input type="date" [(ngModel)]="dateFrom" (ngModelChange)="goToPage(1)"></label>
      <label class="date-filter">{{ t('ui.fee.dateTo') }} <input type="date" [(ngModel)]="dateTo" (ngModelChange)="goToPage(1)"></label>
      <div class="filter-actions">
        <button type="button" sgButton [disabled]="loading()" (click)="searchFees()">
          <mat-icon fontSet="material-icons-round">search</mat-icon>{{ t('ui.common.search') }}
        </button>
        <button type="button" sgButton="tertiary" [disabled]="loading()" (click)="resetFilters()">
          <mat-icon fontSet="material-icons-round">restart_alt</mat-icon>{{ t('ui.common.reset') }}
        </button>
      </div>
    </section>

    <sg-card [flush]="true">
      <div class="sg-scroll-x">
        <table>
          <thead><tr><th>{{ t('ui.fee.colDossierCode') }}</th><th>{{ t('ui.common.plateNumber') }}</th><th>{{ t('ui.common.enterprise') }}</th><th>{{ t('ui.fee.filterFeeType') }}</th><th>{{ t('ui.fee.colAmount') }}</th><th>{{ t('ui.fee.colCreatedAt') }}</th><th>{{ t('ui.dossier.status') }}</th><th>{{ t('ui.fee.colActions') }}</th></tr></thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="8" class="empty">{{ t('ui.common.loading') }}</td></tr>
            } @else if (error()) {
              <tr><td colspan="8" class="empty">{{ error() }}</td></tr>
            } @else {
              @for (row of pagedFeeRows(); track row.code) {
                <tr>
                  <td>
                    @if (row.declarationId) {
                      <a class="target-link" [routerLink]="['/declarations', row.declarationId]">{{ row.code }}</a>
                    } @else {
                      {{ row.code }}
                    }
                  </td>
                  <td>{{ row.plate }}</td>
                  <td>{{ row.company }}</td>
                  <td>{{ feeTypeName(row.feeType) }}</td>
                  <td>{{ money(row.amount) }}</td>
                  <td>{{ dateLabel(row.createdAt) }}</td>
                  <td><span class="status" [attr.data-status]="rowStatusCode(row)">{{ rowStatusLabel(row) }}</span></td>
                  <td class="actions">
                    <button class="icon-btn view" [title]="t('ui.fee.detail')" [attr.aria-label]="t('ui.fee.detail')" (click)="openDetail(row)"><mat-icon fontSet="material-icons-round">visibility</mat-icon></button>
                    @if (row.declarationId && row.outstanding > 0) {
                      @if (canCollectRow(row)) {
                        <a
                          class="icon-btn collect"
                          *hasPermission="collectPermission"
                          [routerLink]="['/declarations', row.declarationId, 'fees']"
                          [title]="t('ui.fee.actionCollect')"
                          [attr.aria-label]="t('ui.fee.actionCollect')"
                        ><mat-icon fontSet="material-icons-round">payments</mat-icon></a>
                      } @else {
                        <span class="step-hint" [title]="t('ui.fee.stepNotReachedHint')">{{ t('ui.fee.stepNotReached') }}</span>
                      }
                    }
                    @if (isPaid(row)) {
                      <button class="icon-btn view" [title]="t('ui.fee.print')" [attr.aria-label]="t('ui.fee.print')" (click)="printReceipt(row)"><mat-icon fontSet="material-icons-round">print</mat-icon></button>
                      @if (canRunFeeAction()) {
                        <button class="icon-btn revision" [title]="t('ui.fee.cancel')" [attr.aria-label]="t('ui.fee.cancel')" (click)="openFeeModal('CANCEL_PAYMENT', row)"><mat-icon fontSet="material-icons-round">money_off</mat-icon></button>
                      }
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty">{{ emptyMessage() }}</td></tr>
              }
            }
          </tbody>
        </table>
      </div>

      <div card-footer class="pager">
        <span>{{ summary() }}</span>
        <div class="pager__controls">
          <span class="pager__label">{{ t('ui.common.display') }}</span>
          <sg-select
            class="pager__size"
            [showEmptyOption]="false"
            [ariaLabel]="t('ui.common.pageSizeAria')"
            [options]="pageSizeOptions()"
            [value]="pageSizeValue()"
            (valueChange)="changePageSize($event)"
          />
        </div>
        <sg-pager
          [page]="page()"
          [pageSize]="pageSize()"
          [total]="total()"
          [disabled]="loading()"
          (pageChange)="goToPage($event)"
        />
      </div>
    </sg-card>

    @if (feeModal(); as modal) {
      <sg-modal
        [eyebrow]="t('ui.fee.eyebrow')"
        [title]="feeModalTitle(modal) + ' - ' + modal.row.code"
        [size]="modal.mode === 'history' ? 'xl' : 'md'"
        [footer]="true"
        (close)="closeFeeModal()"
      >
        @if (modal.mode === 'history') {
          <div class="tx-modal">
            @if (detailLoading()) {
              <div class="file-loading" style="text-align:center; padding: 24px;">{{ t('ui.common.loading') }}</div>
            } @else if (detailTransactions().length === 0) {
              <div class="tx-empty">
                <mat-icon fontSet="material-icons-round" style="font-size: 36px; width: 36px; height: 36px; color: var(--sg-text-muted);">receipt_long</mat-icon>
                <p class="main">{{ t('ui.fee.txEmpty') }}</p>
              </div>
            } @else {
              <div class="tx-table-wrapper">
                <table class="tx-table">
                  <colgroup>
                    <col class="col-amount">
                    <col class="col-method">
                    <col class="col-ref">
                    <col class="col-doc">
                    <col class="col-status">
                    <col class="col-actor">
                  </colgroup>
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
                    @for (row of detailTransactions(); track row.id) {
                      <tr>
                        <td class="right amount-cell">{{ money(row.amount) }}</td>
                        <td class="method-cell" [title]="methodLabel(row.method)">{{ methodLabel(row.method) }}</td>
                        <td class="ref-cell" [title]="row.referenceCode || ''">{{ row.referenceCode || '—' }}</td>
                        <td class="center doc-cell">
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
                        <td class="center status-cell">
                          <span class="chip" [attr.data-tone]="txTone(row.status)">{{ txStatus(row.status) }}</span>
                        </td>
                        <td class="actor-cell" [title]="row.confirmedByName || ''">
                          <div class="actor-name">{{ row.confirmedByName || '—' }}</div>
                          @if (row.confirmedAt) {
                            <span class="sub">{{ row.confirmedAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        } @else {
          <div class="op-modal">
            <dl>
              <dt>{{ t('ui.fee.colDossierCode') }}</dt>
              <dd>
                @if (modal.row.declarationId) {
                  <a class="target-link" [routerLink]="['/declarations', modal.row.declarationId]">{{ modal.row.code }}</a>
                } @else {
                  {{ modal.row.code }}
                }
              </dd>
              <dt>{{ t('ui.common.enterprise') }}</dt><dd>{{ modal.row.company }}</dd>
              <dt>{{ t('ui.common.plateNumber') }}</dt><dd>{{ modal.row.plate }}</dd>
              <dt>{{ t('ui.fee.filterFeeType') }}</dt><dd>{{ feeTypeName(modal.row.feeType) }}</dd>
              <dt>{{ t('ui.fee.colCreatedAt') }}</dt><dd>{{ dateLabel(modal.row.createdAt) }}</dd>
              <dt>{{ t('ui.fee.totalRequired') }}</dt><dd>{{ money(modal.row.amount) }}</dd>
              <dt>{{ t('ui.fee.amountPaid') }}</dt><dd>{{ money(paidAmount(modal.row)) }}</dd>
              <dt>{{ t('ui.fee.amountRemaining') }}</dt><dd>{{ money(remainingAmount(modal.row)) }}</dd>
              <dt>{{ t('ui.dossier.status') }}</dt><dd>{{ rowStatusLabel(modal.row) }}</dd>
              <dt>{{ t('ui.fee.colDocument') }}</dt>
              <dd>
                @if (detailLoading()) {
                  <span class="file-loading">{{ t('ui.common.loading') }}</span>
                } @else if (detailAttachments().length) {
                  <div class="modal-files">
                    @for (file of detailAttachments(); track file.id) {
                      <button
                        type="button"
                        class="modal-file-item"
                        [title]="t('ui.fee.documentDownload') + ': ' + (file.fileName || file.id)"
                        [disabled]="downloadingId() === file.id"
                        (click)="downloadAttachment(file)"
                      >
                        <mat-icon fontSet="material-icons-round">
                          {{ downloadingId() === file.id ? 'hourglass_top' : 'attach_file' }}
                        </mat-icon>
                        <span class="modal-file-name">{{ file.fileName || file.id }}</span>
                      </button>
                    }
                  </div>
                } @else {
                  <span>-</span>
                }
              </dd>
            </dl>
            @if (modal.mode !== 'detail') {
              <label>{{ t('ui.fee.processAmount') }}
                <input type="number" [(ngModel)]="feeAmount">
              </label>
              <label>{{ t('ui.fee.noteLabel') }}
                <textarea rows="4" [(ngModel)]="feeNote" [placeholder]="t('ui.fee.notePlaceholder')"></textarea>
              </label>
            }
          </div>
        }
        <ng-container modal-footer>
          @if (modal.mode === 'detail') {
            @if (hasPaymentHistory(modal.row)) {
              <button type="button" sgButton="secondary" (click)="openPaymentHistory(modal.row)">
                {{ t('ui.fee.paymentHistory') }}
              </button>
            }
            <button type="button" sgButton (click)="closeFeeModal()">{{ t('ui.common.close') }}</button>
          } @else if (modal.mode === 'history') {
            <button type="button" sgButton="secondary" (click)="openDetail(modal.row)">
              {{ t('ui.common.back') }}
            </button>
            <button type="button" sgButton (click)="closeFeeModal()">{{ t('ui.common.close') }}</button>
          } @else {
            <button type="button" class="icon-btn neutral" [title]="t('ui.common.cancelAction')" [attr.aria-label]="t('ui.common.cancelAction')" (click)="closeFeeModal()"><mat-icon fontSet="material-icons-round">close</mat-icon></button>
            <button type="button" class="primary icon-btn" [disabled]="!canSubmit(modal)" [title]="t('ui.fee.execute')" [attr.aria-label]="t('ui.fee.execute')" (click)="submitFeeAction()"><mat-icon fontSet="material-icons-round">check</mat-icon></button>
          }
        </ng-container>
      </sg-modal>
    }
  `,
  styles: [
    `
      .page-header .sub { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .page-header .hint { margin: var(--sg-space-1) 0 0; color: var(--sg-primary); font-size: var(--sg-small-size); }
      .status-filter select, .date-filter input { min-height: 38px; }
      .op-alert { display: block; margin: 0 0 var(--sg-space-3); }

      .target-link { color: var(--sg-primary); font-weight: 600; text-decoration: none; }
      .target-link:hover { text-decoration: underline; }

      /* KPI thẻ ô icon vuông màu — cùng khuôn với sơ đồ kho bãi / dashboard. */
      .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sg-space-4); margin-bottom: var(--sg-space-4); }
      .kpi { display: flex; align-items: center; gap: var(--sg-space-3); padding: 16px 18px; border: 1px solid var(--sg-border); border-radius: 14px; background: var(--sg-bg-surface); }
      .kpi__ico { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0; }
      .kpi__ico mat-icon { font-size: 20px; width: 20px; height: 20px; }
      .kpi__body strong { display: block; font-size: 18px; font-weight: 700; color: var(--sg-text); line-height: 1.2; overflow-wrap: anywhere; }
      .kpi__body span { display: block; margin-top: 1px; color: var(--sg-text-muted); font-size: 11.5px; }
      .kpi[data-tone='total'] .kpi__ico { background: var(--sg-primary-soft); color: var(--sg-primary); }
      .kpi[data-tone='processing'] .kpi__ico { background: var(--sg-state-waiting-soft); color: var(--sg-state-waiting-ink); }
      .kpi[data-tone='done'] .kpi__ico { background: var(--sg-state-done-soft); color: var(--sg-state-done); }
      .kpi[data-tone='danger'] .kpi__ico { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }
      @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

      /* Nhãn trạng thái quá hạn / chờ thu — bám palette mẫu (quá hạn đỏ, chờ thu vàng). */
      .status[data-status='OVERDUE'] { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }
      .status[data-status='PENDING'], .status[data-status='PROCESSING'], .status[data-status='REVISION_REQUIRED'] { background: var(--sg-state-waiting-soft); color: var(--sg-state-waiting-ink); }

      /* Nút thu phí trên dòng — mượn tông "thanh toán" của mẫu nhưng KHÔNG dùng class .payment
         (đã gỡ ở BUG-007); dùng class riêng .collect để không đụng ràng buộc đó. */
      .actions .collect { background: var(--sg-action-payment); }
      /* Gợi ý ngắn khi hồ sơ chưa tới bước thu phí — thay chỗ nút thu, tông chữ mờ. */
      .actions .step-hint { display: inline-block; padding: 0 6px; color: var(--sg-text-muted); font-size: 11.5px; font-style: italic; white-space: nowrap; }

      .pager {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }
      .pager__controls { display: inline-flex; align-items: center; gap: 8px; justify-self: center; }
      .pager sg-pager { justify-self: end; }
      .pager__label { color: var(--sg-text-muted); font-size: var(--sg-small-size); white-space: nowrap; }
      .pager__size { width: 72px; }

      .op-modal { display: grid; gap: var(--sg-space-3); }
      .op-modal dl { display: grid; grid-template-columns: minmax(0, .7fr) minmax(0, 1fr); gap: var(--sg-space-1) var(--sg-space-3); margin: 0; }
      .op-modal dt { color: var(--sg-text-muted); }
      .op-modal dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
      .op-modal label, .op-modal .field { display: grid; gap: var(--sg-space-1); margin: 0; font-weight: 700; }
      .op-modal textarea { min-height: 92px; resize: vertical; }

      .modal-files { display: flex; flex-direction: column; gap: 6px; }
      .modal-file-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 9px;
        border: 1px solid var(--sg-border);
        border-radius: 6px;
        background: var(--sg-bg);
        color: var(--sg-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .modal-file-item:hover {
        background: var(--sg-primary-soft);
        border-color: var(--sg-primary);
      }
      .modal-file-item:disabled { opacity: 0.6; cursor: not-allowed; }
      .modal-file-item mat-icon { font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; }
      .modal-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
      .file-loading { color: var(--sg-text-muted); font-size: 12px; font-weight: normal; font-style: italic; }
      .filter-actions { display: inline-flex; align-items: center; gap: var(--sg-space-2); align-self: end; white-space: nowrap; }

      .tx-modal { width: 100%; }
      .tx-table-wrapper { width: 100%; overflow-x: auto; }
      .tx-table { width: 100%; min-width: 0; max-width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
      .col-amount { width: 18%; }
      .col-method { width: 16%; }
      .col-ref { width: 18%; }
      .col-doc { width: 10%; }
      .col-status { width: 16%; }
      .col-actor { width: 22%; }
      .tx-table th { padding: 10px 8px; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--sg-text-muted); background: var(--sg-bg-muted); border-bottom: 1px solid var(--sg-border); white-space: nowrap; }
      .tx-table td { padding: 10px 8px; border-bottom: 1px solid var(--sg-border); vertical-align: middle; }
      .tx-table th.right, .tx-table td.right { text-align: right; }
      .tx-table th.center, .tx-table td.center { text-align: center; }
      .tx-table .amount-cell { font-weight: 600; color: var(--sg-text); white-space: nowrap; }
      .tx-table td.method-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tx-table td.ref-cell { font-family: monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
      .tx-table td.status-cell { white-space: nowrap; }
      .tx-table td.doc-cell { text-align: center; }
      .tx-table td.actor-cell { overflow: hidden; }
      .tx-table .actor-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
      .tx-table .sub { display: block; color: var(--sg-text-muted); font-size: 11px; margin-top: 2px; white-space: nowrap; }
      .chip { display: inline-flex; align-items: center; gap: 5px; min-height: 22px; padding: 2px 8px; border-radius: 20px; background: var(--sg-bg-muted); color: var(--sg-text-muted); font-size: 11px; font-weight: 600; }
      .chip::before { content: '●'; font-size: 7px; line-height: 1; }
      .chip[data-tone='done'] { background: var(--sg-state-done-soft); color: var(--sg-state-done); }
      .chip[data-tone='waiting'] { background: var(--sg-state-waiting-soft); color: var(--sg-state-waiting-ink); }
      .chip[data-tone='rejected'] { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }
      .doc-btn { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--sg-border); border-radius: 6px; background: var(--sg-bg-surface); color: var(--sg-primary); cursor: pointer; transition: all .15s ease; }
      .doc-btn:hover { background: var(--sg-primary-soft); border-color: var(--sg-primary); }
      .doc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .doc-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
      .tx-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 16px; text-align: center; color: var(--sg-text-muted); }
      .tx-empty p.main { margin: 0; font-weight: 500; font-size: 13.5px; color: var(--sg-text); }
    `,
  ],
})
export class FeeWorkbenchPageComponent implements OnChanges, OnInit {
  @Input() slug = '';
  private readonly i18n = inject(I18nService);
  private readonly appMessages = inject(AppMessageService);
  protected screen = signal<FeeScreenConfig | null>(null);
  protected loading = signal(false);
  /** Lỗi tải danh sách phí — hiện ngay trong bảng để không nhầm với trạng thái "trống". */
  protected error = signal('');
  protected feeModal = signal<FeeModal | null>(null);
  protected feeAmount = 0;
  protected feeNote = '';
  protected readonly detailLoading = signal(false);
  protected readonly detailAttachments = signal<DossierAttachment[]>([]);
  protected readonly detailTransactions = signal<FeeTransaction[]>([]);
  protected readonly downloadingId = signal('');

  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly PAGE_SIZES = [10, 20, 50];
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    this.PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );
  protected readonly total = computed(() => this.filteredFeeRows().length);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly summary = computed(() => {
    const count = this.total();
    if (!count) return this.t('ui.fee.summaryEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(count, this.page() * this.pageSize());
    return this.t('ui.fee.summary', { start, end, total: count });
  });

  private readonly _dateFromSignal = signal('');
  get dateFrom(): string {
    return this._dateFromSignal();
  }
  set dateFrom(val: string) {
    this._dateFromSignal.set(val || '');
  }

  private readonly _dateToSignal = signal('');
  get dateTo(): string {
    return this._dateToSignal();
  }
  set dateTo(val: string) {
    this._dateToSignal.set(val || '');
  }

  private _feeFiltersRaw: Record<string, string> = {};
  private readonly _feeFiltersSignal = signal<Record<string, string>>({});
  /** Giá trị các ô tra cứu, khóa theo mã trường (`PLATE_NUMBER`, `TAX_CODE`…). */
  get feeFilters(): Record<string, string> {
    return this._feeFiltersRaw;
  }
  set feeFilters(val: Record<string, string>) {
    this._feeFiltersRaw = val || {};
    this._feeFiltersSignal.set({ ...this._feeFiltersRaw });
  }

  protected updateFeeFilter(field: string, val: string): void {
    this._feeFiltersRaw[field] = val || '';
    this._feeFiltersSignal.set({ ...this._feeFiltersRaw });
  }

  /** Danh sách dòng phí — signal để bảng vẽ lại khi nạp/lọc, khớp khuôn các trang chuẩn. */
  protected readonly feeRows = signal<FeeRow[]>([]);

  /** Lọc theo nhóm trạng thái ngay tại web trên danh sách đã nạp (khớp filter bar của mẫu). */
  protected readonly statusFilter = signal<FeeStatusFilter>('ALL');
  /** Lọc theo nhóm phí (mã) — rỗng = tất cả. */
  protected readonly feeTypeFilter = signal('');

  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) { }

  ngOnInit(): void {
    this.loadScreen(this.slug);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['slug'] && !changes['slug'].firstChange) {
      this.loadScreen(changes['slug'].currentValue || 'tax');
    }
  }

  private loadScreen(slug: string): void {
    this.screen.set(null);
    this.feeFilters = {};
    this.api.getFeeScreens().subscribe({
      next: (items) => {
        const match = items.find((item) => item.slug === slug) || items[0] || null;
        this.screen.set(match);
      },
      error: () => this.notify(this.t('ui.fee.screenLoadFailed'), 'error'),
    });
    this.loadFeeItems(slug);
  }

  private currentSlug(): string {
    return this.screen()?.slug || this.slug || 'tax';
  }

  protected screenTitle(): string {
    const view = feeScreenView(this.currentSlug());
    return view ? this.t(view.titleKey) : '';
  }

  protected screenMenu(): string {
    const view = feeScreenView(this.currentSlug());
    return view ? this.t(view.menuKey) : '';
  }

  protected searchFields(): FeeScreenConfig['searchFields'] {
    return this.screen()?.searchFields || [];
  }

  protected feeFieldLabel(field: string): string {
    return feeSearchFieldLabel(field, this.t);
  }

  protected feeTypeName(code: string): string {
    return feeTypeLabel(code, this.t);
  }

  /** Nhóm phí có mặt trong dữ liệu đã tải — dựng dropdown "Loại phí". */
  protected feeTypeOptions(): string[] {
    return distinctFeeTypes(this.feeRows());
  }

  protected money(amount: number): string {
    return formatMoney(amount, 'VND', this.i18n.dateLocale());
  }

  protected dateLabel(iso: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(this.i18n.dateLocale());
  }

  protected isPaid(row: FeeRow): boolean {
    const s = String(row.status || '').toUpperCase();
    return s === 'COMPLETED' || s === 'PAID' || (typeof row.outstanding === 'number' && row.outstanding <= 0);
  }

  /** Kiểm tra bản ghi đã phát sinh lịch sử thanh toán (đã thanh toán toàn bộ hoặc một phần hoặc có giao dịch) (SG-292, SG-295). */
  protected hasPaymentHistory(row: FeeRow): boolean {
    if (!row.declarationId) return false;
    if (this.isPaid(row)) return true;
    if (this.paidAmount(row) > 0) return true;
    if (this.detailTransactions().length > 0) return true;
    return false;
  }

  /**
   * Thông báo khi bảng trống. Danh sách API nay chỉ trả hồ sơ **đã tới bước thu phí**; nếu API không
   * trả dòng nào thì gợi ý đúng nguyên nhân, còn nếu chỉ do bộ lọc ở web che hết thì báo trống chung.
   */
  protected emptyMessage(): string {
    return this.feeRows().length === 0 ? this.t('ui.fee.emptyNoFeeStep') : this.t('ui.fee.empty');
  }

  /** Mã dùng cho `data-status` (tô màu) — quá hạn ưu tiên hiện đỏ. */
  protected rowStatusCode(row: FeeRow): string {
    return row.overdue ? 'OVERDUE' : row.status;
  }

  protected rowStatusLabel(row: FeeRow): string {
    return row.overdue ? this.t('ui.fee.statOverdue') : feeStatusLabel(row.status, this.t);
  }

  // --- KPI tiền (số thật) ----------------------------------------------------

  protected kpiTotalDue(): number {
    return feeAmountTotal(this.feeRows());
  }

  protected kpiPaid(): number {
    return feeAmountPaid(this.feeRows());
  }

  protected kpiUnpaid(): number {
    return feeAmountUnpaid(this.feeRows());
  }

  protected kpiOverdue(): number {
    return feeAmountOverdue(this.feeRows());
  }

  // --- KPI đếm phiếu (mockup: 2 thẻ cuối đếm số phiếu, không phải số tiền — BUG-057) -----------

  protected kpiUnpaidCount(): number {
    return feeCountUnpaid(this.feeRows());
  }

  protected kpiOverdueCount(): number {
    return feeCountOverdue(this.feeRows());
  }

  // --- Modal / hành động -----------------------------------------------------

  protected feeModalTitle(modal: FeeModal): string {
    if (modal.mode === 'detail') return this.t('ui.fee.detail');
    if (modal.mode === 'history') return this.t('ui.fee.paymentHistory');
    return feeActionLabel(modal.action, this.t);
  }

  protected openDetail(row: FeeRow): void {
    // Chế độ chi tiết không dùng `action`; đặt một mã hợp lệ làm giữ chỗ.
    this.feeModal.set({ action: 'SUPPLEMENT_PAYMENT', row, mode: 'detail' });
    this.detailAttachments.set([]);
    this.detailTransactions.set([]);
    if (!row.declarationId) return;

    this.detailLoading.set(true);
    forkJoin({
      dossier: this.api.getDeclaration(row.declarationId).pipe(catchError(() => of(null))),
      fees: this.api.getDossierFees(row.declarationId).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ dossier, fees }) => {
        this.detailTransactions.set(fees?.transactions || []);
        // Chỉ lấy chứng từ liên quan đến thu phí (biên lai / chứng từ thanh toán)
        const list: DossierAttachment[] = (dossier?.attachments || []).filter(
          (item) => item.documentTypeCode === 'PAYMENT_RECEIPT',
        );
        const existingIds = new Set(list.map((item) => item.id));

        const txAttachmentIds = (fees?.transactions || [])
          .map((tx) => tx.attachmentId)
          .filter((id): id is string => !!id && !existingIds.has(id));

        if (!txAttachmentIds.length) {
          this.detailAttachments.set(list);
          this.detailLoading.set(false);
          return;
        }

        forkJoin(
          txAttachmentIds.map((id) =>
            this.api.getFileMetadata(id).pipe(
              catchError(() =>
                of({
                  id,
                  fileName: `bien-lai-${id.slice(0, 8)}`,
                  sizeBytes: 0,
                } as DossierAttachment),
              ),
            ),
          ),
        ).subscribe({
          next: (txAttachments) => {
            this.detailAttachments.set([...list, ...txAttachments]);
            this.detailLoading.set(false);
          },
          error: () => {
            this.detailAttachments.set(list);
            this.detailLoading.set(false);
          },
        });
      },
      error: () => {
        this.detailAttachments.set([]);
        this.detailTransactions.set([]);
        this.detailLoading.set(false);
      },
    });
  }

  /** Mở popup lịch sử thanh toán từ popup chi tiết của tờ khai đã thanh toán (SG-292). */
  protected openPaymentHistory(row: FeeRow): void {
    this.feeModal.set({ action: 'SUPPLEMENT_PAYMENT', row, mode: 'history' });
    if (this.detailTransactions().length === 0 && row.declarationId) {
      this.detailLoading.set(true);
      this.api.getDossierFees(row.declarationId).pipe(catchError(() => of(null))).subscribe({
        next: (fees) => {
          this.detailTransactions.set(fees?.transactions || []);
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailTransactions.set([]);
          this.detailLoading.set(false);
        },
      });
    }
  }

  protected methodLabel(method: string): string {
    return feePaymentMethodLabel(method, this.t);
  }

  protected txStatus(status: string): string {
    return feeTransactionStatusLabel(status, this.t);
  }

  protected txTone(status: string): string {
    return feeTransactionStatusTone(status);
  }

  /** Từ hộp thoại Chi tiết chuyển sang luồng điều chỉnh (bổ sung) — theo khuôn nút "✎ Chỉnh sửa" của mockup. */
  protected editFromDetail(row: FeeRow): void {
    if (this.isPaid(row)) return;
    this.openFeeModal('SUPPLEMENT_PAYMENT', row);
  }

  protected openFeeModal(action: FeeActionCode, row: FeeRow): void {
    if (action === 'SUPPLEMENT_PAYMENT' && this.isPaid(row)) {
      this.notify(this.t('ui.fee.adjustSettledNotAllowed'), 'warning');
      return;
    }
    const mode = FEE_ACTION_VIEWS[action].mode;
    if (mode !== 'detail' && !this.canRunFeeAction()) {
      this.notify(this.t('ui.fee.noPermission'), 'error');
      return;
    }
    this.feeAmount = row.amount;
    this.feeNote = '';
    this.feeModal.set({ action, row, mode });
  }

  protected closeFeeModal(): void {
    this.feeModal.set(null);
    this.feeNote = '';
    this.detailAttachments.set([]);
    this.detailTransactions.set([]);
    this.detailLoading.set(false);
  }

  protected downloadAttachment(file: DossierAttachment): void {
    if (!file?.id) return;
    this.downloadingId.set(file.id);
    this.api.downloadFile(file.id).subscribe({
      next: (blob) => {
        this.downloadingId.set('');
        void saveFileWithPicker(blob, file.fileName || `chung-tu-${file.id.slice(0, 8)}`);
      },
      error: () => {
        this.downloadingId.set('');
        this.notify(this.t('ui.detail.downloadFailed', { name: file.fileName || file.id }), 'error');
      },
    });
  }

  protected downloadReceipt(attachmentId: string): void {
    if (!attachmentId) return;
    this.downloadingId.set(attachmentId);
    this.api.downloadFile(attachmentId).subscribe({
      next: (blob) => {
        this.downloadingId.set('');
        void saveFileWithPicker(blob, `bien-lai-${attachmentId.slice(0, 8)}`);
      },
      error: () => {
        this.downloadingId.set('');
        this.notify(this.t('ui.detail.downloadFailed', { name: attachmentId }), 'error');
      },
    });
  }

  /**
   * Chỉ cho xác nhận khi ở chế độ thao tác **và đã nhập lý do/ghi chú** — mọi hành động điều chỉnh
   * (bổ sung/hủy/gộp) đều bắt buộc có lý do (BUG-029); API cũng chặn 400 nếu bỏ trống.
   */
  protected canSubmit(modal: FeeModal): boolean {
    return modal.mode !== 'detail' && !!this.feeNote.trim();
  }

  protected submitFeeAction(): void {
    const modal = this.feeModal();
    const screen = this.screen();
    if (!modal || !screen) return;
    if (!this.canRunFeeAction()) {
      this.notify(this.t('ui.fee.noPermission'), 'error');
      this.closeFeeModal();
      return;
    }
    const label = this.feeModalTitle(modal);
    this.notify(this.t('ui.fee.running', { action: label.toLowerCase() }), 'info');
    this.api.runFeeAction(screen.slug, modal.action, {
      feeCode: modal.row.code,
      declarationId: modal.row.declarationId,
      amount: this.feeAmount,
      note: this.feeNote,
    }).subscribe({
      next: () => {
        this.notify(this.t('ui.fee.actionOk', { action: label }), 'success');
        this.closeFeeModal();
        this.loadFeeItems(screen.slug);
      },
      error: () => this.notify(this.t('ui.fee.actionFailed', { action: label }), 'error'),
    });
  }

  protected searchFees(): void {
    this.goToPage(1);
    this.loadFeeItems(this.currentSlug());
  }

  protected resetFilters(): void {
    this.feeFilters = {};
    this.statusFilter.set('ALL');
    this.feeTypeFilter.set('');
    this.dateFrom = '';
    this.dateTo = '';
    this.goToPage(1);
    this.loadFeeItems(this.currentSlug());
  }

  /**
   * Lấy từ khóa tra cứu để gửi lên API — gửi giá trị tìm kiếm khi có trường được nhập.
   */
  private feeQuery(): { keyword?: string } {
    const activeValues = this.searchFields()
      .map((field) => (this.feeFilters[field] || '').trim())
      .filter(Boolean);
    const keyword = activeValues.length === 1 ? activeValues[0] : activeValues.join(' ');
    return keyword ? { keyword } : {};
  }

  private loadFeeItems(slug: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getFeeItems(slug, this.feeQuery()).subscribe({
      next: (items) => {
        this.feeRows.set(items as unknown as FeeRow[]);
        this.loading.set(false);
        this.goToPage(1);
      },
      error: () => {
        this.feeRows.set([]);
        this.loading.set(false);
        this.error.set(this.t('ui.fee.listLoadFailed'));
        this.notify(this.t('ui.fee.listLoadFailed'), 'error');
      },
    });
  }

  /** Danh sách phí sau khi áp các bộ lọc ở web (trạng thái + loại phí + khoảng ngày + ô tra cứu). */
  protected readonly filteredFeeRows = computed<FeeRow[]>(() => {
    this._feeFiltersSignal();
    const status = this.statusFilter();
    const feeType = this.feeTypeFilter();
    const from = this._dateFromSignal();
    const to = this._dateToSignal();
    const filters = this.feeFilters;
    return this.feeRows().filter((row) => {
      if (!feeRowMatchesStatus(row, status)) return false;
      if (feeType && row.feeType !== feeType) return false;
      const day = String(row.createdAt || '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      for (const field of this.searchFields()) {
        const query = (filters[field] || '').trim().toLowerCase();
        if (!query) continue;
        if (field === 'PLATE_NUMBER' && !String(row.plate || '').toLowerCase().includes(query)) return false;
        if (field === 'TRAILER_NUMBER' && !String(row.trailer || '').toLowerCase().includes(query)) return false;
        if (field === 'FEE_CODE' && !String(row.code || '').toLowerCase().includes(query)) return false;
        if (field === 'TAX_CODE' && !String(row.taxCode || '').toLowerCase().includes(query)) return false;
        if (field === 'CUSTOMS_DECLARATION_NO' && !String(row.code || '').toLowerCase().includes(query)) return false;
      }
      return true;
    });
  });

  /** Đổi bộ lọc trạng thái thì về trang 1 để không kẹt ở trang vượt quá số kết quả. */
  protected changeStatusFilter(value: FeeStatusFilter): void {
    this.statusFilter.set(value);
    this.goToPage(1);
  }

  protected changeFeeTypeFilter(value: string): void {
    this.feeTypeFilter.set(value);
    this.goToPage(1);
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.goToPage(1);
  }

  protected readonly pagedFeeRows = computed<FeeRow[]>(() => {
    const maxP = this.totalPages();
    const currentPage = Math.min(Math.max(1, this.page()), maxP);
    const start = (currentPage - 1) * this.pageSize();
    return this.filteredFeeRows().slice(start, start + this.pageSize());
  });

  protected pageSummary(): string {
    return this.summary();
  }

  protected goToPage(page: number): void {
    const maxPage = this.totalPages();
    this.page.set(Math.min(Math.max(1, page), maxPage));
  }

  protected paidAmount(row: FeeRow): number {
    if (typeof row.paid === 'number') return row.paid;
    if (typeof row.outstanding === 'number') return Math.max(0, row.amount - row.outstanding);
    return row.status === 'PAID' ? row.amount : 0;
  }

  protected remainingAmount(row: FeeRow): number {
    if (typeof row.outstanding === 'number') return row.outstanding;
    return row.status === 'PAID' ? 0 : row.amount;
  }

  /** Chỉ tài khoản có quyền duyệt thu phí mới được thao tác; API vẫn kiểm lại phạm vi dữ liệu. */
  protected canRunFeeAction(): boolean {
    return this.auth.hasPermission(PERMISSION.feeApprove);
  }

  /**
   * Quyền duyệt thu phí (bước F48) — khớp với phân quyền của màn thu phí theo hồ sơ.
   */
  protected readonly collectPermission = PERMISSION.feeApprove;
  protected readonly exportPermission = PERMISSION.feeExport;

  /**
   * Dòng có được thu không: có hồ sơ, còn nợ **và đã tới bước thu phí** (quyết định chủ dự án).
   * Cờ `feeStepReached` do API tính từ workflow.
   */
  protected canCollectRow(row: FeeRow): boolean {
    return !!row.declarationId && row.outstanding > 0 && row.feeStepReached === true;
  }

  /**
   * Xuất đối soát phí — gọi **API máy chủ** để tệp dựng từ số thật (settlement), ghi nhật ký
   * `REPORT_EXPORT` và áp đúng bộ lọc đang xem. Không tự sinh CSV ở trình duyệt nữa (BUG-028).
   */
  protected exportCsv(): void {
    if (!this.auth.hasPermission(this.exportPermission)) {
      this.notify(this.t('ui.fee.noPermission'), 'error');
      return;
    }
    const screen = this.screen();
    if (!screen) return;
    if (!this.filteredFeeRows().length) {
      this.notify(this.t('ui.fee.exportEmpty'), 'info');
      return;
    }
    const status = this.statusFilter();
    const query = {
      ...this.feeQuery(),
      status: status === 'ALL' ? undefined : status,
      feeType: this.feeTypeFilter() || undefined,
      from: this.dateFrom || undefined,
      to: this.dateTo || undefined,
    };
    this.notify(this.t('ui.fee.exporting'), 'info');
    void exportAndLogFile(
      this.api.exportFeeItems(screen.slug, query),
      `doi-soat-phi-${screen.slug}.csv`,
      this.api,
      {
        action: 'REPORT_EXPORT',
        targetType: 'FEE_WORKBENCH',
        targetId: screen.slug,
        reportName: `${this.t('ui.fee.reportPrefix')} ${screen.slug}`,
        filter: query,
      },
      () => this.notify(this.t('ui.fee.exportCancelled'), 'info'),
    ).then((res) => {
      if (res === 'SUCCESS') {
        this.notify(this.t('ui.fee.exported'), 'success');
      } else if (res === 'FAILED') {
        this.notify(this.t('ui.fee.exportFailed'), 'error');
      }
    }).catch(() => {
      this.notify(this.t('ui.fee.exportFailed'), 'error');
    });
  }

  /** In biên lai từ dữ liệu dòng phí đã tải — mở cửa sổ in của trình duyệt, không gọi API. */
  protected printReceipt(row: FeeRow): void {
    const win = window.open('', '_blank', 'width=520,height=640');
    if (!win) {
      this.notify(this.t('ui.fee.actionFailed', { action: this.t('ui.fee.print') }), 'error');
      return;
    }
    const line = (label: string, value: string): string =>
      `<div class="r"><span>${this.escapeHtml(label)}</span><b>${this.escapeHtml(value)}</b></div>`;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${this.escapeHtml(row.code)}</title>
      <style>body{font-family:'Segoe UI',system-ui,sans-serif;color:#152040;padding:24px;}
      h1{font-size:18px;margin:0 0 4px;}.sub{color:#7885a3;font-size:12px;margin:0 0 16px;}
      .amt{font-size:24px;font-weight:800;text-align:center;padding:14px;background:#f4f6fb;border-radius:10px;margin-bottom:16px;}
      .r{display:flex;justify-content:space-between;padding:7px 0;border-top:1px solid #e6e9f3;font-size:13px;}
      .r span{color:#7885a3;}</style></head><body>
      <h1>${this.escapeHtml(this.t('ui.fee.receiptTitle'))}</h1>
      <p class="sub">${this.escapeHtml(row.code)}</p>
      <div class="amt">${this.escapeHtml(this.money(row.amount))}</div>
      ${line(this.t('ui.common.enterprise'), row.company)}
      ${line(this.t('ui.common.plateNumber'), row.plate)}
      ${line(this.t('ui.fee.filterFeeType'), this.feeTypeName(row.feeType))}
      ${line(this.t('ui.fee.colCreatedAt'), this.dateLabel(row.createdAt))}
      ${line(this.t('ui.dossier.status'), this.rowStatusLabel(row))}
      </body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private notify(text: string, type: AppMessageTone = 'info'): void {
    this.appMessages.show(text, type);
  }
}
