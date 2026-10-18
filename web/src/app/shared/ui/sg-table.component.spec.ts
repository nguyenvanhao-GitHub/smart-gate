import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SgTableColumn, SgTableComponent } from './sg-table.component';

/**
 * Component dùng chung `sg-table` (Design System, Đợt 2).
 *
 * Bộ test khóa đúng hợp đồng của khung bảng:
 *   - `<thead>` dựng đúng số cột + nhãn theo `columns`, áp `align`/`width` khi có.
 *   - Hàng trạng thái **tải** hiện khi `loading=true`, `colspan` = số cột, dùng `loadingText`
 *     hoặc mặc định `ui.table.loading` (tiếng Việt: "Đang tải dữ liệu...").
 *   - Hàng **rỗng** hiện khi `empty` có giá trị, không loading; caller tự để `empty=''` khi có
 *     dữ liệu nên hàng rỗng KHÔNG chèn lẫn vào các dòng thật.
 *   - **Content projection**: `<tr>` do trang chiếu vào `<tbody>` được render đúng.
 *   - `dense` gắn class, `minWidth` áp style.
 *
 * Dùng host wrapper để kiểm content projection — đúng cách sg-table được gọi ở các trang thật.
 */

const COT: SgTableColumn[] = [
  { key: 'time', label: 'Thời gian' },
  { key: 'code', label: 'Mã hồ sơ', width: '160px' },
  { key: 'amount', label: 'Số tiền', align: 'end' },
];

@Component({
  standalone: true,
  imports: [SgTableComponent],
  template: `
    <sg-table
      [columns]="columns"
      [loading]="loading"
      [loadingText]="loadingText"
      [empty]="empty"
      [dense]="dense"
      [minWidth]="minWidth"
    >
      @for (row of rows; track row.id) {
        <tr class="data-row">
          <td>{{ row.time }}</td>
          <td>{{ row.code }}</td>
          <td>{{ row.amount }}</td>
        </tr>
      }
    </sg-table>
  `,
})
class HostComponent {
  columns: SgTableColumn[] = COT;
  loading = false;
  loadingText = '';
  empty = '';
  dense = false;
  minWidth = '';
  rows: { id: string; time: string; code: string; amount: string }[] = [];
}

describe('SgTableComponent — khung bảng dùng chung', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function taoTrang(): void {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  }

  function bang(): HTMLElement {
    return fixture.nativeElement.querySelector('table.sg-table') as HTMLElement;
  }

  function hangTrangThai(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.sg-table__status-row') as HTMLElement | null;
  }

  beforeEach(() => {
    // Đảm bảo locale mặc định (vi) để kiểm chuỗi tải mặc định.
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Tiêu đề bảng (thead)', () => {
    it('dựng đúng số cột và nhãn theo columns', () => {
      taoTrang();
      const th = Array.from(bang().querySelectorAll('thead th')) as HTMLElement[];

      expect(th.length).toBe(3);
      expect(th.map((c) => c.textContent?.trim())).toEqual(['Thời gian', 'Mã hồ sơ', 'Số tiền']);
    });

    it('áp text-align và width khi cột khai báo', () => {
      taoTrang();
      const th = Array.from(bang().querySelectorAll('thead th')) as HTMLElement[];

      // Cột không khai align → mặc định 'start'.
      expect(th[0].style.textAlign).toBe('start');
      // Cột có width.
      expect(th[1].style.width).toBe('160px');
      // Cột align='end'.
      expect(th[2].style.textAlign).toBe('end');
    });

    it('không cột nào thì thead không có ô th', () => {
      taoTrang();
      host.columns = [];
      fixture.detectChanges();

      expect(bang().querySelectorAll('thead th').length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Hàng trạng thái tải', () => {
    it('hiện hàng tải khi loading=true, dùng chuỗi mặc định tiếng Việt', () => {
      taoTrang();
      host.loading = true;
      fixture.detectChanges();

      const row = hangTrangThai();
      expect(row).not.toBeNull();
      expect(row!.textContent).toContain('Đang tải dữ liệu...');
    });

    it('colspan của hàng tải bằng số cột', () => {
      taoTrang();
      host.loading = true;
      fixture.detectChanges();

      const td = hangTrangThai()!.querySelector('td') as HTMLElement;
      expect(td.getAttribute('colspan')).toBe('3');
    });

    it('dùng loadingText tùy biến khi được truyền', () => {
      taoTrang();
      host.loading = true;
      host.loadingText = 'Đang tải danh sách phí...';
      fixture.detectChanges();

      expect(hangTrangThai()!.textContent).toContain('Đang tải danh sách phí...');
    });

    it('đang tải thì KHÔNG hiện hàng rỗng dù empty có giá trị', () => {
      taoTrang();
      host.loading = true;
      host.empty = 'Không có dữ liệu.';
      fixture.detectChanges();

      // Chỉ có một hàng trạng thái (hàng tải), không kèm hàng rỗng.
      expect(fixture.nativeElement.querySelectorAll('.sg-table__status-row').length).toBe(1);
      expect(hangTrangThai()!.textContent).toContain('Đang tải dữ liệu...');
      expect(hangTrangThai()!.textContent).not.toContain('Không có dữ liệu.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Hàng trạng thái rỗng', () => {
    it('hiện hàng rỗng với đúng thông điệp khi empty có giá trị và không loading', () => {
      taoTrang();
      host.empty = 'Chưa có hồ sơ nào.';
      fixture.detectChanges();

      const row = hangTrangThai();
      expect(row).not.toBeNull();
      expect(row!.textContent).toContain('Chưa có hồ sơ nào.');
      expect((row!.querySelector('td') as HTMLElement).getAttribute('colspan')).toBe('3');
    });

    it('không hiện hàng rỗng khi empty rỗng (caller có dữ liệu)', () => {
      taoTrang();
      host.empty = '';
      host.rows = [{ id: 'r1', time: '10:00', code: 'HS-01', amount: '100' }];
      fixture.detectChanges();

      expect(hangTrangThai()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Content projection (tbody)', () => {
    it('render các <tr> do trang chiếu vào', () => {
      taoTrang();
      host.rows = [
        { id: 'r1', time: '10:00', code: 'HS-01', amount: '100' },
        { id: 'r2', time: '11:00', code: 'HS-02', amount: '200' },
      ];
      fixture.detectChanges();

      const hang = bang().querySelectorAll('tbody tr.data-row');
      expect(hang.length).toBe(2);
      expect(hang[0].textContent).toContain('HS-01');
      expect(hang[1].textContent).toContain('HS-02');
    });

    it('không có hàng trạng thái nào khi đã có dữ liệu và empty rỗng', () => {
      taoTrang();
      host.rows = [{ id: 'r1', time: '10:00', code: 'HS-01', amount: '100' }];
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.sg-table__status-row')).toBeNull();
      expect(bang().querySelectorAll('tbody tr').length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Trình bày: dense và minWidth', () => {
    it('mặc định không gắn class dense và không đặt min-width', () => {
      taoTrang();

      expect(bang().classList).not.toContain('sg-table--dense');
      expect(bang().style.minWidth).toBe('');
    });

    it('dense=true gắn class sg-table--dense', () => {
      taoTrang();
      host.dense = true;
      fixture.detectChanges();

      expect(bang().classList).toContain('sg-table--dense');
    });

    it('minWidth áp vào style của bảng', () => {
      taoTrang();
      host.minWidth = '900px';
      fixture.detectChanges();

      expect(bang().style.minWidth).toBe('900px');
    });

    it('bọc bảng trong vùng cuộn ngang', () => {
      taoTrang();

      expect(fixture.nativeElement.querySelector('.sg-table__scroll')).not.toBeNull();
    });
  });
});
