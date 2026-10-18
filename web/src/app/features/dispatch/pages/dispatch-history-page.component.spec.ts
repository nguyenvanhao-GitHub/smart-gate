import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { Paged } from '../../../core/services/api.service';
import { DispatchHistoryEntry } from '../../../core/models/dispatch.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { DispatchHistoryPageComponent } from './dispatch-history-page.component';

/**
 * F33 — Lịch sử điều phối.
 *
 * Khóa bốn hành vi: **đổi bộ lọc thì trim tham số và về trang 1**, nhãn hành động dịch đúng theo mã,
 * vị trí "từ → đến" hiển thị, và các trạng thái rỗng/lỗi/phân trang.
 */

function dong(mau: Partial<DispatchHistoryEntry> = {}): DispatchHistoryEntry {
  return {
    id: 'log-1',
    at: '2026-07-22T03:00:00.000Z',
    action: 'DISPATCH_ASSIGN',
    actorId: 'u-1',
    actorName: 'Vũ Thị Hạnh',
    actorRole: 'DISPATCHER',
    dossierId: 'hs-1',
    dossierCode: 'HS-250519-0015',
    ticketNumber: 12,
    from: null,
    to: { gate: 'B1', lane: null, yard: null, slot: null },
    ...mau,
  };
}

function trang(items: DispatchHistoryEntry[], total = items.length): Paged<DispatchHistoryEntry> {
  return { items, total, page: 1, pageSize: 20 };
}

describe('DispatchHistoryPageComponent — lịch sử điều phối (F33)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<DispatchHistoryPageComponent>;
  let component: DispatchHistoryPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [DispatchHistoryPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(DispatchHistoryPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['getDispatchHistory']);
    api.getDispatchHistory.and.returnValue(of(trang([dong()])));
  });

  afterEach(() => TestBed.resetTestingModule());

  it('nạp lịch sử ngay khi mở, không kèm bộ lọc nào', () => {
    taoTrang();

    expect(api.getDispatchHistory).toHaveBeenCalledTimes(1);
    expect(api.getDispatchHistory.calls.mostRecent().args[0]).toEqual({
      dossierCode: undefined,
      actor: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 20,
    });
  });

  it('áp bộ lọc thì cắt khoảng trắng và luôn về trang 1', () => {
    taoTrang();
    // Giả lập đang ở trang 2 rồi mới đổi bộ lọc.
    noiBo()['page'].set(2);
    noiBo()['form'] = { dossierCode: '  HS-0015  ', actor: '  hanh  ', from: '2026-07-01', to: '' };

    noiBo()['applyFilters']();

    expect(api.getDispatchHistory.calls.mostRecent().args[0]).toEqual({
      dossierCode: 'HS-0015',
      actor: 'hanh',
      from: '2026-07-01',
      to: undefined,
      page: 1,
      pageSize: 20,
    });
    expect(noiBo()['page']()).toBe(1);
  });

  it('tìm kiếm theo Cán bộ (Tên đăng nhập hoặc Tên tài khoản) truyền actor param lên API (SG-249)', () => {
    taoTrang();
    noiBo()['form'].actor = 'Điều phối viên';
    noiBo()['applyFilters']();

    expect(api.getDispatchHistory.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ actor: 'Điều phối viên' }),
    );
  });

  it('chọn Từ ngày hoặc Đến ngày thì tự động áp dụng bộ lọc (SG-168)', () => {
    taoTrang();
    const datePickers = fixture.nativeElement.querySelectorAll('sg-date-picker');
    expect(datePickers.length).toBe(2);

    noiBo()['form'].from = '2026-08-01';
    noiBo()['applyFilters']();

    expect(api.getDispatchHistory.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ from: '2026-08-01' }),
    );
  });

  it('dịch nhãn hành động theo mã: ASSIGN/MOVE/RELEASE', () => {
    api.getDispatchHistory.and.returnValue(
      of(
        trang([
          dong({ id: 'a', action: 'DISPATCH_ASSIGN' }),
          dong({ id: 'm', action: 'DISPATCH_MOVE' }),
          dong({ id: 'r', action: 'DISPATCH_RELEASE' }),
        ]),
      ),
    );
    taoTrang();
    const chips = Array.from(fixture.nativeElement.querySelectorAll('.chip')) as HTMLElement[];

    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['Gán', 'Chuyển', 'Bỏ']);
  });

  it('dịch nhãn vai trò người thao tác theo mã, không hiện mã thô', () => {
    api.getDispatchHistory.and.returnValue(
      of(trang([dong({ actorRole: 'DISPATCHER' }), dong({ id: 'b', actorRole: 'BORDER_GUARD' })])),
    );
    taoTrang();
    const noiDung = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(noiDung).toContain('Điều phối viên'); // DISPATCHER → nhãn
    expect(noiDung).toContain('Biên phòng'); // BORDER_GUARD → nhãn
    expect(noiDung).not.toContain('DISPATCHER');
    expect(noiDung).not.toContain('BORDER_GUARD');
  });

  it('hiển thị vị trí từ → đến, và "—" khi thiếu vị trí', () => {
    api.getDispatchHistory.and.returnValue(
      of(
        trang([
          dong({
            id: 'x',
            from: { gate: null, lane: null, yard: null, slot: 'A01' },
            to: null,
          }),
        ]),
      ),
    );
    taoTrang();
    const cells = Array.from(fixture.nativeElement.querySelectorAll('tbody td')) as HTMLElement[];
    const noiDung = cells.map((cell) => cell.textContent?.trim() || '');

    expect(noiDung).toContain('Ô A01');
    expect(noiDung).toContain('—');
  });

  it('SG-229: hiển thị cột "Biển số xe" thay cho cột "Số thứ tự" trong chi tiết lịch sử điều phối', () => {
    api.getDispatchHistory.and.returnValue(
      of(
        trang([
          dong({ id: 'xe-1', plateNumber: '29A-12345' }),
          dong({ id: 'xe-2', plateNumber: null }),
        ]),
      ),
    );
    taoTrang();
    const headers = Array.from(fixture.nativeElement.querySelectorAll('thead th')) as HTMLElement[];
    const rows = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];

    expect(headers.map((th) => th.textContent?.trim())).toContain('Biển số');
    expect(rows[0].textContent).toContain('29A-12345');
    expect(rows[1].textContent).toContain('—');
  });

  it('không có dòng nào thì báo trống', () => {
    api.getDispatchHistory.and.returnValue(of(trang([], 0)));
    taoTrang();

    expect(noiDungTrang()).toContain('Chưa có lịch sử điều phối nào khớp bộ lọc');
  });

  it('đang tải thì hiện dòng chờ', () => {
    api.getDispatchHistory.and.returnValue(NEVER);
    taoTrang();

    expect(noiBo()['loading']()).toBe(true);
    expect(noiDungTrang()).toContain('Đang tải lịch sử điều phối');
  });

  it('API lỗi thì báo lỗi qua toast và xóa danh sách', () => {
    api.getDispatchHistory.and.returnValue(throwError(() => new Error('mat ket noi')));
    taoTrang();

    const messages = TestBed.inject(AppMessageService).messages();
    expect(messages.some((m) => m.tone === 'error' && m.text.includes('Không tải được lịch sử điều phối'))).toBe(true);
    expect(noiBo()['rows']().length).toBe(0);
    expect(noiBo()['total']()).toBe(0);
  });

  it('tổng vượt một trang thì hiện phân trang; chuyển trang thì nạp lại đúng số trang', () => {
    api.getDispatchHistory.and.returnValue(of(trang([dong()], 45)));
    taoTrang();

    expect(fixture.nativeElement.querySelector('sg-pager')).not.toBeNull();

    noiBo()['goToPage'](2);
    expect(api.getDispatchHistory.calls.mostRecent().args[0]?.page).toBe(2);
  });

  it('đổi cỡ trang thì nạp lại từ trang 1 với pageSize mới', () => {
    api.getDispatchHistory.and.returnValue(of(trang([dong()], 45)));
    taoTrang();
    noiBo()['page'].set(2);

    noiBo()['changePageSize']('50');

    expect(noiBo()['page']()).toBe(1);
    expect(api.getDispatchHistory.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ page: 1, pageSize: 50 }),
    );
  });

  it('chân trang hiển thị tóm tắt "hiển thị a–b / tổng"', () => {
    api.getDispatchHistory.and.returnValue(of(trang([dong()], 45)));
    taoTrang();
    const footer = fixture.nativeElement.querySelector('.pager') as HTMLElement;

    expect(footer.textContent).toContain('Hiển thị 1 đến 20 trong tổng số 45 lượt điều phối');
  });
});
