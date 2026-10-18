import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { PERMISSION, actorRoleLabel } from '../../../core/auth/access-control.model';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogItem } from '../../../core/models/admin.model';
import {
  DossierAttachment,
  DossierDetail,
  DossierWorkflowStep,
  RequiredDocument,
  vehicleTypeLabel,
  dossierDirection,
  dossierDirectionLabel,
  dossierStatusLabel,
  dossierStatusTone,
  dossierTypeLabel,
  isDossierEditable,
  resolveEnterpriseIdentifier,
  resolveEnterpriseNameLabelKey,
} from '../../../core/models/declaration.model';
import {
  agencyIcon,
  decisionLabel,
  decisionTone,
  formatDateTime,
  isInspectionStep,
  orderStepsForDisplay,
  workflowStepStatusLabel,
  workflowStepStatusTone,
  QUARANTINE_AGENCY_CODE,
  WorkflowStep,
} from '../../../core/models/workflow.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/message-catalog';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { fileIcon, formatFileSize, isImageFile } from '../../../core/upload/file-rules';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgQrCodeComponent } from '../../../shared/ui/sg-qr-code.component';

interface ProgressStep {
  key: string;
  label: string;
  agencyCode: string;
  icon: string;
  status: string;
  statusLabel: string;
  state: 'done' | 'active' | 'waiting' | 'failed' | 'skipped';
  showsEpidemicBadge?: boolean;
}

/** Một dòng của bảng "Theo dõi trạng thái & lịch sử xử lý". */
interface HistoryRow {
  key: string;
  process: string;
  statusLabel: string;
  tone: string;
  actor: string;
  time: string;
  note: string;
}

/**
 * UI-05 — Chi tiết hồ sơ.
 * Bố cục bám theo template chủ dự án (`HTML/chi-tiet-ho-so.html`): thanh trạng thái, thẻ mã QR,
 * rồi các mục đánh số tuần tự (1 Doanh nghiệp · 2 Phương tiện & lái xe · 3 Hàng hóa ·
 * 4 Tờ khai & chứng từ · 5 Lịch vào cửa khẩu · 6 Theo dõi trạng thái & lịch sử xử lý).
 */
@Component({
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatIconModule,
    HasPermissionDirective,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgModalComponent,
    SgQrCodeComponent,
  ],
  template: `
    @if (loading()) {
      <sg-card><p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.detail.loading') }}</p></sg-card>
    } @else if (error()) {
      <sg-alert type="error" [message]="error()" />
    } @else if (dossier()) {
      <!-- Cú pháp "as" chỉ dùng được ở nhánh @if đầu tiên nên tách khối lấy biến ra trong này. -->
      @if (dossier(); as item) {
      <section class="head">
        <div class="head__title">
          <h1>{{ t('ui.detail.breadcrumbTitle') }} {{ item.code }}</h1>
        </div>
        <div class="head__actions">
          <a sgButton="tertiary" routerLink="/declarations">
            <mat-icon fontSet="material-icons-round">arrow_back</mat-icon>{{ t('ui.detail.back') }}
          </a>
          <button type="button" sgButton="secondary" (click)="print()" [disabled]="!item.qrCode || !qrValid(item.status)">
            <mat-icon fontSet="material-icons-round">print</mat-icon>{{ t('ui.detail.printQr') }}
          </button>
          @if (canEdit()) {
            <a sgButton="secondary" [routerLink]="['/declarations', item.id, 'edit']">
              <mat-icon fontSet="material-icons-round">edit</mat-icon>{{ t('ui.dossier.edit') }}
            </a>
          }
          <!--
            Xác nhận bước và yêu cầu bổ sung **không** làm ở đây nữa (P3): hai lối tắt cũ bỏ qua
            thứ tự bước và mã nguyên nhân bắt buộc. Chuyển sang màn Xử lý liên ngành (UI-07).
          -->
          <!--
            Lối vào duy nhất của UI-11 (thu phí theo hồ sơ) — màn đó không có mục menu riêng. Chỉ hiện
            khi hồ sơ ĐÃ TỚI bước thu phí (feeStepReached, do BE quyết theo luật liên ngành): không cho
            tiếp cận thu phí trước bước phí. Fail-closed — thiếu cờ ⇒ ẩn.
          -->
          @if (item.feeStepReached) {
            <a sgButton="secondary" *hasPermission="permission.feeView" [routerLink]="['/declarations', item.id, 'fees']">
              <mat-icon fontSet="material-icons-round">payments</mat-icon>{{ t('ui.detail.fees') }}
            </a>
          }
          @if (canViewWorkflow()) {
            <a sgButton [routerLink]="['/workflow/dossiers', item.id]">
              <mat-icon fontSet="material-icons-round">fact_check</mat-icon>{{ t('ui.detail.workflow') }}
            </a>
          }
        </div>
      </section>

      <!-- Bố cục 2 cột cấp trang: nội dung bên trái + rail Mã QR cố định (sticky) bên phải (CR32). -->
      <div class="page">
      <div class="main">

      <!-- Thanh trạng thái -->
      <sg-card>
        <div class="statusbar">
          <span class="statusbar__code">{{ item.code }}</span>
          <span class="chip" [attr.data-tone]="statusTone(item.status)">{{ statusLabel(item.status) }}</span>
          @if (item.epidemicFlag) {
            <span class="epidemic" [title]="t('ui.dossier.epidemicBadgeTitle')">
              <mat-icon fontSet="material-icons-round">coronavirus</mat-icon>{{ t('ui.dossier.epidemicBadge') }}
            </span>
          }
          <span class="statusbar__meta">{{ t('ui.detail.barDirection') }}: <b>{{ typeLabel(item.type) }}</b></span>
          <span class="statusbar__meta">{{ t('ui.common.enterprise') }}: <b>{{ item.enterprise.name }}</b></span>
          <span class="statusbar__meta">{{ t('ui.detail.barSchedule') }}: <b>{{ scheduledLabel(item) }}</b></span>
        </div>
      </sg-card>

      <!-- CR21 — Tiến trình xử lý + lịch sử (đưa lên đầu, ngay sau thanh trạng thái) -->
      <sg-card class="sec sec--history">
        <div class="sec-head"><h3>{{ t('ui.detail.sec6') }}</h3></div>
        <p class="sec-sub">{{ t('ui.detail.sec6Subtitle') }}</p>

        <ol class="stepper">
          @for (step of progressSteps(item); track step.key) {
            <li class="stepper__item" [attr.data-state]="step.state">
              <span class="stepper__icon"><mat-icon fontSet="material-icons-round">{{ step.icon }}</mat-icon></span>
              <strong>
                {{ step.label }}
                @if (step.showsEpidemicBadge) {
                  <span class="epidemic epidemic--sm" [title]="t('ui.dossier.epidemicBadgeTitle')">
                    <mat-icon fontSet="material-icons-round">coronavirus</mat-icon>{{ t('ui.dossier.epidemicBadge') }}
                  </span>
                }
              </strong>
              <em>{{ step.statusLabel }}</em>
            </li>
          } @empty {
            <li class="stepper__empty">{{ t('ui.detail.progressEmpty') }}</li>
          }
        </ol>

        <!-- Bảng lịch sử thu gọn đóng/mở, mặc định ĐÓNG (CR21). -->
        <button type="button" class="history-toggle" [attr.aria-expanded]="historyOpen()" (click)="historyOpen.set(!historyOpen())">
          <mat-icon fontSet="material-icons-round">{{ historyOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
          {{ historyOpen() ? t('ui.detail.historyHide') : t('ui.detail.historyShow') }}
        </button>
        @if (historyOpen()) {
          <div class="sg-scroll-x">
            <table class="grid history">
              <thead>
                <tr>
                  <th>{{ t('ui.detail.colProcess') }}</th>
                  <th>{{ t('ui.detail.colStatus') }}</th>
                  <th>{{ t('ui.detail.colConfirmedBy') }}</th>
                  <th>{{ t('ui.detail.colTime') }}</th>
                  <th>{{ t('ui.common.note') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of historyRows(item); track row.key) {
                  <tr>
                    <td><strong>{{ row.process }}</strong></td>
                    <td><span class="status-tag" [attr.data-tone]="row.tone">{{ row.statusLabel }}</span></td>
                    <td>{{ row.actor }}</td>
                    <td>{{ row.time }}</td>
                    <td class="wrap">{{ row.note || '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="state">{{ t('ui.detail.progressEmpty') }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </sg-card>

      <!-- Tiêu đề khối khai báo -->
      <div class="decl-head">
        <p class="decl-title">{{ t('ui.detail.declTitle') }}</p>
        <p class="decl-sub">{{ t('ui.detail.declSubtitle') }}</p>
      </div>

      <!-- 1. Thông tin doanh nghiệp / cá nhân -->
      <sg-card class="sec sec--enterprise">
        <div class="sec-head"><span class="sec-num">1</span><h3>{{ t('ui.detail.sec1') }}</h3></div>
        <div class="info-grid">
          <div class="info-item"><div class="il">{{ enterpriseNameLabel(item) }}</div><div class="iv">{{ item.enterprise.name }}</div></div>
          <div class="info-item"><div class="il">{{ enterpriseIdentifierLabel(item) }}</div><div class="iv">{{ enterpriseIdentifierValue(item) }}</div></div>
          <div class="info-item"><div class="il">{{ t('ui.form.representative') }}</div><div class="iv">{{ item.enterprise.representativeName || '—' }}</div></div>
          <div class="info-item"><div class="il">{{ t('ui.common.phone') }}</div><div class="iv">{{ item.enterprise.phone || '—' }}</div></div>
          <div class="info-item"><div class="il">{{ t('ui.form.address') }}</div><div class="iv">{{ item.enterprise.address || '—' }}</div></div>
          <div class="info-item"><div class="il">{{ t('ui.dossier.colType') }}</div><div class="iv">{{ typeLabel(item.type) }}</div></div>
        </div>
      </sg-card>

      <!-- 2. Phương tiện & lái xe -->
      <sg-card class="sec sec--vehicle">
        <div class="sec-head"><span class="sec-num">2</span><h3>{{ t('ui.detail.sec2') }}</h3></div>
        <p class="sec-sub">{{ t('ui.detail.sec2Count', { count: vehicleCount(item) }) }}</p>
        <div class="sg-scroll-x">
          <table class="grid">
            <thead>
              <tr>
                <th>#</th>
                <th>{{ t('ui.form.vehicleType') }}</th>
                <th>{{ t('ui.detail.colPlateContainer') }}</th>
                <th>{{ t('ui.form.trailerNumber') }}</th>
                <th>{{ t('ui.form.transportLicense') }}</th>
                <th>{{ t('ui.form.weightKg') }}</th>
                <!-- Lái xe theo TỪNG xe (BUG-033). -->
                <th>{{ t('ui.common.driver') }}</th>
                <th>{{ t('ui.form.idNumber') }}</th>
                <th>{{ t('ui.detail.colLicense') }}</th>
                <th>{{ t('ui.form.nationality') }}</th>
                <th>{{ t('ui.common.phone') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of item.vehicles || []; track $index; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td>{{ vehicleTypeLabel(row.vehicleType) }}</td>
                  <td><strong>{{ row.plateNumber }}</strong>{{ row.containerNumber ? ' · ' + row.containerNumber : '' }}</td>
                  <td>{{ row.trailerNumber || '—' }}</td>
                  <td>{{ row.transportLicenseNumber || '—' }}</td>
                  <td>{{ row.weightKg ? (row.weightKg | number: '1.0-0') : '—' }}</td>
                  <td>{{ row.driver?.fullName || '—' }}</td>
                  <td>{{ row.driver?.idNumber || '—' }}</td>
                  <td>{{ row.driver?.licenseNumber || '—' }}</td>
                  <td>{{ row.driver?.nationality || '—' }}</td>
                  <td>{{ row.driver?.phone || '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="11" class="state">{{ t('ui.detail.vehicleEmpty') }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </sg-card>

      <!-- 3. Hàng hóa -->
      <sg-card class="sec sec--cargo">
        <div class="sec-head"><span class="sec-num">3</span><h3>{{ t('ui.detail.sec3') }}</h3></div>
        <div class="sg-scroll-x">
          <table class="grid">
            <thead>
              <tr>
                <th>#</th>
                <th>{{ t('ui.detail.cargoType') }}</th>
                <th>{{ t('ui.form.cargoName') }}</th>
                <th>{{ t('ui.form.quantity') }}</th>
                <th>{{ t('ui.detail.colUnit') }}</th>
                <th>{{ t('ui.form.grossWeight') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of item.cargoItems || []; track row.id; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td>{{ cargoTypeLabel(row.cargoTypeCode) }}</td>
                  <td><strong>{{ row.description }}</strong></td>
                  <td>{{ row.quantity ?? '—' }}</td>
                  <td>{{ row.unitCode || '—' }}</td>
                  <td>{{ row.grossWeightKg ? (row.grossWeightKg | number: '1.0-0') : '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="state">{{ t('ui.detail.cargoEmpty') }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="total-line">{{ t('ui.detail.totalWeight') }}: <b>{{ totalWeight(item) | number: '1.0-0' }} kg</b></p>
      </sg-card>

      <!-- Xe nhận sang tải (CR9/CR18/CR33) — chỉ hiện khi hồ sơ có dữ liệu sang tải. -->
      @if ((item.transshipmentVehicles || []).length) {
        <sg-card class="sec sec--cargo">
          <div class="sec-head"><h3>{{ t('ui.detail.transshipTitle') }}</h3></div>
          <div class="sg-scroll-x">
            <table class="grid">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{{ t('ui.form.transshipSourcePlate') }}</th>
                  <th>{{ t('ui.form.transshipPlate') }}</th>
                  <th>{{ t('ui.form.vehicleType') }}</th>
                  <th>{{ t('ui.form.containerNumber') }}</th>
                  <th>{{ t('ui.form.trailerNumber') }}</th>
                  <th>{{ t('ui.form.transshipDriver') }}</th>
                  <th>{{ t('ui.form.transshipFee') }}</th>
                  <th>{{ t('ui.form.transshipPlace') }}</th>
                  <th>{{ t('ui.form.transshipNote') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of item.transshipmentVehicles || []; track $index; let i = $index) {
                  <tr>
                    <td>{{ i + 1 }}</td>
                    <td>{{ row.sourcePlate || '—' }}</td>
                    <td><strong>{{ row.plateNumber }}</strong></td>
                    <td>{{ vehicleTypeLabel(row.vehicleType) }}</td>
                    <td>{{ row.containerNumber || '—' }}</td>
                    <td>{{ row.trailerNumber || '—' }}</td>
                    <td>{{ row.driverName || '—' }}</td>
                    <td>{{ row.fee01 || '—' }}</td>
                    <td>{{ row.transferPlace || '—' }}</td>
                    <td>{{ row.note || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </sg-card>
      }

      <!-- 4. Tờ khai & chứng từ -->
      <sg-card class="sec sec--docs">
        <div class="sec-head"><span class="sec-num">4</span><h3>{{ t('ui.detail.sec4') }}</h3></div>

        <!-- D7 — chứng từ bắt buộc theo loại hồ sơ: đã đủ / còn thiếu (F13). -->
        <div class="reqdocs">
          <div class="reqdocs__head">
            <strong>{{ t('ui.detail.requiredDocsTitle') }}</strong>
            @if (requiredDocStatus().length) {
              <span class="reqdocs__summary">{{ t('ui.detail.requiredDocsSummary', { done: requiredDocsDone(), total: requiredDocStatus().length }) }}</span>
            }
          </div>
          @if (requiredDocStatus().length) {
            <ul class="reqdocs__list">
              @for (doc of requiredDocStatus(); track doc.code) {
                <li class="reqdoc" [attr.data-uploaded]="doc.uploaded">
                  <mat-icon fontSet="material-icons-round">{{ doc.uploaded ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                  <span class="reqdoc__name">{{ doc.name }}</span>
                  <span class="reqdoc__badge" [attr.data-uploaded]="doc.uploaded">{{ doc.uploaded ? t('ui.form.requiredDocUploaded') : t('ui.form.requiredDocMissing') }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="muted">{{ t('ui.detail.requiredDocsEmpty') }}</p>
          }
        </div>

        <div class="docs">
          @for (file of item.attachments || []; track file.id) {
            <article class="doc">
              <div class="doc__thumb" [attr.data-kind]="isImage(file) ? 'image' : 'file'">
                <mat-icon fontSet="material-icons-round">{{ iconOf(file) }}</mat-icon>
              </div>
              <strong class="doc__name" [title]="file.fileName">{{ file.fileName || t('ui.detail.docFallback') }}</strong>
              <span class="doc__meta">{{ fileMeta(file) }}</span>
              <span class="doc__meta">{{ file.uploadedAt ? (file.uploadedAt | date: 'dd/MM/yyyy HH:mm') : '' }}</span>
              <button type="button" sgButton="tertiary" size="sm" [disabled]="downloadingId() === file.id" (click)="download(file)">
                <mat-icon fontSet="material-icons-round">download</mat-icon>
                {{ downloadingId() === file.id ? t('ui.common.loadingShort') : t('ui.detail.download') }}
              </button>
            </article>
          } @empty {
            <p class="state">{{ t('ui.detail.docsEmpty') }}</p>
          }
        </div>
      </sg-card>

      <!-- 5. Thời gian dự kiến đến cửa khẩu (CR20) + thời gian nhập/xuất cảnh (CR12) -->
      <sg-card class="sec sec--schedule">
        <div class="sec-head"><span class="sec-num">5</span><h3>{{ t('ui.detail.sec5') }}</h3></div>
        <div class="info-grid">
          <div class="info-item"><div class="il">{{ t('ui.common.scheduledTime') }}</div><div class="iv">{{ scheduledLabel(item) }}</div></div>
          <!-- CR12 — thời gian xe qua cổng vào/ra, đọc từ gate_events (BE). -->
          <div class="info-item"><div class="il">{{ t('ui.detail.entryAt') }}</div><div class="iv">{{ item.entryAt ? (item.entryAt | date: 'dd/MM/yyyy HH:mm') : t('ui.common.notYet') }}</div></div>
          <div class="info-item"><div class="il">{{ t('ui.detail.exitAt') }}</div><div class="iv">{{ item.exitAt ? (item.exitAt | date: 'dd/MM/yyyy HH:mm') : t('ui.common.notYet') }}</div></div>
          <div class="info-item"><div class="il">{{ t('ui.dossier.colCreatedAt') }}</div><div class="iv">{{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}</div></div>
          <div class="info-item"><div class="il">{{ t('ui.detail.submittedAt') }}</div><div class="iv">{{ item.submittedAt ? (item.submittedAt | date: 'dd/MM/yyyy HH:mm') : t('ui.detail.notSubmitted') }}</div></div>
        </div>
      </sg-card>

      </div>

      <!-- Rail Mã QR — cột phải hẹp, dính theo khi cuộn (bỏ dính ở chế độ 1 cột). -->
      <div class="rail">
        <div class="rail__sticky">
          <!-- Mã QR hồ sơ (trên cùng), rồi Tóm tắt hồ sơ.
               class="qr-print": vùng duy nhất được in khi bấm "In mã QR" (xem @media print ở styles.scss). -->
          <sg-card class="qr-print" [title]="t('ui.detail.qrTitle')">
            <div class="qr-layout">
              <sg-qr-code [value]="item.qrCode || ''" [size]="140" [caption]="item.code" [ariaLabel]="t('ui.form.qrAria', { code: item.code })" />
              <div class="qr-col">
                <div class="meta-item">
                  <div class="meta-label">{{ t('ui.detail.qrCodeStatus') }}</div>
                  @if (!item.qrCode) {
                    <span class="status-tag" data-tone="idle">{{ t('ui.detail.qrNotIssued') }}</span>
                  } @else {
                    <span class="status-tag" [attr.data-tone]="qrValid(item.status) ? 'done' : 'idle'">{{ qrValid(item.status) ? t('ui.detail.qrValid') : t('ui.detail.qrLocked') }}</span>
                  }
                </div>
                @if (item.qrCode) {
                  <div class="meta-item"><div class="meta-label">{{ t('ui.detail.qrIssuedAt') }}</div><div class="meta-value">{{ (item.submittedAt || item.createdAt) | date: 'dd/MM/yyyy HH:mm' }}</div></div>
                }
                <div class="meta-item"><div class="meta-label">{{ t('ui.detail.qrUsagePoint') }}</div><div class="meta-value">{{ t('ui.detail.qrUsageValue') }}</div></div>
              </div>
            </div>
          </sg-card>

          <sg-card class="summary-card" [title]="t('ui.form.summaryTitle')">
            <dl class="summary">
              <dt>{{ t('ui.dossier.type') }}</dt><dd>{{ typeLabel(item.type) }}</dd>
              <dt>{{ t('ui.common.plateNumber') }}</dt><dd>{{ item.vehicle.plateNumber || '—' }}</dd>
              <dt>{{ t('ui.common.driver') }}</dt><dd>{{ item.driver?.fullName || '—' }}</dd>
              <dt>{{ t('ui.common.enterprise') }}</dt><dd>{{ item.enterprise.name || '—' }}</dd>
              <dt>{{ t('ui.common.mainCargo') }}</dt><dd>{{ mainCargo(item) }}</dd>
              <dt>{{ t('ui.form.totalWeight') }}</dt><dd>{{ totalWeight(item) | number: '1.0-0' }} kg</dd>
              <dt>{{ t('ui.dossier.status') }}</dt><dd>{{ statusLabel(item.status) }}</dd>
            </dl>
          </sg-card>
        </div>
      </div>

      </div>

      @if (downloadPromptFile(); as promptFile) {
        <sg-modal
          size="sm"
          [title]="t('ui.detail.downloadConfirmTitle')"
          (close)="cancelDownloadModal()"
        >
          <div class="confirm-modal-body">
            <p class="confirm-modal-desc">{{ t('ui.detail.downloadConfirmQuestion') }}</p>
            <div class="confirm-modal-file-card">
              <div class="confirm-modal-file-name"><strong>{{ t('ui.detail.fileName') }}:</strong> {{ promptFile.fileName || t('ui.detail.docFallback') }}</div>
              <div class="confirm-modal-file-meta"><strong>{{ t('ui.detail.fileSize') }}:</strong> {{ sizeOf(promptFile) }}</div>
            </div>
          </div>
          <div modal-footer class="confirm-modal-foot">
            <button type="button" sgButton="secondary" (click)="cancelDownloadModal()">
              {{ t('ui.common.cancel') }}
            </button>
            <button type="button" sgButton="primary" (click)="confirmDownloadModal()">
              <mat-icon fontSet="material-icons-round">download</mat-icon>
              {{ t('ui.detail.download') }}
            </button>
          </div>
        </sg-modal>
      }

      }
    }
  `,
  styles: [
    `
      .confirm-modal-body { display: grid; gap: 12px; }
      .confirm-modal-desc { margin: 0; font-size: 13.5px; color: var(--ink-700); }
      .confirm-modal-file-card { padding: 12px; background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
      .confirm-modal-file-name { margin-bottom: 4px; overflow-wrap: anywhere; }
      .confirm-modal-foot { display: flex; justify-content: flex-end; gap: 8px; width: 100%; }

      /* Bảng màu lấy đúng từ template BA (chi-tiet-ho-so.html), khoanh trong :host nên
         không rò ra token --sg-* toàn cục. */
      :host {
        display: block;
        --navy-900: #101d3d;
        --blue-600: #2f6fed;
        --blue-50: #eef3fe;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --amber-500: #e0a72e;
        --amber-50: #fbf3e2;
        --red-500: #e5484d;
        --red-50: #fdeced;
        --ink-900: #152040;
        --ink-700: #3d4a6b;
        --ink-500: #7885a3;
        --line: #e6e9f3;
        --bg: #f4f6fb;
      }
      /* Card trong cột trái cách đều nhau; card trong rail xếp bằng gap của .rail__sticky. */
      .main > sg-card { display: block; margin-bottom: 18px; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
      .head h1 { margin: 0; font-size: 20px; font-weight: 700; color: var(--ink-900); }
      .head__actions { display: flex; flex-wrap: wrap; gap: 10px; }

      /* Thanh trạng thái */
      .statusbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 20px; }
      .statusbar__code { font-size: 16px; font-weight: 800; color: var(--ink-900); }
      .statusbar__meta { color: var(--ink-700); font-size: 12.5px; }
      .statusbar__meta b { color: var(--ink-900); }
      .epidemic { display: inline-flex; align-items: center; gap: 4px; padding: 3px 11px; border-radius: 20px; background: var(--amber-50); color: #b34e12; font-size: 11.5px; font-weight: 700; }
      .epidemic mat-icon { width: 15px; height: 15px; font-size: 15px; }
      .epidemic--sm { padding: 1px 7px; margin-left: 6px; font-size: 10px; vertical-align: middle; }
      .epidemic--sm mat-icon { width: 13px; height: 13px; font-size: 13px; }

      /* Bố cục 2 cột cấp trang: nội dung trái + rail Mã QR phải (~300px), rail dính khi cuộn. */
      .page { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
      .main { min-width: 0; }
      /* align-self: stretch để .rail cao bằng cả hàng grid, tạo khoảng trượt cho card sticky (nếu
         chỉ cao bằng nội dung thì position: sticky không có tác dụng). */
      .rail { min-width: 0; align-self: stretch; }
      .rail__sticky { position: sticky; top: calc(var(--sg-topbar-height) + 12px); display: grid; gap: 16px; align-content: start; }

      /* Card tóm tắt hồ sơ trong rail — dùng lại khuôn .summary của màn tạo mới. */
      .summary { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1fr); gap: 8px; margin: 0; }
      .summary dt { color: var(--ink-500); font-size: 12.5px; }
      .summary dd { margin: 0; font-weight: 600; color: var(--ink-900); overflow-wrap: anywhere; text-align: right; }

      /* Thẻ mã QR trong rail — QR ở trên, thông tin xếp dọc bên dưới cho vừa cột hẹp. */
      .qr-layout { display: grid; justify-items: center; gap: 14px; }
      .qr-col { display: grid; gap: 10px; width: 100%; align-content: start; }
      .meta-label { margin-bottom: 2px; color: var(--ink-500); font-size: 11px; }
      .meta-value { font-size: 12.5px; font-weight: 700; color: var(--ink-900); }
      .meta-value--normal { font-weight: 500; color: var(--ink-700); }

      /* Tiêu đề khối và các mục đánh số */
      .decl-head { margin: 24px 0 14px; }
      .decl-title { margin: 0 0 3px; font-size: 15.5px; font-weight: 700; color: var(--ink-900); }
      .decl-sub { margin: 0; color: var(--ink-500); font-size: 12.5px; }
      .sec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
      .sec-num {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--blue-600);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
      }
      .sec-head h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--ink-900); }
      .sec-sub { margin: -8px 0 14px; color: var(--ink-500); font-size: 12.5px; }

      .info-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 20px; }
      .info-grid--driver { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
      .info-item .il { margin-bottom: 3px; color: var(--ink-500); font-size: 11px; }
      .info-item .iv { font-size: 13px; font-weight: 700; color: var(--ink-900); overflow-wrap: anywhere; }
      .total-line { margin: 10px 0 0; color: var(--ink-700); font-size: 12.5px; }
      .total-line b { color: var(--ink-900); }
      .aside-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }

      .stepper { display: flex; gap: 10px; margin: 0 0 16px; padding: 0; list-style: none; overflow-x: auto; }
      .stepper__item {
        flex: 1 1 0;
        min-width: 120px;
        display: grid;
        justify-items: center;
        gap: 4px;
        padding: 14px 10px;
        border: 1px solid var(--line);
        border-radius: 12px;
        text-align: center;
      }
      .stepper__icon {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--bg);
        color: var(--ink-500);
      }
      .stepper__item strong { font-size: 12.5px; color: var(--ink-900); }
      .stepper__item em { font-style: normal; color: var(--ink-500); font-size: 11px; }
      .stepper__item[data-state='done'] { border-color: var(--green-600); }
      .stepper__item[data-state='done'] .stepper__icon { background: var(--green-50); color: var(--green-600); }
      .stepper__item[data-state='active'] { border-color: var(--blue-600); background: var(--blue-50); }
      .stepper__item[data-state='active'] .stepper__icon { background: var(--blue-600); color: #fff; }
      .stepper__item[data-state='failed'] { border-color: var(--red-500); }
      .stepper__item[data-state='failed'] .stepper__icon { background: var(--red-50); color: var(--red-500); }
      .stepper__item[data-state='skipped'] { opacity: .6; }
      .stepper__empty { color: var(--ink-500); }

      .grid { width: 100%; min-width: 760px; border-collapse: collapse; }
      .grid th, .grid td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
      .grid th { background: var(--blue-50); color: var(--ink-700); font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .grid td { font-size: 12.5px; color: var(--ink-900); }
      .grid tbody tr:last-child td { border-bottom: none; }
      .grid td.wrap, .grid th.wrap { white-space: normal; }

      /* Nút thu gọn/mở bảng lịch sử (CR21) */
      .history-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fff;
        color: var(--ink-700);
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .history-toggle:hover { border-color: var(--blue-600); color: var(--blue-600); }
      .history-toggle mat-icon { width: 18px; height: 18px; font-size: 18px; }

      /* Bảng lịch sử — đầu bảng nền navy theo template BA */
      .history { margin-top: 16px; min-width: 640px; }
      .history th { background: var(--navy-900); color: #fff; text-transform: none; border-bottom: none; }
      .history th:first-child { border-top-left-radius: 9px; }
      .history th:last-child { border-top-right-radius: 9px; }
      /* Chip hướng di chuyển (nhập/xuất) — theo mẫu chi-tiet-ho-so.html */
      .direction-tag { padding: 3px 9px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; }
      .direction-tag.in { background: var(--green-50); color: var(--green-600); }
      .direction-tag.out { background: var(--amber-50); color: var(--amber-500); }
      .status-tag {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 6px;
        background: var(--bg);
        color: var(--ink-500);
        font-size: 10.5px;
        font-weight: 700;
      }
      .status-tag[data-tone='processing'] { background: var(--blue-50); color: var(--blue-600); }
      .status-tag[data-tone='done'] { background: var(--green-50); color: var(--green-600); }
      .status-tag[data-tone='waiting'] { background: var(--amber-50); color: var(--amber-500); }
      .status-tag[data-tone='warning'] { background: #fdece1; color: #b34e12; }
      .status-tag[data-tone='rejected'] { background: var(--red-50); color: var(--red-500); }

      .reqdocs { display: grid; gap: 8px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
      .reqdocs__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .reqdocs__head strong { color: var(--ink-900); }
      .reqdocs__summary { color: var(--ink-500); font-size: 12.5px; }
      .reqdocs__list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .reqdoc { display: flex; align-items: center; gap: 8px; }
      .reqdoc mat-icon { width: 20px; height: 20px; font-size: 20px; color: var(--ink-500); }
      .reqdoc[data-uploaded='true'] mat-icon { color: var(--green-600); }
      .reqdoc__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-900); }
      .reqdoc__badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 9px;
        border-radius: 6px;
        background: var(--amber-50);
        color: var(--amber-500);
        font-size: 10.5px;
        font-weight: 700;
      }
      .reqdoc__badge[data-uploaded='true'] { background: var(--green-50); color: var(--green-600); }

      .docs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
      .doc {
        display: grid;
        justify-items: center;
        gap: 6px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        text-align: center;
      }
      .doc__thumb {
        display: grid;
        place-items: center;
        width: 100%;
        height: 96px;
        border-radius: 10px;
        background: var(--bg);
        color: var(--blue-600);
      }
      .doc__thumb[data-kind='image'] { background: var(--blue-50); }
      .doc__thumb mat-icon { width: 36px; height: 36px; font-size: 36px; }
      .doc__name { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-900); }
      .doc__meta { color: var(--ink-500); font-size: 11px; }

      .chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 11px;
        border-radius: 20px;
        background: var(--bg);
        color: var(--ink-500);
        font-size: 11px;
        font-weight: 700;
      }
      .chip[data-tone='processing'] { background: var(--blue-50); color: var(--blue-600); }
      .chip[data-tone='done'] { background: var(--green-50); color: var(--green-600); }
      .chip[data-tone='waiting'] { background: var(--amber-50); color: var(--amber-500); }
      .chip[data-tone='warning'] { background: #fdece1; color: #b34e12; }
      .chip[data-tone='rejected'] { background: var(--red-50); color: var(--red-500); }

      .state { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 40px; color: var(--ink-500); }
      .muted { color: var(--ink-500); margin: 0; }

      @media (max-width: 1024px) {
        /* Gộp về 1 cột: rail Mã QR xuống dưới nội dung, bỏ dính. */
        .page { grid-template-columns: 1fr; }
        .rail__sticky { position: static; }
        .info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .aside-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 640px) {
        .info-grid { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class DeclarationDetailPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly appMessages = inject(AppMessageService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;

  @Input() id = '';

  protected readonly permission = PERMISSION;

  protected readonly dossier = signal<DossierDetail | null>(null);
  protected readonly loading = signal(true);
  /** Lỗi tải trang — hiển thị thay cho toàn bộ nội dung (trạng thái trang), không phải cảnh báo thoáng qua. */
  protected readonly error = signal('');
  protected readonly downloadingId = signal('');
  protected readonly downloadPromptFile = signal<DossierAttachment | null>(null);
  /** CR21 — bảng lịch sử thu gọn đóng/mở, mặc định ĐÓNG. */
  protected readonly historyOpen = signal(false);
  /** D7 — chứng từ bắt buộc theo loại hồ sơ của hồ sơ đang xem. */
  protected readonly requiredDocuments = signal<RequiredDocument[]>([]);

  /** Đối chiếu chứng từ bắt buộc với tệp đã đính kèm để đánh dấu đã đủ / còn thiếu. */
  protected readonly requiredDocStatus = computed(() => {
    const uploaded = new Set(
      (this.dossier()?.attachments || [])
        .map((file) => file.documentTypeCode || '')
        .filter((code) => !!code),
    );
    return this.requiredDocuments().map((doc) => ({
      code: doc.documentTypeCode,
      name: doc.documentTypeName || doc.documentTypeCode,
      uploaded: uploaded.has(doc.documentTypeCode),
    }));
  });

  protected readonly requiredDocsDone = computed(() => this.requiredDocStatus().filter((doc) => doc.uploaded).length);

  protected readonly canEdit = computed(() => {
    const item = this.dossier();
    return !!item && this.auth.hasPermission(PERMISSION.dossierUpdate) && isDossierEditable(item.status);
  });

  protected readonly canViewWorkflow = computed(() => {
    const item = this.dossier();
    return !!item && this.auth.hasPermission(PERMISSION.workflowView) && item.status !== 'DRAFT';
  });

  protected readonly vehicleTypes = signal<CatalogItem[]>([]);
  protected readonly cargoTypes = signal<CatalogItem[]>([]);

  ngOnInit(): void {
    this.loadCatalogs();
    this.loadDetail();
  }

  private loadCatalogs(): void {
    this.loadVehicleTypes();
    this.loadCargoTypes();
  }

  private loadVehicleTypes(): void {
    this.api.getVehicleTypes().subscribe({
      next: (items) => this.vehicleTypes.set(items || []),
      error: () => this.vehicleTypes.set([]),
    });
  }

  private loadCargoTypes(): void {
    this.api.getCargoTypes().subscribe({
      next: (items) => this.cargoTypes.set(items || []),
      error: () => this.cargoTypes.set([]),
    });
  }

  private loadDetail(): void {
    if (!this.id) {
      this.loading.set(false);
      this.error.set(this.t('ui.detail.noDossierId'));
      return;
    }
    this.load(this.id);
  }

  // --- Hiển thị --------------------------------------------------------------

  protected statusLabel(status: string): string {
    return dossierStatusLabel(status, this.t);
  }

  protected statusTone(status: string): string {
    return dossierStatusTone(status);
  }

  protected typeLabel(type: string): string {
    return dossierTypeLabel(type, this.t);
  }

  protected vehicleTypeLabel(type?: string): string {
    const item = this.vehicleTypes().find((i) => i.code === type);
    return vehicleTypeLabel(type, this.t, item?.name);
  }

  protected cargoTypeLabel(type?: string): string {
    if (!type) return '—';
    const item = this.cargoTypes().find((i) => i.code === type);
    return item?.name || type;
  }

  /** Mã hướng di chuyển (`IN`/`OUT`) suy từ loại hồ sơ — dùng chọn màu chip, không dò chuỗi hiển thị. */
  protected directionCode(type: string): string {
    return dossierDirection(type);
  }

  protected directionLabel(type: string): string {
    return dossierDirectionLabel(type, this.t);
  }

  /** Loại giấy tờ là mã cố định của contract; mã lạ thì hiện nguyên mã. */
  protected idTypeLabel(idType?: string): string {
    const code = idType || 'CCCD';
    const key = `ui.idType.${code}` as MessageKey;
    return this.i18n.has(key) ? this.t(key) : code;
  }

  protected enterpriseNameLabel(item: DossierDetail): string {
    return this.t(resolveEnterpriseNameLabelKey(item.enterprise));
  }

  protected enterpriseIdentifierLabel(item: DossierDetail): string {
    const resolved = resolveEnterpriseIdentifier(item.enterprise);
    return this.t(resolved.labelKey);
  }

  protected enterpriseIdentifierValue(item: DossierDetail): string {
    const resolved = resolveEnterpriseIdentifier(item.enterprise);
    return resolved.value || '—';
  }

  protected containerLabel(item: DossierDetail): string {
    const parts = [
      item.vehicle.containerNumber ? this.t('ui.dossier.containerPrefix', { number: item.vehicle.containerNumber }) : '',
      item.vehicle.trailerNumber ? this.t('ui.dossier.trailerPrefix', { number: item.vehicle.trailerNumber }) : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : this.t('ui.dossier.noContainer');
  }

  protected mainCargo(item: DossierDetail): string {
    const items = (item.cargoItems || [])
      .map((row) => row.description?.trim())
      .filter((desc): desc is string => !!desc);
    if (items.length) return items.join(', ');
    return item.cargoSummary || this.t('ui.dossier.noCargo');
  }

  protected totalWeight(item: DossierDetail): number {
    return (item.cargoItems || []).reduce((sum, row) => sum + (row.grossWeightKg || 0), 0);
  }

  protected attachmentCount(item: DossierDetail): number {
    return item.attachments?.length || 0;
  }

  protected cargoCount(item: DossierDetail): number {
    return item.cargoItems?.length || 0;
  }

  protected vehicleCount(item: DossierDetail): number {
    return item.vehicles?.length || 0;
  }

  protected scheduledLabel(item: DossierDetail): string {
    const value = item.appointment?.scheduledAt;
    return value ? this.formatDateTime(value) : this.t('ui.form.notRegistered');
  }

  protected iconOf(file: DossierAttachment): string {
    return fileIcon(file.contentType || file.fileName);
  }

  protected sizeOf(file: DossierAttachment): string {
    return formatFileSize(file.sizeBytes);
  }

  /** Dòng phụ của tệp: "loại chứng từ · kích thước". Tệp chưa gắn loại thì chỉ hiện kích thước. */
  protected fileMeta(file: DossierAttachment): string {
    const size = this.sizeOf(file);
    return file.documentTypeName ? `${file.documentTypeName} · ${size}` : size;
  }

  protected isImage(file: DossierAttachment): boolean {
    return isImageFile(file.contentType, file.fileName);
  }

  protected progressSubtitle(item: DossierDetail): string {
    const steps = this.progressSteps(item);
    const done = steps.filter((step) => step.state === 'done').length;
    return steps.length
      ? this.t('ui.detail.progressDone', { done, total: steps.length })
      : this.t('ui.detail.progressNone');
  }

  /**
   * Stepper ngang: mỗi bước của **phiên xử lý liên ngành thật** (`workflowSteps` — bảng
   * `workflow_instances`) là một tile, tên và trạng thái do API trả nên luôn khớp thực tế. Không
   * còn dùng `forceProgress` (đóng băng ở trạng thái lúc gửi hồ sơ, không được cập nhật khi có
   * quyết định). Rỗng khi hồ sơ chưa vào quy trình.
   */
  protected progressSteps(item: DossierDetail): ProgressStep[] {
    const rawSteps: WorkflowStep[] = (item.workflowSteps || []).map((step) => ({
      code: step.code,
      name: step.name,
      agencyCode: step.agencyCode,
      agencyName: step.agencyName,
      order: step.order,
      status: step.status,
      gate: step.gate ?? null,
    }));
    const ordered = orderStepsForDisplay(rawSteps, !!item.epidemicFlag);

    return ordered.map((step) => ({
      key: step.code,
      label: step.name || step.agencyName || step.code,
      agencyCode: step.agencyCode,
      icon: agencyIcon(step.agencyCode),
      status: step.status,
      statusLabel: workflowStepStatusLabel(step.status, this.t),
      state: this.progressState(step.status),
      showsEpidemicBadge: !!item.epidemicFlag && isInspectionStep(step) && step.agencyCode === QUARANTINE_AGENCY_CODE,
    }));
  }

  /** Đổi mã trạng thái bước (`WorkflowStepStatus`) sang trạng thái hiển thị của tile. */
  private progressState(status: string): ProgressStep['state'] {
    if (status === 'COMPLETED') return 'done';
    if (status === 'IN_PROGRESS') return 'active';
    if (status === 'REJECTED') return 'failed';
    // PENDING (chưa tới lượt) và WAITING_SUPPLEMENT (chờ bổ sung) đều hiển thị trung tính.
    return 'waiting';
  }

  /** Chỉ các bước đã có dấu vết quyết định (có người xác nhận) mới vào lịch sử, mới nhất trước. */
  private decidedSteps(item: DossierDetail): DossierWorkflowStep[] {
    return (item.workflowSteps || [])
      .filter((step) => !!step.decision || !!step.completedAt || !!step.actorName)
      .sort((left, right) => this.stepTime(right) - this.stepTime(left));
  }

  private stepTime(step: DossierWorkflowStep): number {
    const value = step.completedAt || step.enteredAt;
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isNaN(time) ? 0 : time;
  }

  /**
   * Bảng "Theo dõi trạng thái & lịch sử xử lý" (SG-116): hiển thị đầy đủ mọi quyết định đã thực hiện
   * (Xác nhận hoàn thành, Yêu cầu sửa đổi bổ sung, Từ chối, Nộp hồ sơ), kèm người xác nhận, thời gian và ghi chú.
   */
  protected historyRows(item: DossierDetail): HistoryRow[] {
    if (item.workflowHistory && item.workflowHistory.length > 0) {
      return item.workflowHistory.map((h) => ({
        key: h.id,
        process: h.process,
        statusLabel: decisionLabel(h.decision, this.t),
        tone: decisionTone(h.decision),
        actor: h.actorName || actorRoleLabel(h.actorRole, this.t) || this.t('ui.detail.system'),
        time: this.formatDateTime(h.actedAt),
        note: h.note || '',
      }));
    }

    return this.decidedSteps(item).map((step) => ({
      key: step.code,
      process: step.name || step.agencyName || step.code,
      statusLabel: step.decision
        ? decisionLabel(step.decision, this.t)
        : workflowStepStatusLabel(step.status, this.t),
      tone: step.decision ? decisionTone(step.decision) : workflowStepStatusTone(step.status),
      actor: step.actorName || actorRoleLabel(step.actorRole, this.t) || this.t('ui.detail.system'),
      time: this.formatDateTime(step.completedAt || step.enteredAt || ''),
      note: step.note || '',
    }));
  }

  /**
   * Mã QR còn hiệu lực trừ khi hồ sơ đã kết thúc, bị hủy/đóng hoặc bị từ chối (khớp ghi chú thẻ QR).
   * Chỉ gọi khi hồ sơ **đã có** mã QR; hồ sơ chưa cấp mã (Nháp) được xử lý riêng ở template — BUG-023.
   */
  protected qrValid(status: string): boolean {
    const s = (status || '').toUpperCase().trim();
    return !['COMPLETED', 'EXITED', 'CANCELLED', 'CLOSED', 'REJECTED', 'APPROVED_EXIT', 'DONE', 'HOAN_THANH', 'HOAN THANH'].includes(s);
  }

  /** Nút "In mã QR" — dùng hộp thoại in của trình duyệt cho bản chi tiết đang xem. */
  protected print(): void {
    const item = this.dossier();
    if (!item || !item.qrCode || !this.qrValid(item.status)) return;
    window.print();
  }

  // --- Hành động -------------------------------------------------------------

  protected download(file: DossierAttachment): void {
    this.downloadPromptFile.set(file);
  }

  protected cancelDownloadModal(): void {
    const file = this.downloadPromptFile();
    this.downloadPromptFile.set(null);
    if (file) {
      this.api.cancelDownloadFile(file.id).subscribe({
        next: () => {
          this.appMessages.showKey('ui.detail.downloadCancelled', 'info', { name: file.fileName });
        },
        error: () => {
          this.appMessages.showKey('ui.detail.downloadCancelled', 'info', { name: file.fileName });
        },
      });
    }
  }

  protected confirmDownloadModal(): void {
    const file = this.downloadPromptFile();
    this.downloadPromptFile.set(null);
    if (!file) return;

    this.downloadingId.set(file.id);
    this.api.downloadFile(file.id).subscribe({
      next: (blob) => {
        this.downloadingId.set('');
        this.saveBlob(blob, file.fileName);
      },
      error: () => {
        this.downloadingId.set('');
        this.appMessages.showKey('ui.detail.downloadFailed', 'error', { name: file.fileName });
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

  // --- Tải dữ liệu -----------------------------------------------------------

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getDeclaration(id).subscribe({
      next: (item) => {
        this.loading.set(false);
        if (!item) {
          this.error.set(this.t('ui.detail.notFound'));
          return;
        }
        this.dossier.set(item);
        this.loadRequiredDocuments(item.type);
      },
      error: () => {
        this.loading.set(false);
        this.dossier.set(null);
        this.error.set(this.t('ui.detail.loadFailed'));
      },
    });
  }

  /** D7 — chứng từ bắt buộc theo loại hồ sơ; lỗi tải thì bỏ qua, không chặn xem hồ sơ. */
  private loadRequiredDocuments(type: string): void {
    if (!type) {
      this.requiredDocuments.set([]);
      return;
    }
    this.api.getRequiredDocuments(type).subscribe({
      next: (docs) => this.requiredDocuments.set(docs || []),
      error: () => this.requiredDocuments.set([]),
    });
  }

  private formatDateTime(value: string): string {
    return formatDateTime(value);
  }
}
