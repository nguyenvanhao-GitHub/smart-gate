import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { PERMISSION } from '../../../core/auth/access-control.model';
import { AuthService } from '../../../core/auth/auth.service';
import { DispatchCard } from '../../../core/models/dispatch.model';
import { extractErrorMessage } from '../../../core/forms/field-errors';
import {
  YardDetail,
  YardSlot,
  YardSummary,
  freeSlots,
  inspectionStatusLabel,
  inspectionStatusTone,
  nextInspectionStatus,
  slotDisplayStatus,
  yardOccupancyPercent,
  yardSlotStatusLabel,
  yardSlotStatusTone,
} from '../../../core/models/yard.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { I18nService } from '../../../core/i18n/i18n.service';

/** Icon material cho ô đỗ theo trạng thái hiển thị (tra theo mã ASCII, không dò chuỗi tiếng Việt). */
const SLOT_ICONS: Record<string, string> = {
  FREE: 'add',
  OCCUPIED: 'local_shipping',
  OVERDUE: 'warning',
  MAINTENANCE: 'build',
};

/**
 * UI-10 — Quản lý kho bãi.
 *
 * Theo SRS UI-10 màn hình gồm: **sơ đồ vị trí** (lưới ô đỗ), **trạng thái trống/có xe**,
 * **chi tiết xe – vị trí** và thao tác **chuyển vị trí / hoàn thành**.
 *
 * Bố cục bám mockup MH10 (`HTML/kho-bai-vi-tri.html`): 2 cột [danh sách khu | lưới vị trí];
 * bấm một ô mở **hộp thoại chi tiết** (`sg-modal`) chứ không phải panel cạnh lưới. Nội dung
 * hộp thoại đổi theo trạng thái ô (trống / bảo trì / có xe) đúng mẫu MH10.
 *
 * Ô **trống** dựng **biểu mẫu gán thật**: chọn một hồ sơ đang chờ bố trí (cột `waiting` của
 * `GET /dispatch/board`) rồi `POST /dispatch/assignments`. Không nhập biển số tự do — nguồn hồ
 * sơ là dữ liệu thật của bảng điều phối. Biểu mẫu chỉ hiện khi có quyền `dispatch.update`.
 *
 * Quy tắc nghiệp vụ (F42–F44): 1 vị trí = 1 xe. Chuyển sang ô đã có xe khác thì API trả
 * 409 — màn hình hiện nguyên thông báo, không nuốt lỗi.
 *
 * Contract: `GET /yards/:id` trả `assignment.id` trong từng ô, nên *chuyển vị trí* dùng
 * `PATCH /dispatch/assignments/:id`. **Đừng đổi sang `POST`** — xe đang đứng ở ô cũ nên
 * tạo mới sẽ bị chỉ mục "một xe không nằm ở hai vị trí" chặn bằng 409, chuyển ô không bao
 * giờ thành công. *Hoàn thành* dùng `POST /yards/:id/slots/:slotCode/actions/release`.
 */
@Component({
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.yard.mapTitle') }}</h1>
        <p class="sub">{{ t('ui.yard.mapSubtitle') }}</p>
      </div>
      <button type="button" sgButton="secondary" [disabled]="loading()" (click)="reload()">
        <mat-icon fontSet="material-icons-round">refresh</mat-icon>{{ loading() ? t('ui.common.loadingShort') : t('ui.common.reload') }}
      </button>
    </section>

    <section class="stats" [attr.aria-label]="t('ui.yard.kpiAria')">
      <article class="kpi" data-tone="total">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">warehouse</mat-icon></span>
        <div class="kpi__body"><strong>{{ totalCapacity() }}</strong><span>{{ t('ui.yard.totalCapacity') }}</span></div>
      </article>
      <article class="kpi" data-tone="processing">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">inventory_2</mat-icon></span>
        <div class="kpi__body"><strong>{{ totalOccupied() }}</strong><span>{{ t('ui.yard.inUse') }}</span></div>
      </article>
      <article class="kpi" data-tone="done">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">check_circle</mat-icon></span>
        <div class="kpi__body"><strong>{{ totalFree() }}</strong><span>{{ t('ui.yard.free') }}</span></div>
      </article>
      <article class="kpi" data-tone="danger">
        <span class="kpi__ico"><mat-icon fontSet="material-icons-round">warning</mat-icon></span>
        <div class="kpi__body"><strong>{{ totalOverdue() }}</strong><span>{{ t('ui.yard.overdueKpi') }}</span></div>
      </article>
    </section>

    <div class="shell">
      <aside class="zones">
        <sg-card [title]="t('ui.yard.zonesTitleCount', { count: yards().length })">
          <ul class="zonelist" [attr.aria-label]="t('ui.yard.tabsAria')">
            @if (yards().length) {
              <li>
                <button
                  type="button"
                  class="zone"
                  [class.zone--active]="allMode()"
                  [class.zone--warn]="totalOverdue() > 0"
                  [attr.aria-current]="allMode()"
                  (click)="selectAllZones()"
                >
                  <span class="zone__top">
                    <span class="zone__name">{{ t('ui.yard.allZones') }}</span>
                    <span class="zone__count">{{ totalOccupied() }}/{{ totalCapacity() }}</span>
                  </span>
                  <span class="zone__bar"><span [style.width.%]="totalPercent()"></span></span>
                </button>
              </li>
            }
            @for (yard of yards(); track yard.id) {
              <li>
                <button
                  type="button"
                  class="zone"
                  [class.zone--active]="!allMode() && selectedYardId() === yard.id"
                  [class.zone--warn]="(yard.overdue || 0) > 0"
                  [attr.aria-current]="!allMode() && selectedYardId() === yard.id"
                  (click)="selectYard(yard.id)"
                >
                  <span class="zone__top">
                    <span class="zone__name">{{ yard.code }} — {{ yard.name }}</span>
                    <span class="zone__count">{{ yard.occupied }}/{{ yard.capacity }}</span>
                  </span>
                  <span class="zone__bar"><span [style.width.%]="zonePercent(yard)"></span></span>
                </button>
              </li>
            } @empty {
              <li class="state">{{ t('ui.yard.noYards') }}</li>
            }
          </ul>
        </sg-card>
      </aside>

      <sg-card [flush]="true">
        <div class="body">
        @if (loading()) {
          <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.yard.loading') }}</p>
        } @else if (error()) {
          <p class="state">{{ t('ui.yard.displayError') }}</p>
        } @else if (detail()) {
          @if (detail(); as yard) {
          <div class="mapbox">
            <ul class="legend">
              <li><span class="dot" data-status="FREE"></span>{{ t('ui.yard.slotFREE') }}</li>
              <li><span class="dot" data-status="OCCUPIED"></span>{{ t('ui.yard.slotOCCUPIED') }}</li>
              <li><span class="dot" data-status="OVERDUE"></span>{{ t('ui.yard.slotOVERDUE') }}</li>
              <li><span class="dot" data-status="MAINTENANCE"></span>{{ t('ui.yard.slotMAINTENANCE') }}</li>
            </ul>

            <div class="grid-head">
              <div class="grid-head__titles">
                <h2 class="grid-title">{{ t('ui.yard.mapHeading', { name: yard.name }) }}</h2>
                <p class="grid-sub">{{ t('ui.yard.gridCount', { count: visibleSlots().length }) }}</p>
              </div>
              <label class="search">
                <mat-icon fontSet="material-icons-round">search</mat-icon>
                <input
                  type="search"
                  [attr.aria-label]="t('ui.yard.searchAria')"
                  [placeholder]="t('ui.yard.searchPlaceholder')"
                  [value]="search()"
                  (input)="onSearch($event)"
                />
                @if (search()) {
                  <button type="button" class="search__clear" [attr.aria-label]="t('ui.common.clearKeyword')" (click)="clearSearch()">
                    <mat-icon fontSet="material-icons-round">close</mat-icon>
                  </button>
                }
              </label>
            </div>

            <div class="slots" role="list">
              @for (slot of visibleSlots(); track slot.yardId ? slot.yardId + '/' + slot.code : slot.code) {
                <button
                  type="button"
                  role="listitem"
                  class="slot"
                  [attr.data-status]="displayStatus(slot)"
                  [class.slot--active]="selectedSlotCode() === slot.code"
                  [attr.aria-label]="slotAriaLabel(slot)"
                  [attr.aria-pressed]="selectedSlotCode() === slot.code"
                  (click)="selectSlot(slot)"
                >
                  <mat-icon class="slot__ico" fontSet="material-icons-round" aria-hidden="true">{{ slotIcon(displayStatus(slot)) }}</mat-icon>
                  <strong>{{ slot.code }}</strong>
                  <span class="slot__info">{{ slotInfo(slot) }}</span>
                </button>
              } @empty {
                <p class="state">{{ search() ? t('ui.yard.noMatch') : t('ui.yard.noSlots') }}</p>
              }
            </div>

            <p class="summary">
              {{ t('ui.yard.summary', { capacity: yard.capacity, occupied: yard.occupied, percent: percentOf(yard), free: freeCount(yard) }) }}
            </p>
          </div>
          }
        } @else {
          <p class="state"><mat-icon fontSet="material-icons-round">inbox</mat-icon>{{ t('ui.yard.chooseYard') }}</p>
        }
        </div>
      </sg-card>
    </div>

    @if (detailSlot(); as slot) {
      <sg-modal [title]="t('ui.yard.slotDetailTitle', { code: slot.code })" [eyebrow]="slotZoneName(slot)" (close)="closeDetail()">
        <dl class="facts">
          <div>
            <dt>{{ t('ui.dossier.status') }}</dt>
            <dd><span class="chip" [attr.data-tone]="statusTone(displayStatus(slot))">{{ statusLabel(displayStatus(slot)) }}</span></dd>
          </div>
          @if (slot.assignment; as vehicle) {
            <div><dt>{{ t('ui.yard.plateOrContainer') }}</dt><dd>{{ vehicle.plateNumber }}</dd></div>
            <div><dt>{{ t('ui.yard.dossierCode') }}</dt><dd><a [routerLink]="['/declarations', vehicle.dossierId]">{{ vehicle.code }}</a></dd></div>
            <div><dt>{{ t('ui.yard.entity') }}</dt><dd>{{ vehicle.entity || '—' }}</dd></div>
            <div><dt>{{ t('ui.yard.since') }}</dt><dd>{{ vehicle.since ? (vehicle.since | date: 'dd/MM/yyyy HH:mm') : '—' }}</dd></div>
            <div>
              <dt>{{ t('ui.yard.expectedDeparture') }}</dt>
              <dd [class.overdue]="slot.overdue">
                {{ vehicle.expectedDeparture ? (vehicle.expectedDeparture | date: 'dd/MM/yyyy HH:mm') : '—' }}
                @if (slot.overdue) { <span class="chip" data-tone="danger">{{ t('ui.yard.overdueBadge') }}</span> }
              </dd>
            </div>
            <div>
              <dt>{{ t('ui.yard.inspectionLabel') }}</dt>
              <dd><span class="chip" [attr.data-tone]="inspectionTone(vehicle.inspectionStatus)">{{ inspectionLabel(vehicle.inspectionStatus) }}</span></dd>
            </div>
            @if (vehicle.inspectionUpdatedAt) {
              <div><dt>{{ t('ui.yard.inspectionUpdatedAt') }}</dt><dd>{{ vehicle.inspectionUpdatedAt | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
            }
          } @else if (slot.status === 'MAINTENANCE') {
            <div><dt>{{ t('ui.yard.noteLabel') }}</dt><dd>{{ t('ui.yard.maintenanceNote') }}</dd></div>
          }
        </dl>

        @if (slot.assignment) {
          @if (!nextInspection(slot.assignment.inspectionStatus)) {
            <p class="modal-hint">{{ t('ui.yard.inspectionDone') }}</p>
          }
        } @else if (slot.status !== 'MAINTENANCE') {
          <!-- Ô trống: biểu mẫu gán hồ sơ đang chờ bố trí (chỉ khi có quyền điều phối). -->
          @if (canAssign()) {
            <div class="assign">
              <sg-form-field [label]="t('ui.yard.assignDossierLabel')">
                @if (waitingLoading()) {
                  <p class="assign__state">{{ t('ui.yard.assignLoading') }}</p>
                } @else if (!waitingOptions().length) {
                  <p class="assign__state">{{ t('ui.yard.assignEmpty') }}</p>
                } @else {
                  <sg-select
                    [ariaLabel]="t('ui.yard.assignDossierLabel')"
                    [placeholder]="t('ui.yard.assignPlaceholder')"
                    [options]="waitingOptions()"
                    [value]="assignDossierId()"
                    (valueChange)="assignDossierId.set($event)"
                  />
                }
              </sg-form-field>
            </div>
          } @else {
            <p class="modal-hint">{{ t('ui.yard.freeHint') }}</p>
          }
        }

        <div modal-footer class="modal-actions">
          <button type="button" sgButton="secondary" (click)="closeDetail()">{{ t('ui.common.close') }}</button>
          @if (slot.assignment) {
            <!-- Kiểm tra/tập kết và giải phóng ô là thao tác KHO BÃI → giữ quyền yard.update. -->
            @if (canManage()) {
              @if (nextInspection(slot.assignment.inspectionStatus); as next) {
                <button type="button" sgButton="secondary" [disabled]="busy()" (click)="advanceInspection(slot, next)">
                  <mat-icon fontSet="material-icons-round">arrow_forward</mat-icon>{{ t('ui.yard.inspectionAdvance', { status: inspectionLabel(next) }) }}
                </button>
              }
              <button type="button" sgButton="danger" [disabled]="busy()" (click)="complete(slot)">
                <mat-icon fontSet="material-icons-round">logout</mat-icon>{{ t('ui.yard.releaseSlot') }}
              </button>
            }
            <!-- Chuyển ô = PATCH bản ghi điều phối → cần đúng quyền dispatch.update, không phải yard.update. -->
            @if (canMoveDispatch()) {
              <button type="button" sgButton="secondary" [disabled]="busy()" (click)="openMove(slot)">
                <mat-icon fontSet="material-icons-round">swap_horiz</mat-icon>{{ t('ui.yard.move') }}
              </button>
            }
          } @else if (slot.status === 'MAINTENANCE') {
            @if (canManage()) {
              <button type="button" sgButton [disabled]="busy()" (click)="unlockSlot(slot)">
                <mat-icon fontSet="material-icons-round">lock_open</mat-icon>{{ t('ui.yard.unlock') }}
              </button>
            }
          } @else {
            @if (canManage()) {
              <button type="button" sgButton="secondary" [disabled]="busy()" (click)="lockSlot(slot)">
                <mat-icon fontSet="material-icons-round">lock</mat-icon>{{ t('ui.yard.lock') }}
              </button>
            }
            @if (canAssign()) {
              <button type="button" sgButton [disabled]="busy() || !assignDossierId()" (click)="submitAssign(slot)">
                <mat-icon fontSet="material-icons-round">add_location_alt</mat-icon>{{ t('ui.yard.assignSubmit') }}
              </button>
            }
          }
        </div>
      </sg-modal>
    }

    @if (moveTarget(); as slot) {
      <sg-modal [title]="t('ui.yard.moveTitle', { plate: slot.assignment?.plateNumber })" [ariaLabel]="t('ui.yard.moveAria')" (close)="closeMove()">
        <p class="modal__desc">
          {{ t('ui.yard.moveDescPrefix') }} <strong>{{ slot.code }}</strong> — {{ t('ui.yard.moveDescSuffix', { dossier: slot.assignment?.code }) }}
        </p>

        <div class="modal__grid">
          <sg-form-field [label]="t('ui.yard.targetYard')" [required]="true">
            <sg-select [ariaLabel]="t('ui.yard.targetYard')" [placeholder]="t('ui.yard.chooseTargetYard')" [options]="yardOptions()" [value]="moveYardId()" (valueChange)="chooseMoveYard($event)" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.yard.targetSlot')" [required]="true" [hint]="moveSlotHint()" [error]="moveError()">
            <sg-select [ariaLabel]="t('ui.yard.targetSlot')" [placeholder]="t('ui.yard.chooseFreeSlot')" [options]="moveSlotOptions()" [value]="moveSlotCode()" (valueChange)="moveSlotCode.set($event)" />
          </sg-form-field>
        </div>

        <div modal-footer class="modal-actions">
          <button type="button" sgButton="secondary" [disabled]="moveSubmitting()" (click)="closeMove()">{{ t('ui.yard.moveBack') }}</button>
          <button type="button" sgButton [disabled]="moveSubmitting()" (click)="submitMove()">
            {{ moveSubmitting() ? t('ui.yard.moving') : t('ui.yard.move') }}
          </button>
        </div>
      </sg-modal>
    }
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ mẫu MH10 (kho-bai-vi-tri.html), khoanh vùng trong :host
         nên không rò ra token --sg-* toàn cục. */
      :host {
        display: block;
        --blue-600: #2f6fed;
        --blue-500: #4a84f2;
        --blue-50: #eef3fe;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --amber-500: #e0a72e;
        --amber-50: #fbf3e2;
        --red-500: #e5484d;
        --red-50: #fdeced;
        --teal-600: #0f9488;
        --ink-900: #152040;
        --ink-700: #3d4a6b;
        --ink-500: #7885a3;
        --t-line: #e6e9f3;
        --t-bg: #f4f6fb;
        --t-card: #ffffff;
        --t-radius: 14px;
        --t-shadow: 0 1px 2px rgba(20, 30, 60, 0.04), 0 6px 16px rgba(20, 30, 60, 0.05);
      }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
      .head h1 { margin: 0; font-size: 20px; font-weight: 700; color: var(--ink-900); }
      .head .sub { margin: 4px 0 0; color: var(--ink-500); font-size: 13px; }
      .feedback { display: block; margin-bottom: 16px; }

      .shell { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 20px; align-items: start; }
      .zones { position: sticky; top: 20px; }
      .zonelist { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .zone {
        display: grid;
        gap: 6px;
        width: 100%;
        padding: 11px 12px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }
      .zone:hover { background: var(--t-bg); }
      .zone--active { background: var(--blue-50); }
      .zone__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .zone__name { color: var(--ink-900); font-weight: 700; font-size: 13px; }
      .zone--active .zone__name { color: var(--blue-600); }
      .zone__count { color: var(--ink-500); font-size: 11px; white-space: nowrap; }
      .zone__bar { display: block; height: 6px; border-radius: 4px; background: var(--t-line); overflow: hidden; }
      .zone__bar > span { display: block; height: 100%; border-radius: 4px; background: var(--blue-600); }
      .zone--warn .zone__bar > span { background: var(--red-500); }

      /* Thẻ thống kê có ô icon vuông bo góc như mẫu MH10. */
      .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
      .kpi {
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 16px 18px;
        border: 1px solid var(--t-line);
        border-radius: var(--t-radius);
        background: var(--t-card);
        box-shadow: var(--t-shadow);
      }
      .kpi__ico { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0; }
      .kpi__ico mat-icon { font-size: 20px; width: 20px; height: 20px; }
      .kpi__body strong { display: block; font-size: 18px; font-weight: 700; color: var(--ink-900); line-height: 1.2; }
      .kpi__body span { display: block; margin-top: 1px; color: var(--ink-500); font-size: 11.5px; }
      .kpi[data-tone='total'] .kpi__ico { background: var(--blue-50); color: var(--blue-600); }
      .kpi[data-tone='processing'] .kpi__ico { background: var(--amber-50); color: var(--amber-500); }
      .kpi[data-tone='done'] .kpi__ico { background: var(--green-50); color: var(--green-600); }
      .kpi[data-tone='danger'] .kpi__ico { background: var(--red-50); color: var(--red-500); }

      /* Thẻ lưới vị trí: legend + tiêu đề + lưới ô, mỗi khối tự quản padding như mẫu MH10. */
      .body { padding: 0; }
      .mapbox { display: block; }
      .legend { display: flex; gap: 14px; margin: 0; padding: 12px 16px; list-style: none; color: var(--ink-700); font-size: 11.5px; flex-wrap: wrap; border-bottom: 1px solid var(--t-line); }
      .legend li { display: inline-flex; align-items: center; gap: 6px; }
      .dot { display: inline-block; width: 12px; height: 12px; border-radius: 4px; background: #fff; border: 1.5px solid var(--t-line); }
      .dot[data-status='OCCUPIED'] { background: var(--blue-500); border-color: var(--blue-500); }
      .dot[data-status='OVERDUE'] { background: var(--red-500); border-color: var(--red-500); }
      .dot[data-status='MAINTENANCE'] { background: var(--amber-500); border-color: var(--amber-500); }

      .grid-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px; }
      .grid-head__titles { min-width: 0; }
      .grid-title { margin: 0; font-size: 14.5px; font-weight: 700; color: var(--ink-900); }
      .grid-sub { margin: 2px 0 0; color: var(--ink-500); font-size: 12px; }
      .search {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: 360px;
        max-width: 100%;
        min-width: 320px;
        padding: 8px 12px;
        border: 1px solid var(--t-line);
        border-radius: 9px;
        background: var(--t-bg);
        color: var(--ink-500);
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
      }
      .search:focus-within {
        border-color: var(--blue-500);
        box-shadow: 0 0 0 3px rgba(74, 132, 242, 0.15);
        background: #fff;
      }
      .search mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--ink-500); flex-shrink: 0; }
      .search input {
        flex: 1 1 auto;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        font-family: inherit;
        font-size: 12.5px;
        color: var(--ink-900);
      }
      .search input::placeholder { color: var(--ink-500); }
      .search__clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--ink-500);
        cursor: pointer;
        flex-shrink: 0;
      }
      .search__clear:hover { background: rgba(0, 0, 0, 0.06); color: var(--ink-900); }
      .search__clear mat-icon { font-size: 16px; width: 16px; height: 16px; }

      .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; padding: 16px; }
      .slot {
        display: grid;
        justify-items: center;
        gap: 2px;
        min-height: 78px;
        padding: 10px 8px;
        border: 1.5px solid var(--t-line);
        border-radius: 10px;
        background: #fff;
        color: var(--ink-500);
        font-family: inherit;
        text-align: center;
        cursor: pointer;
        transition: transform 0.1s;
      }
      .slot:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(20, 30, 60, 0.08); }
      .slot__ico { font-size: 18px; width: 18px; height: 18px; color: var(--ink-500); }
      .slot[data-status='OCCUPIED'] .slot__ico { color: var(--blue-600); }
      .slot[data-status='OVERDUE'] .slot__ico { color: var(--red-500); }
      .slot[data-status='MAINTENANCE'] .slot__ico { color: var(--amber-500); }
      .slot strong { color: var(--ink-900); font-size: 12.5px; font-weight: 800; }
      .slot__info { font-size: 10px; line-height: 1.4; min-height: 26px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .slot[data-status='OCCUPIED'] { background: var(--blue-50); border-color: var(--blue-500); color: var(--ink-700); }
      .slot[data-status='OVERDUE'] { background: var(--red-50); border-color: var(--red-500); color: var(--ink-700); }
      .slot[data-status='MAINTENANCE'] { background: var(--amber-50); border-color: var(--amber-500); color: var(--ink-700); }
      .slot[data-status='OCCUPIED'] .slot__info, .slot[data-status='OVERDUE'] .slot__info { color: var(--ink-700); font-weight: 600; }
      .slot--active { outline: 2px solid var(--blue-600); outline-offset: 1px; }
      .summary { margin: 0; padding: 0 16px 16px; color: var(--ink-500); font-size: 12px; }

      /* Các dòng chi tiết ô đỗ theo mẫu MH10 (detail-row): nhãn xám trái · giá trị đậm phải, viền phân cách. */
      .facts { display: block; margin: 0; }
      .facts > div { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--t-line); font-size: 12.5px; }
      .facts > div:first-child { border-top: 0; }
      .facts dt { color: var(--ink-500); font-size: 12.5px; }
      .facts dd { margin: 0; text-align: right; color: var(--ink-900); font-weight: 700; overflow-wrap: anywhere; }
      .facts a { color: var(--blue-600); font-weight: 700; text-decoration: none; }
      .facts a:hover { text-decoration: underline; }
      .facts dd.overdue { color: var(--red-500); font-weight: 700; }
      .modal-hint { margin: 12px 0 0; color: var(--ink-500); font-size: 12px; }

      /* Biểu mẫu gán hồ sơ chờ vào ô trống (bám khối "field" của mẫu MH10). */
      .assign { margin-top: 14px; }
      .assign__state { margin: 0; padding: 10px 12px; border: 1px dashed var(--t-line); border-radius: 9px; background: var(--t-bg); color: var(--ink-500); font-size: 12.5px; }

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
      .chip[data-tone='waiting'] { background: var(--amber-50); color: var(--amber-500); }
      .chip[data-tone='done'] { background: var(--green-50); color: var(--green-600); }
      .chip[data-tone='danger'] { background: var(--red-50); color: var(--red-500); }

      .state { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: var(--ink-500); }
      .slots .state { grid-column: 1 / -1; }
      .modal__desc { margin: 0 0 14px; color: var(--ink-500); }
      .modal__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .modal-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--sg-space-3);
        width: 100%;
      }

      @media (max-width: 1000px) {
        .shell { grid-template-columns: 1fr; }
        .zones { position: static; }
        .grid-head { flex-direction: column; align-items: stretch; }
        .search { width: 100%; min-width: 0; }
      }
      @media (max-width: 1080px) {
        .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .modal__grid { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class YardMapPageComponent implements OnInit {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly appMessages = inject(AppMessageService);

  protected readonly yards = signal<YardSummary[]>([]);
  protected readonly detail = signal<YardDetail | null>(null);
  protected readonly selectedYardId = signal('');
  protected readonly selectedSlotCode = signal('');
  protected readonly loading = signal(true);
  /** Giữ để lưới sơ đồ bãi tự hiện trạng thái lỗi của chính nó; thông báo cho người dùng đi qua toast. */
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  /** Hồ sơ đang chờ bố trí (cột `waiting` của bảng điều phối) — nạp một lần khi mở ô trống. */
  private readonly waitingCards = signal<DispatchCard[] | null>(null);
  protected readonly waitingLoading = signal(false);
  /** Hồ sơ được chọn trong biểu mẫu gán của ô trống. */
  protected readonly assignDossierId = signal('');

  /** Ô lọc lưới (mã ô / biển số / mã hồ sơ) — lọc phía client trên bãi đang mở. */
  protected readonly search = signal('');
  /** Chế độ gộp "Tất cả khu vực": `detail()` là sơ đồ tổng hợp mọi bãi. */
  protected readonly allMode = signal(false);

  protected readonly moveTarget = signal<YardSlot | null>(null);
  protected readonly moveYardId = signal('');
  protected readonly moveSlotCode = signal('');
  /** Lỗi validate ô đích khi chuyển vị trí — hiện ngay dưới ô chọn ô đích. */
  protected readonly moveError = signal('');
  protected readonly moveSubmitting = signal(false);
  /** Bãi đích khi chuyển sang bãi khác — bãi hiện tại dùng thẳng `detail()`. */
  private readonly moveYardDetail = signal<YardDetail | null>(null);

  protected readonly canManage = computed(() => this.auth.hasPermission(PERMISSION.yardUpdate));
  /** Quyền gán xe vào ô trống = tạo bản ghi điều phối qua `POST /dispatch/assignments` (dispatch.create). */
  protected readonly canAssign = computed(() => this.auth.hasPermission(PERMISSION.dispatchCreate));
  /** Quyền chuyển ô = cập nhật bản ghi điều phối qua `PATCH /dispatch/assignments/:id` (dispatch.update);
   *  khác quyền kho bãi (`yard.update`) của giải phóng ô / kiểm tra / khóa ô. */
  protected readonly canMoveDispatch = computed(() => this.auth.hasPermission(PERMISSION.dispatchUpdate));

  /** Danh sách hồ sơ chờ bố trí dựng thành lựa chọn cho biểu mẫu gán ô trống. */
  protected readonly waitingOptions = computed<SgSelectOption[]>(() =>
    (this.waitingCards() ?? []).map((card) => ({ value: card.dossierId, label: `${card.code} — ${card.plateNumber}` })),
  );

  protected readonly selectedSlot = computed<YardSlot | null>(() => {
    const code = this.selectedSlotCode();
    if (!code) return null;
    return (this.detail()?.slots || []).find((slot) => slot.code === code) || null;
  });

  /** Ô đang mở hộp thoại chi tiết — ẩn khi hộp "Chuyển vị trí" bật để không chồng 2 modal. */
  protected readonly detailSlot = computed<YardSlot | null>(() => (this.moveTarget() ? null : this.selectedSlot()));

  /** Ô đỗ hiển thị trên lưới sau khi lọc theo từ khóa tìm kiếm. */
  protected readonly visibleSlots = computed<YardSlot[]>(() => {
    const slots = this.detail()?.slots || [];
    const query = this.search().trim().toLowerCase();
    if (!query) return slots;
    return slots.filter((slot) => {
      const plate = slot.assignment?.plateNumber?.toLowerCase() ?? '';
      const dossier = slot.assignment?.code?.toLowerCase() ?? '';
      return slot.code.toLowerCase().includes(query) || plate.includes(query) || dossier.includes(query);
    });
  });

  protected readonly totalCapacity = computed(() => this.yards().reduce((sum, yard) => sum + (yard.capacity || 0), 0));
  protected readonly totalOccupied = computed(() => this.yards().reduce((sum, yard) => sum + (yard.occupied || 0), 0));
  protected readonly totalFree = computed(() => Math.max(0, this.totalCapacity() - this.totalOccupied()));
  protected readonly totalOverdue = computed(() => this.yards().reduce((sum, yard) => sum + (yard.overdue || 0), 0));
  protected readonly totalPercent = computed(() =>
    yardOccupancyPercent({ capacity: this.totalCapacity(), occupied: this.totalOccupied() }),
  );

  protected readonly yardOptions = computed<SgSelectOption[]>(() =>
    this.yards().map((yard) => ({ value: yard.id, label: `${yard.code} — ${yard.name} (${yard.occupied}/${yard.capacity})` })),
  );

  ngOnInit(): void {
    this.loadYards();
  }

  // --- Hiển thị --------------------------------------------------------------

  protected statusLabel(status: string): string {
    return yardSlotStatusLabel(status, this.t);
  }

  protected statusTone(status: string): string {
    return yardSlotStatusTone(status);
  }

  /** Trạng thái hiển thị của ô: OCCUPIED + quá hạn → OVERDUE để tô màu cảnh báo. */
  protected displayStatus(slot: YardSlot): string {
    return slotDisplayStatus(slot);
  }

  /** Icon material của ô theo trạng thái hiển thị (tra theo mã, không dò chuỗi). */
  protected slotIcon(status: string): string {
    return SLOT_ICONS[status] ?? SLOT_ICONS['FREE'];
  }

  /**
   * Dòng thông tin duy nhất trên ô lưới (bám mẫu MH10): ô có xe/quá hạn → biển số;
   * ô trống/bảo trì → nhãn trạng thái.
   */
  protected slotInfo(slot: YardSlot): string {
    const status = this.displayStatus(slot);
    if ((status === 'OCCUPIED' || status === 'OVERDUE') && slot.assignment) return slot.assignment.plateNumber;
    return this.statusLabel(status);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.search.set('');
  }

  // --- Vòng đời kiểm tra / tập kết (F44) -------------------------------------

  protected inspectionLabel(status: string | undefined): string {
    return inspectionStatusLabel(status, this.t);
  }

  protected inspectionTone(status: string | undefined): string {
    return inspectionStatusTone(status);
  }

  /** Trạng thái kiểm tra kế tiếp hợp lệ để dựng nút "Chuyển sang"; `null` khi đã ở bước cuối. */
  protected nextInspection(status: string | undefined): string | null {
    return nextInspectionStatus(status);
  }

  protected percentOf(yard: YardDetail): number {
    return yardOccupancyPercent(yard);
  }

  /** Tỷ lệ lấp đầy của một bãi trong danh sách khu vực — dựng thanh tiến độ. */
  protected zonePercent(yard: YardSummary): number {
    return yardOccupancyPercent(yard);
  }

  protected freeCount(yard: YardDetail): number {
    return freeSlots(yard).length;
  }

  protected slotAriaLabel(slot: YardSlot): string {
    if (slot.status === 'OCCUPIED' && slot.assignment) {
      return this.t('ui.yard.slotAriaOccupied', {
        code: slot.code,
        plate: slot.assignment.plateNumber,
        dossier: slot.assignment.code,
      });
    }
    if (slot.status === 'MAINTENANCE') return this.t('ui.yard.slotAriaMaintenance', { code: slot.code });
    return this.t('ui.yard.slotAriaFree', { code: slot.code });
  }

  /** Tên khu chứa ô cho phụ đề hộp thoại chi tiết (chế độ gộp lấy đúng bãi của ô). */
  protected slotZoneName(slot: YardSlot): string {
    if (slot.yardId) {
      const yard = this.yards().find((item) => item.id === slot.yardId);
      return yard ? `${yard.code} — ${yard.name}` : this.t('ui.yard.allZones');
    }
    return this.detail()?.name ?? '';
  }

  /** Khu chứa ô — chế độ gộp lấy từ `slot.yardId`, chế độ một bãi lấy bãi đang mở. */
  private slotYardId(slot: YardSlot): string {
    return slot.yardId || this.selectedYardId();
  }

  // --- Chọn bãi và ô ---------------------------------------------------------

  protected selectYard(id: string): void {
    if (!this.allMode() && this.selectedYardId() === id) return;
    this.allMode.set(false);
    this.selectedYardId.set(id);
    this.selectedSlotCode.set('');
    this.loadYardDetail(id);
  }

  /** Gộp mọi khu vào một sơ đồ (UI-10). Mỗi ô được gắn `yardId` để thao tác biết ô thuộc bãi nào. */
  protected selectAllZones(): void {
    if (this.allMode()) return;
    this.allMode.set(true);
    this.selectedYardId.set('');
    this.selectedSlotCode.set('');
    this.loadAllZones();
  }

  /** Bấm một ô mở hộp thoại chi tiết ô đó (bám mẫu MH10). Ô trống thì nạp hồ sơ chờ để gán. */
  protected selectSlot(slot: YardSlot): void {
    this.assignDossierId.set('');
    this.selectedSlotCode.set(slot.code);
    if (slot.status === 'FREE' && this.canAssign()) this.loadWaitingDossiers();
  }

  /** Đóng hộp thoại chi tiết ô. */
  protected closeDetail(): void {
    this.selectedSlotCode.set('');
    this.assignDossierId.set('');
  }

  // --- Gán vị trí cho ô trống (F42) ------------------------------------------

  /**
   * Nạp hồ sơ đang chờ bố trí (cột `waiting` của bảng điều phối) để dựng lựa chọn gán.
   * Cache một lần; `refresh()` xóa cache nên lần mở ô trống kế tiếp sẽ nạp lại danh sách mới.
   */
  private loadWaitingDossiers(): void {
    if (this.waitingCards() !== null || this.waitingLoading()) return;
    this.waitingLoading.set(true);
    this.api.getDispatchBoard().subscribe({
      next: (board) => {
        this.waitingLoading.set(false);
        const waiting = (board.columns || []).find((column) => (column.key || '').toUpperCase() === 'WAITING');
        this.waitingCards.set(waiting?.items ?? []);
      },
      error: () => {
        this.waitingLoading.set(false);
        this.waitingCards.set([]);
      },
    });
  }

  /**
   * Gán hồ sơ chờ vào ô trống — `POST /dispatch/assignments`. Ô đã có xe (đua) trả 409;
   * hiện nguyên văn thông báo của API, không nuốt lỗi.
   */
  protected submitAssign(slot: YardSlot): void {
    const dossierId = this.assignDossierId();
    const yardId = this.slotYardId(slot);
    if (!dossierId) {
      this.appMessages.showKey('ui.yard.assignNeedDossier', 'error');
      return;
    }
    if (!yardId) return;

    this.busy.set(true);
    this.api.createDispatchAssignment({ dossierId, yardId, slotCode: slot.code }).subscribe({
      next: () => {
        this.busy.set(false);
        this.selectedSlotCode.set('');
        this.assignDossierId.set('');
        this.refresh();
        this.appMessages.showKey('ui.yard.assigned', 'success', { slot: slot.code });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.appMessages.show(this.assignErrorMessage(error), 'error');
      },
    });
  }

  /** 409 = ô đã có xe (1 vị trí = 1 xe). Ưu tiên nguyên văn thông báo của API. */
  private assignErrorMessage(error: unknown): string {
    const status = (error as { status?: number })?.status || 0;
    const message = extractErrorMessage(error);
    if (status === 409) return message || this.t('ui.yard.assignConflict');
    return message || this.t('ui.yard.assignFailed');
  }

  // --- Chuyển vị trí (F43) ---------------------------------------------------

  protected openMove(slot: YardSlot): void {
    const yardId = this.slotYardId(slot);
    this.moveTarget.set(slot);
    this.moveError.set('');
    this.moveYardId.set(yardId);
    this.moveSlotCode.set('');
    this.moveYardDetail.set(null);
    // Chế độ gộp: `detail()` không phải bãi nguồn nên phải nạp riêng để liệt kê ô trống.
    if (this.allMode() || yardId !== this.selectedYardId()) this.loadMoveYard(yardId);
  }

  protected closeMove(): void {
    this.moveTarget.set(null);
    this.moveError.set('');
    this.moveYardId.set('');
    this.moveSlotCode.set('');
    this.moveYardDetail.set(null);
  }

  protected chooseMoveYard(id: string): void {
    this.moveYardId.set(id);
    this.moveSlotCode.set('');
    this.moveYardDetail.set(null);
    // Khi ô trống của bãi đích lấy thẳng từ `detail()` (bãi đang mở, không ở chế độ gộp) thì khỏi nạp.
    if (!id || (!this.allMode() && id === this.selectedYardId())) return;
    this.loadMoveYard(id);
  }

  /** Nạp sơ đồ một bãi vào `moveYardDetail` để liệt kê ô trống làm đích chuyển. */
  private loadMoveYard(id: string): void {
    if (!id) {
      this.moveYardDetail.set(null);
      return;
    }
    this.api.getYard(id).subscribe({
      next: (yard) => this.moveYardDetail.set(yard),
      error: () => {
        this.moveYardDetail.set(null);
        this.appMessages.showKey('ui.yard.moveTargetLoadFailed', 'error');
      },
    });
  }

  /** Chỉ liệt kê ô còn trống — ô đang có xe không được chọn làm đích. */
  protected moveSlotOptions(): SgSelectOption[] {
    const yard = !this.allMode() && this.moveYardId() === this.selectedYardId() ? this.detail() : this.moveYardDetail();
    const current = this.moveTarget()?.code || '';
    return freeSlots(yard)
      .filter((slot) => slot.code !== current)
      .map((slot) => ({ value: slot.code, label: this.t('ui.dispatch.slotOption', { code: slot.code }) }));
  }

  protected moveSlotHint(): string {
    if (!this.moveYardId()) return this.t('ui.yard.moveSlotHintNoYard');
    if (!this.moveSlotOptions().length) return this.t('ui.yard.moveSlotHintFull');
    return this.t('ui.dispatch.slotHintOk');
  }

  protected submitMove(): void {
    const slot = this.moveTarget();
    // Chuyển ô phải dùng PATCH theo mã bản ghi điều phối. Dùng POST sẽ bị chỉ mục
    // "một xe không nằm ở hai vị trí" chặn bằng 409 — xe đang đứng ở ô cũ.
    const assignmentId = slot?.assignment?.id || '';
    const yardId = this.moveYardId();
    const slotCode = this.moveSlotCode();

    if (!slot || !assignmentId) return;
    if (!yardId || !slotCode) {
      // Lỗi validate ô đích → hiện ngay dưới ô chọn + toast tổng.
      this.moveError.set(this.t('ui.yard.moveNeedTarget'));
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      return;
    }

    this.moveSubmitting.set(true);
    this.moveError.set('');
    this.api.updateDispatchAssignment(assignmentId, { yardId, slotCode }).subscribe({
      next: () => {
        this.moveSubmitting.set(false);
        this.closeMove();
        this.selectedSlotCode.set('');
        this.refresh();
        this.appMessages.showKey('ui.yard.moved', 'success', { plate: slot.assignment?.plateNumber, slot: slotCode });
      },
      error: (error: unknown) => {
        this.moveSubmitting.set(false);
        this.appMessages.show(this.moveErrorMessage(error), 'error');
      },
    });
  }

  /** 409 = ô đích đã có xe khác (1 vị trí = 1 xe). Ưu tiên nguyên văn thông báo của API. */
  private moveErrorMessage(error: unknown): string {
    const status = (error as { status?: number })?.status || 0;
    const message = extractErrorMessage(error);
    if (status === 409) return message || this.t('ui.yard.moveConflict');
    return message || this.t('ui.yard.moveFailed');
  }

  // --- Hoàn thành, rời bãi (F44) ---------------------------------------------

  protected complete(slot: YardSlot): void {
    const yardId = this.slotYardId(slot);
    if (!yardId || !slot.assignment) return;

    this.busy.set(true);
    this.api.releaseYardSlot(yardId, slot.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.selectedSlotCode.set('');
        this.refresh();
        this.appMessages.showKey('ui.yard.released', 'success', { slot: slot.code, plate: slot.assignment?.plateNumber });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.appMessages.show(extractErrorMessage(error) || this.t('ui.yard.releaseFailed'), 'error');
      },
    });
  }

  // --- Khóa / mở lại ô đỗ (F42) ----------------------------------------------

  /** Khóa ô để bảo trì. API trả 409 nếu ô đang có xe — hiện nguyên văn thông báo. */
  protected lockSlot(slot: YardSlot): void {
    const yardId = this.slotYardId(slot);
    if (!yardId) return;

    this.busy.set(true);
    this.api.lockYardSlot(yardId, slot.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.selectedSlotCode.set('');
        this.refresh();
        this.appMessages.showKey('ui.yard.locked', 'success', { slot: slot.code });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.appMessages.show(this.lockErrorMessage(error), 'error');
      },
    });
  }

  /** Mở lại ô đang khóa để đưa vào khai thác. */
  protected unlockSlot(slot: YardSlot): void {
    const yardId = this.slotYardId(slot);
    if (!yardId) return;

    this.busy.set(true);
    this.api.unlockYardSlot(yardId, slot.code).subscribe({
      next: () => {
        this.busy.set(false);
        this.selectedSlotCode.set('');
        this.refresh();
        this.appMessages.showKey('ui.yard.unlocked', 'success', { slot: slot.code });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.appMessages.show(extractErrorMessage(error) || this.t('ui.yard.unlockFailed'), 'error');
      },
    });
  }

  /** 409 = ô đang có xe nên không khóa được. Ưu tiên nguyên văn thông báo của API. */
  private lockErrorMessage(error: unknown): string {
    const status = (error as { status?: number })?.status || 0;
    const message = extractErrorMessage(error);
    if (status === 409) return message || this.t('ui.yard.lockConflict');
    return message || this.t('ui.yard.lockFailed');
  }

  /**
   * Chuyển xe sang trạng thái kiểm tra kế tiếp (F44).
   * API là nơi chặn sai thứ tự (409) — nút chỉ gợi ý bước kế; lỗi hiện nguyên văn, không nuốt.
   */
  protected advanceInspection(slot: YardSlot, status: string): void {
    const assignmentId = slot.assignment?.id || '';
    if (!assignmentId || !status) return;

    this.busy.set(true);
    this.api.updateAssignmentInspection(assignmentId, { status }).subscribe({
      next: () => {
        this.busy.set(false);
        this.refresh();
        this.appMessages.showKey('ui.yard.inspectionUpdated', 'success', { status: this.inspectionLabel(status) });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.appMessages.show(this.inspectionErrorMessage(error), 'error');
      },
    });
  }

  /** 409 = chuyển sai thứ tự bước kiểm tra. Ưu tiên nguyên văn thông báo của API. */
  private inspectionErrorMessage(error: unknown): string {
    const status = (error as { status?: number })?.status || 0;
    const message = extractErrorMessage(error);
    if (status === 409) return message || this.t('ui.yard.inspectionConflict');
    return message || this.t('ui.yard.inspectionFailed');
  }

  // --- Tải dữ liệu -----------------------------------------------------------

  /**
   * Làm mới toàn bộ màn hình: xóa từ khóa tìm kiếm, đặt lại bộ lọc về mặc định (bãi đầu tiên),
   * đóng hộp thoại/ô đang chọn và nạp lại dữ liệu mới nhất từ máy chủ.
   */
  protected reload(): void {
    this.search.set('');
    this.allMode.set(false);
    this.selectedSlotCode.set('');
    this.assignDossierId.set('');
    this.waitingCards.set(null);
    this.loadYards();
  }

  private refresh(): void {
    // Xóa cache hồ sơ chờ để lần mở ô trống kế tiếp lấy danh sách mới (đã trừ hồ sơ vừa gán).
    this.waitingCards.set(null);
    if (this.allMode()) this.reloadAll();
    else this.loadYards(this.selectedYardId());
  }

  private loadYards(keepId = ''): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getYards().subscribe({
      next: (list) => {
        const yards = list || [];
        this.yards.set(yards);
        const nextId = yards.some((yard) => yard.id === keepId) ? keepId : yards[0]?.id || '';
        this.selectedYardId.set(nextId);
        if (!nextId) {
          this.loading.set(false);
          this.detail.set(null);
          return;
        }
        this.loadYardDetail(nextId);
      },
      error: () => {
        this.loading.set(false);
        this.yards.set([]);
        this.detail.set(null);
        this.error.set(this.t('ui.yard.loadFailed'));
        this.appMessages.showKey('ui.yard.loadFailed', 'error');
      },
    });
  }

  /** Làm mới ở chế độ gộp: nạp lại danh sách bãi (KPI/cảnh báo) rồi dựng lại sơ đồ tổng hợp. */
  private reloadAll(): void {
    this.api.getYards().subscribe({
      next: (list) => {
        this.yards.set(list || []);
        this.loadAllZones();
      },
      error: () => {
        this.loading.set(false);
        this.detail.set(null);
        this.error.set(this.t('ui.yard.loadFailed'));
        this.appMessages.showKey('ui.yard.loadFailed', 'error');
      },
    });
  }

  /** Gộp ô đỗ của mọi bãi thành một sơ đồ; mỗi ô gắn `yardId`/`yardCode` để thao tác đúng bãi. */
  private loadAllZones(): void {
    const yards = this.yards();
    if (yards.length === 0) {
      this.loading.set(false);
      this.detail.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    forkJoin(yards.map((yard) => this.api.getYard(yard.id))).subscribe({
      next: (details) => {
        this.loading.set(false);
        const slots: YardSlot[] = [];
        let capacity = 0;
        let occupied = 0;
        details.forEach((yard) => {
          capacity += yard.capacity || 0;
          occupied += yard.occupied || 0;
          yard.slots.forEach((slot) => slots.push({ ...slot, yardId: yard.id, yardCode: yard.code }));
        });
        this.detail.set({ id: '', code: '', name: this.t('ui.yard.allZones'), capacity, occupied, slots });
      },
      error: () => {
        this.loading.set(false);
        this.detail.set(null);
        this.error.set(this.t('ui.yard.detailLoadFailed'));
        this.appMessages.showKey('ui.yard.detailLoadFailed', 'error');
      },
    });
  }

  private loadYardDetail(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getYard(id).subscribe({
      next: (yard) => {
        this.loading.set(false);
        this.detail.set(yard ?? null);
      },
      error: () => {
        this.loading.set(false);
        this.detail.set(null);
        this.error.set(this.t('ui.yard.detailLoadFailed'));
        this.appMessages.showKey('ui.yard.detailLoadFailed', 'error');
      },
    });
  }
}
