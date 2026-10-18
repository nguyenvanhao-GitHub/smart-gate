import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import type { EChartsOption } from 'echarts';
import { dossierStatusLabel, dossierTypeLabel } from '../../../core/models/declaration.model';
import { normalizeText } from '../../../core/models/label.util';
import {
  DashboardAlert,
  DashboardKpi,
  DashboardKpiTrend,
  DashboardOverview,
  DashboardYard,
  alertLevelLabel,
  alertLevelType,
  kpiIcon,
  sumForce,
} from '../../../core/models/dashboard.model';
import type { DashboardDailyPoint } from '../../../core/models/dashboard.model';
import { ApiService } from '../../../core/services/api.service';
import { chartTheme, toneColor } from '../../../shared/charts/chart-theme';
import { SgChartComponent, SgChartTable } from '../../../shared/charts/sg-chart.component';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgDatePickerComponent } from '../../../shared/ui/sg-date-picker.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/message-catalog';

/** Màu token có thể chưa nạp (lúc test) — khi đó để ECharts dùng bảng màu của chính nó. */
function color(tone: string): string | undefined {
  return toneColor(tone) || undefined;
}

/**
 * UI-02 — Dashboard tổng quan.
 *
 * Theo SRS UI-02 màn hình gồm: **KPI hồ sơ/phương tiện**, **biểu đồ theo giờ**,
 * **trạng thái theo lực lượng** và **danh sách cảnh báo**.
 *
 * Điểm cốt lõi để nghiệm thu mốc M3 là **drill-down**: bấm một KPI mở đúng danh sách
 * sinh ra con số đó. Đường dẫn và tham số lấy nguyên từ `kpi.drilldown` do API trả —
 * web **không** tự suy ra từ mã KPI, vì suy sai thì số trên thẻ và số trong danh sách
 * sẽ lệch nhau mà không ai biết.
 *
 * Ngoài bộ chính, trang dựng thêm ba panel từ đúng dữ liệu `GET /dashboard/overview`:
 * donut "Cơ cấu hồ sơ theo trạng thái" (từ `kpis`), sơ đồ TRẠNG THÁI "Tình hình cửa khẩu"
 * (từ `gateYard` — quyết định A0 đã được đảo ngược) và "Cần xử lý sớm" (từ `attention`).
 * Vẫn giữ hai ranh giới chống bịa: **không** vẽ bản đồ địa lý giả, và **không** cảnh báo
 * quá hạn/SLA (điểm D5) — "Cần xử lý sớm" chỉ sắp theo thời gian chờ THẬT, không tính ngưỡng.
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    SgButtonDirective,
    SgChartComponent,
    SgDatePickerComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.dashboard.title') }}</h1>
        @if (generatedAtLabel()) {
          <p class="head__time">{{ t('ui.dashboard.generatedAt', { time: generatedAtLabel() }) }}</p>
        }
      </div>
      <div class="head__filters">
        <sg-date-picker class="head__field" [ariaLabel]="t('ui.common.fromDate')" [value]="filters.from" [(ngModel)]="filters.from" (ngModelChange)="reload()" (valueChange)="reload()" />
        <sg-date-picker class="head__field" [ariaLabel]="t('ui.common.toDate')" [value]="filters.to" [(ngModel)]="filters.to" (ngModelChange)="reload()" (valueChange)="reload()" />
        <button type="button" sgButton="secondary" [disabled]="loading()" (click)="resetFilters()">
          <mat-icon fontSet="material-icons-round">refresh</mat-icon>{{ loading() ? t('ui.common.loadingShort') : t('ui.common.reload') }}
        </button>
      </div>
    </section>

    <section class="kpis" [attr.aria-label]="t('ui.dashboard.kpiAria')">
      @if (loading()) {
        <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.dashboard.loadingKpi') }}</p>
      } @else if (!kpis().length) {
        <p class="state"><mat-icon fontSet="material-icons-round">inbox</mat-icon>{{ t('ui.dashboard.noKpi') }}</p>
      } @else {
        @for (kpi of kpis(); track kpi.key) {
          <button
            type="button"
            class="kpi"
            [attr.data-tone]="kpi.tone || 'idle'"
            [attr.aria-label]="t('ui.dashboard.kpiDrilldownAria', { label: kpi.label, value: kpi.value })"
            (click)="openDrilldown(kpi)"
          >
            <span class="kpi__top">
              <span class="kpi__meta">
                <span class="kpi__label">{{ kpiLabel(kpi) }}</span>
                <strong class="kpi__value">{{ kpi.value }}{{ kpiUnit(kpi) }}</strong>
              </span>
              <span class="kpi__icon"><mat-icon fontSet="material-icons-round">{{ icon(kpi) }}</mat-icon></span>
            </span>
            @if (kpi.trend; as trend) {
              @if (showTrend(trend)) {
                <span class="kpi__trend" [attr.data-dir]="trend.direction">
                  <mat-icon fontSet="material-icons-round">{{ trendIcon(trend) }}</mat-icon>{{ trendLabel(trend) }}
                </span>
              }
            }
            <span class="kpi__more">{{ t('ui.dashboard.viewList') }}<mat-icon fontSet="material-icons-round">chevron_right</mat-icon></span>
          </button>
        }
      }
    </section>

    <!--
      Hàng 2 bám template chủ dự án (overview.html): [lưu lượng theo giờ | cơ cấu hồ sơ (donut) |
      tình hình cửa khẩu (sơ đồ trạng thái)]. Tất cả từ GET /dashboard/overview.
    -->
    <div class="insight">
      <sg-chart
        class="insight__wide"
        [title]="t('ui.dashboard.hourlyTitle')"
        [subtitle]="t('ui.dashboard.hourlySubtitle')"
        height="260px"
        [option]="hourlyOption()"
        [loading]="loading()"
        [error]="chartError()"
        [empty]="!hourly().length"
        [emptyText]="t('ui.dashboard.hourlyEmpty')"
        [ariaLabel]="hourlyAria()"
        [table]="hourlyTable()"
      />

      <sg-chart
        class="insight__donut"
        [title]="t('ui.dashboard.donutTitle')"
        [subtitle]="t('ui.dashboard.donutSubtitle')"
        height="260px"
        [option]="statusDonutOption()"
        [loading]="loading()"
        [error]="chartError()"
        [empty]="!statusSlices().length"
        [emptyText]="t('ui.dashboard.donutEmpty')"
        [ariaLabel]="donutAria()"
        [table]="donutTable()"
      />

      <section class="panel" [attr.aria-label]="t('ui.dashboard.gateYardTitle')">
        <header class="panel__head"><h2>{{ t('ui.dashboard.gateYardTitle') }}</h2></header>
        @if (loading()) {
          <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.common.loadingShort') }}</p>
        } @else {
          <div class="yards">
            @for (yard of gateYard()?.yards ?? []; track yard.yardName) {
              <div class="yard">
                <div class="yard__row">
                  <span class="yard__name">{{ yard.yardName }}</span>
                  <span class="yard__count">{{ yard.occupied }}/{{ yard.slots }}</span>
                </div>
                <div class="yard__track"><span class="yard__fill" [style.width.%]="yardPercent(yard)"></span></div>
              </div>
            } @empty {
              <p class="muted">{{ t('ui.dashboard.gateYardYardsEmpty') }}</p>
            }
          </div>
          <div class="gate-stats">
            <div class="gate-stat" data-tone="done">
              <span class="gate-stat__value">{{ gateYard()?.gatePassedToday ?? 0 }}</span>
              <span class="gate-stat__label">{{ t('ui.dashboard.gatePassedToday') }}</span>
            </div>
            <div class="gate-stat" data-tone="rejected">
              <span class="gate-stat__value">{{ gateYard()?.gateDeniedToday ?? 0 }}</span>
              <span class="gate-stat__label">{{ t('ui.dashboard.gateDeniedToday') }}</span>
            </div>
            <div class="gate-stat" data-tone="waiting">
              <span class="gate-stat__value">{{ gateYard()?.queueWaiting ?? 0 }}</span>
              <span class="gate-stat__label">{{ t('ui.dashboard.queueWaiting') }}</span>
            </div>
          </div>
        }
      </section>

    </div>

    <!--
      Hàng phân tích (BUG-030): hai chiều SRS đòi mà dashboard còn thiếu —
      [cơ cấu hồ sơ theo luồng (donut) | lưu lượng theo ngày]. Đều từ GET /dashboard/overview
      (byType/daily). Hai thẻ cùng bề rộng cho cân đối; sg-chart tự khóa canvas nên không đè.
    -->
    <div class="insight2">
      <sg-chart
        [title]="t('ui.dashboard.typeTitle')"
        [subtitle]="t('ui.dashboard.typeSubtitle')"
        height="260px"
        [option]="typeOption()"
        [loading]="loading()"
        [error]="chartError()"
        [empty]="!byType().length"
        [emptyText]="t('ui.dashboard.typeEmpty')"
        [ariaLabel]="typeAria()"
        [table]="typeTable()"
      />

      <sg-chart
        [title]="t('ui.dashboard.dailyTitle')"
        [subtitle]="t('ui.dashboard.dailySubtitle')"
        height="260px"
        [option]="dailyOption()"
        [loading]="loading()"
        [error]="chartError()"
        [empty]="!daily().length"
        [emptyText]="t('ui.dashboard.dailyEmpty')"
        [ariaLabel]="dailyAria()"
        [table]="dailyTable()"
      />
    </div>

    <!--
      Hàng 3 bám template chủ dự án: [bảng "Hồ sơ cần xử lý gấp" | thống kê theo lực lượng |
      cảnh báo]. Bảng gấp dùng đúng dữ liệu "attention" (hồ sơ chờ lâu nhất) — không tính ngưỡng
      SLA/quá hạn, chỉ trình bày mốc vào bước THẬT.
    -->
    <div class="grid3">
      <section class="panel attention-panel" [attr.aria-label]="t('ui.dashboard.attentionTitle')">
        <header class="panel__head panel__head--row">
          <h2>{{ t('ui.dashboard.attentionTitle') }}</h2>
          <a class="panel__viewall" routerLink="/workflow/queue">{{ t('ui.dashboard.attentionViewAll') }}<mat-icon fontSet="material-icons-round">chevron_right</mat-icon></a>
        </header>
        @if (loading()) {
          <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.common.loadingShort') }}</p>
        } @else {
          <table class="grid attention">
            <thead>
              <tr>
                <th>{{ t('ui.dashboard.colDossier') }}</th>
                <th>{{ t('ui.dashboard.colEnterprise') }}</th>
                <th>{{ t('ui.dashboard.colDossierType') }}</th>
                <th>{{ t('ui.dashboard.colStep') }}</th>
                <th>{{ t('ui.dashboard.colWaitingSince') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of attention(); track item.dossierId + '-' + $index) {
                <tr class="attention__item">
                  <td>
                    <a class="attention__code" [routerLink]="['/workflow/dossiers', item.dossierId]">{{ item.dossierCode }}</a>
                  </td>
                  <td class="attention__enterprise">{{ item.enterpriseName || '—' }}</td>
                  <td><span class="badge">{{ typeLabel(item.type) }}</span></td>
                  <td class="attention__step">{{ formatStepLabel(item.stepLabel) }}</td>
                  <td class="attention__since">{{ waitingSinceLabel(item.waitingSince) }}</td>
                </tr>
              } @empty {
                <tr>
                  <td class="muted" colspan="5">{{ t('ui.dashboard.attentionEmpty') }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>

      <sg-chart
        [title]="t('ui.dashboard.forceTitle')"
        [subtitle]="t('ui.dashboard.forceSubtitle')"
        height="300px"
        [option]="forceOption()"
        [loading]="loading()"
        [error]="chartError()"
        [empty]="!byForce().length"
        [emptyText]="t('ui.dashboard.forceEmpty')"
        [ariaLabel]="forceAria()"
        [table]="forceTable()"
      />

      <section class="alerts" [attr.aria-label]="t('ui.dashboard.alertsAria')">
        <header class="alerts__head">
          <h2>{{ t('ui.dashboard.alertsTitle') }}</h2>
          <span class="alerts__count">{{ alerts().length }}</span>
        </header>
        @if (loading()) {
          <p class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.dashboard.loadingAlerts') }}</p>
        } @else {
          <ul class="alerts__list">
            @for (alert of alerts(); track $index) {
              <li class="alert" [attr.data-level]="alert.level">
                <mat-icon fontSet="material-icons-round">{{ alertIcon(alert) }}</mat-icon>
                <div class="alert__body">
                  <span class="alert__level">{{ levelLabel(alert.level) }}</span>
                  <p class="alert__message">{{ alert.message }}</p>
                </div>
                @if (alert.dossierId) {
                  <a class="alert__link" [routerLink]="['/declarations', alert.dossierId]">
                    {{ alert.dossierCode || t('ui.workflow.viewDossier') }}
                  </a>
                }
              </li>
            } @empty {
              <li class="alerts__empty">{{ t('ui.dashboard.alertsEmpty') }}</li>
            }
          </ul>
        }
      </section>
    </div>

    <p class="note">{{ t('ui.dashboard.note') }}</p>
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ template chủ dự án (overview.html) để khớp tuyệt đối;
         khoanh trong :host nên không rò ra ngoài, không đụng token --sg-* toàn cục. */
      :host {
        display: block;
        --navy-900: #0e2a63;
        --navy-800: #123278;
        --blue-accent: #2f6fed;
        --red-accent: #e3423f;
        --red-dark: #c62f2f;
        --gold: #e0a72e;
        --green: #1fa971;
        --card: #ffffff;
        --ink-900: #0d1b34;
        --ink-600: #5a6a85;
        --ink-400: #93a0b8;
        --line: #e5e9f1;
        --shadow: 0 1px 2px rgba(13, 27, 52, 0.04), 0 8px 24px -12px rgba(13, 27, 52, 0.12);
      }

      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
      .head h1 { margin: 0; font-size: 20px; font-weight: 800; color: var(--ink-900); }
      .head__time { margin: 4px 0 0; color: var(--ink-400); font-size: 12px; }
      .head__filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .head__field { width: 180px; }
      .feedback { display: block; margin-bottom: 14px; }

      /* ---------------------------- KPI ---------------------------- */
      .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        min-height: 96px;
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--card);
        box-shadow: var(--shadow);
        text-align: left;
        cursor: pointer;
        transition: transform 0.12s, box-shadow 0.12s;
      }
      .kpi:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(13, 27, 52, 0.06), 0 14px 30px -14px rgba(13, 27, 52, 0.2); }
      .kpi__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .kpi__meta { display: grid; gap: 6px; min-width: 0; }
      .kpi__label { color: var(--ink-400); font-size: 11.5px; font-weight: 600; }
      .kpi__value { font-size: 21px; line-height: 1.15; font-weight: 800; color: var(--ink-900); }
      .kpi__icon {
        flex: 0 0 auto;
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: #eef1f6;
      }
      .kpi__icon mat-icon { width: 16px; height: 16px; font-size: 16px; color: var(--ink-600); }
      .kpi__more { display: inline-flex; align-items: center; color: var(--blue-accent); font-size: 11px; font-weight: 700; }
      .kpi__more mat-icon { width: 15px; height: 15px; font-size: 15px; color: inherit; }
      /* Xu hướng "so với hôm qua" — mũi tên + %, màu theo chiều tăng/giảm như template. */
      .kpi__trend { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: var(--ink-400); }
      .kpi__trend mat-icon { width: 13px; height: 13px; font-size: 13px; }
      .kpi__trend[data-dir='up'] { color: var(--green); }
      .kpi__trend[data-dir='down'] { color: var(--red-accent); }
      .kpi__trend[data-dir='flat'] { color: var(--ink-400); }
      /* Sắc thái theo trạng thái nghiệp vụ, ánh xạ đúng bảng màu KPI của template. */
      .kpi[data-tone='processing'] .kpi__icon { background: #e8f3ff; }
      .kpi[data-tone='processing'] .kpi__icon mat-icon { color: var(--blue-accent); }
      .kpi[data-tone='waiting'] .kpi__icon { background: #fff2e0; }
      .kpi[data-tone='waiting'] .kpi__icon mat-icon { color: #b1690a; }
      .kpi[data-tone='done'] .kpi__icon { background: #e7f8f0; }
      .kpi[data-tone='done'] .kpi__icon mat-icon { color: var(--green); }
      .kpi[data-tone='rejected'] .kpi__icon { background: #fdecec; }
      .kpi[data-tone='rejected'] .kpi__icon mat-icon { color: var(--red-accent); }
      .kpi[data-tone='rejected'] .kpi__value { color: var(--red-accent); }

      /* Hàng 2 giống template: [lưu lượng theo giờ (rộng) | donut | tình hình cửa khẩu]. */
      .insight { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 14px; align-items: start; margin-bottom: 14px; }
      .insight > * { min-width: 0; }
      .insight__wide { display: block; }
      .insight__donut { display: block; }

      /* Hàng phân tích BUG-030: hai biểu đồ cùng bề rộng [cơ cấu theo luồng | lưu lượng theo ngày]. */
      .insight2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; margin-bottom: 14px; }
      .insight2 > * { min-width: 0; }
      .panel {
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--card);
        box-shadow: var(--shadow);
      }
      .panel__head { margin-bottom: 12px; }
      /* Tiêu đề panel có link "Xem tất cả" bên phải (bám overview.html: bảng cần xử lý truy ngược nguồn). */
      .panel__head--row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .panel__viewall { display: inline-flex; align-items: center; gap: 2px; color: var(--blue-accent); font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap; }
      .panel__viewall:hover { text-decoration: underline; }
      .panel__viewall mat-icon { font-size: 16px; width: 16px; height: 16px; }
      /* Tiêu đề 3 khối hàng cuối dùng CHUNG một style (khớp tiêu đề của sg-chart = --sg-h3-size). */
      .panel__head h2,
      .alerts__head h2 { margin: 0; font-size: var(--sg-h3-size); line-height: var(--sg-h3-line); font-weight: 700; color: var(--ink-900); }
      /* sg-chart tự tô tiêu đề bằng màu chữ mặc định — ép về ink-900 cho khớp 2 khối kia. */
      .grid3 ::ng-deep .chart__title { font-size: var(--sg-h3-size); line-height: var(--sg-h3-line); font-weight: 700; color: var(--ink-900); }
      .muted { margin: 0; color: var(--ink-400); font-size: 11.5px; }

      /* Tồn bãi theo khu — thanh occupancy. */
      .yards { display: grid; gap: 10px; margin-bottom: 14px; }
      .yard__row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
      .yard__name { color: var(--ink-600); font-size: 11.5px; }
      .yard__count { color: var(--ink-900); font-size: 11.5px; font-weight: 700; }
      .yard__track { height: 8px; border-radius: 6px; background: #eef1f6; overflow: hidden; }
      .yard__fill { display: block; height: 100%; border-radius: 6px; background: var(--blue-accent); }

      /* Ba số cổng/hàng đợi hôm nay. */
      .gate-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .gate-stat { display: grid; gap: 2px; padding: 10px 8px; border-radius: 10px; background: #f8fafd; text-align: center; }
      .gate-stat__value { font-size: 19px; font-weight: 800; color: var(--ink-900); }
      .gate-stat__label { font-size: 10.5px; color: var(--ink-400); font-weight: 600; }
      .gate-stat[data-tone='done'] .gate-stat__value { color: var(--green); }
      .gate-stat[data-tone='rejected'] .gate-stat__value { color: var(--red-accent); }
      .gate-stat[data-tone='waiting'] .gate-stat__value { color: #b1690a; }

      /* Bảng "Hồ sơ cần xử lý gấp" — table.grid như template hàng 3.
         table-layout:fixed là bắt buộc: không có nó, mã hồ sơ/tên doanh nghiệp dài đẩy min-content
         của bảng rộng hơn ô lưới 1.2fr, bảng TRÀN ngang ra cả hàng và hai thẻ biểu đồ/cảnh báo vẽ
         chồng lên. Fixed ép bảng luôn bằng đúng bề rộng ô; nội dung dài thì cắt/ngắt trong từng ô. */
      .attention-panel { display: flex; flex-direction: column; min-width: 0; }
      table.grid { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11.5px; }
      table.grid thead th {
        text-align: center;
        padding: 6px 6px;
        font-size: 10.5px;
        font-weight: 700;
        color: var(--ink-400);
        text-transform: uppercase;
        letter-spacing: 0.02em;
        border-bottom: 1px solid var(--line);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      table.grid tbody td {
        padding: 8px 6px;
        border-bottom: 1px solid #f1f3f8;
        color: var(--ink-600);
        vertical-align: middle;
        overflow: hidden;
      }
      table.grid tbody tr:last-child td { border-bottom: none; }
      /* Chia cột cố định cho 5 cột: mã / doanh nghiệp / loại / đang chờ ở bước / chờ từ. */
      .attention th:nth-child(1), .attention td:nth-child(1) { width: 15%; }
      .attention th:nth-child(2), .attention td:nth-child(2) { width: 24%; }
      .attention th:nth-child(3), .attention td:nth-child(3) { width: 11%; }
      .attention th:nth-child(4), .attention td:nth-child(4) { width: 34%; }
      .attention th:nth-child(5), .attention td:nth-child(5) { width: 16%; }
      /* Mã hồ sơ giữ đọc đủ (ngắt trong ô nếu cần), tên doanh nghiệp cắt gọn bằng dấu "…". */
      .attention__code { color: var(--blue-accent); font-size: 12px; font-weight: 700; text-decoration: none; word-break: break-all; }
      .attention__code:hover { text-decoration: underline; }
      .attention__enterprise { color: var(--ink-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      /* Bước hiện tại (đang chờ lực lượng nào) — thông tin quan trọng nhất, để đọc đủ nên cho xuống dòng. */
      .attention__step { color: var(--ink-600); white-space: normal; word-break: break-word; }
      .attention__since { color: var(--ink-400); font-weight: 600; white-space: nowrap; }
      .attention .badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 20px;
        background: #e8f3ff;
        color: var(--blue-accent);
        font-size: 10px;
        font-weight: 700;
      }

      /* "Hồ sơ cần xử lý gấp" chiếm trọn hàng trên; "Trạng thái theo lực lượng" + "Cảnh báo" xuống
         hàng dưới, mỗi cái nửa hàng, stretch chiều cao cho cân đối hai bên. */
      .grid3 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: stretch; margin-bottom: 14px; }
      .grid3 > * { min-width: 0; }
      .grid3 > :first-child { grid-column: 1 / -1; }

      /* ------------------------ Cảnh báo (kiểu "Hoạt động gần đây") ------------------------ */
      /* SG-218: Cân đối chiều cao với khối biểu đồ bên cạnh + cuộn nếu > 7 thông báo */
      .alerts {
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--card);
        box-shadow: var(--shadow);
      }
      .alerts__head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      /* Style tiêu đề gộp chung ở trên (.panel__head h2, .alerts__head h2) để 3 khối giống nhau. */
      .alerts__count {
        display: inline-grid;
        place-items: center;
        min-width: 22px;
        height: 20px;
        padding: 0 6px;
        border-radius: 20px;
        background: #e8f3ff;
        color: var(--blue-accent);
        font-size: 11px;
        font-weight: 700;
      }
      .alerts__list {
        display: flex;
        flex-direction: column;
        gap: 11px;
        margin: 0;
        padding: 0 4px 0 0;
        list-style: none;
        flex: 1 1 0px;
        min-height: 0;
        overflow-y: auto;
      }
      .alerts__list::-webkit-scrollbar { width: 5px; }
      .alerts__list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      .alerts__list::-webkit-scrollbar-track { background: transparent; }
      .alerts__empty { color: var(--ink-400); font-size: 11.5px; }
      .alert {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-left: 3px solid var(--ink-400);
        border-radius: 10px;
        background: #f8fafd;
      }
      .alert mat-icon { width: 18px; height: 18px; font-size: 18px; color: var(--ink-400); }
      .alert__body { flex: 1 1 auto; min-width: 0; }
      .alert__level { display: block; color: var(--ink-400); font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
      .alert__message { margin: 2px 0 0; font-size: 11.5px; color: var(--ink-600); line-height: 1.5; }
      .alert__link { flex: 0 0 auto; color: var(--blue-accent); font-size: 11.5px; font-weight: 700; text-decoration: none; }
      .alert__link:hover { text-decoration: underline; }
      .alert[data-level='WARN'] { border-left-color: var(--gold); }
      .alert[data-level='WARN'] mat-icon { color: #b1690a; }
      .alert[data-level='DANGER'] { border-left-color: var(--red-accent); }
      .alert[data-level='DANGER'] mat-icon { color: var(--red-accent); }
      .alert[data-level='INFO'] { border-left-color: var(--blue-accent); }
      .alert[data-level='INFO'] mat-icon { color: var(--blue-accent); }

      .state { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 28px; color: var(--ink-400); }
      .kpis .state { grid-column: 1 / -1; }
      .note { margin: 14px 0 0; color: var(--ink-400); font-size: 11px; line-height: 1.6; }

      @media (max-width: 1280px) {
        .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }

      @media (max-width: 1080px) {
        .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .insight { grid-template-columns: 1fr; }
        .insight2 { grid-template-columns: 1fr; }
        .grid3 { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class DashboardPageComponent implements OnInit {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly appMessages = inject(AppMessageService);

  /** Để trống nghĩa là dùng khoảng mặc định của API — web không tự đoán "hôm nay". */
  protected filters = { from: '', to: '' };

  protected readonly data = signal<DashboardOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly kpis = computed(() => this.data()?.kpis ?? []);
  protected readonly hourly = computed(() => this.data()?.hourly ?? []);
  protected readonly byForce = computed(() => this.data()?.byForce ?? []);
  protected readonly alerts = computed(() => this.data()?.alerts ?? []);
  protected readonly gateYard = computed(() => this.data()?.gateYard ?? null);
  protected readonly attention = computed(() => this.data()?.attention ?? []);
  protected readonly byType = computed(() => this.data()?.byType ?? []);
  protected readonly daily = computed(() => this.data()?.daily ?? []);

  /**
   * Lát của donut "Cơ cấu hồ sơ theo trạng thái" = các KPI **lọc theo hồ sơ** (`drilldown` mang
   * `status` HOẶC `statusGroup`). Bỏ KPI tổng (không có bộ lọc) để tổng các lát không vượt 100%, và
   * bỏ KPI đo lượt xe qua cổng (không mang tham số trạng thái nào — nó không phải cơ cấu hồ sơ).
   */
  protected readonly statusSlices = computed(() =>
    this.kpis().filter(
      (kpi) => !!kpi.drilldown?.queryParams?.['status'] || !!kpi.drilldown?.queryParams?.['statusGroup'],
    ),
  );

  /** Lỗi tải chung cũng là lỗi của biểu đồ — không để canvas trắng không rõ lý do. */
  protected readonly chartError = computed(() => (this.error() ? this.t('ui.dashboard.chartLoadFailed') : ''));

  protected readonly generatedAtLabel = computed(() => {
    const value = this.data()?.generatedAt;
    if (!value) return '';
    const time = new Date(value);
    return Number.isNaN(time.getTime())
      ? ''
      : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(time);
  });

  ngOnInit(): void {
    this.load();
  }

  // --- Drill-down (DoD mốc M3) ----------------------------------------------

  /**
   * Mở danh sách nguồn của một KPI. Dùng **nguyên** `route` và `queryParams` API trả,
   * không ghép thêm gì — đó là điều kiện để số trên thẻ khớp số trong danh sách.
   */
  protected openDrilldown(kpi: DashboardKpi): void {
    const target = kpi?.drilldown;
    if (!target?.route) {
      this.appMessages.showKey('ui.dashboard.noDrilldown', 'warning', { label: kpi?.label || '' });
      return;
    }
    void this.router.navigate([target.route], { queryParams: target.queryParams || {} });
  }

  protected icon(kpi: DashboardKpi): string {
    return kpiIcon(kpi.tone);
  }

  protected translatedKpiLabel(label: string): string {
    if (this.i18n.locale() === 'en') {
      const raw = normalizeText(label);
      if (raw.includes('cho vao cong') || raw.includes('waiting gate')) return dossierStatusLabel('WAITING_GATE', this.t);
      if (raw.includes('dang xu ly') || raw.includes('processing')) return dossierStatusLabel('BUSINESS_PROCESSING', this.t);
      if (raw.includes('can bo sung') || raw.includes('revision') || raw.includes('supplement')) return dossierStatusLabel('REVISION_REQUIRED', this.t);
      if (raw.includes('hoan thanh') || raw.includes('completed')) return dossierStatusLabel('COMPLETED', this.t);
      if (raw.includes('tu choi') || raw.includes('rejected')) return dossierStatusLabel('REJECTED', this.t);
    }
    return label;
  }

  protected levelLabel(level: string): string {
    return alertLevelLabel(level, this.t);
  }

  protected alertIcon(alert: DashboardAlert): string {
    const type = alertLevelType(alert.level);
    return type === 'error' ? 'report' : type === 'warning' ? 'warning' : 'info';
  }

  // --- Xu hướng "so với hôm qua" của thẻ KPI --------------------------------

  protected kpiLabel(kpi: DashboardKpi): string {
    const key = `ui.dashboard.kpi_${kpi.key}`;
    if (this.i18n.has(key)) {
      return this.i18n.t(key as MessageKey);
    }
    return kpi.label;
  }

  protected kpiUnit(kpi: DashboardKpi): string {
    if (!kpi.unit) return '';
    if (kpi.unit.toLowerCase().includes('dossier') || kpi.unit.toLowerCase().startsWith('h')) {
      return ` ${this.i18n.t('ui.dashboard.unitDossier')}`;
    }
    return ` ${kpi.unit}`;
  }

  /** Nhãn loại hồ sơ cho bảng "Hồ sơ cần xử lý gấp" — mã lạ vẫn hiện được (rơi về chính mã). */
  protected typeLabel(type: string): string {
    return dossierTypeLabel(type, this.t);
  }

  /** Nhãn bước xử lý: hiển thị đầy đủ các lực lượng kiểm tra nghiệp vụ (SG-251). */
  protected formatStepLabel(stepLabel: string | undefined): string {
    if (!stepLabel) return '—';
    const raw = normalizeText(stepLabel);
    if (
      raw === 'kiem tra nghiep vu' ||
      raw === 'kiem tra nghiep vu theo chuyen nganh' ||
      (raw.includes('kiem tra nghiep vu') && !raw.includes('bien phong') && !raw.includes('hai quan') && !raw.includes('kiem dich'))
    ) {
      return this.t('ui.dashboard.allAgenciesInspection');
    }
    return stepLabel;
  }

  /** Có gì để hiện không: hoặc tính được % (hôm qua > 0), hoặc có hồ sơ mới hôm nay. */
  protected showTrend(trend: DashboardKpiTrend): boolean {
    return trend.deltaPercent !== null || trend.today > 0;
  }

  protected trendIcon(trend: DashboardKpiTrend): string {
    if (trend.direction === 'down') return 'arrow_downward';
    if (trend.direction === 'up') return 'arrow_upward';
    return 'remove';
  }

  /** Có % thì hiện "{|delta|}% so với hôm qua"; hôm qua = 0 thì hiện "{today} hồ sơ hôm nay". */
  protected trendLabel(trend: DashboardKpiTrend): string {
    if (trend.deltaPercent !== null) {
      return this.t('ui.dashboard.trendVsYesterday', { delta: Math.abs(trend.deltaPercent) });
    }
    return this.t('ui.dashboard.trendNewToday', { count: trend.today });
  }

  // --- Biểu đồ theo giờ ------------------------------------------------------

  protected readonly hourlyOption = computed<EChartsOption | null>(() => {
    const points = this.hourly();
    if (!points.length) return null;
    const theme = chartTheme();
    const seriesSubmitted = this.t('ui.dashboard.seriesSubmitted');
    const seriesPassed = this.t('ui.dashboard.seriesPassed');

    return {
      color: theme.palette.length ? theme.palette : undefined,
      textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
      grid: { left: 48, right: 16, top: 40, bottom: 32 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: [seriesSubmitted, seriesPassed], textStyle: { color: theme.muted } },
      xAxis: {
        type: 'category',
        data: points.map((point) => point.hour),
        axisLine: { lineStyle: { color: theme.line } },
        axisLabel: { color: theme.muted },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: theme.line } },
        axisLabel: { color: theme.muted },
      },
      series: [
        { name: seriesSubmitted, type: 'bar', barMaxWidth: 28, data: points.map((point) => point.submitted), itemStyle: { color: color('processing') } },
        { name: seriesPassed, type: 'line', smooth: true, symbolSize: 7, data: points.map((point) => point.passed), itemStyle: { color: color('done') }, lineStyle: { color: color('done') } },
      ],
    };
  });

  protected readonly hourlyTable = computed<SgChartTable>(() => ({
    columns: [this.t('ui.dashboard.colHour'), this.t('ui.dashboard.seriesSubmitted'), this.t('ui.dashboard.seriesPassed')],
    rows: this.hourly().map((point) => [point.hour, point.submitted, point.passed]),
  }));

  protected hourlyAria(): string {
    const points = this.hourly();
    if (!points.length) return this.t('ui.dashboard.hourlyAriaEmpty');
    const submitted = points.reduce((total, point) => total + (Number(point.submitted) || 0), 0);
    const passed = points.reduce((total, point) => total + (Number(point.passed) || 0), 0);
    const peak = points.reduce((best, point) => ((Number(point.submitted) || 0) > (Number(best.submitted) || 0) ? point : best), points[0]);
    return this.t('ui.dashboard.hourlyAria', {
      from: points[0].hour,
      to: points[points.length - 1].hour,
      submitted,
      passed,
      peakHour: peak.hour,
      peakValue: peak.submitted,
    });
  }

  // --- Trạng thái theo lực lượng ---------------------------------------------

  protected readonly forceOption = computed<EChartsOption | null>(() => {
    const rows = this.byForce();
    if (!rows.length) return null;
    const theme = chartTheme();
    const waiting = this.t('ui.dashboard.waiting');
    const processing = this.t('ui.dashboard.processing');
    const completed = this.t('ui.dashboard.completed');

    return {
      textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
      grid: { left: 140, right: 24, top: 40, bottom: 32 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, data: [waiting, processing, completed], textStyle: { color: theme.muted } },
      xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: theme.line } }, axisLabel: { color: theme.muted } },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.agencyName || row.agencyCode),
        axisLine: { lineStyle: { color: theme.line } },
        axisLabel: { color: theme.muted },
      },
      series: [
        { name: waiting, type: 'bar', stack: 'trangThai', data: rows.map((row) => row.waiting), itemStyle: { color: color('waiting') } },
        { name: processing, type: 'bar', stack: 'trangThai', data: rows.map((row) => row.processing), itemStyle: { color: color('processing') } },
        { name: completed, type: 'bar', stack: 'trangThai', data: rows.map((row) => row.completed), itemStyle: { color: color('done') } },
      ],
    };
  });

  protected readonly forceTable = computed<SgChartTable>(() => ({
    columns: [
      this.t('ui.dashboard.colForce'),
      this.t('ui.dashboard.waiting'),
      this.t('ui.dashboard.processing'),
      this.t('ui.dashboard.completed'),
    ],
    rows: this.byForce().map((row) => [row.agencyName || row.agencyCode, row.waiting, row.processing, row.completed]),
  }));

  protected forceAria(): string {
    const rows = this.byForce();
    if (!rows.length) return this.t('ui.dashboard.forceAriaEmpty');
    return this.t('ui.dashboard.forceAria', {
      count: rows.length,
      waiting: sumForce(rows, 'waiting'),
      processing: sumForce(rows, 'processing'),
      completed: sumForce(rows, 'completed'),
    });
  }

  // --- Cơ cấu hồ sơ theo trạng thái (donut) ----------------------------------

  protected readonly statusDonutOption = computed<EChartsOption | null>(() => {
    const slices = this.statusSlices();
    if (!slices.length) return null;
    const theme = chartTheme();
    return {
      textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle', textStyle: { color: theme.muted } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
          label: { show: false },
          data: slices.map((kpi) => ({
            name: this.translatedKpiLabel(kpi.label),
            value: kpi.value,
            itemStyle: { color: color(kpi.tone ?? 'idle') },
          })),
        },
      ],
    };
  });

  protected readonly donutTable = computed<SgChartTable>(() => ({
    columns: [this.t('ui.dashboard.colStatus'), this.t('ui.dashboard.colCount')],
    rows: this.statusSlices().map((kpi) => [this.translatedKpiLabel(kpi.label), kpi.value]),
  }));

  protected donutAria(): string {
    const slices = this.statusSlices();
    if (!slices.length) return this.t('ui.dashboard.donutAriaEmpty');
    const total = slices.reduce((sum, kpi) => sum + (Number(kpi.value) || 0), 0);
    return this.t('ui.dashboard.donutAria', { count: slices.length, total });
  }

  // --- Cơ cấu hồ sơ theo luồng (donut) ---------------------------------------

  protected readonly typeOption = computed<EChartsOption | null>(() => {
    const slices = this.byType();
    if (!slices.length) return null;
    const theme = chartTheme();
    return {
      color: theme.palette.length ? theme.palette : undefined,
      textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle', textStyle: { color: theme.muted } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
          label: { show: false },
          data: slices.map((slice) => ({ name: this.typeLabel(slice.type), value: slice.count })),
        },
      ],
    };
  });

  protected readonly typeTable = computed<SgChartTable>(() => ({
    columns: [this.t('ui.dashboard.colFlow'), this.t('ui.dashboard.colCount')],
    rows: this.byType().map((slice) => [this.typeLabel(slice.type), slice.count]),
  }));

  protected typeAria(): string {
    const slices = this.byType();
    if (!slices.length) return this.t('ui.dashboard.typeAriaEmpty');
    const total = slices.reduce((sum, slice) => sum + (Number(slice.count) || 0), 0);
    return this.t('ui.dashboard.typeAria', { count: slices.length, total });
  }

  // --- Lưu lượng theo ngày (cột hồ sơ tiếp nhận + đường hoàn tất) -------------

  protected readonly dailyOption = computed<EChartsOption | null>(() => {
    const points = this.daily();
    if (!points.length) return null;
    const theme = chartTheme();
    const seriesSubmitted = this.t('ui.dashboard.seriesSubmitted');
    const seriesCompleted = this.t('ui.dashboard.completed');

    return {
      textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.text },
      grid: { left: 48, right: 16, top: 40, bottom: 32 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: [seriesSubmitted, seriesCompleted], textStyle: { color: theme.muted } },
      xAxis: {
        type: 'category',
        data: points.map((point) => this.dailyLabel(point.date)),
        axisLine: { lineStyle: { color: theme.line } },
        axisLabel: { color: theme.muted },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: theme.line } },
        axisLabel: { color: theme.muted },
      },
      series: [
        { name: seriesSubmitted, type: 'bar', barMaxWidth: 22, data: points.map((point) => point.submitted), itemStyle: { color: color('processing') } },
        { name: seriesCompleted, type: 'line', smooth: true, symbolSize: 7, data: points.map((point) => point.completed), itemStyle: { color: color('done') }, lineStyle: { color: color('done') } },
      ],
    };
  });

  protected readonly dailyTable = computed<SgChartTable>(() => ({
    columns: [this.t('ui.dashboard.colDay'), this.t('ui.dashboard.seriesSubmitted'), this.t('ui.dashboard.completed')],
    rows: this.daily().map((point) => [this.dailyLabel(point.date), point.submitted, point.completed]),
  }));

  protected dailyAria(): string {
    const points = this.daily();
    if (!points.length) return this.t('ui.dashboard.dailyAriaEmpty');
    const submitted = points.reduce((total, point) => total + (Number(point.submitted) || 0), 0);
    const completed = points.reduce((total, point) => total + (Number(point.completed) || 0), 0);
    return this.t('ui.dashboard.dailyAria', { days: points.length, submitted, completed });
  }

  /** `YYYY-MM-DD` → `DD/MM` bằng cắt chuỗi thuần (không dựng Date để khỏi lệch múi giờ). */
  protected dailyLabel(date: DashboardDailyPoint['date']): string {
    const parts = date.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
  }

  // --- Tình hình cửa khẩu & Cần xử lý sớm ------------------------------------

  protected yardPercent(yard: DashboardYard): number {
    if (!yard.slots) return 0;
    return Math.min(100, Math.round((yard.occupied / yard.slots) * 100));
  }

  /** Mốc vào bước hiện tại — chỉ trình bày thời điểm THẬT, không suy ra "đã trễ bao lâu". */
  protected waitingSinceLabel(iso: string): string {
    const time = new Date(iso);
    return Number.isNaN(time.getTime())
      ? ''
      : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(time);
  }

  // --- Tải dữ liệu -----------------------------------------------------------

  protected resetFilters(): void {
    this.filters = { from: '', to: '' };
    this.load();
  }

  protected reload(): void {
    this.load();
  }

  private load(): void {
    if (this.filters.from && this.filters.to && this.filters.from > this.filters.to) {
      this.data.set(null);
      this.loading.set(false);
      this.error.set(this.t('ui.dashboard.invalidDateRange'));
      this.appMessages.showKey('ui.dashboard.invalidDateRange', 'error');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api
      .getDashboardOverview({ from: this.filters.from || undefined, to: this.filters.to || undefined })
      .subscribe({
        next: (data) => {
          this.loading.set(false);
          this.data.set(data ?? null);
        },
        error: () => {
          this.loading.set(false);
          this.data.set(null);
          // Giữ error() để biểu đồ tự hiện trạng thái lỗi của chính nó; đồng thời báo toast tổng.
          this.error.set(this.t('ui.dashboard.loadFailed'));
          this.appMessages.showKey('ui.dashboard.loadFailed', 'error');
        },
      });
  }
}
