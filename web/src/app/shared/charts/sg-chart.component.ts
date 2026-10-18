import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { MatIconModule } from '@angular/material/icon';
import type { EChartsOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';

/** Bảng số liệu kèm biểu đồ — bắt buộc, vì canvas là vùng mù với trình đọc màn hình. */
export interface SgChartTable {
  columns: string[];
  rows: Array<Array<string | number>>;
}

/**
 * Khung biểu đồ dùng chung (P5 — UI-02, UI-12).
 *
 * Ba yêu cầu bắt buộc của biểu đồ trong dự án, gói hết vào đây để mọi màn hình
 * dùng lại thay vì tự làm mỗi nơi một kiểu:
 *   1. **Màu lấy từ `_tokens.scss`** — xem `chart-theme.ts`, nơi dựng `option`.
 *   2. **Có phương án cho người không đọc được biểu đồ**: vùng vẽ mang `role="img"`
 *      kèm `aria-label` mô tả bằng lời, và luôn kèm **bảng số liệu** mở được.
 *   3. **Ba trạng thái tải / rỗng / lỗi** hiện rõ bằng chữ, không để canvas trắng.
 *
 *   <sg-chart title="Lưu lượng theo giờ" [option]="opt()" [loading]="loading()"
 *             [error]="error()" [empty]="!rows().length" [table]="table()"
 *             ariaLabel="Biểu đồ ..." />
 */
@Component({
  selector: 'sg-chart',
  standalone: true,
  imports: [MatIconModule, NgxEchartsDirective],
  template: `
    <figure class="chart">
      @if (title || subtitle) {
        <figcaption class="chart__head">
          @if (title) { <h2 class="chart__title">{{ title }}</h2> }
          @if (subtitle) { <p class="chart__subtitle">{{ subtitle }}</p> }
        </figcaption>
      }

      <div class="chart__area" [style.height]="height">
        @if (loading) {
          <p class="chart__state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.chart.loading') }}</p>
        } @else if (error) {
          <p class="chart__state chart__state--error"><mat-icon fontSet="material-icons-round">error</mat-icon>{{ error }}</p>
        } @else if (empty || !option) {
          <p class="chart__state"><mat-icon fontSet="material-icons-round">bar_chart</mat-icon>{{ resolvedEmptyText() }}</p>
        } @else {
          <div
            class="chart__canvas"
            echarts
            role="img"
            [attr.aria-label]="ariaLabel"
            [options]="option"
            [autoResize]="true"
            (chartClick)="chartClick.emit($event)"
          ></div>
        }
      </div>

      @if (table && table.rows.length && !loading && !error) {
        <details class="chart__data">
          <summary>{{ t('ui.chart.table') }}</summary>
          <div class="sg-scroll-x chart__table-wrapper">
            <table class="chart__table">
              <thead>
                <tr>
                  @for (column of table.columns; track column) {
                    <th scope="col">{{ column }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of table.rows; track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      <td>{{ cell }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    </figure>
  `,
  styles: [
    `
      :host { display: block; }
      .chart {
        margin: 0;
        padding: var(--sg-space-4);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius-card);
        background: var(--sg-bg-surface);
        box-shadow: var(--sg-shadow-card);
      }
      .chart__head { margin: 0 0 var(--sg-space-3); }
      .chart__title { margin: 0; font-size: var(--sg-h3-size); line-height: var(--sg-h3-line); }
      .chart__subtitle { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      /* min-width:0 + overflow:hidden: canvas do ECharts sinh mang kích thước px riêng; nếu đo nhầm
         bề rộng lúc layout lưới chưa ổn định nó có thể rộng hơn ô cột và VẼ TRÀN phủ lên khối bên
         cạnh. Khóa vùng vẽ trong đúng ô (absolute inset:0) rồi cắt phần thừa để không đè UI hàng xóm;
         autoResize của ngx-echarts sẽ vẽ lại vừa cột ngay sau đó. */
      .chart__area { position: relative; width: 100%; min-width: 0; overflow: hidden; }
      .chart__canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
      .chart__state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--sg-space-2);
        height: 100%;
        margin: 0;
        color: var(--sg-text-muted);
        text-align: center;
      }
      .chart__state--error { color: var(--sg-danger); }
      .chart__data { margin-top: var(--sg-space-3); }
      .chart__data summary {
        cursor: pointer;
        color: var(--sg-primary);
        font-size: var(--sg-small-size);
        font-weight: 700;
      }
      .chart__table-wrapper {
        max-height: 195px;
        overflow-y: auto;
        overflow-x: auto;
        margin-top: var(--sg-space-2);
      }
      .chart__table-wrapper::-webkit-scrollbar { width: 5px; height: 5px; }
      .chart__table-wrapper::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      .chart__table-wrapper::-webkit-scrollbar-track { background: transparent; }
      .chart__table { width: 100%; min-width: 0; border-collapse: collapse; }
      .chart__table th {
        position: sticky;
        top: 0;
        background: var(--sg-bg-surface);
        z-index: 1;
        box-shadow: inset 0 -1px 0 var(--sg-border);
      }
      .chart__table th,
      .chart__table td {
        padding: var(--sg-space-1) var(--sg-space-2);
        border-bottom: 1px solid var(--sg-border);
        font-size: var(--sg-small-size);
        text-align: right;
      }
      .chart__table th:first-child,
      .chart__table td:first-child { text-align: left; }
    `,
  ],
})
export class SgChartComponent {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  @Input() title = '';
  @Input() subtitle = '';
  /** Cấu hình ECharts đã dựng sẵn màu từ token — xem `chart-theme.ts`. */
  @Input() option: EChartsOption | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Input() empty = false;
  @Input() emptyText = '';
  /** Lời nhắn mặc định khi nơi gọi không truyền — phương thức để đọc lại `@Input` mỗi lượt kiểm tra. */
  protected resolvedEmptyText(): string {
    return this.emptyText || this.t('ui.chart.empty');
  }
  /** Mô tả biểu đồ bằng lời cho trình đọc màn hình. */
  @Input() ariaLabel = '';
  @Input() height = '280px';
  @Input() table: SgChartTable | null = null;
  @Output() readonly chartClick = new EventEmitter<unknown>();
}
