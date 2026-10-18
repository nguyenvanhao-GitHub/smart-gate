import { Component, Input, ViewEncapsulation, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../core/i18n/i18n.service';

/** Mô tả một cột tiêu đề. `align`/`width` là tùy chọn trình bày cho ô `<th>`. */
export interface SgTableColumn {
  /** Khóa cột — chỉ dùng cho `track`, không hiển thị. */
  key: string;
  /** Nhãn tiêu đề (đã dịch sẵn ở component gọi). */
  label: string;
  align?: 'start' | 'end' | 'center';
  width?: string;
}

/**
 * Bảng dữ liệu dùng chung — khung `<table>` chuẩn của Design System: header viết HOA nền `--sg-bg-subtle`,
 * hàng viền dưới `--sg-border`, cuộn ngang khi tràn, và hàng trạng thái tải/rỗng chiếm đủ số cột.
 *
 *   <sg-table [columns]="cols" [loading]="loading()" [empty]="rows().length ? '' : t('...')">
 *     @for (row of rows(); track row.id) {
 *       <tr><td>...</td>...</tr>
 *     }
 *   </sg-table>
 *
 * Nội dung `<tbody>` do component gọi tự chiếu vào (content projection) — mỗi trang tự viết `<tr><td>`.
 *
 * **Vì sao `ViewEncapsulation.None`:** ô `<th>/<td>` do trang chiếu vào mang thuộc tính encapsulation
 * của *trang đó*, nên style phạm vi (emulated) của sg-table không "chạm" tới được. Ta tắt encapsulation
 * và **giới hạn mọi selector dưới lớp gốc `.sg-table`** — style chỉ áp cho phần tử nằm trong bảng này,
 * không rò ra bảng khác ngoài component (chúng không có tổ tiên `.sg-table`). Cách này an toàn hơn
 * `::ng-deep` (đã bị khai tử) và làm được việc mà encapsulation emulated không làm được.
 */
@Component({
  selector: 'sg-table',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [MatIconModule],
  template: `
    <div class="sg-table__scroll">
      <table class="sg-table" [class.sg-table--dense]="dense" [style.min-width]="minWidth || null">
        <thead>
          <tr>
            @for (col of columns; track col.key) {
              <th [style.text-align]="col.align || 'start'" [style.width]="col.width || null">{{ col.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @if (loading) {
            <tr class="sg-table__status-row">
              <td [attr.colspan]="columns.length" class="sg-table__state">
                <mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ loadingText || t('ui.table.loading') }}
              </td>
            </tr>
          } @else if (empty) {
            <tr class="sg-table__status-row">
              <td [attr.colspan]="columns.length" class="sg-table__state">
                <mat-icon fontSet="material-icons-round">inbox</mat-icon>{{ empty }}
              </td>
            </tr>
          }
          <ng-content />
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      /* Căn khớp bảng chuẩn hệ thống .grid (mẫu hang-doi-xu-ly.html) để mọi bảng dùng chung
         nhìn đồng nhất với màn Hàng đợi xử lý liên ngành. Các token --bg/--ink-500/--ink-900 chỉ
         được vài trang khai ở :host nên kèm giá trị dự phòng đúng số của .grid cho nơi chưa khai. */
      sg-table { display: block; }
      .sg-table__scroll { width: 100%; overflow-x: auto; }
      .sg-table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
      }
      .sg-table th,
      .sg-table td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: middle;
      }
      .sg-table th {
        background: var(--bg, #f4f6fb);
        color: var(--ink-500, #7885a3);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .03em;
        white-space: nowrap;
      }
      .sg-table td { font-size: 12.5px; color: var(--ink-900, #152040); }
      .sg-table tbody tr:hover { background: var(--bg, #f4f6fb); }
      .sg-table tbody tr:last-child td { border-bottom: none; }
      .sg-table--dense th,
      .sg-table--dense td { padding: var(--sg-space-1) var(--sg-space-2); }
      .sg-table__status-row:hover { background: transparent; }
      .sg-table__state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 60px 20px;
        color: var(--ink-500, #7885a3);
        text-align: center;
      }
      .sg-table__state mat-icon { width: 20px; height: 20px; font-size: 20px; }
    `,
  ],
})
export class SgTableComponent {
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = inject(I18nService).t;

  /** Cột tiêu đề — render `<thead>`. `columns.length` cũng là colspan cho hàng trạng thái. */
  @Input() columns: SgTableColumn[] = [];
  /** Thông báo khi không có dữ liệu; để trống thì không hiện hàng rỗng. */
  @Input() empty = '';
  /** Đang tải — hiện hàng chờ thay cho dữ liệu. */
  @Input() loading = false;
  /** Chữ hiển thị ở hàng chờ; mặc định dùng `ui.table.loading`. */
  @Input() loadingText = '';
  /** Thu gọn đệm ô cho bảng dày dữ liệu. */
  @Input() dense = false;
  /** Bề rộng tối thiểu của bảng (vd '900px') để giữ layout khi cuộn ngang. */
  @Input() minWidth = '';
}
