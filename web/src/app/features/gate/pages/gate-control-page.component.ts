import { Component, OnDestroy, OnInit, WritableSignal, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PERMISSION } from '../../../core/auth/access-control.model';
import { AuthService } from '../../../core/auth/auth.service';
import { extractErrorMessage } from '../../../core/forms/field-errors';
import { MessageKey } from '../../../core/i18n/message-catalog';
import {
  DossierEnterprise,
  dossierStatusLabel,
  dossierStatusTone,
  dossierTypeLabel,
  resolveEnterpriseIdentifier,
} from '../../../core/models/declaration.model';
import {
  GateDirection,
  gateDirectionLabel,
} from '../../../core/models/dispatch.model';
import { readDossierQr } from '../../../core/models/gate-qr.model';
import {
  GateChecklistInput,
  GateChecklistItem,
  GateDecision,
  GateEvent,
  GateEventFilters,
  GateLookupResult,
  GateStatusColor,
  GateSummary,
  gateDecisionLabel,
  gateStatusColorLabel,
  gateStatusColorTone,
  gateWorkflowConditionsMet,
} from "../../../core/models/gate.model";
import {
  QrScannerError,
  QrScannerFailure,
  QrScannerService,
} from "../../../core/scanner/qr-scanner.service";
import { ApiService } from "../../../core/services/api.service";
import { AppMessageService } from "../../../core/services/app-message.service";
import { SgAlertComponent } from "../../../shared/ui/sg-alert.component";
import { SgButtonDirective } from "../../../shared/ui/sg-button.directive";
import { SgCardComponent } from "../../../shared/ui/sg-card.component";
import { SgDatePickerComponent } from "../../../shared/ui/sg-date-picker.component";
import { SgFormFieldComponent } from "../../../shared/ui/sg-form-field.component";
import { SgSearchInputComponent } from "../../../shared/ui/sg-search-input.component";
import {
  SgSelectComponent,
  SgSelectOption,
} from "../../../shared/ui/sg-select.component";
import { SgPagerComponent } from "../../../shared/ui/sg-pager.component";
import {
  SgTableColumn,
  SgTableComponent,
} from "../../../shared/ui/sg-table.component";
import { I18nService } from "../../../core/i18n/i18n.service";

/** Trạng thái chỉnh sửa của một mục checklist trước khi gửi kèm sự kiện cổng. */
interface ChecklistDraftEntry {
  checked: boolean;
  note: string;
}

/** Mã làn ('in' = làn vào · 'out' = làn ra) — mã ASCII trong tập đóng, nhãn tra i18n. */
type Lane = "in" | "out";

/**
 * Trạng thái ĐỘC LẬP của một làn (Vào / Ra). Mỗi làn có riêng ô tra cứu, kết quả, checklist,
 * ghi chú và trạng thái gửi — hai làn thao tác song song, không dùng chung state.
 */
interface LaneState {
  readonly dir: Lane;
  /** Hướng cố định của làn (ENTRY cho làn vào · EXIT cho làn ra) — chỉ để hiển thị pill đúng/sai chiều. */
  readonly direction: GateDirection;
  readonly titleKey: MessageKey;
  readonly camLabelKey: MessageKey;
  /** Câu hướng dẫn ô "Hồ sơ khớp" khi chưa tra cứu — RIÊNG theo chiều làn (BUG-083). */
  readonly matchEmptyKey: MessageKey;
  /** Hai trường ràng buộc ngModel — mutable, không cần signal. */
  codeInput: string;
  note: string;
  /**
   * CR2 — cờ "Ưu tiên kiểm dịch" của làn VÀO. Chỉ dùng ở làn `in` + khi CHO QUA; gửi kèm sự kiện
   * cổng để bật cờ dịch tễ trên hồ sơ. Một chiều (đặt rồi thôi); reset khi tra cứu hồ sơ mới.
   */
  prioritizeQuarantine: boolean;
  readonly result: WritableSignal<GateLookupResult | null>;
  readonly looking: WritableSignal<boolean>;
  readonly lookupError: WritableSignal<string>;
  readonly feedback: WritableSignal<string>;
  readonly actionError: WritableSignal<string>;
  readonly noteError: WritableSignal<string>;
  readonly submitting: WritableSignal<boolean>;
  /** Danh sách điều kiện thiếu do API trả kèm lỗi 409 — hiển thị nguyên văn. */
  readonly blockingReasons: WritableSignal<string[]>;
  readonly checklistDraft: WritableSignal<Record<string, ChecklistDraftEntry>>;
  /** Lỗi mở camera của riêng làn này (từ chối quyền, camera bận). */
  readonly scanError: WritableSignal<string>;
  /** Cảnh báo không chặn khi quét (QR quá hạn) — vẫn tra cứu bình thường. */
  readonly scanNotice: WritableSignal<string>;
}

const NOTE_MAX_LENGTH = 500;
const PAGE_SIZES = [10, 20, 50];

/** Nhãn cho từng mã lý do không quét được — tra theo mã, nhãn nằm ở từ điển. */
const SCAN_FAILURE_LABEL_KEYS: Record<QrScannerFailure, MessageKey> = {
  INSECURE_CONTEXT: "ui.gate.scanINSECURE_CONTEXT",
  UNSUPPORTED: "ui.gate.scanUNSUPPORTED",
  PERMISSION_DENIED: "ui.gate.scanPERMISSION_DENIED",
  NO_CAMERA: "ui.gate.scanNO_CAMERA",
  START_FAILED: "ui.gate.scanSTART_FAILED",
};

/** Khởi tạo state rỗng cho một làn. */
function createLane(
  dir: Lane,
  direction: GateDirection,
  titleKey: MessageKey,
  camLabelKey: MessageKey,
  matchEmptyKey: MessageKey,
): LaneState {
  return {
    dir,
    direction,
    titleKey,
    camLabelKey,
    matchEmptyKey,
    codeInput: "",
    note: "",
    prioritizeQuarantine: false,
    result: signal<GateLookupResult | null>(null),
    looking: signal(false),
    lookupError: signal(""),
    feedback: signal(""),
    actionError: signal(""),
    noteError: signal(""),
    submitting: signal(false),
    blockingReasons: signal<string[]>([]),
    checklistDraft: signal<Record<string, ChecklistDraftEntry>>({}),
    scanError: signal(""),
    scanNotice: signal(""),
  };
}

/**
 * UI-09 — Kiểm soát cổng vào / ra (bố cục 2 LÀN song song, bám mockup MH09).
 *
 * Màn hình chia đôi thành **hai làn độc lập** (Vào = ENTRY, Ra = EXIT). Mỗi làn có khung camera
 * riêng, ô tra cứu / quét QR riêng và panel "Hồ sơ khớp với phương tiện" riêng với nút Cho qua /
 * Từ chối ngay tại làn. Bên dưới là **một bảng nhật ký chung** (`sg-table`) gộp sự kiện của cả hai làn.
 *
 * **Khung camera là PLACEHOLDER TRUNG THỰC — hệ thống chưa đấu thiết bị nhận diện biển số (ANPR).**
 * Không dựng dữ liệu giả: không random biển số, không `setTimeout` tự nhận, không giả lập "đang quét".
 * "Biển số nhận diện" hiển thị chính là biển số của hồ sơ vừa tra cứu (nguồn duy nhất đang có).
 *
 * **Quét QR bằng camera (F34) là đường phụ, ô nhập mã là đường chính.** Camera cần ngữ cảnh bảo mật
 * (HTTPS/localhost) + quyền người dùng; thiếu điều kiện nào thì chỉ nêu lý do và nhắc dùng ô nhập mã.
 * Chỉ một làn quét được tại một thời điểm (một luồng camera chung); mở quét ở làn này sẽ dừng làn kia.
 *
 * Quy tắc bắt buộc (DoD của P4): `evaluation.canOpen = false` ⇒ liệt kê rõ điều kiện còn thiếu và
 * **khóa nút xác nhận cho qua**. Nếu vẫn gửi được thì API trả 409 — panel hiện nguyên `blockingReasons`.
 * Không có nút điều khiển barie (F40 = Giai đoạn 2).
 */
@Component({
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatIconModule,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgDatePickerComponent,
    SgFormFieldComponent,
    SgSearchInputComponent,
    SgSelectComponent,
    SgTableComponent,
    SgPagerComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t("ui.gate.controlTitle") }}</h1>
        <p class="sub">{{ t("ui.gate.controlSubtitle") }}</p>
      </div>
      <!--
        Bộ lọc nhật ký chung + KPI theo cổng và khoảng ngày. Áp vào GET /gate/events và
        GET /gate/summary. KHÔNG dùng cho thao tác của làn — làn ghi nhận theo cổng của hồ sơ
        vừa tra cứu (data.gate) nên bộ lọc này chỉ ảnh hưởng bảng nhật ký và KPI.
      -->
      <div class="filters">
        <sg-date-picker
          [ariaLabel]="t('ui.gate.filterFrom')"
          [value]="filterFrom"
          [(ngModel)]="filterFrom"
          (ngModelChange)="onFromChange($event)"
          (valueChange)="onFromChange($event)"
        />
        <sg-date-picker
          [ariaLabel]="t('ui.gate.filterTo')"
          [value]="filterTo"
          [(ngModel)]="filterTo"
          (ngModelChange)="onToChange($event)"
          (valueChange)="onToChange($event)"
        />
      </div>
    </section>

    <!-- KPI lượt qua cổng hôm nay (GET /gate/summary), theo bộ lọc cổng đang chọn. -->
    <div class="kpis" role="group" [attr.aria-label]="t('ui.gate.kpiTitle')">
      <sg-card class="kpi kpi--allow">
        <span class="kpi__label">{{ t("ui.gate.kpiAllowed") }}</span>
        <strong class="kpi__value">{{ summary()?.allowed ?? "—" }}</strong>
      </sg-card>
      <sg-card class="kpi kpi--deny">
        <span class="kpi__label">{{ t("ui.gate.kpiDenied") }}</span>
        <strong class="kpi__value">{{ summary()?.denied ?? "—" }}</strong>
      </sg-card>
      <sg-card class="kpi kpi--total">
        <span class="kpi__label">{{ t("ui.gate.kpiTotal") }}</span>
        <strong class="kpi__value">{{ summary()?.total ?? "—" }}</strong>
      </sg-card>
    </div>

    <!-- Hai làn Vào / Ra song song, mỗi làn một cột. -->
    <div class="dual">
      @for (lane of laneList; track lane.dir) {
        <section class="lane" [attr.data-dir]="lane.dir">
          <header class="lane__head">
            <mat-icon fontSet="material-icons-round">{{
              lane.dir === "in" ? "login" : "logout"
            }}</mat-icon>
            <h2>{{ t(lane.titleKey) }}</h2>
            <span class="lane__dir">{{ directionLabel(lane.direction) }}</span>
          </header>

          <!--
            Khung camera PLACEHOLDER TRUNG THỰC: chưa đấu ANPR nên không dựng dữ liệu giả.
            "Biển số nhận diện" lấy từ hồ sơ vừa tra cứu (biển số của phương tiện khai báo).
          -->
          <sg-card class="cam" [flush]="true">
            <div class="cam__head">
              <!-- Không có chấm "LIVE" nhấp nháy: chưa đấu camera (ngay bên dưới ghi "Đã ngắt kết nối"),
                   để đèn động sẽ mâu thuẫn. Thêm lại khi hệ thống thật sự có luồng camera trực tiếp. -->
              <span class="cam__title">{{ t("ui.gate.camTitle") }}</span>
              <span class="cam__label">{{ t(lane.camLabelKey) }}</span>
            </div>
            <div class="cam__feed">
              <mat-icon fontSet="material-icons-round" aria-hidden="true"
                >photo_camera</mat-icon
              >
              <p>{{ t("ui.gate.camWaiting") }}</p>
              <span>{{ t("ui.gate.camDisconnected") }}</span>
            </div>
            <div class="cam__foot">
              <div class="plate">
                <span class="plate__lbl">{{ t("ui.gate.plateDetected") }}</span>
                <span class="plate__val">{{
                  lane.result()?.dossier?.vehicle?.plateNumber || "—"
                }}</span>
              </div>
              <span class="cam__hint">{{ t("ui.gate.laneScanNote") }}</span>
            </div>
          </sg-card>

          <!-- Ô nhập mã + quét QR RIÊNG cho làn. -->
          <sg-card>
            <div class="lookup">
              <sg-form-field
                [label]="t('ui.common.dossierCode')"
                [required]="true"
                [error]="lane.lookupError()"
                [hint]="t('ui.gate.codeHint')"
              >
                <input
                  type="text"
                  [attr.name]="'dossierCode-' + lane.dir"
                  [attr.aria-label]="t('ui.common.dossierCode')"
                  [placeholder]="t('ui.gate.codePlaceholder')"
                  autocomplete="off"
                  [(ngModel)]="lane.codeInput"
                  (keyup.enter)="lookup(lane)"
                />
              </sg-form-field>
              <button
                type="button"
                sgButton
                [disabled]="lane.looking()"
                (click)="lookup(lane)"
              >
                <mat-icon fontSet="material-icons-round">search</mat-icon
                >{{
                  lane.looking() ? t("ui.gate.looking") : t("ui.gate.lookup")
                }}
              </button>
            </div>

            <!--
              Khung quét QR (F34) của làn. Camera là đường phụ; chỉ một làn quét được một lúc.
              Thẻ video luôn ở DOM (chỉ ẩn khi không quét) để trao được cho bộ giải mã.
            -->
            <div class="scanner">
              <mat-icon fontSet="material-icons-round" aria-hidden="true"
                >qr_code_scanner</mat-icon
              >
              @if (scanBlocked(); as reason) {
                <span class="scanner__blocked">{{
                  scanReasonLabel(reason)
                }}</span>
                <span>{{ t("ui.gate.scanFallback") }}</span>
              } @else {
                <span>{{ t("ui.gate.scannerNote") }}</span>
                <video
                  #scanVideo
                  class="scanner__video"
                  [hidden]="!scanning(lane)"
                  [attr.aria-label]="t('ui.gate.scanVideoAria')"
                  muted
                  playsinline
                ></video>
                <button
                  type="button"
                  sgButton="secondary"
                  size="sm"
                  [disabled]="scanStarting(lane)"
                  (click)="toggleScan(lane, scanVideo)"
                >
                  <mat-icon fontSet="material-icons-round">{{
                    scanning(lane) ? "videocam_off" : "photo_camera"
                  }}</mat-icon>
                  {{ scanButtonLabel(lane) }}
                </button>
                @if (lane.scanError()) {
                  <span class="scanner__blocked">{{ lane.scanError() }}</span>
                  <span>{{ t("ui.gate.scanFallback") }}</span>
                }
                @if (lane.scanNotice()) {
                  <span class="scanner__notice">{{ lane.scanNotice() }}</span>
                }
              }
            </div>
          </sg-card>

          <!-- Panel "Hồ sơ khớp với phương tiện". -->
          <sg-card class="match" [title]="t('ui.gate.matchTitle')">
            @if (lane.result(); as data) {
              <!--
                Đèn tín hiệu 3 màu (theo statusColor máy chủ trả) + pill đúng/sai chiều (so hướng
                làn với chiều khai suy từ loại hồ sơ). Điều kiện qua cổng vẫn do evaluation quyết.
              -->
              <div class="signal-row">
                <div
                  class="signal"
                  role="img"
                  [attr.aria-label]="colorLabel(data)"
                >
                  <span
                    class="light light--red"
                    [class.on]="isColor(data, 'RED')"
                  ></span>
                  <span
                    class="light light--amber"
                    [class.on]="isColor(data, 'YELLOW')"
                  ></span>
                  <span
                    class="light light--green"
                    [class.on]="isColor(data, 'GREEN')"
                  ></span>
                </div>
                <span class="chip" [attr.data-tone]="colorTone(data)">{{
                  colorLabel(data)
                }}</span>
              </div>

              <!-- Lý do chặn khi API trả 409 -->
              @if (lane.blockingReasons().length) {
                <sg-alert type="error" [title]="t('ui.gate.conflict')">
                  <ul>
                    @for (reason of lane.blockingReasons(); track reason) {
                      <li>{{ reason }}</li>
                    }
                  </ul>
                </sg-alert>
              }

              <a
                class="match__code"
                [routerLink]="['/declarations', data.dossier.id]"
                >{{ data.dossier.code }}</a
              >

              <dl class="facts">
                <div><dt>{{ t('ui.common.plateNumber') }}</dt><dd><strong>{{ data.dossier.vehicle.plateNumber }}</strong></dd></div>
                <div><dt>{{ t('ui.dossier.colType') }}</dt><dd>{{ typeLabel(data.dossier.type) }}</dd></div>
                <div><dt>{{ t('ui.gate.containerTrailer') }}</dt><dd>{{ containerLabel(data) }}</dd></div>
                <div><dt>{{ t('ui.common.enterprise') }}</dt><dd>{{ data.dossier.enterprise.name }}</dd></div>
                <div><dt>{{ enterpriseIdentifierLabel(data.dossier.enterprise) }}</dt><dd>{{ enterpriseIdentifierValue(data.dossier.enterprise) }}</dd></div>
                <div><dt>{{ t('ui.common.driver') }}</dt><dd>{{ data.dossier.driver?.fullName || t('ui.common.notDeclared') }}</dd></div>
                <div><dt>{{ t('ui.gate.dossierStatus') }}</dt><dd><span class="chip" [attr.data-tone]="statusTone(data.dossier.status)">{{ statusLabel(data.dossier.status) }}</span></dd></div>
              </dl>

              @if (canOperate()) {
                <sg-form-field
                  [label]="t('ui.gate.officerNote')"
                  [error]="lane.noteError()"
                  [hint]="t('ui.gate.noteHint')"
                >
                  <textarea
                    rows="2"
                    [attr.aria-label]="t('ui.gate.officerNote')"
                    [maxlength]="noteMaxLength"
                    [(ngModel)]="lane.note"
                  ></textarea>
                </sg-form-field>

                <!-- CR2 — Ưu tiên kiểm dịch: CHỈ làn Vào, gắn với thao tác CHO QUA. Một chiều. -->
                @if (lane.dir === "in") {
                  <label class="epidemic">
                    <input
                      type="checkbox"
                      [(ngModel)]="lane.prioritizeQuarantine"
                      [attr.name]="'epidemic-' + lane.dir"
                    />
                    <span>
                      <strong>{{ t("ui.gate.prioritizeQuarantine") }}</strong>
                      <em>{{ t("ui.gate.prioritizeQuarantineHint") }}</em>
                    </span>
                  </label>
                }

                <div class="actions">
                  <button
                    type="button"
                    sgButton="danger"
                    [disabled]="lane.submitting()"
                    (click)="record(lane, 'DENY')"
                  >
                    <mat-icon fontSet="material-icons-round">block</mat-icon
                    >{{ t("ui.gate.decisionDENY") }}
                  </button>
                  <button
                    type="button"
                    sgButton
                    [disabled]="!canAllow(lane) || lane.submitting()"
                    (click)="record(lane, 'ALLOW')"
                  >
                    <mat-icon fontSet="material-icons-round">task_alt</mat-icon
                    >{{
                      lane.dir === "in"
                        ? t("ui.gate.allowIn")
                        : t("ui.gate.allowOut")
                    }}
                  </button>
                </div>

                @if (!eligibleToPass(lane)) {
                  <p class="blocked">{{ t("ui.gate.blockedButton") }}</p>
                }
                <p class="note">{{ t("ui.gate.mvpNote") }}</p>
              }
            } @else {
              <p class="match__empty">
                <mat-icon fontSet="material-icons-round">qr_code_2</mat-icon>
                {{
                  lane.looking() ? t("ui.gate.looking") : t(lane.matchEmptyKey)
                }}
              </p>
            }
          </sg-card>
        </section>
      }
    </div>

    <!-- Bảng nhật ký chung của cả hai làn kèm bộ lọc 7 tiêu chí. -->
    <sg-card
      id="recent-events"
      class="log"
      [title]="t('ui.gate.recentTitle')"
      [subtitle]="t('ui.gate.recentSubtitle')"
      [flush]="true"
    >
      <button
        card-actions
        type="button"
        sgButton="tertiary"
        size="sm"
        [disabled]="recentLoading()"
        (click)="reloadRecent()"
      >
        <mat-icon fontSet="material-icons-round">refresh</mat-icon
        >{{
          recentLoading() ? t("ui.common.loadingShort") : t("ui.common.reload")
        }}
      </button>

      <div class="log-filter-bar">
        <sg-search-input
          class="log-filter-item"
          [placeholder]="t('ui.gate.filterPlate')"
          [ariaLabel]="t('ui.gate.filterPlate')"
          [(ngModel)]="filterPlate"
          (search)="loadRecentEvents()"
        />
        <sg-search-input
          class="log-filter-item"
          [placeholder]="t('ui.gate.filterDossier')"
          [ariaLabel]="t('ui.gate.filterDossier')"
          [(ngModel)]="filterDossierCode"
          (search)="loadRecentEvents()"
        />
        <sg-select
          class="log-filter-item"
          [placeholder]="t('ui.gate.allDirections')"
          [ariaLabel]="t('ui.gate.filterDirection')"
          [options]="directionOptions()"
          [(ngModel)]="filterDirection"
          (valueChange)="loadRecentEvents()"
        />
        <sg-select
          class="log-filter-item"
          [placeholder]="t('ui.gate.allDecisions')"
          [ariaLabel]="t('ui.gate.filterDecision')"
          [options]="decisionOptions()"
          [(ngModel)]="filterDecision"
          (valueChange)="loadRecentEvents()"
        />
        <sg-search-input
          class="log-filter-item"
          [placeholder]="t('ui.gate.filterActor')"
          [ariaLabel]="t('ui.gate.filterActor')"
          [(ngModel)]="filterActor"
          (search)="loadRecentEvents()"
        />
        <sg-date-picker
          class="log-filter-item"
          [ariaLabel]="t('ui.gate.filterFrom')"
          [value]="filterFrom"
          [(ngModel)]="filterFrom"
          (ngModelChange)="onFromChange($event)"
          (valueChange)="onFromChange($event)"
        />
        <sg-date-picker
          class="log-filter-item"
          [ariaLabel]="t('ui.gate.filterTo')"
          [value]="filterTo"
          [(ngModel)]="filterTo"
          (ngModelChange)="onToChange($event)"
          (valueChange)="onToChange($event)"
        />
        <div class="log-filter-actions">
          <button type="button" sgButton size="sm" (click)="loadRecentEvents()">
            <mat-icon fontSet="material-icons-round">search</mat-icon
            >{{ t("ui.common.search") }}
          </button>
          <button
            type="button"
            sgButton="tertiary"
            size="sm"
            (click)="resetLogFilters()"
          >
            <mat-icon fontSet="material-icons-round">restart_alt</mat-icon
            >{{ t("ui.common.reset") }}
          </button>
        </div>
      </div>

      <sg-table
        [columns]="logColumns()"
        [loading]="recentLoading()"
        [loadingText]="t('ui.gate.loadingLog')"
        [empty]="recentEvents().length ? '' : t('ui.gate.recentEmpty')"
      >
        @for (event of recentEvents(); track event.id) {
          <tr>
            <td>
              {{
                event.occurredAt
                  ? (event.occurredAt | date: "dd/MM/yyyy HH:mm")
                  : "—"
              }}
            </td>
            <td class="plate-cell">
              {{ event.plateNumber || t("ui.gate.noPlate") }}
            </td>
            <td class="code">
              <a
                [routerLink]="
                  event.dossierId ? ['/declarations', event.dossierId] : null
                "
                >{{ event.dossierCode || "—" }}</a
              >
            </td>
            <td>
              <span
                class="direction-tag"
                [attr.data-dir]="directionTone(event.direction)"
                >{{ directionShort(event.direction) }}</span
              >
            </td>
            <td>
              <span
                class="chip"
                [attr.data-tone]="
                  event.decision === 'ALLOW' ? 'done' : 'rejected'
                "
                >{{ decisionLabel(event.decision) }}</span
              >
            </td>
            <td>{{ event.actorName || "—" }}</td>
            <td>{{ event.note || "—" }}</td>
          </tr>
        }
      </sg-table>

      <div card-footer class="pager">
        <span>{{ recentSummary() }}</span>
        <div class="pager__controls">
          <span class="pager__label">{{ t("ui.common.display") }}</span>
          <sg-select
            class="pager__size"
            [showEmptyOption]="false"
            [value]="recentPageSizeValue()"
            [options]="pageSizeOptions()"
            [ariaLabel]="t('ui.common.pageSizeAria')"
            (valueChange)="changeRecentPageSize($event)"
          />
        </div>
        <sg-pager
          [page]="recentPage()"
          [pageSize]="recentPageSize()"
          [total]="recentTotal()"
          [disabled]="recentLoading()"
          (pageChange)="goToRecentPage($event)"
        />
      </div>
    </sg-card>
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ mẫu MH09 (cong-vao-ra.html), khoanh vùng trong :host. */
      :host {
        display: block;
        --navy-950: #0d1730;
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
        --t-line: #e6e9f3;
        --t-radius: 14px;
      }
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      .head h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--ink-900);
      }
      .head .sub {
        margin: 4px 0 0;
        color: var(--ink-500);
        font-size: 13px;
      }

      .filters {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .filters sg-date-picker {
        min-width: 150px;
      }

      .pager {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-top: 1px solid var(--t-line);
        color: var(--ink-500);
        font-size: 12.5px;
      }
      .pager__controls {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        justify-self: center;
      }
      .pager sg-pager {
        justify-self: end;
      }
      .pager__label {
        color: var(--ink-500);
        font-size: 12.5px;
        white-space: nowrap;
      }
      .pager__size {
        width: 72px;
      }

      @media (max-width: 900px) {
        .pager {
          grid-template-columns: 1fr;
          justify-items: center;
          gap: 10px;
          text-align: center;
        }
        .pager sg-pager {
          justify-self: center;
        }
      }

      /* KPI lượt qua cổng hôm nay */
      .kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 18px;
      }
      .kpi {
        display: block;
      }
      .kpi__label {
        display: block;
        color: var(--ink-500);
        font-size: 12px;
        font-weight: 600;
      }
      .kpi__value {
        display: block;
        margin-top: 6px;
        font-size: 26px;
        font-weight: 800;
        color: var(--ink-900);
        line-height: 1;
      }
      .kpi--allow .kpi__value {
        color: var(--green-600);
      }
      .kpi--deny .kpi__value {
        color: var(--red-500);
      }

      /* Hai làn song song */
      .dual {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 20px;
        margin-bottom: 20px;
      }
      .lane {
        display: grid;
        gap: 14px;
        align-content: start;
      }
      .lane__head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .lane__head mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
      .lane[data-dir="in"] .lane__head mat-icon {
        color: var(--green-600);
      }
      .lane[data-dir="out"] .lane__head mat-icon {
        color: var(--amber-500);
      }
      .lane__head h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        color: var(--ink-900);
      }
      .lane__dir {
        margin-left: auto;
        color: var(--ink-500);
        font-size: 11.5px;
        font-weight: 700;
      }

      /* Khung camera placeholder (chưa đấu ANPR) */
      .cam .cam__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 13px 16px;
        border-bottom: 1px solid var(--t-line);
      }
      .cam__title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 13px;
        font-weight: 700;
        color: var(--ink-900);
      }
      .cam__label {
        font-size: 11px;
        color: var(--ink-500);
        font-weight: 600;
      }
      .cam__feed {
        display: grid;
        justify-items: center;
        align-content: center;
        gap: 6px;
        aspect-ratio: 16 / 10;
        background: linear-gradient(135deg, #1b2947, #0d1730);
        color: #9fb0d8;
        text-align: center;
        padding: 16px;
      }
      .cam__feed mat-icon {
        width: 32px;
        height: 32px;
        font-size: 32px;
        color: #5c6a92;
      }
      .cam__feed p {
        margin: 0;
        font-weight: 700;
        color: #e6ecf9;
        font-size: 13px;
      }
      .cam__feed span {
        font-size: 12px;
        max-width: 320px;
      }
      .cam__foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 16px;
        border-top: 1px solid var(--t-line);
      }
      .plate__lbl {
        display: block;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--ink-500);
        margin-bottom: 2px;
      }
      .plate__val {
        font-size: 15px;
        font-weight: 800;
        color: var(--ink-900);
      }
      .cam__hint {
        font-size: 11px;
        color: var(--ink-500);
        font-weight: 600;
        text-align: right;
      }

      /* align-items:center để nút "Tra cứu" nằm NGANG ô input: sg-form-field xếp dọc [nhãn/input/hint]
         nên canh 'end' làm nút rơi xuống ngang dòng hint; 'center' đưa nút về giữa field ≈ ngang input. */
      .lookup {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      /* Khung quét — dựng dáng "cam-feed" tối để gợi hình ảnh camera. */
      .scanner {
        display: grid;
        justify-items: center;
        gap: 6px;
        margin-top: 14px;
        padding: 22px;
        border-radius: var(--t-radius);
        background: linear-gradient(135deg, #1b2947, #0d1730);
        text-align: center;
        color: #9fb0d8;
      }
      .scanner mat-icon {
        width: 30px;
        height: 30px;
        font-size: 30px;
        color: #5c6a92;
      }
      .scanner span {
        color: #9fb0d8;
        font-size: 12px;
      }
      .scanner__blocked {
        color: #ff8a8f;
        font-weight: 700;
      }
      .scanner__notice {
        color: var(--amber-500);
        font-weight: 700;
      }
      .scanner__video {
        width: min(280px, 100%);
        margin-top: 8px;
        border-radius: var(--t-radius);
        background: #0d1730;
      }

      /* Panel hồ sơ khớp */
      .match__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 34px 16px;
        color: var(--ink-500);
        text-align: center;
        font-size: 12.5px;
      }
      .match__code {
        display: inline-block;
        margin-bottom: 12px;
        font-size: 15px;
        font-weight: 800;
        color: var(--blue-600);
        text-decoration: none;
      }
      .match__code:hover {
        text-decoration: underline;
      }

      .signal-row {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 14px;
        flex-wrap: wrap;
      }
      .signal {
        display: inline-flex;
        gap: 7px;
        padding: 7px 10px;
        border-radius: 20px;
        background: var(--navy-950);
      }
      .light {
        width: 15px;
        height: 15px;
        border-radius: 50%;
        opacity: 0.22;
      }
      .light--red {
        background: var(--red-500);
      }
      .light--amber {
        background: var(--amber-500);
      }
      .light--green {
        background: var(--green-600);
      }
      .light.on {
        opacity: 1;
        box-shadow: 0 0 8px currentColor;
      }
      .light--red.on {
        color: var(--red-500);
      }
      .light--amber.on {
        color: var(--amber-500);
      }
      .light--green.on {
        color: var(--green-600);
      }
      .pill {
        padding: 4px 11px;
        border-radius: 20px;
        font-size: 11.5px;
        font-weight: 700;
      }
      .pill[data-match="true"] {
        background: var(--green-50);
        color: var(--green-600);
      }
      .pill[data-match="false"] {
        background: var(--amber-50);
        color: var(--amber-500);
      }

      .reasons {
        margin: 8px 0 0;
        padding-left: 22px;
      }
      .reasons li {
        margin-top: 2px;
      }

      .facts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 0 0 4px;
      }
      .facts dt {
        color: var(--ink-500);
        font-size: 12px;
      }
      .facts dd {
        margin: 2px 0 0;
        color: var(--ink-900);
        overflow-wrap: anywhere;
      }

      .checks {
        display: grid;
        gap: 10px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
      }
      .checks__item {
        display: grid;
        gap: 6px;
      }
      .checks__label {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        cursor: pointer;
      }
      .checks__label input {
        margin-top: 3px;
        accent-color: var(--green-600);
      }
      .checks__note {
        width: 100%;
      }
      .checks__empty {
        color: var(--ink-500);
      }
      .req {
        color: var(--red-500);
        font-style: normal;
        margin-left: 2px;
      }

      .epidemic {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        margin-top: 12px;
        padding: 11px 13px;
        border: 1px solid var(--amber-500);
        border-radius: var(--t-radius);
        background: var(--amber-50);
        cursor: pointer;
      }
      .epidemic input {
        margin-top: 3px;
        accent-color: var(--amber-500);
      }
      .epidemic strong {
        display: block;
        color: var(--ink-900);
        font-size: 13px;
      }
      .epidemic em {
        display: block;
        margin-top: 2px;
        font-style: normal;
        color: var(--ink-500);
        font-size: 11.5px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .actions button {
        flex: 1;
        justify-content: center;
      }
      .blocked {
        margin: 12px 0 0;
        color: var(--red-500);
        font-size: 12.5px;
        font-weight: 700;
      }
      .note {
        margin: 8px 0 0;
        color: var(--ink-500);
        font-size: 11.5px;
      }

      /* Bảng nhật ký chung */
      .log {
        display: block;
      }
      .log-filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        padding: 14px 16px;
        background: #f8fafc;
        border-bottom: 1px solid var(--t-line);
      }
      .log-filter-item {
        flex: 1 1 140px;
        min-width: 130px;
      }
      .log-filter-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .plate-cell {
        font-weight: 700;
      }
      .code a {
        color: var(--blue-600);
        font-weight: 600;
        text-decoration: none;
      }
      .code a:hover {
        text-decoration: underline;
      }
      .direction-tag {
        padding: 3px 9px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        display: inline-block;
        background: #eef1f7;
        color: var(--ink-700);
      }
      .direction-tag[data-dir="in"] {
        background: var(--green-50);
        color: var(--green-600);
      }
      .direction-tag[data-dir="out"] {
        background: var(--amber-50);
        color: var(--amber-500);
      }

      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 2px 10px;
        border-radius: 20px;
        background: #eef1f7;
        color: var(--ink-700);
        font-size: 11px;
        font-weight: 700;
      }
      .chip[data-tone="processing"] {
        background: var(--blue-50);
        color: var(--blue-600);
      }
      .chip[data-tone="done"] {
        background: var(--green-50);
        color: var(--green-600);
      }
      .chip[data-tone="waiting"] {
        background: var(--amber-50);
        color: var(--amber-500);
      }
      .chip[data-tone="warning"] {
        background: #fdece1;
        color: #b34e12;
      }
      .chip[data-tone="rejected"] {
        background: var(--red-50);
        color: var(--red-500);
      }

      @media (max-width: 1080px) {
        .dual {
          grid-template-columns: 1fr;
        }
        .facts {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 720px) {
        .kpis {
          grid-template-columns: 1fr;
        }
        .lookup {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class GateControlPageComponent implements OnInit, OnDestroy {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly scanner = inject(QrScannerService);
  private readonly appMessages = inject(AppMessageService);
  private readonly route = inject(ActivatedRoute, { optional: true });

  protected readonly noteMaxLength = NOTE_MAX_LENGTH;

  /** Hai làn độc lập. `laneList` giữ thứ tự cột: Vào trước, Ra sau. */
  protected readonly lanes: Record<Lane, LaneState> = {
    in: createLane(
      "in",
      "ENTRY",
      "ui.gate.channelIn",
      "ui.gate.camLabelIn",
      "ui.gate.matchEmptyIn",
    ),
    out: createLane(
      "out",
      "EXIT",
      "ui.gate.channelOut",
      "ui.gate.camLabelOut",
      "ui.gate.matchEmptyOut",
    ),
  };
  protected readonly laneList: LaneState[] = [this.lanes.in, this.lanes.out];

  /**
   * Nhật ký qua cổng gần đây của **mọi** hồ sơ (API tự giới hạn theo phạm vi dữ liệu của người
   * dùng). Gộp cả hai làn vào một bảng chung; không tra cứu hồ sơ cụ thể nào.
   */
  protected readonly recentEvents = signal<GateEvent[]>([]);
  protected readonly recentTotal = signal(0);
  protected readonly recentPage = signal(1);
  protected readonly recentPageSize = signal(10);
  protected readonly recentLoading = signal(false);
  protected readonly recentError = signal("");

  protected readonly PAGE_SIZES = PAGE_SIZES;
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );
  protected readonly recentPageSizeValue = computed(() =>
    String(this.recentPageSize()),
  );
  protected readonly recentTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.recentTotal() / this.recentPageSize())),
  );

  protected readonly recentSummary = computed(() => {
    if (!this.recentTotal()) return this.t("ui.gate.recentSummaryEmpty");
    const start = (this.recentPage() - 1) * this.recentPageSize() + 1;
    const end = Math.min(
      this.recentTotal(),
      this.recentPage() * this.recentPageSize(),
    );
    return this.t("ui.gate.recentSummary", {
      start,
      end,
      total: this.recentTotal(),
    });
  });

  // --- Bộ lọc (cổng + khoảng ngày) và KPI ------------------------------------

  protected readonly directionOptions = computed<SgSelectOption[]>(() => [
    { value: "ENTRY", label: this.t("ui.gate.dirInShort") },
    { value: "EXIT", label: this.t("ui.gate.dirOutShort") },
  ]);

  protected readonly decisionOptions = computed<SgSelectOption[]>(() => [
    { value: "ALLOW", label: this.t("ui.gate.decisionALLOW") },
    { value: "DENY", label: this.t("ui.gate.decisionDENY") },
  ]);

  protected filterPlate = "";
  protected filterDossierCode = "";
  protected filterDirection = "";
  protected filterDecision = "";
  protected filterActor = "";
  protected filterFrom = "";
  protected filterTo = "";

  /** KPI lượt qua cổng hôm nay (`GET /gate/summary`) theo cổng đang lọc. */
  protected readonly summary = signal<GateSummary | null>(null);
  protected readonly summaryError = signal("");

  /*
   * Quét QR (F34). `scanBlocked` tính MỘT LẦN lúc dựng màn hình (năng lực máy trạm). Chỉ một làn
   * quét được tại một thời điểm — `scanningLane` / `scanStartingLane` ghi làn đang dùng camera.
   */
  protected readonly scanBlocked = signal<QrScannerFailure | null>(
    this.scanner.supportCheck(),
  );
  private readonly scanningLane = signal<Lane | null>(null);
  private readonly scanStartingLane = signal<Lane | null>(null);

  // Ghi nhận sự kiện cổng đi qua `POST /gate/events` = `@RequirePermission('gate.approve')`; "cho
  // qua / từ chối" bản chất là DUYỆT cổng, nên khóa thao tác theo đúng quyền đó (không phải gate.update).
  protected readonly canOperate = computed(() =>
    this.auth.hasPermission(PERMISSION.gateApprove),
  );

  // --- Hiển thị --------------------------------------------------------------

  protected typeLabel(type: string): string {
    return dossierTypeLabel(type, this.t);
  }

  protected statusLabel(status: string): string {
    return dossierStatusLabel(status, this.t);
  }

  protected statusTone(status: string): string {
    return dossierStatusTone(status);
  }

  protected directionLabel(direction: string): string {
    return gateDirectionLabel(direction, this.t);
  }

  protected decisionLabel(decision: string): string {
    return gateDecisionLabel(decision, this.t);
  }

  protected colorLabel(data: GateLookupResult): string {
    return gateStatusColorLabel(data.evaluation?.statusColor || "", this.t);
  }

  protected colorTone(data: GateLookupResult): string {
    return gateStatusColorTone(data.evaluation?.statusColor || "");
  }

  /** Đèn tín hiệu: đúng màu do máy chủ trả thì sáng. */
  protected isColor(data: GateLookupResult, color: GateStatusColor): boolean {
    return data.evaluation?.statusColor === color;
  }

  protected containerLabel(data: GateLookupResult): string {
    const parts = [
      data.dossier.vehicle.containerNumber
        ? this.t("ui.dossier.containerPrefix", {
            number: data.dossier.vehicle.containerNumber,
          })
        : "",
      data.dossier.vehicle.trailerNumber
        ? this.t("ui.dossier.trailerPrefix", {
            number: data.dossier.vehicle.trailerNumber,
          })
        : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : this.t("ui.dossier.noContainer");
  }

  /** Nhãn ngắn cho cột Hướng ở bảng nhật ký (Vào / Ra) — tra theo mã, không dò chuỗi. */
  protected directionShort(direction: string | undefined): string {
    if (direction === "ENTRY") return this.t("ui.gate.dirInShort");
    if (direction === "EXIT") return this.t("ui.gate.dirOutShort");
    return "—";
  }

  /** Mã tông màu (in/out) cho tag hướng — mã lạ trả rỗng để không tô. */
  protected directionTone(direction: string | undefined): string {
    if (direction === "ENTRY") return "in";
    if (direction === "EXIT") return "out";
    return "";
  }

  /** Cột cho bảng nhật ký chung — nhãn dịch sẵn, số cột = colspan hàng trạng thái. */
  protected logColumns(): SgTableColumn[] {
    return [
      { key: "time", label: this.t("ui.gate.colTime") },
      { key: "plate", label: this.t("ui.common.plateNumber") },
      { key: "code", label: this.t("ui.gate.colDossier") },
      { key: "dir", label: this.t("ui.gate.colDirection") },
      { key: "result", label: this.t("ui.gate.colResult") },
      { key: "actor", label: this.t("ui.gate.colActor") },
      { key: "note", label: this.t("ui.gate.colNote") },
    ];
  }

  // --- Checklist (theo làn) --------------------------------------------------

  protected isChecked(lane: LaneState, item: GateChecklistItem): boolean {
    return lane.checklistDraft()[item.code]?.checked ?? item.checked;
  }

  protected noteOf(lane: LaneState, item: GateChecklistItem): string {
    return lane.checklistDraft()[item.code]?.note ?? (item.note || "");
  }

  protected toggleCheck(
    lane: LaneState,
    item: GateChecklistItem,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    lane.checklistDraft.update((draft) => ({
      ...draft,
      [item.code]: { checked, note: this.noteOf(lane, item) },
    }));
  }

  protected setNote(
    lane: LaneState,
    item: GateChecklistItem,
    event: Event,
  ): void {
    const note = (event.target as HTMLInputElement).value;
    lane.checklistDraft.update((draft) => ({
      ...draft,
      [item.code]: { checked: this.isChecked(lane, item), note },
    }));
  }

  private checklistPayload(lane: LaneState): GateChecklistInput[] {
    return (lane.result()?.checklist || []).map((item) => ({
      code: item.code,
      checked: this.isChecked(lane, item),
      note: this.noteOf(lane, item) || undefined,
    }));
  }

  private checkedMap(lane: LaneState): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    (lane.result()?.checklist || []).forEach((item) => {
      map[item.code] = this.isChecked(lane, item);
    });
    return map;
  }

  /** Điều kiện còn thiếu để qua cổng của làn — chỉ các mục CHƯA đạt do máy chủ trả (BUG-019). */
  // protected missing(lane: LaneState): string[] {
  //   return missingConditions(lane.result()?.evaluation);
  // }

  protected eligibleToPass(lane: LaneState): boolean {
    const data = lane.result();
    if (!data) return false;
    return gateWorkflowConditionsMet(data);
  }

  /** Chỉ cho xác nhận cho qua khi hồ sơ đủ điều kiện (tính tại chỗ) và người dùng có quyền. */
  protected canAllow(lane: LaneState): boolean {
    return this.eligibleToPass(lane) && this.canOperate();
  }

  // --- Vòng đời -------------------------------------------------------------

  ngOnInit(): void {
    const params = this.route?.snapshot?.queryParams || {};
    if (params["from"]) this.filterFrom = params["from"];
    if (params["to"]) this.filterTo = params["to"];
    if (params["direction"]) this.filterDirection = params["direction"];
    if (params["decision"]) this.filterDecision = params["decision"];
    if (params["plate"] || params["plateNumber"])
      this.filterPlate = params["plate"] || params["plateNumber"];
    if (params["dossierCode"]) this.filterDossierCode = params["dossierCode"];
    if (params["actorName"]) this.filterActor = params["actorName"];

    this.loadRecentEvents();
    this.loadSummary();

    if (
      params["from"] ||
      params["to"] ||
      params["direction"] ||
      params["decision"] ||
      this.route?.snapshot?.fragment === "recent-events"
    ) {
      setTimeout(() => {
        const el = document.getElementById("recent-events");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 250);
    }
  }

  /** Tắt camera khi rời màn hình — không để đèn camera sáng sau khi điều hướng đi. */
  ngOnDestroy(): void {
    this.scanner.stop();
  }

  // --- Bộ lọc ----------------------------------------------------------------

  protected onFromChange(from: string): void {
    this.filterFrom = from;
    this.applyFilters();
  }

  protected onToChange(to: string): void {
    this.filterTo = to;
    this.applyFilters();
  }

  /** Đổi bộ lọc thì tải lại nhật ký chung và KPI hôm nay. */
  private applyFilters(): void {
    this.loadRecentEvents();
    this.loadSummary();
  }

  /** KPI lượt qua cổng hôm nay. Gọi phòng thủ khi api chưa sẵn sàng. */
  private loadSummary(): void {
    if (typeof this.api.getGateSummary !== "function") return;
    this.summaryError.set("");
    this.api.getGateSummary().subscribe({
      next: (data) => this.summary.set(data),
      error: () => {
        this.summary.set(null);
        this.summaryError.set(this.t("ui.gate.kpiLoadFailed"));
        this.appMessages.showKey("ui.gate.kpiLoadFailed", "warning");
      },
    });
  }

  // --- Quét QR bằng camera (F34) — theo làn ----------------------------------

  protected scanning(lane: LaneState): boolean {
    return this.scanningLane() === lane.dir;
  }

  protected scanStarting(lane: LaneState): boolean {
    return this.scanStartingLane() === lane.dir;
  }

  protected scanButtonLabel(lane: LaneState): string {
    if (this.scanStarting(lane)) return this.t("ui.gate.scanStarting");
    return this.scanning(lane)
      ? this.t("ui.gate.scanStop")
      : this.t("ui.gate.scanStart");
  }

  /** Nhãn lý do không quét được — tra theo **mã** `QrScannerFailure`, không dò chuỗi. */
  protected scanReasonLabel(reason: QrScannerFailure): string {
    return this.t(SCAN_FAILURE_LABEL_KEYS[reason]);
  }

  protected toggleScan(lane: LaneState, video: HTMLVideoElement): void {
    if (this.scanning(lane) || this.scanStarting(lane)) {
      this.stopScan();
      return;
    }
    void this.startScan(lane, video);
  }

  private async startScan(
    lane: LaneState,
    video: HTMLVideoElement,
  ): Promise<void> {
    lane.scanError.set("");
    this.scanStartingLane.set(lane.dir);
    try {
      // `scanner.start` tự dừng luồng camera cũ trước — mở quét ở làn này sẽ dừng làn kia.
      await this.scanner.start(video, (text) => this.onScanned(lane, text));
      this.scanStartingLane.set(null);
      this.scanningLane.set(lane.dir);
    } catch (error: unknown) {
      this.scanStartingLane.set(null);
      this.scanningLane.set(null);
      const reason =
        error instanceof QrScannerError ? error.reason : "START_FAILED";
      lane.scanError.set(this.t(SCAN_FAILURE_LABEL_KEYS[reason]));
    }
  }

  private stopScan(): void {
    this.scanner.stop();
    this.scanningLane.set(null);
    this.scanStartingLane.set(null);
  }

  /**
   * Quét trúng: **tắt camera ngay** rồi tra cứu như khi gõ tay vào làn tương ứng. Quét nhầm mã
   * thứ khác thì **giữ camera chạy tiếp** và báo tại chỗ. QR quá hạn thì **vẫn tra cứu** nhưng
   * cảnh báo — điều kiện qua cổng vẫn do máy chủ quyết.
   */
  private onScanned(lane: LaneState, text: string): void {
    const scanned = readDossierQr(text);
    if (scanned.status === "INVALID") {
      lane.scanNotice.set("");
      lane.scanError.set(this.t("ui.gate.scanInvalidQr"));
      return;
    }

    this.stopScan();
    lane.scanError.set("");
    lane.scanNotice.set(
      scanned.status === "EXPIRED" ? this.t("ui.gate.scanExpiredQr") : "",
    );
    lane.codeInput = scanned.code;
    this.lookup(lane);
  }

  // --- Tra cứu (theo làn) ----------------------------------------------------

  protected lookup(lane: LaneState): void {
    const code = lane.codeInput.trim();
    if (!code) {
      lane.lookupError.set(this.t("ui.gate.codeRequired"));
      return;
    }

    lane.looking.set(true);
    lane.lookupError.set("");
    lane.actionError.set("");
    lane.feedback.set("");
    lane.blockingReasons.set([]);

    this.api.lookupGateDossier(code, lane.direction).subscribe({
      next: (data) => {
        lane.looking.set(false);
        if (!data?.dossier) {
          lane.result.set(null);
          lane.lookupError.set(this.t("ui.gate.notFound"));
          return;
        }
        lane.result.set(data);
        lane.checklistDraft.set({});
        lane.note = "";
        lane.prioritizeQuarantine = false;
      },
      error: (error: unknown) => {
        lane.looking.set(false);
        lane.result.set(null);
        const status = (error as { status?: number })?.status || 0;
        const message = extractErrorMessage(error);
        lane.lookupError.set(
          status === 404
            ? message || this.t("ui.gate.notFoundHint")
            : message || this.t("ui.gate.lookupFailed"),
        );
      },
    });
  }

  // --- Ghi nhận sự kiện cổng (F38) — theo làn --------------------------------

  protected record(lane: LaneState, decision: GateDecision): void {
    const data = lane.result();
    if (!data) return;

    lane.actionError.set("");
    lane.noteError.set("");
    lane.blockingReasons.set([]);

    // Chặn ngay tại web: điều kiện nghiệp vụ/phí chưa đạt thì không gửi ALLOW
    if (decision === "ALLOW" && !gateWorkflowConditionsMet(data)) {
      lane.actionError.set(this.t("ui.gate.cannotAllow"));
      this.appMessages.showKey("ui.gate.cannotAllow", "error");
      return;
    }

    // Từ chối cho qua bắt buộc có lý do — nhật ký sự kiện cổng phải nói được vì sao chặn xe.
    if (decision === "DENY" && !lane.note.trim()) {
      lane.noteError.set(this.t("ui.gate.denyReasonRequired"));
      this.appMessages.showKey("ui.common.formHasErrors", "error");
      return;
    }

    lane.submitting.set(true);
    // CR2 — chỉ gửi cờ dịch tễ khi CHO QUA ở làn VÀO và cán bộ đã tích "Ưu tiên kiểm dịch".
    const prioritizeQuarantine =
      lane.dir === "in" && decision === "ALLOW" && lane.prioritizeQuarantine
        ? true
        : undefined;
    // Ghi nhận theo cổng và hướng của làn đang thực hiện.
    this.api
      .createGateEvent({
        dossierId: data.dossier.id,
        gateCode: data.gate?.code,
        direction: (data.gate?.direction as GateDirection) || lane.direction,
        decision,
        checklist: this.checklistPayload(lane),
        note: lane.note.trim() || undefined,
        prioritizeQuarantine,
      })
      .subscribe({
        next: () => {
          lane.submitting.set(false);
          const message = this.t("ui.gate.recorded", {
            decision: gateDecisionLabel(decision, this.t).toLowerCase(),
            code: data.dossier.code,
          });
          lane.feedback.set(message);
          this.appMessages.show(message, "success");
          lane.note = "";
          lane.prioritizeQuarantine = false;
          this.loadRecentEvents();
          this.loadSummary();
          this.refreshLookup(lane, data.dossier.code);
        },
        error: (error: unknown) => {
          lane.submitting.set(false);
          this.handleEventError(lane, error);
        },
      });
  }

  /**
   * 409 = API xác định hồ sơ chưa đủ điều kiện dù giao diện tưởng là đủ (dữ liệu vừa đổi ở nơi
   * khác). Hiện **nguyên danh sách `blockingReasons`** rồi tra cứu lại để đồng bộ.
   */
  private handleEventError(lane: LaneState, error: unknown): void {
    const status = (error as { status?: number })?.status || 0;
    const message = extractErrorMessage(error);

    if (status === 409) {
      const reasons = this.extractBlockingReasons(error);
      // Danh sách lý do chi tiết vẫn hiện tại chỗ (theo làn); tóm tắt lỗi báo qua toast.
      lane.blockingReasons.set(
        reasons.length ? reasons : [this.t("ui.gate.serverNoReason")],
      );
      const conflict = message || this.t("ui.gate.conflict");
      lane.actionError.set(conflict);
      this.appMessages.show(conflict, "error");
      const code = lane.result()?.dossier?.code || "";
      if (code) this.refreshLookup(lane, code);
      return;
    }

    const failed = message || this.t("ui.gate.recordFailed");
    lane.actionError.set(failed);
    this.appMessages.show(failed, "error");
  }

  private extractBlockingReasons(error: unknown): string[] {
    const body = (error as { error?: Record<string, unknown> })?.error;
    const reasons = body?.["blockingReasons"];
    if (!Array.isArray(reasons)) return [];
    return reasons.filter(
      (item): item is string => typeof item === "string" && !!item,
    );
  }

  /** Tải lại kết quả tra cứu của làn sau khi ghi nhận — trạng thái điều kiện có thể đã đổi. */
  private refreshLookup(lane: LaneState, code: string): void {
    this.api.lookupGateDossier(code, lane.direction).subscribe({
      next: (data) => {
        if (data?.dossier) {
          lane.result.set(data);
          lane.checklistDraft.set({});
        }
      },
      error: () => {
        // Sự kiện cổng ĐÃ ghi nhận thành công; đây chỉ là bước tra cứu lại để đồng bộ điều kiện.
        // Nêu nhẹ trong panel của làn, KHÔNG bung toast đỏ để tránh hiểu nhầm thao tác thất bại.
        lane.actionError.set(this.t("ui.gate.refreshFailed"));
      },
    });
  }

  // --- Nhật ký qua cổng gần đây (bảng chung) ---------------------------------

  protected reloadRecent(): void {
    this.recentPage.set(1);
    this.loadRecentEvents();
  }

  protected loadRecentEvents(): void {
    this.recentLoading.set(true);
    this.recentError.set("");
    const filters: GateEventFilters = {
      page: this.recentPage(),
      pageSize: this.recentPageSize(),
    };
    if (this.filterDossierCode.trim())
      filters.dossierCode = this.filterDossierCode.trim();
    if (this.filterPlate.trim()) filters.plateNumber = this.filterPlate.trim();
    if (this.filterDirection) filters.direction = this.filterDirection;
    if (this.filterDecision) filters.decision = this.filterDecision;
    if (this.filterActor.trim()) filters.actorName = this.filterActor.trim();
    if (this.filterFrom) filters.from = `${this.filterFrom}T00:00:00`;
    if (this.filterTo) filters.to = `${this.filterTo}T23:59:59`;

    this.api.getGateEvents(filters).subscribe({
      next: (page) => {
        this.recentLoading.set(false);
        this.recentEvents.set(page?.items || []);
        this.recentTotal.set(page?.total || 0);
      },
      error: () => {
        this.recentLoading.set(false);
        this.recentEvents.set([]);
        this.recentTotal.set(0);
        this.recentError.set(this.t("ui.gate.recentLoadFailed"));
        this.appMessages.showKey("ui.gate.recentLoadFailed", "error");
      },
    });
  }

  protected goToRecentPage(next: number): void {
    const target = Math.min(Math.max(1, next), this.recentTotalPages());
    if (target === this.recentPage()) return;
    this.recentPage.set(target);
    this.loadRecentEvents();
  }

  protected changeRecentPageSize(value: string): void {
    this.recentPageSize.set(Number(value) || 10);
    this.recentPage.set(1);
    this.loadRecentEvents();
  }

  protected resetLogFilters(): void {
    this.filterPlate = "";
    this.filterDossierCode = "";
    this.filterDirection = "";
    this.filterDecision = "";
    this.filterActor = "";
    this.filterFrom = "";
    this.filterTo = "";
    this.recentPage.set(1);
    this.loadRecentEvents();
    this.loadSummary();
  }

  protected enterpriseIdentifierLabel(enterprise?: Partial<DossierEnterprise> | null): string {
    const resolved = resolveEnterpriseIdentifier(enterprise);
    return this.t(resolved.labelKey);
  }

  protected enterpriseIdentifierValue(enterprise?: Partial<DossierEnterprise> | null): string {
    const resolved = resolveEnterpriseIdentifier(enterprise);
    return resolved.value || '—';
  }
}
