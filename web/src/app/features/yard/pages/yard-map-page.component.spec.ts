import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DispatchBoard } from '../../../core/models/dispatch.model';
import { YardDetail, YardSlot, YardSummary } from '../../../core/models/yard.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { YardMapPageComponent } from './yard-map-page.component';

/**
 * UI-10 Quản lý kho bãi (P4).
 *
 * Bộ test khóa: sơ đồ ô đỗ hiển thị đúng **trống / có xe**, chi tiết xe – vị trí,
 * chuyển vị trí (409 khi ô đích đã có xe — F42/F43) và giải phóng ô khi xe rời bãi (F44).
 */

function hoSoTruyCap(permissions: string[] = ['yard.view', 'yard.update']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'quanlybai',
      displayName: 'Hoàng Văn Nam',
      title: 'Quản lý bãi',
      email: 'nam@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'QUAN_LY_BAI', name: 'Quản lý bãi', dataScope: 'ORGANIZATION' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

const DANH_SACH_BAI: YardSummary[] = [
  { id: 'bai-a', code: 'A', name: 'Khu A', capacity: 4, occupied: 2 },
  { id: 'bai-b', code: 'B', name: 'Khu B', capacity: 4, occupied: 0 },
];

function oDo(mau: Partial<YardSlot> = {}): YardSlot {
  return { code: 'A01', status: 'FREE', assignment: null, ...mau };
}

function khuA(mau: Partial<YardDetail> = {}): YardDetail {
  return {
    id: 'bai-a',
    code: 'A',
    name: 'Khu A',
    capacity: 4,
    occupied: 2,
    slots: [
      oDo({ code: 'A01' }),
      oDo({
        code: 'A02',
        status: 'OCCUPIED',
        assignment: { id: 'as-hs-1', dossierId: 'hs-1', code: 'HS-250519-0015', plateNumber: '26C-123.45', since: '2026-07-22T01:00:00.000Z' },
      }),
      oDo({
        code: 'A03',
        status: 'OCCUPIED',
        assignment: { id: 'as-hs-2', dossierId: 'hs-2', code: 'HS-250519-0016', plateNumber: '12C-567.89', since: '2026-07-22T02:00:00.000Z' },
      }),
      oDo({ code: 'A04' }),
    ],
    ...mau,
  };
}

function khuB(): YardDetail {
  return { id: 'bai-b', code: 'B', name: 'Khu B', capacity: 4, occupied: 0, slots: [oDo({ code: 'B01' }), oDo({ code: 'B02' })] };
}

/** Bảng điều phối với cột `waiting` gồm hai hồ sơ đang chờ bố trí — nguồn cho biểu mẫu gán. */
function bangChoBoTri(): DispatchBoard {
  return {
    kpi: { waiting: 2, inspecting: 0, inspected: 0 },
    columns: [
      {
        key: 'waiting',
        label: 'Chờ điều phối',
        items: [
          { dossierId: 'hs-9', code: 'HS-250519-0099', plateNumber: '29C-777.88', enterpriseName: 'Cty A', ticketNumber: '012', type: 'IMPORT', status: 'WAITING', waitingSeconds: 600, assignment: null },
          { dossierId: 'hs-10', code: 'HS-250519-0100', plateNumber: '30F-222.33', enterpriseName: 'Cty B', ticketNumber: '013', type: 'IMPORT', status: 'WAITING', waitingSeconds: 300, assignment: null },
        ],
      },
      { key: 'assigned', label: 'Đã bố trí', items: [] },
    ],
  };
}

/** Hồ sơ truy cập có thêm quyền điều phối `dispatch.create` để dựng biểu mẫu gán ô trống (POST). */
function hoSoGan(): AccessProfile {
  return hoSoTruyCap(['yard.view', 'yard.update', 'dispatch.create', 'dispatch.update']);
}

// --- Fixture Đợt C: có ô quá hạn, ô bảo trì, tên doanh nghiệp và dự kiến rời bãi ------------------

/** Danh sách bãi kèm số ô quá hạn (KPI + viền cảnh báo khu). */
const BAI_CO_QUA_HAN: YardSummary[] = [
  { id: 'bai-a', code: 'A', name: 'Khu A', capacity: 5, occupied: 3, overdue: 2 },
  { id: 'bai-b', code: 'B', name: 'Khu B', capacity: 4, occupied: 0, overdue: 0 },
];

/**
 * Khu A đủ bốn nhóm trạng thái: A01 trống · A02 có xe (còn hạn) · A03 + A05 quá hạn ·
 * A04 bảo trì (đã khóa). Xe có `entity` (tên DN) và `expectedDeparture`.
 */
function khuDayDu(): YardDetail {
  return {
    id: 'bai-a',
    code: 'A',
    name: 'Khu A',
    capacity: 5,
    occupied: 3,
    overdue: 2,
    slots: [
      oDo({ code: 'A01' }),
      oDo({
        code: 'A02',
        status: 'OCCUPIED',
        overdue: false,
        assignment: {
          id: 'as-hs-1',
          dossierId: 'hs-1',
          code: 'HS-250519-0015',
          plateNumber: '26C-123.45',
          entity: 'Công ty TNHH Chiềng Khương',
          since: '2026-07-29T01:00:00.000Z',
          expectedDeparture: '2026-07-31T01:00:00.000Z',
          inspectionStatus: 'WAITING_INSPECTION',
        },
      }),
      oDo({
        code: 'A03',
        status: 'OCCUPIED',
        overdue: true,
        assignment: {
          id: 'as-hs-2',
          dossierId: 'hs-2',
          code: 'HS-250519-0016',
          plateNumber: '30F-999.99',
          entity: 'HTX Tân Thanh',
          since: '2026-07-20T01:00:00.000Z',
          expectedDeparture: '2026-07-22T01:00:00.000Z',
          inspectionStatus: 'INSPECTING',
        },
      }),
      oDo({ code: 'A04', status: 'MAINTENANCE' }),
      oDo({
        code: 'A05',
        status: 'OCCUPIED',
        overdue: true,
        assignment: {
          id: 'as-hs-3',
          dossierId: 'hs-3',
          code: 'HS-250519-0017',
          plateNumber: '29H-111.22',
          entity: 'Cá nhân Nguyễn Văn A',
          since: '2026-07-19T01:00:00.000Z',
          expectedDeparture: '2026-07-21T01:00:00.000Z',
        },
      }),
    ],
  };
}

describe('YardMapPageComponent — quản lý kho bãi', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<YardMapPageComponent>;
  let component: YardMapPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [YardMapPageComponent],
      providers: [provideRouter([{ path: 'declarations/:id', children: [] }]), { provide: ApiService, useValue: api }],
    });

    fixture = TestBed.createComponent(YardMapPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function oTrenSoDo(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.slot')) as HTMLButtonElement[];
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  /** Gộp nội dung toàn bộ toast đang hiển thị (feedback thao tác / lỗi tải-gửi đi qua đây). */
  function noiDungToast(): string {
    return TestBed.inject(AppMessageService).messages().map((m) => m.text).join(' | ');
  }

  /** Dựng trang với fixture Đợt C (có ô quá hạn / bảo trì / tên DN / dự kiến rời bãi). */
  function taoTrangDayDu(): void {
    api.getYards.and.returnValue(of(BAI_CO_QUA_HAN));
    api.getYard.and.callFake((id: string) => of(id === 'bai-b' ? khuB() : khuDayDu()));
    taoTrang();
  }

  /** Nút thao tác trong chân hộp thoại chi tiết theo chữ hiển thị. */
  function nutTheoChu(chu: string): HTMLButtonElement | undefined {
    const nut = fixture.nativeElement.querySelectorAll('.sg-modal__foot button') as NodeListOf<HTMLButtonElement>;
    return Array.from(nut).find((item) => (item.textContent ?? '').includes(chu));
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getYards',
      'getYard',
      'releaseYardSlot',
      'updateDispatchAssignment',
      'createDispatchAssignment',
      'getDispatchBoard',
      'updateAssignmentInspection',
      'lockYardSlot',
      'unlockYardSlot',
      'getAccessProfile',
    ]);
    api.getYards.and.returnValue(of(DANH_SACH_BAI));
    api.getYard.and.callFake((id: string) => of(id === 'bai-b' ? khuB() : khuA()));
    api.releaseYardSlot.and.returnValue(of(void 0));
    api.updateDispatchAssignment.and.returnValue(of({ id: 'as-1', gateCode: null, laneCode: null, yardId: 'bai-a', slotCode: 'A04' }));
    api.createDispatchAssignment.and.returnValue(of({ id: 'as-9', gateCode: null, laneCode: null, yardId: 'bai-a', slotCode: 'A01' }));
    api.getDispatchBoard.and.returnValue(of(bangChoBoTri()));
    api.updateAssignmentInspection.and.returnValue(
      of({ assignment: { id: 'as-hs-1', gateCode: null, laneCode: null, yardId: 'bai-a', slotCode: 'A02' } }),
    );
    api.lockYardSlot.and.callFake((id: string) => of(id === 'bai-b' ? khuB() : khuA()));
    api.unlockYardSlot.and.callFake((id: string) => of(id === 'bai-b' ? khuB() : khuA()));
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
      api.getYards.and.returnValue(NEVER);
      taoTrang();

      expect(noiBo()['loading']()).toBe(true);
      expect(noiDungTrang()).toContain('Đang tải sơ đồ kho bãi');
    });

    it('chưa có bãi nào thì báo danh mục trống', () => {
      api.getYards.and.returnValue(of([]));
      taoTrang();

      expect(noiDungTrang()).toContain('Chưa có bãi nào trong danh mục');
    });

    it('API danh sách bãi lỗi thì hiện thông báo lỗi', () => {
      api.getYards.and.returnValue(throwError(() => new Error('mat ket noi')));
      taoTrang();

      expect(noiBo()['error']()).toContain('Không tải được danh sách kho bãi');
      expect(noiDungToast()).toContain('Không tải được danh sách kho bãi');
    });

    it('API chi tiết bãi lỗi thì báo riêng cho sơ đồ ô đỗ', () => {
      api.getYard.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      expect(noiBo()['error']()).toContain('Không tải được sơ đồ ô đỗ');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Sơ đồ vị trí — trạng thái trống / có xe', () => {
    it('tự mở bãi đầu tiên và vẽ đủ số ô đỗ', () => {
      taoTrang();

      expect(noiBo()['selectedYardId']()).toBe('bai-a');
      expect(oTrenSoDo().length).toBe(4);
      expect(noiDungTrang()).toContain('Sơ đồ vị trí — Khu A');
    });

    it('ô 1 dòng info: ô trống hiện nhãn "Trống", ô có xe hiện biển số (bám mẫu MH10)', () => {
      taoTrang();
      const o = oTrenSoDo();

      expect(o[0].getAttribute('data-status')).toBe('FREE');
      expect(o[0].textContent).toContain('A01');
      expect(o[0].textContent).toContain('Trống');
      expect(o[0].textContent).not.toContain('26C-123.45');

      // Ô có xe hiện đúng MỘT dòng info = biển số (không kèm nhãn "Có xe").
      expect(o[1].getAttribute('data-status')).toBe('OCCUPIED');
      expect(o[1].textContent).toContain('A02');
      expect(o[1].textContent).toContain('26C-123.45');
      expect((o[1].querySelector('.slot__info') as HTMLElement).textContent).toContain('26C-123.45');
    });

    it('mỗi ô có nhãn trợ năng nói rõ trống hay đang có xe nào', () => {
      taoTrang();
      const o = oTrenSoDo();

      expect(o[0].getAttribute('aria-label')).toBe('Ô A01 — trống');
      expect(o[1].getAttribute('aria-label')).toBe('Ô A02 — có xe 26C-123.45, hồ sơ HS-250519-0015');
    });

    it('tổng hợp sức chứa toàn bộ bãi và số ô còn trống của bãi đang mở', () => {
      taoTrang();

      expect(noiBo()['totalCapacity']()).toBe(8);
      expect(noiBo()['totalOccupied']()).toBe(2);
      expect(noiBo()['totalFree']()).toBe(6);
      expect(noiDungTrang()).toContain('còn trống 2 ô');
    });

    it('đổi bãi thì tải sơ đồ bãi mới', () => {
      taoTrang();

      noiBo()['selectYard']('bai-b');
      fixture.detectChanges();

      expect(api.getYard).toHaveBeenCalledWith('bai-b');
      expect(oTrenSoDo().length).toBe(2);
      expect(noiDungTrang()).toContain('Sơ đồ vị trí — Khu B');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chi tiết xe – vị trí', () => {
    it('chưa chọn ô thì chưa mở hộp thoại chi tiết nào', () => {
      taoTrang();

      expect(noiBo()['selectedSlotCode']()).toBe('');
      expect(fixture.nativeElement.querySelector('sg-modal')).toBeNull();
    });

    it('bấm ô có xe thì mở hộp thoại chi tiết với biển số, mã hồ sơ và thời điểm vào bãi', () => {
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      const noiDung = noiDungTrang();
      expect(noiBo()['selectedSlotCode']()).toBe('A02');
      expect(fixture.nativeElement.querySelector('sg-modal')).not.toBeNull();
      expect(noiDung).toContain('Vị trí A02');
      expect(noiDung).toContain('26C-123.45');
      expect(noiDung).toContain('HS-250519-0015');
      expect(noiDung).toContain('22/07/2026');
    });

    it('bấm ô trống thì mở hộp thoại nhưng không hiện nút thao tác trên xe', () => {
      taoTrang();
      oTrenSoDo()[0].click();
      fixture.detectChanges();

      expect(noiDungTrang()).toContain('Ô đang trống');
      expect(noiDungTrang()).not.toContain('Chuyển vị trí —');
    });

    it('thiếu quyền yard.update thì ẩn nút chuyển vị trí và giải phóng', () => {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(['yard.view']) }),
      );
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      expect(noiBo()['canManage']()).toBe(false);
      expect(noiDungTrang()).not.toContain('Giải phóng vị trí');
    });

    it('có yard.update nhưng thiếu dispatch.update: ẩn nút "Chuyển vị trí", vẫn hiện "Giải phóng"/khóa', () => {
      // Persona mặc định = yard.view + yard.update (KHÔNG có dispatch.update).
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      expect(noiBo()['canManage']()).toBe(true);
      expect(noiBo()['canMoveDispatch']()).toBe(false);
      expect(nutTheoChu('Giải phóng vị trí')).toBeDefined();
      expect(nutTheoChu('Chuyển vị trí')).toBeUndefined();
    });

    it('có dispatch.update thì hiện nút "Chuyển vị trí" (PATCH điều phối)', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoGan() }));
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      expect(noiBo()['canMoveDispatch']()).toBe(true);
      expect(nutTheoChu('Chuyển vị trí')).toBeDefined();
    });

    it('chân hộp thoại chi tiết gom tất cả các nút vào wrapper .modal-actions nằm trong .sg-modal__foot', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoGan() }));
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      const foot = fixture.nativeElement.querySelector('.sg-modal__foot') as HTMLElement;
      expect(foot).not.toBeNull();
      const actionsWrapper = foot.querySelector('.modal-actions') as HTMLElement;
      expect(actionsWrapper).not.toBeNull();
      const buttons = actionsWrapper.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chuyển vị trí và hoàn thành (F43, F44)', () => {
    it('chân hộp thoại chuyển vị trí cũng dùng wrapper .modal-actions trong .sg-modal__foot', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoGan() }));
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      nutTheoChu('Chuyển vị trí')?.click();
      fixture.detectChanges();

      const foot = fixture.nativeElement.querySelector('.sg-modal__foot') as HTMLElement;
      expect(foot).not.toBeNull();
      const actionsWrapper = foot.querySelector('.modal-actions') as HTMLElement;
      expect(actionsWrapper).not.toBeNull();
      expect(actionsWrapper.querySelectorAll('button').length).toBe(2);
    });
    function moChuyenVeOCoXe(): void {
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();
      noiBo()['openMove'](noiBo()['selectedSlot']());
      fixture.detectChanges();
    }

    it('chỉ cho chọn ô còn trống làm đích, bỏ ô đang đứng', () => {
      moChuyenVeOCoXe();

      expect(noiBo()['moveSlotOptions']().map((item: { value: string }) => item.value)).toEqual(['A01', 'A04']);
    });

    it('chưa chọn ô đích thì chặn ngay, không gọi API', () => {
      moChuyenVeOCoXe();

      noiBo()['submitMove']();

      expect(api.updateDispatchAssignment).not.toHaveBeenCalled();
      expect(noiBo()['moveError']()).toContain('Vui lòng chọn bãi đích và ô đỗ đích');
    });

    /**
     * Chuyển ô phải đi bằng PATCH theo mã bản ghi điều phối. Dùng POST thì bị chỉ mục
     * "một xe không nằm ở hai vị trí" chặn 409 — xe vẫn đang đứng ở ô cũ.
     */
    it('chuyển thành công thì gọi PATCH theo mã bản ghi điều phối rồi tải lại', () => {
      moChuyenVeOCoXe();
      noiBo()['moveSlotCode'].set('A04');

      noiBo()['submitMove']();
      fixture.detectChanges();

      expect(api.updateDispatchAssignment).toHaveBeenCalledWith('as-hs-1', { yardId: 'bai-a', slotCode: 'A04' });
      expect(noiBo()['moveTarget']()).toBeNull();
      expect(noiDungToast()).toContain('sang ô A04');
    });

    it('ô đích đã có xe khác (409) thì hiện NGUYÊN thông báo và giữ hộp thoại', () => {
      api.updateDispatchAssignment.and.returnValue(
        throwError(() => ({ status: 409, error: { message: 'Ô A04 đã có phương tiện 12C-567.89.' } })),
      );
      moChuyenVeOCoXe();
      noiBo()['moveSlotCode'].set('A04');

      noiBo()['submitMove']();
      fixture.detectChanges();

      expect(noiDungToast()).toContain('Ô A04 đã có phương tiện 12C-567.89.');
      expect(noiBo()['moveTarget']()).not.toBeNull();
    });

    it('chuyển sang bãi khác thì nạp ô trống của bãi đích', () => {
      moChuyenVeOCoXe();

      noiBo()['chooseMoveYard']('bai-b');
      fixture.detectChanges();

      expect(api.getYard).toHaveBeenCalledWith('bai-b');
      expect(noiBo()['moveSlotOptions']().map((item: { value: string }) => item.value)).toEqual(['B01', 'B02']);
    });

    it('hoàn thành thì giải phóng đúng ô đỗ và tải lại sơ đồ', () => {
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();
      const soLan = api.getYards.calls.count();

      noiBo()['complete'](noiBo()['selectedSlot']());
      fixture.detectChanges();

      expect(api.releaseYardSlot).toHaveBeenCalledWith('bai-a', 'A02');
      expect(noiDungToast()).toContain('Đã giải phóng ô A02');
      expect(api.getYards.calls.count()).toBe(soLan + 1);
    });

    it('giải phóng lỗi thì báo cho người dùng, không im lặng', () => {
      api.releaseYardSlot.and.returnValue(throwError(() => ({ status: 400, error: { message: 'Ô đỗ không ở trạng thái có xe.' } })));
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      noiBo()['complete'](noiBo()['selectedSlot']());
      fixture.detectChanges();

      expect(noiDungToast()).toContain('Ô đỗ không ở trạng thái có xe.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Trạng thái kiểm tra / tập kết (F44)', () => {
    it('ô có xe hiện trạng thái kiểm tra hiện tại và nút chuyển sang bước kế tiếp', () => {
      taoTrang();
      oTrenSoDo()[1].click(); // A02 — chưa có inspectionStatus → mặc định "Chờ kiểm tra"
      fixture.detectChanges();

      const noiDung = noiDungTrang();
      expect(noiDung).toContain('Chờ kiểm tra');
      expect(noiDung).toContain('Chuyển sang: Đang kiểm tra');
    });

    it('nhãn trạng thái theo mã, đổi mã đổi nhãn (không dò chuỗi tiếng Việt)', () => {
      taoTrang();

      expect(noiBo()['inspectionLabel']('INSPECTING')).toBe('Đang kiểm tra');
      expect(noiBo()['inspectionLabel']('CONSOLIDATING')).toBe('Đang sang tải / tập kết');
      expect(noiBo()['nextInspection']('INSPECTION_DONE')).toBe('CONSOLIDATING');
      expect(noiBo()['nextInspection']('CONSOLIDATING')).toBeNull();
    });

    it('chuyển bước hợp lệ thì gọi API theo mã bản ghi điều phối rồi tải lại sơ đồ', () => {
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();
      const soLan = api.getYards.calls.count();

      noiBo()['advanceInspection'](noiBo()['selectedSlot'](), 'INSPECTING');
      fixture.detectChanges();

      expect(api.updateAssignmentInspection).toHaveBeenCalledWith('as-hs-1', { status: 'INSPECTING' });
      expect(noiDungToast()).toContain('Đang kiểm tra');
      expect(api.getYards.calls.count()).toBe(soLan + 1);
    });

    it('chuyển sai bước (409) thì hiện NGUYÊN thông báo của API, không nuốt lỗi', () => {
      api.updateAssignmentInspection.and.returnValue(
        throwError(() => ({ status: 409, error: { message: 'Không thể chuyển từ chờ kiểm tra thẳng sang tập kết.' } })),
      );
      taoTrang();
      oTrenSoDo()[1].click();
      fixture.detectChanges();

      noiBo()['advanceInspection'](noiBo()['selectedSlot'](), 'CONSOLIDATING');
      fixture.detectChanges();

      expect(api.updateAssignmentInspection).toHaveBeenCalledWith('as-hs-1', { status: 'CONSOLIDATING' });
      expect(noiDungToast()).toContain('Không thể chuyển từ chờ kiểm tra thẳng sang tập kết.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bốn nhóm trạng thái, chú giải và cảnh báo khu quá hạn (Đợt C — F42/F44)', () => {
    it('chú giải liệt kê đủ bốn nhóm: trống, có xe, quá hạn, bảo trì', () => {
      taoTrangDayDu();
      const chuGiai = (fixture.nativeElement.querySelector('.legend') as HTMLElement).textContent || '';

      expect(chuGiai).toContain('Trống');
      expect(chuGiai).toContain('Đang sử dụng');
      expect(chuGiai).toContain('Quá hạn');
      expect(chuGiai).toContain('Bảo trì');
    });

    it('lưới tô đủ bốn trạng thái hiển thị (FREE/OCCUPIED/OVERDUE/MAINTENANCE)', () => {
      taoTrangDayDu();
      const trangThai = oTrenSoDo().map((o) => o.getAttribute('data-status'));

      expect(trangThai).toContain('FREE');
      expect(trangThai).toContain('OCCUPIED'); // A02 còn hạn
      expect(trangThai).toContain('OVERDUE'); // A03, A05 quá hạn
      expect(trangThai).toContain('MAINTENANCE'); // A04 bị khóa
    });

    it('khu có ô quá hạn được gắn viền cảnh báo, khu sạch thì không', () => {
      taoTrangDayDu();
      const khuVuc = Array.from(fixture.nativeElement.querySelectorAll('.zone')) as HTMLButtonElement[];
      const khuA = khuVuc.find((z) => (z.textContent || '').includes('Khu A'))!;
      const khuBtn = khuVuc.find((z) => (z.textContent || '').includes('Khu B'))!;
      const tatCa = khuVuc.find((z) => (z.textContent || '').includes('Tất cả khu vực'))!;

      expect(khuA.classList).toContain('zone--warn');
      expect(khuBtn.classList).not.toContain('zone--warn');
      // "Tất cả khu vực" cũng cảnh báo vì tổng quá hạn > 0.
      expect(tatCa.classList).toContain('zone--warn');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Panel chi tiết — tên doanh nghiệp, dự kiến rời bãi, badge quá hạn (Đợt C)', () => {
    it('ô quá hạn hiện tên DN, dự kiến rời bãi và badge "Quá hạn" tô đỏ', () => {
      taoTrangDayDu();
      oTrenSoDo()[2].click(); // A03 — quá hạn
      fixture.detectChanges();

      const noiDung = noiDungTrang();
      expect(noiDung).toContain('Doanh nghiệp / Cá nhân');
      expect(noiDung).toContain('HTX Tân Thanh');
      expect(noiDung).toContain('Dự kiến rời bãi');

      const ddQuaHan = fixture.nativeElement.querySelector('.facts dd.overdue') as HTMLElement | null;
      expect(ddQuaHan).not.toBeNull();
      expect((ddQuaHan!.querySelector('.chip[data-tone="danger"]') as HTMLElement).textContent).toContain('Quá hạn');
    });

    it('ô còn hạn hiện tên DN + dự kiến rời bãi nhưng KHÔNG có badge quá hạn', () => {
      taoTrangDayDu();
      oTrenSoDo()[1].click(); // A02 — còn hạn
      fixture.detectChanges();

      expect(noiDungTrang()).toContain('Công ty TNHH Chiềng Khương');
      expect(noiDungTrang()).toContain('31/07/2026'); // dự kiến rời bãi
      expect(fixture.nativeElement.querySelector('.facts dd.overdue')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ô tìm kiếm lưới và gộp "Tất cả khu vực" (Đợt C)', () => {
    function goTimKiem(tuKhoa: string): void {
      const input = fixture.nativeElement.querySelector('.search input') as HTMLInputElement;
      input.value = tuKhoa;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    function maOHienThi(): string[] {
      return oTrenSoDo().map((o) => (o.querySelector('strong') as HTMLElement).textContent || '');
    }

    it('lọc theo biển số chỉ giữ ô khớp', () => {
      taoTrangDayDu();
      goTimKiem('30F-999.99');

      expect(maOHienThi()).toEqual(['A03']);
    });

    it('lọc theo mã ô', () => {
      taoTrangDayDu();
      goTimKiem('A04');

      expect(maOHienThi()).toEqual(['A04']);
    });

    it('lọc theo mã hồ sơ của xe đang đỗ', () => {
      taoTrangDayDu();
      goTimKiem('HS-250519-0015');

      expect(maOHienThi()).toEqual(['A02']);
    });

    it('không khớp từ khóa thì báo không có ô nào', () => {
      taoTrangDayDu();
      goTimKiem('khong-ton-tai');

      expect(oTrenSoDo().length).toBe(0);
      expect(noiDungTrang()).toContain('Không có ô nào khớp');
    });

    it('"Tất cả khu vực" gộp ô của mọi bãi vào một sơ đồ', () => {
      taoTrangDayDu();
      noiBo()['selectAllZones']();
      fixture.detectChanges();

      expect(noiBo()['allMode']()).toBe(true);
      expect(api.getYard).toHaveBeenCalledWith('bai-a');
      expect(api.getYard).toHaveBeenCalledWith('bai-b');
      // 5 ô Khu A + 2 ô Khu B.
      expect(oTrenSoDo().length).toBe(7);
      expect(noiDungTrang()).toContain('Tất cả khu vực');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Khóa và mở lại ô đỗ (Đợt C — F42)', () => {
    it('bấm "Khóa ô" trên ô trống gọi lockYardSlot và báo đã khóa', () => {
      taoTrangDayDu();
      oTrenSoDo()[0].click(); // A01 — trống
      fixture.detectChanges();

      nutTheoChu('Khóa ô')!.click();
      fixture.detectChanges();

      expect(api.lockYardSlot).toHaveBeenCalledWith('bai-a', 'A01');
      expect(noiDungToast()).toContain('Đã khóa ô A01');
    });

    it('bấm "Mở lại ô" trên ô bảo trì gọi unlockYardSlot và báo đã mở', () => {
      taoTrangDayDu();
      oTrenSoDo()[3].click(); // A04 — bảo trì
      fixture.detectChanges();

      nutTheoChu('Mở lại vị trí')!.click();
      fixture.detectChanges();

      expect(api.unlockYardSlot).toHaveBeenCalledWith('bai-a', 'A04');
      expect(noiDungToast()).toContain('Đã mở lại ô A04');
    });

    it('khóa ô đang có xe bị 409 thì hiện NGUYÊN thông báo của API, không nuốt lỗi', () => {
      api.lockYardSlot.and.returnValue(
        throwError(() => ({ status: 409, error: { message: 'Ô A01 đang có xe nên không thể khoá. Hãy giải phóng ô trước.' } })),
      );
      taoTrangDayDu();
      oTrenSoDo()[0].click(); // A01 — trống (server vẫn từ chối trong tình huống đua)
      fixture.detectChanges();

      nutTheoChu('Khóa ô')!.click();
      fixture.detectChanges();

      expect(noiDungToast()).toContain('Ô A01 đang có xe nên không thể khoá. Hãy giải phóng ô trước.');
    });

    it('thiếu quyền yard.update thì ẩn nút Khóa ô', () => {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(['yard.view']) }),
      );
      taoTrangDayDu();
      oTrenSoDo()[0].click(); // A01 — trống
      fixture.detectChanges();

      expect(noiBo()['canManage']()).toBe(false);
      expect(nutTheoChu('Khóa ô')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('KPI Quá hạn (Đợt C)', () => {
    it('KPI "Quá hạn lưu bãi" bằng tổng số ô quá hạn của mọi bãi', () => {
      taoTrangDayDu();

      expect(noiBo()['totalOverdue']()).toBe(2);
      const kpi = fixture.nativeElement.querySelector('.kpi[data-tone="danger"]') as HTMLElement;
      expect(kpi.textContent).toContain('Quá hạn lưu bãi');
      expect((kpi.querySelector('strong') as HTMLElement).textContent).toContain('2');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Nội dung hộp thoại theo trạng thái ô (Vòng 5 — bám mẫu MH10)', () => {
    /** Dựng trang với quyền điều phối để biểu mẫu gán ô trống hiển thị. */
    function taoTrangGan(): void {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoGan() }));
      taoTrang();
    }

    it('ô trống (có quyền điều phối) hiện danh sách hồ sơ chờ và nút Gán vị trí', () => {
      taoTrangGan();
      oTrenSoDo()[0].click(); // A01 — trống
      fixture.detectChanges();

      expect(api.getDispatchBoard).toHaveBeenCalled();
      // Danh sách lấy từ cột WAITING: mỗi lựa chọn = "{mã hồ sơ} — {biển số}".
      expect(noiBo()['waitingOptions']()).toEqual([
        { value: 'hs-9', label: 'HS-250519-0099 — 29C-777.88' },
        { value: 'hs-10', label: 'HS-250519-0100 — 30F-222.33' },
      ]);
      expect(fixture.nativeElement.querySelector('sg-select')).not.toBeNull();
      expect(nutTheoChu('Gán vị trí')).toBeDefined();
    });

    it('ô trống rỗng hồ sơ chờ thì báo không có hồ sơ và không cho gán', () => {
      api.getDispatchBoard.and.returnValue(of({ kpi: { waiting: 0, inspecting: 0, inspected: 0 }, columns: [{ key: 'waiting', label: 'Chờ điều phối', items: [] }] }));
      taoTrangGan();
      oTrenSoDo()[0].click();
      fixture.detectChanges();

      expect(noiDungTrang()).toContain('Không có hồ sơ nào đang chờ bố trí');
      // Chưa chọn hồ sơ → nút Gán bị vô hiệu hóa.
      expect(nutTheoChu('Gán vị trí')!.disabled).toBe(true);
    });

    it('chọn hồ sơ chờ rồi bấm Gán thì tạo bản ghi điều phối đúng tham số và tải lại', () => {
      taoTrangGan();
      oTrenSoDo()[0].click(); // A01 — trống
      fixture.detectChanges();
      noiBo()['assignDossierId'].set('hs-9');
      fixture.detectChanges(); // bật nút Gán sau khi chọn hồ sơ
      const soLan = api.getYards.calls.count();

      nutTheoChu('Gán vị trí')!.click();
      fixture.detectChanges();

      expect(api.createDispatchAssignment).toHaveBeenCalledWith({ dossierId: 'hs-9', yardId: 'bai-a', slotCode: 'A01' });
      expect(noiDungToast()).toContain('Đã gán hồ sơ vào ô A01');
      expect(noiBo()['selectedSlotCode']()).toBe('');
      expect(api.getYards.calls.count()).toBe(soLan + 1);
    });

    it('gán bị 409 (ô đã có xe) thì hiện NGUYÊN thông báo của API, không nuốt lỗi', () => {
      api.createDispatchAssignment.and.returnValue(
        throwError(() => ({ status: 409, error: { message: 'Ô A01 đã có phương tiện khác.' } })),
      );
      taoTrangGan();
      oTrenSoDo()[0].click();
      fixture.detectChanges();
      noiBo()['assignDossierId'].set('hs-9');
      fixture.detectChanges(); // bật nút Gán sau khi chọn hồ sơ

      nutTheoChu('Gán vị trí')!.click();
      fixture.detectChanges();

      expect(noiDungToast()).toContain('Ô A01 đã có phương tiện khác.');
    });

    it('thiếu quyền điều phối thì ô trống KHÔNG dựng biểu mẫu gán, chỉ hiện gợi ý', () => {
      taoTrang(); // hồ sơ mặc định: yard.view + yard.update, không có dispatch.update
      oTrenSoDo()[0].click();
      fixture.detectChanges();

      expect(api.getDispatchBoard).not.toHaveBeenCalled();
      expect(nutTheoChu('Gán vị trí')).toBeUndefined();
      expect(noiDungTrang()).toContain('Ô đang trống');
    });

    it('ô bảo trì hiện dòng Ghi chú theo mẫu và nút Mở lại vị trí', () => {
      taoTrangDayDu();
      oTrenSoDo()[3].click(); // A04 — bảo trì
      fixture.detectChanges();

      expect(noiDungTrang()).toContain('Ghi chú');
      expect(noiDungTrang()).toContain('Vị trí tạm khóa để bảo trì mặt bằng');
      expect(nutTheoChu('Mở lại vị trí')).toBeDefined();
    });

    it('ô có xe hiện đủ detail-row (mã hồ sơ, DN, vào bãi, dự kiến rời) và nút Giải phóng / Chuyển', () => {
      // Nút "Chuyển vị trí" cần dispatch.update (PATCH), "Giải phóng" cần yard.update → persona đủ cả hai.
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoGan() }));
      taoTrangDayDu();
      oTrenSoDo()[2].click(); // A03 — quá hạn
      fixture.detectChanges();

      const nd = noiDungTrang();
      expect(nd).toContain('Biển số / Container');
      expect(nd).toContain('Mã hồ sơ');
      expect(nd).toContain('Doanh nghiệp / Cá nhân');
      expect(nd).toContain('Vào bãi lúc');
      expect(nd).toContain('Dự kiến rời bãi');
      // Mã hồ sơ là liên kết tới chi tiết hồ sơ.
      expect((fixture.nativeElement.querySelector('.facts a') as HTMLAnchorElement).textContent).toContain('HS-250519-0016');
      expect(nutTheoChu('Giải phóng vị trí')).toBeDefined();
      expect(nutTheoChu('Chuyển vị trí')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chức năng Làm mới (Reset bộ lọc và điều kiện tìm kiếm)', () => {
    it('bấm "Làm mới" xóa toàn bộ từ khóa tìm kiếm, khôi phục bãi mặc định ban đầu và đóng modal/ô đang chọn', () => {
      taoTrangDayDu();

      // Giả lập người dùng chuyển sang khu B, nhập từ khóa tìm kiếm và chọn ô
      noiBo()['selectYard']('bai-b');
      fixture.detectChanges();
      noiBo()['search'].set('30F-999.99');
      noiBo()['selectedSlotCode'].set('B01');
      fixture.detectChanges();

      expect(noiBo()['selectedYardId']()).toBe('bai-b');
      expect(noiBo()['search']()).toBe('30F-999.99');
      expect(noiBo()['selectedSlotCode']()).toBe('B01');

      const soLanYards = api.getYards.calls.count();

      // Bấm nút Làm mới trên thanh tiêu đề
      const reloadBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((btn) =>
        ((btn as HTMLButtonElement).textContent || '').includes('Làm mới'),
      ) as HTMLButtonElement;
      expect(reloadBtn).toBeDefined();
      reloadBtn.click();
      fixture.detectChanges();

      // Điều kiện tìm kiếm và bộ lọc được đưa về mặc định
      expect(noiBo()['search']()).toBe('');
      expect(noiBo()['allMode']()).toBe(false);
      expect(noiBo()['selectedSlotCode']()).toBe('');
      expect(noiBo()['selectedYardId']()).toBe('bai-a');
      expect(api.getYards.calls.count()).toBe(soLanYards + 1);
    });

    it('bấm nút xóa tìm kiếm trong ô tìm kiếm khôi phục toàn bộ danh sách ô', () => {
      taoTrangDayDu();

      const input = fixture.nativeElement.querySelector('.search input') as HTMLInputElement;
      input.value = '30F-999.99';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(noiBo()['search']()).toBe('30F-999.99');
      expect(noiBo()['visibleSlots']().length).toBe(1);

      // Nút xóa tìm kiếm xuất hiện khi có từ khóa
      const clearBtn = fixture.nativeElement.querySelector('.search__clear') as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();

      clearBtn.click();
      fixture.detectChanges();

      expect(noiBo()['search']()).toBe('');
      expect(noiBo()['visibleSlots']().length).toBe(5);
    });
  });
});
