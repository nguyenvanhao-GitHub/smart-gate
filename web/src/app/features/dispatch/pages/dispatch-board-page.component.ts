import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PERMISSION, actorRoleLabel } from '../../../core/auth/access-control.model';
import { AuthService } from '../../../core/auth/auth.service';
import { extractErrorMessage } from '../../../core/forms/field-errors';
import {
  dossierStatusLabel,
  dossierStatusTone,
} from '../../../core/models/declaration.model';
import {
  DispatchBoard,
  DispatchBoardFilters,
  DispatchCard,
  DispatchHistoryEntry,
  DispatchPlacementSnapshot,
  assignmentSummary,
  dispatchHistoryActionLabel,
  placementLabel,
} from '../../../core/models/dispatch.model';
import { formatDateTime, formatElapsed } from '../../../core/models/workflow.model';
import { YardDetail, YardSummary, freeSlots } from '../../../core/models/yard.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgDatePickerComponent } from '../../../shared/ui/sg-date-picker.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { SgTableColumn, SgTableComponent } from '../../../shared/ui/sg-table.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/message-catalog';
import { normalizeText } from '../../../core/models/label.util';

/** Vị trí đang soạn trong hộp thoại gán — để trống nghĩa là không gán thành phần đó. */
interface AssignDraft {
  yardId: string;
  slotCode: string;
}

const EMPTY_ASSIGN: AssignDraft = { yardId: '', slotCode: '' };

/** Vòng màu cho tiêu đề 3 khung theo thứ tự: chờ điều phối → đang kiểm tra → đã kiểm tra xong. */
const COLUMN_TONES = ['waiting', 'processing', 'done'];

/**
 * UI-08 — Điều phối phương tiện.
 *
 * Theo SRS UI-08 màn hình gồm: **KPI tải**, **card gọi số + khung giờ tiếp nhận**, **bảng điều
 * phối dạng cột** với thẻ phương tiện, và **lịch sử điều phối**. Cột do API trả trong
 * `board.columns`, web không tự chia nhóm.
 *
 * Ba hạng mục của mockup MH08 **cố ý không làm** (kết luận điểm D1 của kế hoạch MVP):
 * sơ đồ khu vực cửa khẩu dạng flow, dòng thời gian ETA, và cảnh báo ùn tắc (F57 thuộc
 * Giai đoạn 2). Thay bằng đúng bảng cột mà SRS mô tả.
 *
 * **Không làm kéo-thả để gán vị trí / chuyển cột.** Lý do: cột trên bảng là *trạng thái điều phối*
 * do API tính (chờ → gán → bãi → đã qua), không phải hành động có endpoint, nên thả thẻ sang cột
 * khác không ánh xạ được với thao tác thật nào. Việc gán/đổi/bỏ vị trí đi qua hộp thoại mở bằng nút
 * bấm — thao tác này dùng được bằng bàn phím, đúng yêu cầu trợ năng.
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    SgAlertComponent,
    SgButtonDirective,
    SgDatePickerComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgSearchInputComponent,
    SgSelectComponent,
    SgTableComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.dispatch.boardTitle') }}</h1>
      </div>
      <div class="head__filters">
        <sg-search-input
          class="head__search"
          [placeholder]="t('ui.dispatch.searchPlaceholder')"
          [ariaLabel]="t('ui.dispatch.searchPlaceholder')"
          [(ngModel)]="filters.search"
          (search)="reload()"
        />
        <sg-date-picker class="head__field" [ariaLabel]="t('ui.dispatch.filterFrom')" [(ngModel)]="filters.from" (ngModelChange)="reload()" (valueChange)="onFromChange($event)" />
        <sg-date-picker class="head__field" [ariaLabel]="t('ui.dispatch.filterTo')" [(ngModel)]="filters.to" (ngModelChange)="reload()" (valueChange)="onToChange($event)" />
        <a sgButton="tertiary" routerLink="/dispatch/history">
          <mat-icon fontSet="material-icons-round">history</mat-icon>{{ t('ui.dispatch.openHistory') }}
        </a>
        <button
          type="button"
          sgButton
          [disabled]="loading() || callingNext() || !canCallNext()"
          (click)="callNext()"
        >
          <mat-icon fontSet="material-icons-round">campaign</mat-icon>
          {{ callingNext() ? t('ui.dispatch.callingNext') : t('ui.dispatch.callNext') }}
        </button>
        <button type="button" sgButton="secondary" [disabled]="loading()" (click)="reset()">
          <mat-icon fontSet="material-icons-round">refresh</mat-icon>{{ loading() ? t('ui.common.loadingShort') : t('ui.common.reload') }}
        </button>
      </div>
    </section>

    <div class="section-heading">
      <h2>{{ t('ui.dispatch.laneSectionTitle') }}</h2>
      <p>{{ t('ui.dispatch.laneSectionSubtitle') }}</p>
    </div>

    <div class="sg-scroll-x board-scroll">
      <div class="board" role="list" [attr.aria-label]="t('ui.dispatch.boardAria')">
        @if (loading()) {
          <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.dispatch.loading') }}</p>
        } @else if (error()) {
          <p class="state">{{ t('ui.dispatch.displayError') }}</p>
        } @else if (!columns().length) {
          <p class="state"><mat-icon fontSet="material-icons-round">inbox</mat-icon>{{ t('ui.dispatch.empty') }}</p>
        } @else {
          @for (column of columns(); track column.key; let i = $index) {
            <section class="col" role="listitem" [attr.data-tone]="columnTone(i)">
              <header class="col__head">
                <h2>{{ columnTitle(column) }}</h2>
                <span class="col__count">{{ column.items.length }}</span>
              </header>
              <ol class="cards">
                @for (card of column.items; track card.dossierId + '-' + $index) {
                  <li class="card">
                    <header class="card__head">
                      <strong class="card__plate">
                        {{ card.plateNumber || t('ui.dispatch.noPlate') }}
                      </strong>
                      <span class="card__head-right">
                        @if (card.ticketCode || card.ticketNumber) {
                          <span class="chip" data-tone="processing">{{ card.ticketCode || t('ui.dispatch.ticket', { number: card.ticketNumber }) }}</span>
                        }
                      </span>
                    </header>
                    <a class="card__code" [routerLink]="['/declarations', card.dossierId]">{{ card.code }}</a>
                    <p class="card__enterprise">{{ card.enterpriseName || t('ui.dispatch.noEnterprise') }}</p>
                    <p class="card__meta">
                      <span class="chip" [attr.data-tone]="statusTone(card.status)">{{ statusLabel(card.status) }}</span>
                      <span class="card__wait">
                        <mat-icon fontSet="material-icons-round">timer</mat-icon>{{ t('ui.dispatch.waited', { value: waiting(card) }) }}
                      </span>
                    </p>
                    <p class="card__slot" [attr.data-assigned]="!!card.assignment">
                      <mat-icon fontSet="material-icons-round">place</mat-icon>{{ positionOf(card) }}
                    </p>
                    <div class="card__actions">
                      @if (column.key === 'WAITING' || card.status === 'WAITING_CALL') {
                        <button
                          type="button"
                          sgButton="secondary"
                          size="sm"
                          [disabled]="busyDossierId() === card.dossierId || !canCallNext()"
                          (click)="callSpecific(card)"
                        >
                          <mat-icon fontSet="material-icons-round">campaign</mat-icon>
                          {{ t('ui.dispatch.callThis') }}
                        </button>
                      }
                      @if (card.assignment ? canDispatch() : canCreateDispatch()) {
                        <button type="button" sgButton="secondary" size="sm" (click)="openAssign(card)">
                          <mat-icon fontSet="material-icons-round">edit_location_alt</mat-icon>
                          {{ card.assignment ? t('ui.dispatch.changePosition') : t('ui.dispatch.assignPosition') }}
                        </button>
                      }
                      @if (card.assignment && canDeleteDispatch()) {
                        <button type="button" sgButton="tertiary" size="sm" [disabled]="busyDossierId() === card.dossierId" (click)="clearAssignment(card)">
                          {{ t('ui.dispatch.clearPosition') }}
                        </button>
                      }
                    </div>
                  </li>
                } @empty {
                  <li class="cards__empty">{{ t('ui.dispatch.columnEmpty') }}</li>
                }
              </ol>
            </section>
          }
        }
      </div>
    </div>

    <p class="note">{{ t('ui.dispatch.note') }}</p>

    <!-- Lịch sử điều phối -->
    <section class="history">
      <div class="history__head">
        <div>
          <strong><mat-icon fontSet="material-icons-round">history</mat-icon>{{ t('ui.dispatch.historyTitle') }}</strong>
          <span class="history__sub">{{ t('ui.dispatch.historySubtitle') }}</span>
        </div>
        <a sgButton="tertiary" routerLink="/dispatch/history">
          <mat-icon fontSet="material-icons-round">open_in_full</mat-icon>{{ t('ui.dispatch.openHistory') }}
        </a>
      </div>
      @if (history().length) {
        <sg-table [columns]="historyColumns()">
          @for (row of history(); track row.id) {
            <tr>
              <td>{{ formatAt(row.at) }}</td>
              <td>
                <span class="actor">{{ row.actorName || '—' }}</span>
                @if (row.actorRole) {
                  <span class="actor__role">{{ roleLabel(row.actorRole) }}</span>
                }
              </td>
              <td><span class="chip" [attr.data-action]="row.action">{{ actionLabel(row.action) }}</span></td>
              <td>{{ row.dossierCode || row.dossierId || '—' }}</td>
              <td>{{ row.plateNumber || '—' }}</td>
              <td>{{ place(row.from) }}</td>
              <td>{{ place(row.to) }}</td>
            </tr>
          }
        </sg-table>
      } @else {
        <p class="history__empty">{{ t('ui.dispatchHistory.empty') }}</p>
      }
    </section>

    @if (assignTarget(); as card) {
      <sg-modal [title]="t('ui.dispatch.modalTitle', { plate: card.plateNumber })" [ariaLabel]="t('ui.dispatch.modalAria')" (close)="closeAssign()">
        <p class="modal__desc">
          {{ t('ui.dispatch.modalDesc', { code: card.code, enterprise: card.enterpriseName }) }}
          <strong>{{ positionOf(card) }}</strong>.
        </p>

        @if (assignError()) {
          <sg-alert class="feedback" type="error" [message]="assignError()" />
        }

        <div class="modal__grid">
          <sg-form-field [label]="t('ui.dispatch.yard')" [hint]="t('ui.dispatch.yardHint')">
            <sg-select [ariaLabel]="t('ui.dispatch.yard')" [placeholder]="t('ui.dispatch.yardNone')" [options]="yardOptions()" [value]="draft.yardId" (valueChange)="chooseYard($event)" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.dispatch.slot')" [hint]="slotHint()">
            <sg-select [ariaLabel]="t('ui.dispatch.slot')" [placeholder]="t('ui.dispatch.slotNone')" [options]="slotOptions()" [value]="draft.slotCode" (valueChange)="draft.slotCode = $event" />
          </sg-form-field>
        </div>

        @if (assignInvalidReason(); as reason) {
          <p class="modal__hint"><mat-icon fontSet="material-icons-round">info</mat-icon>{{ t(reason) }}</p>
        }

        <button modal-footer type="button" sgButton="secondary" [disabled]="assignSubmitting()" (click)="closeAssign()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton [disabled]="assignSubmitting() || !!assignInvalidReason()" (click)="submitAssign()">
          {{ assignSubmitting() ? t('ui.common.saving') : t('ui.dispatch.savePosition') }}
        </button>
      </sg-modal>
    }
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ mẫu MH08 (dieu-phoi-lan.html), khoanh vùng trong :host
         nên không rò ra token --sg-* toàn cục. */
      :host {
        display: block;
        --navy-900: #101d3d;
        --blue-600: #2f6fed;
        --blue-500: #4a84f2;
        --blue-50: #eef3fe;
        --orange-500: #e8622c;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --amber-500: #e0a72e;
        --amber-50: #fbf3e2;
        --red-500: #e5484d;
        --red-50: #fdeced;
        --teal-600: #0f9488;
        --teal-50: #e6f7f5;
        --ink-900: #152040;
        --ink-700: #3d4a6b;
        --ink-500: #7885a3;
        --t-line: #e6e9f3;
        --t-bg: #f4f6fb;
        --t-card: #ffffff;
        --t-radius: 16px;
        --t-shadow: 0 1px 2px rgba(20, 30, 60, 0.04), 0 6px 16px rgba(20, 30, 60, 0.05);
      }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
      .head h1 { margin: 0; font-size: 23px; font-weight: 800; color: var(--ink-900); letter-spacing: -0.01em; }
      .head__filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .head__field { width: 190px; }
      .head__search { width: 230px; }
      .feedback { display: block; margin-bottom: 16px; }

      .board-scroll { min-width: 0; }

      .section-heading { margin-bottom: 18px; }
      .section-heading h2 { margin: 0; font-size: 16px; font-weight: 800; color: var(--ink-900); letter-spacing: -0.01em; }
      .section-heading p { margin: 4px 0 0; color: var(--ink-500); font-size: 12.5px; }

      .board {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 32px;
        align-items: start;
        min-height: 200px;
      }
      .col {
        display: flex;
        flex-direction: column;
        min-width: 0;
        border: 1px solid var(--t-line);
        border-radius: var(--t-radius);
        background: var(--t-card);
        box-shadow: var(--t-shadow);
        overflow: hidden;
      }
      .col__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; color: #fff; background: var(--teal-600); font-size: 13.5px; font-weight: 800; }
      .col[data-tone='waiting'] .col__head { background: var(--orange-500); }
      .col[data-tone='processing'] .col__head { background: var(--blue-600); }
      .col[data-tone='idle'] .col__head { background: var(--teal-600); }
      .col[data-tone='done'] .col__head { background: var(--green-600); }
      .col__head h2 { margin: 0; font-size: 13.5px; font-weight: 800; color: #fff; }
      .col__count {
        display: inline-grid;
        place-items: center;
        min-width: 22px;
        height: 20px;
        padding: 0 6px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.25);
        color: #fff;
        font-size: 11.5px;
        font-weight: 700;
      }
      .cards {
        display: grid;
        gap: 8px;
        align-content: start;
        margin: 0;
        padding: 10px;
        list-style: none;
        flex: 1;
        min-height: 120px;
        max-height: calc(5 * 145px + 4 * 8px + 20px);
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 transparent;
      }
      .cards::-webkit-scrollbar {
        width: 6px;
      }
      .cards::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 6px;
      }
      .cards::-webkit-scrollbar-thumb:hover {
        background: var(--ink-500);
      }
      .cards::-webkit-scrollbar-track {
        background: transparent;
      }
      .cards__empty { padding: 20px 0; text-align: center; color: var(--ink-500); font-size: 12.5px; }
      .card {
        display: grid;
        gap: 2px;
        padding: 9px 11px;
        border: 1px solid var(--t-line);
        border-radius: 10px;
        background: #fff;
      }
      .card:hover { box-shadow: var(--t-shadow); }
      .card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .card__plate { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: var(--ink-900); }
      .card__head-right { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .card__code { color: var(--blue-600); font-weight: 600; text-decoration: none; font-size: 11px; }
      .card__code:hover { text-decoration: underline; }
      .card__enterprise { margin: 0; color: var(--ink-500); font-size: 11px; line-height: 1.3; }
      .card__meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px; margin: 3px 0 0; }
      .card__wait { display: inline-flex; align-items: center; gap: 4px; color: var(--amber-500); font-size: 11px; font-weight: 700; }
      .card__wait mat-icon, .card__slot mat-icon { width: 14px; height: 14px; font-size: 14px; }
      .card__slot { display: flex; align-items: center; gap: 4px; margin: 1px 0 0; color: var(--ink-500); font-size: 11px; }
      .card__slot[data-assigned='true'] { color: var(--blue-600); font-weight: 700; }
      .card__actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
      .card__actions button { min-height: 28px; padding: 0 8px; font-size: 11px; }
      .card__actions button mat-icon { width: 15px; height: 15px; font-size: 15px; }

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
      .chip[data-tone='processing'] { background: var(--blue-50); color: var(--blue-600); }
      .chip[data-tone='done'] { background: var(--green-50); color: var(--green-600); }
      .chip[data-tone='waiting'] { background: var(--amber-50); color: var(--amber-500); }
      .chip[data-tone='warning'] { background: #fdece1; color: #b34e12; }
      .chip[data-tone='rejected'] { background: var(--red-50); color: var(--red-500); }

      .chip[data-action='DISPATCH_ASSIGN'] { background: var(--sg-state-processing-soft); color: var(--sg-state-processing); }
      .chip[data-action='DISPATCH_MOVE'] { background: var(--sg-state-waiting-soft); color: var(--sg-state-waiting-ink); }
      .chip[data-action='DISPATCH_RELEASE'] { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }

      .state { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 40px; color: var(--ink-500); }
      .note { margin: 20px 0 0; color: var(--ink-500); font-size: 11.5px; }

      /* --- Lịch sử điều phối --- */
      .history { margin-top: 24px; border: 1px solid var(--t-line); border-radius: var(--t-radius); background: var(--t-card); box-shadow: var(--t-shadow); overflow: hidden; }
      .history__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--t-line); }
      .history__head strong { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: var(--ink-900); }
      .history__head strong mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--blue-600); }
      .history__sub { display: block; margin-top: 3px; font-size: 12px; color: var(--ink-500); }
      .history__empty { margin: 0; padding: 24px 20px; text-align: center; color: var(--ink-500); font-size: 12.5px; }

      .modal__desc { margin: 0 0 16px; color: var(--ink-500); }
      .modal__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .modal__hint { display: flex; align-items: center; gap: 6px; margin: 14px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--amber-50); color: #9a6a12; font-size: 12.5px; font-weight: 600; }
      .modal__hint mat-icon { font-size: 16px; width: 16px; height: 16px; }

      @media (max-width: 1200px) {
        .board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 1080px) {
        .modal__grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 768px) {
        .board { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class DispatchBoardPageComponent implements OnInit {
  /** Giữ tham chiếu service i18n; `t` là hàm dịch cho template. */
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly appMessages = inject(AppMessageService);

  protected readonly historyColumns = computed<SgTableColumn[]>(() => [
    { key: 'time', label: this.t('ui.dispatchHistory.colTime') },
    { key: 'actor', label: this.t('ui.dispatchHistory.colActor') },
    { key: 'action', label: this.t('ui.dispatchHistory.colAction') },
    { key: 'dossier', label: this.t('ui.dispatchHistory.colDossier') },
    { key: 'plate', label: this.t('ui.common.plateNumber') },
    { key: 'from', label: this.t('ui.dispatchHistory.colFrom') },
    { key: 'to', label: this.t('ui.dispatchHistory.colTo') },
  ]);

  /** SG-144 — bộ lọc chốt được thay bằng khoảng ngày bắt đầu hồ sơ + ô tìm kiếm. */
  protected filters = { search: '', from: '', to: '' };

  protected readonly board = signal<DispatchBoard | null>(null);
  protected readonly loading = signal(true);
  /** Giữ để bảng điều phối tự hiện trạng thái lỗi tải; thông báo cho người dùng đi qua toast. */
  protected readonly error = signal('');
  /** Hồ sơ đang có thao tác chạy dở — khóa nút của đúng thẻ đó. */
  protected readonly busyDossierId = signal('');

  protected readonly yards = signal<YardSummary[]>([]);
  protected readonly yardDetail = signal<YardDetail | null>(null);

  /** Vài dòng lịch sử điều phối gần nhất, hiển thị gập inline (F33). */
  protected readonly history = signal<DispatchHistoryEntry[]>([]);

  protected readonly assignTarget = signal<DispatchCard | null>(null);
  protected readonly assignError = signal('');
  protected readonly assignSubmitting = signal(false);
  protected draft: AssignDraft = { ...EMPTY_ASSIGN };

  /** Cột và thứ tự thẻ do API trả — web không sắp lại. */
  protected readonly columns = computed(() => this.board()?.columns ?? []);

  // Gate theo đúng hành động/endpoint (BUG lệch quyền A3): Gán mới = POST (dispatch.create),
  // Chuyển vị trí = PATCH (dispatch.update), Gỡ/Trả vị trí = DELETE (dispatch.delete).
  protected readonly canDispatch = computed(() => this.auth.hasPermission(PERMISSION.dispatchUpdate));
  protected readonly canCreateDispatch = computed(() => this.auth.hasPermission(PERMISSION.dispatchCreate));
  protected readonly canDeleteDispatch = computed(() => this.auth.hasPermission(PERMISSION.dispatchDelete));
  protected readonly canCallNext = computed(() =>
    this.auth.hasPermission([PERMISSION.dispatchCreate, PERMISSION.dispatchUpdate, PERMISSION.yardUpdate]),
  );
  protected readonly callingNext = signal(false);

  protected readonly yardOptions = computed<SgSelectOption[]>(() =>
    this.yards().map((yard) => ({ value: yard.id, label: `${yard.code} — ${yard.name} (${yard.occupied}/${yard.capacity})` })),
  );

  /** Chỉ cho chọn ô còn trống, trừ ô mà chính phương tiện này đang đứng. */
  protected readonly slotOptions = computed<SgSelectOption[]>(() => {
    const detail = this.yardDetail();
    if (!detail) return [];
    const current = this.assignTarget()?.assignment;
    const keepCode = current?.yardId === detail.id ? current?.slotCode || '' : '';
    const options = freeSlots(detail).map((slot) => ({
      value: slot.code,
      label: this.t('ui.dispatch.slotOption', { code: slot.code }),
    }));
    if (keepCode && !options.some((option) => option.value === keepCode)) {
      options.unshift({ value: keepCode, label: this.t('ui.dispatch.slotOptionCurrent', { code: keepCode }) });
    }
    return options;
  });

  ngOnInit(): void {
    this.load();
    this.loadCatalogs();
    this.loadHistory();
  }

  // --- Hiển thị --------------------------------------------------------------

  protected statusLabel(status: string): string {
    return dossierStatusLabel(status, this.t);
  }

  protected statusTone(status: string): string {
    return dossierStatusTone(status);
  }

  /**
   * Sắc thái tiêu đề cột theo thứ tự — dựng lại dáng "kanban" của mockup (chờ → làn →
   * bãi → sẵn sàng). Chỉ là màu trình bày, không mang ý nghĩa nghiệp vụ; cột vẫn do API trả.
   */
  protected columnTone(index: number): string {
    return COLUMN_TONES[index % COLUMN_TONES.length];
  }

  /** Thời gian ĐÃ chờ — không phải thời gian còn lại (không có SLA, điểm D1). */
  protected waiting(card: DispatchCard): string {
    return formatElapsed(card.waitingSeconds, this.t);
  }

  protected positionOf(card: DispatchCard): string {
    return assignmentSummary(card.assignment, this.yardName(card.assignment?.yardId || ''), this.t);
  }

  private yardName(yardId: string): string {
    return this.yards().find((yard) => yard.id === yardId)?.name || '';
  }

  protected slotHint(): string {
    if (!this.draft.yardId) return this.t('ui.dispatch.slotHintNoYard');
    if (!this.slotOptions().length) return this.t('ui.dispatch.slotHintFull');
    return this.t('ui.dispatch.slotHintOk');
  }

  /**
   * Lý do vị trí đang soạn chưa hợp lệ — khớp đúng luật server
   * (`dispatch-placement.rules.ts`), trả **khóa i18n** hoặc `null` khi hợp lệ. Dùng cho cả
   * `[disabled]` nút Lưu lẫn hint tại chỗ để không bấm Lưu rồi mới nhận 400.
   */
  protected assignInvalidReason(): MessageKey | null {
    const hasYard = !!this.draft.yardId;
    const hasSlot = !!this.draft.slotCode;

    if (!hasYard && !hasSlot) return 'ui.dispatch.needPosition';
    if (hasSlot && !hasYard) return 'ui.dispatch.slotNeedsYard';
    if (hasYard && !hasSlot) {
      // Bãi đã chọn không còn ô trống → không thể thỏa "chọn bãi phải chọn ô"; nói rõ bãi đầy.
      if (this.yardDetail() && !this.slotOptions().length) return 'ui.dispatch.slotHintFull';
      return 'ui.dispatch.yardNeedsSlot';
    }
    return null;
  }

  // --- Lịch sử điều phối (F33) -----------------------------------------------

  protected columnTitle(column: { key?: string; label?: string }): string {
    const key = (column?.key || '').toLowerCase();
    const raw = normalizeText(column?.label);

    if (key.includes('waiting') || raw.includes('cho dieu phoi')) return this.t('ui.dispatch.colWaiting');
    if (key.includes('inspected') || key.includes('done') || raw.includes('da kiem tra')) return this.t('ui.dispatch.colInspected');
    if (key.includes('inspecting') || key.includes('processing') || raw.includes('kiem tra')) return this.t('ui.dispatch.colInspection');

    return column?.label || '';
  }

  protected formatAt(at: string): string {
    return formatDateTime(at);
  }

  protected actionLabel(action: string): string {
    return dispatchHistoryActionLabel(action, this.t);
  }

  protected roleLabel(role: string | null | undefined): string {
    return actorRoleLabel(role, this.t);
  }

  protected place(snapshot: DispatchPlacementSnapshot | null): string {
    return placementLabel(snapshot, this.t);
  }

  // --- Gán vị trí ------------------------------------------------------------

  protected openAssign(card: DispatchCard): void {
    this.assignError.set('');
    this.assignTarget.set(card);
    this.draft = {
      yardId: card.assignment?.yardId || '',
      slotCode: card.assignment?.slotCode || '',
    };
    this.yardDetail.set(null);
    if (this.draft.yardId) this.loadYardDetail(this.draft.yardId);
  }

  protected closeAssign(): void {
    this.assignTarget.set(null);
    this.assignError.set('');
    this.draft = { ...EMPTY_ASSIGN };
    this.yardDetail.set(null);
  }

  protected chooseYard(id: string): void {
    this.draft.yardId = id;
    this.draft.slotCode = '';
    this.yardDetail.set(null);
    if (id) this.loadYardDetail(id);
  }

  private loadYardDetail(id: string): void {
    this.api.getYard(id).subscribe({
      next: (detail) => this.yardDetail.set(detail),
      error: () => {
        this.yardDetail.set(null);
        this.assignError.set(this.t('ui.dispatch.yardLoadFailed'));
      },
    });
  }

  protected submitAssign(): void {
    const card = this.assignTarget();
    if (!card) return;

    const position = {
      yardId: this.draft.yardId || undefined,
      slotCode: this.draft.slotCode || undefined,
    };
    const invalid = this.assignInvalidReason();
    if (invalid) {
      // Lỗi validate vị trí gán → hiện ngay trong hộp thoại + toast tổng.
      this.assignError.set(this.t(invalid));
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      return;
    }

    this.assignSubmitting.set(true);
    this.assignError.set('');

    const request = card.assignment?.id
      ? this.api.updateDispatchAssignment(card.assignment.id, position)
      : this.api.createDispatchAssignment({ dossierId: card.dossierId, ...position });

    request.subscribe({
      next: () => {
        this.assignSubmitting.set(false);
        this.closeAssign();
        this.load(true);
        this.loadCatalogs();
        this.loadHistory();
        this.appMessages.showKey('ui.dispatch.assigned', 'success', { plate: card.plateNumber, code: card.code });
      },
      error: (error: unknown) => {
        this.assignSubmitting.set(false);
        this.assignError.set(this.assignErrorMessage(error));
      },
    });
  }

  /**
   * 409 = vị trí đã có phương tiện khác, hoặc xe đã được gán chỗ khác (F29, F31).
   * Ưu tiên thông báo của API; chỉ dùng câu dự phòng khi API không gửi `message`.
   */
  private assignErrorMessage(error: unknown): string {
    const status = (error as { status?: number })?.status || 0;
    const message = extractErrorMessage(error);
    if (status === 409) return message || this.t('ui.dispatch.conflict');
    if (status === 400) return message || this.t('ui.dispatch.invalid');
    return message || this.t('ui.dispatch.saveFailed');
  }

  protected clearAssignment(card: DispatchCard): void {
    const id = card.assignment?.id;
    if (!id) return;
    this.busyDossierId.set(card.dossierId);
    this.api.deleteDispatchAssignment(id).subscribe({
      next: () => {
        this.busyDossierId.set('');
        this.load(true);
        this.loadCatalogs();
        this.loadHistory();
        this.appMessages.showKey('ui.dispatch.cleared', 'success', { plate: card.plateNumber });
      },
      error: (error: unknown) => {
        this.busyDossierId.set('');
        this.appMessages.show(extractErrorMessage(error) || this.t('ui.dispatch.clearFailed'), 'error');
      },
    });
  }

  // --- Gọi số tiếp theo (UI-08 · SG-60) ------------------------------------

  protected callNext(): void {
    this.callingNext.set(true);
    this.api
      .callNextDispatch({
        from: this.filters.from || undefined,
        to: this.filters.to || undefined,
      })
      .subscribe({
        next: (result) => {
          this.callingNext.set(false);
          if (result.called) {
            this.appMessages.showKey('ui.dispatch.callSuccess', 'success', {
              ticket: result.ticketCode || (result.ticketNumber !== null && result.ticketNumber !== undefined ? String(result.ticketNumber) : ''),
              plate: result.plateNumber || result.dossierCode || '',
            });
            this.reload();
          } else {
            this.appMessages.showKey('ui.dispatch.callEmpty', 'info');
          }
        },
        error: (error: unknown) => {
          this.callingNext.set(false);
          this.appMessages.show(extractErrorMessage(error) || this.t('ui.dispatch.callFailed'), 'error');
        },
      });
  }

  protected callSpecific(card: DispatchCard): void {
    this.busyDossierId.set(card.dossierId);
    this.api
      .callNextDispatch({
        dossierId: card.dossierId,
        from: this.filters.from || undefined,
        to: this.filters.to || undefined,
      })
      .subscribe({
        next: (result) => {
          this.busyDossierId.set('');
          if (result.called) {
            this.appMessages.showKey('ui.dispatch.callSuccess', 'success', {
              ticket: result.ticketCode || (result.ticketNumber !== null && result.ticketNumber !== undefined ? String(result.ticketNumber) : card.ticketCode || (card.ticketNumber !== null ? String(card.ticketNumber) : '')),
              plate: result.plateNumber || card.plateNumber || card.code,
            });
            this.reload();
          }
        },
        error: (error: unknown) => {
          this.busyDossierId.set('');
          this.appMessages.show(extractErrorMessage(error) || this.t('ui.dispatch.callFailed'), 'error');
        },
      });
  }

  protected onFromChange(val: string): void {
    this.filters.from = val ?? '';
    this.reload();
  }

  protected onToChange(val: string): void {
    this.filters.to = val ?? '';
    this.reload();
  }

  // --- Tải dữ liệu -----------------------------------------------------------

  protected reset(): void {
    this.filters.search = '';
    this.filters.from = '';
    this.filters.to = '';
    this.reload();
  }

  protected reload(): void {
    this.load();
    this.loadCatalogs();
    this.loadHistory();
  }

  private load(silent = false): void {
    const search = (this.filters.search || '').trim();
    const from = (this.filters.from || '').trim();
    const to = (this.filters.to || '').trim();
    if (from && to && from > to) {
      if (silent) return;
      this.board.set(null);
      this.loading.set(false);
      this.error.set(this.t('ui.dispatch.invalidDateRange'));
      this.appMessages.showKey('ui.dispatch.invalidDateRange', 'error');
      return;
    }
    if (!silent) this.loading.set(true);
    this.error.set('');
    const payload: DispatchBoardFilters = {};
    if (search) payload.search = search;
    if (from) payload.from = from;
    if (to) payload.to = to;
    this.api
      .getDispatchBoard(payload)
      .subscribe({
        next: (data) => {
          this.loading.set(false);
          this.board.set(data ?? null);
        },
        error: () => {
          this.loading.set(false);
          // Tải lại im lặng sau một hành động ĐÃ THÀNH CÔNG (gán/chuyển/bỏ vị trí/cấp số): giữ nguyên
          // bảng đang hiển thị, KHÔNG bung toast đỏ. Chỉ lần tải đầu (không im lặng) mới hiện lỗi.
          if (silent) return;
          this.board.set(null);
          this.error.set(this.t('ui.dispatch.loadFailed'));
          this.appMessages.showKey('ui.dispatch.loadFailed', 'error');
        },
      });
  }

  /** Danh mục bãi cho hộp thoại gán vị trí — lỗi ở đây không chặn xem bảng. */
  private loadCatalogs(): void {
    this.api.getYards().subscribe({ next: (list) => this.yards.set(list || []), error: () => this.yards.set([]) });
  }

  private loadHistory(): void {
    if (typeof this.api.getDispatchHistory !== 'function') return;
    this.api.getDispatchHistory({
      page: 1,
      pageSize: 8,
      ...(this.filters.from ? { from: this.filters.from } : {}),
      ...(this.filters.to ? { to: this.filters.to } : {}),
    }).subscribe({
      next: (page) => this.history.set(page?.items ?? []),
      error: () => this.history.set([]),
    });
  }
}
