import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DispatchBoard, DispatchCard, DispatchHistoryEntry } from '../../../core/models/dispatch.model';
import { YardDetail } from '../../../core/models/yard.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { DispatchBoardPageComponent } from './dispatch-board-page.component';

/**
 * UI-08 Điều phối phương tiện (P4).
 *
 * Bộ test khóa hai thứ: **bảng điều phối dạng cột** đúng SRS UI-08 (không sơ đồ flow,
 * không ETA, không cảnh báo ùn tắc — điểm D1) và **xử lý 409 khi gán trùng vị trí**
 * (F29, F31: một vị trí chỉ nhận một xe).
 */

function hoSoTruyCap(
  permissions: string[] = ['dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete', 'queue.create'],
): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'dieuphoi',
      displayName: 'Vũ Thị Hạnh',
      title: 'Cán bộ điều phối',
      email: 'hanh@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'DIEU_PHOI', name: 'Điều phối', dataScope: 'ORGANIZATION' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

function the(mau: Partial<DispatchCard> = {}): DispatchCard {
  return {
    dossierId: 'hs-1',
    code: 'HS-250519-0015',
    plateNumber: '26C-123.45',
    enterpriseName: 'Cty CP Nông sản Tây Bắc',
    ticketNumber: '012',
    type: 'IMPORT',
    status: 'PROCESSING',
    waitingSeconds: 4530,
    assignment: null,
    ...mau,
  };
}

function bang(mau: Partial<DispatchBoard> = {}): DispatchBoard {
  return {
    kpi: { waiting: 12, inspecting: 8, inspected: 31 },
    columns: [
      { key: 'WAITING', label: 'Chờ điều phối', items: [the()] },
      {
        key: 'INSPECTING',
        label: 'Đang kiểm tra',
        items: [
          the({
            dossierId: 'hs-2',
            code: 'HS-250519-0016',
            plateNumber: '12C-567.89',
            ticketNumber: '',
            waitingSeconds: 600,
            assignment: { id: 'as-2', gateCode: 'A1', laneCode: '02', yardId: null, slotCode: null },
          }),
        ],
      },
      { key: 'INSPECTED', label: 'Đã kiểm tra xong', items: [] },
    ],
    ...mau,
  };
}

function baiXe(mau: Partial<YardDetail> = {}): YardDetail {
  return {
    id: 'bai-a',
    code: 'A',
    name: 'Khu A',
    capacity: 16,
    occupied: 2,
    slots: [
      { code: 'A01', status: 'FREE', assignment: null },
      { code: 'A02', status: 'OCCUPIED', assignment: { id: 'as-hs-9', dossierId: 'hs-9', code: 'HS-9', plateNumber: '29C-111.11', since: '2026-07-22T01:00:00.000Z' } },
    ],
    ...mau,
  };
}

function dongLichSu(mau: Partial<DispatchHistoryEntry> = {}): DispatchHistoryEntry {
  return {
    id: 'ls-1',
    at: '2026-07-22T03:30:00.000Z',
    action: 'DISPATCH_ASSIGN',
    actorId: 'u-9',
    actorName: 'Trần Văn B',
    actorRole: 'DIEU_PHOI',
    dossierId: 'hs-1',
    dossierCode: 'HS-250519-0015',
    ticketNumber: 8,
    from: null,
    to: { gate: 'A1', lane: '02', yard: null, slot: null },
    ...mau,
  };
}

describe('DispatchBoardPageComponent — điều phối phương tiện', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<DispatchBoardPageComponent>;
  let component: DispatchBoardPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  /** Gộp nội dung toàn bộ toast đang hiển thị (feedback/actionError nay đi qua toast góc màn hình). */
  function noiDungToast(): string {
    return TestBed.inject(AppMessageService).messages().map((m) => m.text).join(' | ');
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [DispatchBoardPageComponent],
      providers: [provideRouter([{ path: 'declarations/:id', children: [] }]), { provide: ApiService, useValue: api }],
    });

    fixture = TestBed.createComponent(DispatchBoardPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getDispatchBoard',
      'createDispatchAssignment',
      'updateDispatchAssignment',
      'deleteDispatchAssignment',
      'createQueueTicket',
      'callNextDispatch',
      'getGateCatalog',
      'getLaneCatalog',
      'getYards',
      'getYard',
      'getAccessProfile',
      'getDispatchHistory',
      'getCheckpoints',
    ]);
    api.callNextDispatch.and.returnValue(
      of({ called: true, dossierId: 'hs-1', dossierCode: 'HS-250519-0015', plateNumber: '26C-123.45', ticketNumber: 12, ticketCode: '14/08/2026.0012' }),
    );
    api.getCheckpoints.and.returnValue(of([]));
    api.getDispatchBoard.and.returnValue(of(bang()));
    // Phụ trợ quanh bảng chính — mặc định rỗng để test bảng cột không phụ thuộc.
    api.getDispatchHistory.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 8 }));
    api.createDispatchAssignment.and.returnValue(of({ id: 'as-1', gateCode: 'A1', laneCode: null, yardId: null, slotCode: null }));
    api.updateDispatchAssignment.and.returnValue(of({ id: 'as-2', gateCode: 'A2', laneCode: null, yardId: null, slotCode: null }));
    api.deleteDispatchAssignment.and.returnValue(of(void 0));
    api.createQueueTicket.and.returnValue(
      of({ id: 'tk-1', ticketNumber: '045', issuedDate: '2026-07-22', flow: 'IMPORT', checkpoint: 'A1', issuedAt: '2026-07-22T03:00:00.000Z' }),
    );
    api.getGateCatalog.and.returnValue(of([{ code: 'A1', name: 'Cửa A1', direction: 'ENTRY', checkpoint: 'A1', active: true }]));
    api.getLaneCatalog.and.returnValue(
      of([
        { code: '01', name: 'Làn 01', gateCode: 'A1', active: true },
        { code: '05', name: 'Làn 05', gateCode: 'B1', active: true },
      ]),
    );
    api.getYards.and.returnValue(of([{ id: 'bai-a', code: 'A', name: 'Khu A', capacity: 16, occupied: 2 }]));
    api.getYard.and.returnValue(of(baiXe()));
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Trạng thái tải, rỗng và lỗi (SRS 8.1)', () => {
    it('đang tải thì hiện dòng chờ', () => {
      api.getDispatchBoard.and.returnValue(NEVER);
      taoTrang();

      expect(noiBo()['loading']()).toBe(true);
      expect(noiDungTrang()).toContain('Đang tải bảng điều phối');
    });

    it('không có cột nào thì báo trống', () => {
      api.getDispatchBoard.and.returnValue(of(bang({ columns: [] })));
      taoTrang();

      expect(noiDungTrang()).toContain('Chưa có phương tiện nào cần điều phối');
    });

    it('API lỗi thì hiện thông báo lỗi và không vẽ cột', () => {
      api.getDispatchBoard.and.returnValue(throwError(() => new Error('mat ket noi')));
      taoTrang();

      expect(noiBo()['error']()).toContain('Không tải được bảng điều phối');
      expect(noiBo()['columns']().length).toBe(0);
      expect(noiDungToast()).toContain('Không tải được bảng điều phối');
    });

    it('gửi đúng bộ lọc từ ngày và đến ngày lên API (SG-144)', () => {
      taoTrang();
      noiBo()['filters'].from = '2026-07-01';
      noiBo()['filters'].to = '2026-07-22';

      noiBo()['reload']();

      expect(api.getDispatchBoard.calls.mostRecent().args[0]).toEqual({ from: '2026-07-01', to: '2026-07-22' });
      expect(api.getDispatchHistory.calls.mostRecent().args[0]).toEqual({
        from: '2026-07-01',
        to: '2026-07-22',
        page: 1,
        pageSize: 8,
      });
    });

    it('Từ ngày muộn hơn Đến ngày thì chặn ở web và báo lỗi', () => {
      taoTrang();
      const count = api.getDispatchBoard.calls.count();
      noiBo()['filters'].from = '2026-07-31';
      noiBo()['filters'].to = '2026-07-01';

      noiBo()['reload']();

      expect(api.getDispatchBoard.calls.count()).toBe(count);
      expect(noiBo()['error']()).toContain('Từ ngày phải trước hoặc bằng Đến ngày');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Cột và thẻ phương tiện (SRS UI-08)', () => {
    it('vẽ đúng số cột API trả, mỗi cột có số lượng thẻ', () => {
      taoTrang();
      const cot = fixture.nativeElement.querySelectorAll('.col');

      expect(cot.length).toBe(3);
      expect((cot[0] as HTMLElement).textContent).toContain('Chờ điều phối');
      expect((cot[2] as HTMLElement).textContent).toContain('Không có phương tiện nào ở trạng thái này');
    });

    it('thẻ phương tiện có biển số, mã hồ sơ, số thứ tự và thời gian ĐÃ chờ', () => {
      taoTrang();
      const the1 = fixture.nativeElement.querySelector('.card') as HTMLElement;

      expect(the1.textContent).toContain('26C-123.45');
      expect(the1.textContent).toContain('HS-250519-0015');
      expect(the1.textContent).toContain('STT 012');
      expect(the1.textContent).toContain('Đã chờ 1 giờ 15 phút');
    });

    it('thẻ đã gán hiện vị trí, thẻ chưa gán hiện "Chưa gán vị trí"', () => {
      taoTrang();
      const cards = Array.from(fixture.nativeElement.querySelectorAll('.card__slot')) as HTMLElement[];

      expect(cards[0].textContent).toContain('Chưa gán vị trí');
      expect(cards[1].textContent).toContain('Cửa A1');
      expect(cards[1].textContent).toContain('Làn 02');
    });

    it('không vẽ sơ đồ flow, dòng thời gian ETA hay cảnh báo ùn tắc (điểm D1)', () => {
      taoTrang();
      // Chỉ xét phần dữ liệu nghiệp vụ (bảng cột); ghi chú cuối trang cố ý nhắc tên
      // ba hạng mục bị loại nên không tính vào phép kiểm này.
      const noiDungNghiepVu = (fixture.nativeElement.querySelector('.board') as HTMLElement).textContent || '';

      expect(noiDungNghiepVu).not.toContain('ETA');
      expect(noiDungNghiepVu).not.toContain('ùn tắc');
      expect(noiDungNghiepVu).not.toContain('Sơ đồ khu vực');
      expect(fixture.nativeElement.querySelector('svg')).toBeNull();
      expect(noiDungTrang()).toContain('Điều phối phương tiện chờ vào cửa khẩu');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Gán vị trí — một vị trí chỉ nhận một xe (F29, F31)', () => {
    function moGanChoTheDau(): DispatchCard {
      const card = noiBo()['columns']()[0].items[0] as DispatchCard;
      noiBo()['openAssign'](card);
      fixture.detectChanges();
      return card;
    }

    it('thẻ chưa gán thì gọi POST, thẻ đã gán thì gọi PATCH đúng mã phân công', () => {
      taoTrang();

      moGanChoTheDau();
      noiBo()['draft'].yardId = 'bai-a';
      noiBo()['draft'].slotCode = 'A01';
      noiBo()['submitAssign']();
      expect(api.createDispatchAssignment).toHaveBeenCalledWith({ dossierId: 'hs-1', yardId: 'bai-a', slotCode: 'A01' });

      const daGan = noiBo()['columns']()[1].items[0] as DispatchCard;
      noiBo()['openAssign'](daGan);
      noiBo()['draft'].yardId = 'bai-a';
      noiBo()['draft'].slotCode = 'A02';
      noiBo()['submitAssign']();
      expect(api.updateDispatchAssignment).toHaveBeenCalledWith('as-2', jasmine.objectContaining({ yardId: 'bai-a', slotCode: 'A02' }));
    });

    it('chưa chọn vị trí nào thì chặn ngay, không gọi API', () => {
      taoTrang();
      moGanChoTheDau();

      noiBo()['submitAssign']();

      expect(api.createDispatchAssignment).not.toHaveBeenCalled();
      expect(noiBo()['assignError']()).toContain('bãi hoặc ô đỗ');
    });

    it('chọn ô đỗ mà chưa chọn bãi thì chặn ngay', () => {
      taoTrang();
      moGanChoTheDau();
      noiBo()['draft'].slotCode = 'A01';

      noiBo()['submitAssign']();

      expect(api.createDispatchAssignment).not.toHaveBeenCalled();
      expect(noiBo()['assignError']()).toContain('phải chọn bãi');
    });

    it('API trả 409 (vị trí đã có xe khác) thì hiện NGUYÊN thông báo và giữ hộp thoại', () => {
      api.createDispatchAssignment.and.returnValue(
        throwError(() => ({ status: 409, error: { message: 'Ô A01 đã có phương tiện 29C-111.11.' } })),
      );
      taoTrang();
      moGanChoTheDau();
      noiBo()['draft'].yardId = 'bai-a';
      noiBo()['draft'].slotCode = 'A01';

      noiBo()['submitAssign']();
      fixture.detectChanges();

      expect(noiBo()['assignError']()).toBe('Ô A01 đã có phương tiện 29C-111.11.');
      expect(noiBo()['assignTarget']()).not.toBeNull();
      expect(noiDungTrang()).toContain('Ô A01 đã có phương tiện 29C-111.11.');
    });

    it('409 không kèm message thì vẫn nói rõ mỗi vị trí chỉ nhận một xe', () => {
      api.createDispatchAssignment.and.returnValue(throwError(() => ({ status: 409, error: {} })));
      taoTrang();
      moGanChoTheDau();
      noiBo()['draft'].yardId = 'bai-a';
      noiBo()['draft'].slotCode = 'A01';

      noiBo()['submitAssign']();

      expect(noiBo()['assignError']()).toContain('Mỗi vị trí chỉ nhận một xe');
    });

    it('gán thành công thì đóng hộp thoại, báo thành công, tải lại bảng, bãi xe và lịch sử', () => {
      taoTrang();
      const soLan = api.getDispatchBoard.calls.count();
      const soLanHistory = api.getDispatchHistory.calls.count();
      const soLanYards = api.getYards.calls.count();
      moGanChoTheDau();
      noiBo()['draft'].yardId = 'bai-a';
      noiBo()['draft'].slotCode = 'A01';

      noiBo()['submitAssign']();
      fixture.detectChanges();

      expect(noiBo()['assignTarget']()).toBeNull();
      expect(noiDungToast()).toContain('Đã gán vị trí');
      expect(api.getDispatchBoard.calls.count()).toBe(soLan + 1);
      expect(api.getDispatchHistory.calls.count()).toBe(soLanHistory + 1);
      expect(api.getYards.calls.count()).toBe(soLanYards + 1);
    });

    it('chọn bãi thì nạp danh sách ô còn trống của bãi đó', () => {
      taoTrang();
      moGanChoTheDau();

      noiBo()['chooseYard']('bai-a');
      fixture.detectChanges();

      expect(api.getYard).toHaveBeenCalledWith('bai-a');
      expect(noiBo()['slotOptions']().map((item: { value: string }) => item.value)).toEqual(['A01']);
    });

    it('bỏ gán vị trí thì gọi DELETE đúng mã phân công, tải lại bảng và lịch sử', () => {
      taoTrang();
      const soLan = api.getDispatchBoard.calls.count();
      const soLanHistory = api.getDispatchHistory.calls.count();
      const soLanYards = api.getYards.calls.count();
      const daGan = noiBo()['columns']()[1].items[0] as DispatchCard;

      noiBo()['clearAssignment'](daGan);

      expect(api.deleteDispatchAssignment).toHaveBeenCalledWith('as-2');
      expect(noiDungToast()).toContain('Đã bỏ gán vị trí');
      expect(api.getDispatchBoard.calls.count()).toBe(soLan + 1);
      expect(api.getDispatchHistory.calls.count()).toBe(soLanHistory + 1);
      expect(api.getYards.calls.count()).toBe(soLanYards + 1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chặn sớm vị trí không hợp lệ — khớp luật server (F29, F31)', () => {
    /** Nút "Lưu vị trí" trong hộp thoại gán (phân biệt với nút "Hủy"). */
    function nutLuu(): HTMLButtonElement | null {
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      return buttons.find((btn) => (btn.textContent || '').includes('Lưu vị trí')) || null;
    }

    function moGanChoTheDau(): DispatchCard {
      const card = noiBo()['columns']()[0].items[0] as DispatchCard;
      noiBo()['openAssign'](card);
      fixture.detectChanges();
      return card;
    }

    it('chọn bãi mà chưa chọn ô (bãi còn ô trống) thì chặn, nút Lưu bị vô hiệu', () => {
      taoTrang();
      moGanChoTheDau();

      // baiXe() mặc định còn ô A01 trống → cần chọn ô, không phải bãi đầy.
      noiBo()['chooseYard']('bai-a');
      fixture.detectChanges();

      expect(noiBo()['assignInvalidReason']()).toBe('ui.dispatch.yardNeedsSlot');
      expect(nutLuu()?.disabled).toBe(true);
      noiBo()['submitAssign']();
      expect(api.createDispatchAssignment).not.toHaveBeenCalled();
      expect(noiBo()['assignError']()).toContain('phải chọn ô đỗ');
    });

    it('chọn bãi đã hết ô trống thì chặn với thông báo bãi đầy, nút Lưu bị vô hiệu', () => {
      api.getYard.and.returnValue(
        of(baiXe({ slots: [{ code: 'A01', status: 'OCCUPIED', assignment: null }, { code: 'A02', status: 'OCCUPIED', assignment: null }] })),
      );
      taoTrang();
      moGanChoTheDau();

      noiBo()['chooseYard']('bai-a');
      fixture.detectChanges();

      expect(noiBo()['slotOptions']().length).toBe(0);
      expect(noiBo()['assignInvalidReason']()).toBe('ui.dispatch.slotHintFull');
      expect(nutLuu()?.disabled).toBe(true);
      noiBo()['submitAssign']();
      expect(api.createDispatchAssignment).not.toHaveBeenCalled();
      expect(noiBo()['assignError']()).toContain('không còn ô trống');
    });

    it('chưa chọn gì thì chặn (needPosition); chọn ô mà chưa chọn bãi thì chặn (slotNeedsYard)', () => {
      taoTrang();
      moGanChoTheDau();

      expect(noiBo()['assignInvalidReason']()).toBe('ui.dispatch.needPosition');
      expect(nutLuu()?.disabled).toBe(true);

      noiBo()['draft'].slotCode = 'A01';
      fixture.detectChanges();
      expect(noiBo()['assignInvalidReason']()).toBe('ui.dispatch.slotNeedsYard');
      expect(nutLuu()?.disabled).toBe(true);
    });

    it('gán đủ bãi + ô thì hợp lệ, nút Lưu bật', () => {
      taoTrang();
      moGanChoTheDau();
      noiBo()['chooseYard']('bai-a');
      noiBo()['draft'].slotCode = 'A01';
      fixture.detectChanges();

      expect(noiBo()['assignInvalidReason']()).toBeNull();
      expect(nutLuu()?.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Số thứ tự và phân quyền nút bấm', () => {
    function dangNhap(perms: string[]): void {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(perms) }));
    }

    it('chỉ dispatch.create: thẻ chưa gán hiện "Gán vị trí", không hiện "Bỏ gán"', () => {
      dangNhap(['dispatch.view', 'dispatch.create']);
      taoTrang();

      expect(noiBo()['canCreateDispatch']()).toBe(true);
      expect(noiDungTrang()).toContain('Gán vị trí');
      expect(noiDungTrang()).not.toContain('Bỏ gán');
    });

    it('chỉ dispatch.update: thẻ đã gán hiện "Đổi vị trí", thẻ chưa gán KHÔNG hiện "Gán vị trí"', () => {
      dangNhap(['dispatch.view', 'dispatch.update']);
      taoTrang();

      const trang = noiDungTrang();
      expect(trang).toContain('Đổi vị trí');
      expect(trang).not.toContain('Gán vị trí');
      expect(trang).not.toContain('Bỏ gán');
    });

    it('có dispatch.delete: thẻ đã gán hiện "Bỏ gán"', () => {
      dangNhap(['dispatch.view', 'dispatch.delete']);
      taoTrang();

      expect(noiBo()['canDeleteDispatch']()).toBe(true);
      expect(noiDungTrang()).toContain('Bỏ gán');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bộ lọc tìm kiếm (Mã hồ sơ / Biển số xe)', () => {
    it('hiển thị ô nhập tìm kiếm với placeholder đúng yêu cầu', () => {
      taoTrang();
      const el = fixture.nativeElement as HTMLElement;
      const inputEl = el.querySelector('sg-search-input input') as HTMLInputElement;
      expect(inputEl).toBeTruthy();
      expect(inputEl.placeholder).toBe('Tìm mã hồ sơ, biển số');
    });

    it('khi người dùng nhập từ khóa và nhấn Enter, ứng dụng gọi api.getDispatchBoard với tham số search', () => {
      taoTrang();
      api.getDispatchBoard.calls.reset();

      noiBo()['filters'].search = '29C-123.45';
      noiBo()['reload']();

      expect(api.getDispatchBoard).toHaveBeenCalledWith({
        search: '29C-123.45',
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bộ lọc thời gian (SG-144)', () => {
    it('khi chọn ngày từ / đến hoặc bấm Làm mới, ứng dụng gọi api.getDispatchBoard với đúng query params', () => {
      taoTrang();

      noiBo()['onFromChange']('2026-08-10');
      expect(api.getDispatchBoard).toHaveBeenCalledWith({ from: '2026-08-10' });

      noiBo()['onToChange']('2026-08-11');
      expect(api.getDispatchBoard).toHaveBeenCalledWith({ from: '2026-08-10', to: '2026-08-11' });
    });

    it('từ ngày lớn hơn đến ngày thì báo lỗi và không gọi API', () => {
      taoTrang();
      api.getDispatchBoard.calls.reset();

      noiBo()['filters'].from = '2026-08-20';
      noiBo()['filters'].to = '2026-08-10';
      noiBo()['reload']();

      expect(api.getDispatchBoard).not.toHaveBeenCalled();
      expect(noiBo()['error']()).toBe('Từ ngày phải trước hoặc bằng Đến ngày.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Lịch sử điều phối inline (F33)', () => {
    it('render các dòng lịch sử từ getDispatchHistory', () => {
      api.getDispatchHistory.and.returnValue(
        of({ items: [dongLichSu(), dongLichSu({ id: 'ls-2', action: 'DISPATCH_RELEASE', dossierCode: 'HS-250519-0099' })], total: 2, page: 1, pageSize: 8 }),
      );
      taoTrang();

      expect(api.getDispatchHistory).toHaveBeenCalledWith({ page: 1, pageSize: 8 });
      expect(noiBo()['history']().length).toBe(2);
      const table = fixture.nativeElement.querySelector('.history sg-table') as HTMLElement;
      expect(table.textContent).toContain('HS-250519-0015');
      expect(table.textContent).toContain('HS-250519-0099');
      expect(table.textContent).toContain('Trần Văn B');

      const chips = Array.from(table.querySelectorAll('.chip')) as HTMLElement[];
      expect(chips.length).toBe(2);
      expect(chips[0].getAttribute('data-action')).toBe('DISPATCH_ASSIGN');
      expect(chips[1].getAttribute('data-action')).toBe('DISPATCH_RELEASE');
    });

    it('không có dòng nào thì hiện thông báo trống', () => {
      api.getDispatchHistory.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 8 }));
      taoTrang();

      expect(fixture.nativeElement.querySelector('.history sg-table')).toBeNull();
      expect(noiDungTrang()).toContain('Lịch sử điều phối');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Gọi số tiếp theo & Gọi xe (UI-08 · SG-60)', () => {
    it('bấm Gọi số tiếp theo gọi api.callNextDispatch và thông báo thành công', () => {
      taoTrang();
      expect(noiDungTrang()).toContain('Gọi số tiếp theo');

      noiBo()['callNext']();
      expect(api.callNextDispatch).toHaveBeenCalled();
      expect(noiDungToast()).toContain('Đã gọi số 14/08/2026.0012');
    });

    it('bấm Gọi xe này trên thẻ gọi đích danh hồ sơ', () => {
      taoTrang();
      const card = noiBo()['columns']()[0].items[0];
      noiBo()['callSpecific'](card);

      expect(api.callNextDispatch).toHaveBeenCalledWith(jasmine.objectContaining({ dossierId: card.dossierId }));
      expect(noiDungToast()).toContain('Đã gọi số 14/08/2026.0012');
    });

    it('khi hàng đợi rỗng, gọi số tiếp theo báo thông tin không có xe chờ', () => {
      api.callNextDispatch.and.returnValue(of({ called: false, message: 'dispatch.noWaitingVehicles' }));
      taoTrang();

      noiBo()['callNext']();
      expect(noiDungToast()).toContain('Không có phương tiện nào đang chờ gọi');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bộ lọc thời gian (SG-144)', () => {
    it('lọc theo ngày bắt đầu và ngày kết thúc gửi đúng params lên API', () => {
      taoTrang();
      noiBo()['filters'].from = '2026-08-01';
      noiBo()['filters'].to = '2026-08-19';

      noiBo()['reload']();

      expect(api.getDispatchBoard).toHaveBeenCalledWith(
        jasmine.objectContaining({ from: '2026-08-01', to: '2026-08-19' }),
      );
    });

    it('ngày bắt đầu muộn hơn ngày kết thúc thì báo lỗi khoảng ngày không hợp lệ', () => {
      taoTrang();
      const soLan = api.getDispatchBoard.calls.count();
      noiBo()['filters'].from = '2026-08-20';
      noiBo()['filters'].to = '2026-08-01';

      noiBo()['reload']();

      expect(api.getDispatchBoard.calls.count()).toBe(soLan);
      expect(noiBo()['error']()).toContain('Từ ngày');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Danh sách xe trên thẻ cột điều phối (hơn 10 xe)', () => {
    it('hiển thị đầy đủ danh sách xe khi cột có nhiều hơn 10 xe và danh sách có class cards', () => {
      const items = Array.from({ length: 15 }, (_, i) =>
        the({ dossierId: `hs-${i + 1}`, code: `HS-250519-${1000 + i}`, plateNumber: `26C-100.${i}` }),
      );
      api.getDispatchBoard.and.returnValue(
        of(
          bang({
            columns: [
              { key: 'WAITING', label: 'Chờ điều phối', items },
              { key: 'INSPECTING', label: 'Đang kiểm tra', items: [] },
              { key: 'INSPECTED', label: 'Đã kiểm tra xong', items: [] },
            ],
          }),
        ),
      );
      taoTrang();

      const cardsContainer = fixture.nativeElement.querySelector('.col .cards') as HTMLElement;
      expect(cardsContainer).toBeTruthy();
      const renderedCards = cardsContainer.querySelectorAll('.card');
      expect(renderedCards.length).toBe(15);
      expect(cardsContainer.textContent).toContain('26C-100.0');
      expect(cardsContainer.textContent).toContain('26C-100.14');
    });
  });

  // ---------------------------------------------------------------------------
  describe('columnTitle - chuyển đổi tiêu đề cột điều phối', () => {
    it('chuyển đổi chính xác tên cột Chờ điều phối, Đang kiểm tra và Đã kiểm tra xong', () => {
      taoTrang();
      const instance = noiBo();

      expect(instance['columnTitle']({ key: 'WAITING', label: 'Chờ điều phối' })).toBe('Chờ điều phối');
      expect(instance['columnTitle']({ key: 'INSPECTING', label: 'Đang trong giai đoạn kiểm tra' })).toBe('Đang trong giai đoạn kiểm tra');
      expect(instance['columnTitle']({ key: 'PROCESSING', label: 'Đang kiểm tra' })).toBe('Đang trong giai đoạn kiểm tra');
      expect(instance['columnTitle']({ key: 'INSPECTED', label: 'Đã kiểm tra xong' })).toBe('Đã kiểm tra xong');
      expect(instance['columnTitle']({ key: 'DONE', label: 'Đã kiểm tra' })).toBe('Đã kiểm tra xong');
    });
  });
});

