import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DossierSummary } from '../../../core/models/declaration.model';
import { GateEvent, GateLookupResult, GateSummary } from '../../../core/models/gate.model';
import { QrScannerError, QrScannerService } from '../../../core/scanner/qr-scanner.service';
import { ApiService, Paged } from '../../../core/services/api.service';
import { GateControlPageComponent } from './gate-control-page.component';

/**
 * UI-09 Kiểm soát cổng (bố cục 2 LÀN song song — Đợt 2, bám mockup MH09).
 *
 * Bộ test khóa đúng độ phủ ý nghĩa của màn hình:
 *   - **Tra cứu theo từng làn** (Vào / Ra) độc lập, không dùng chung state.
 *   - Panel "Hồ sơ khớp với phương tiện" hiển thị đủ, **pill đúng/sai chiều** và **đèn tín hiệu**
 *     theo `statusColor` máy chủ trả.
 *   - `canOpen = false` ⇒ **không cho qua** và liệt kê rõ điều kiện còn thiếu (DoD của P4); API vẫn
 *     chặn bằng 409 nếu bị ép gửi.
 *   - **ALLOW / DENY per-lane** gọi `createGateEvent` đúng cổng của hồ sơ; DENY bắt buộc lý do.
 *   - **Bảng nhật ký chung** dùng `sg-table`, bind `occurredAt`.
 *   - KPI + bộ lọc cổng/ngày; camera là đường phụ (F34), ô nhập mã là đường chính.
 *
 * **Khung camera là placeholder trung thực** — không giả lập ANPR, nên không có test nào kỳ vọng
 * biển số tự nhận; "biển số nhận diện" chính là biển của hồ sơ vừa tra cứu.
 */

function hoSoTruyCap(permissions: string[] = ['gate.view', 'gate.approve']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'nvcong',
      displayName: 'Nguyễn Văn Công',
      title: 'Nhân viên cổng',
      email: 'cong@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'NHAN_VIEN_CONG', name: 'Nhân viên cổng', dataScope: 'ASSIGNMENT' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

function hoSo(mau: Partial<DossierSummary> = {}): DossierSummary {
  return {
    id: 'hs-1',
    code: 'HS-250519-0015',
    type: 'IMPORT',
    status: 'READY_FOR_EXIT',
    enterprise: { taxCode: '5501234567', name: 'Cty CP Nông sản Tây Bắc' },
    vehicle: { plateNumber: '26C-123.45', containerNumber: 'TCLU8765432' },
    vehicles: [{ plateNumber: '26C-123.45', containerNumber: 'TCLU8765432' }],
    driver: { fullName: 'Nguyễn Văn Hùng', idNumber: '012345678901' },
    cargoSummary: 'Ngô hạt',
    checkpoint: 'A1',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T02:00:00.000Z',
    ...mau,
  };
}

function ketQua(mau: Partial<GateLookupResult> = {}): GateLookupResult {
  return {
    dossier: hoSo(),
    gate: { code: 'A1', name: 'Cửa A1', direction: 'ENTRY' },
    evaluation: { canOpen: true, statusColor: 'GREEN', blockingReasons: [], requiredCompletedSteps: [] },
    checklist: [
      { code: 'BIEN_SO', label: 'Đối chiếu biển số thực tế', required: true, checked: true },
      { code: 'LAI_XE', label: 'Đối chiếu giấy tờ lái xe', required: true, checked: true },
      { code: 'ANH', label: 'Chụp ảnh phương tiện', required: false, checked: false },
    ],
    ...mau,
  };
}

function trangSuKien(items: GateEvent[] = [], total?: number): Paged<GateEvent> {
  return { items, total: total ?? items.length, page: 1, pageSize: 20 };
}

function suKienCong(mau: Partial<GateEvent> = {}): GateEvent {
  return {
    id: 'ev-1',
    occurredAt: '2026-07-25T02:00:00.000Z',
    dossierId: 'hs-1',
    dossierCode: 'HS-250519-0015',
    plateNumber: '26C-123.45',
    gateCode: 'A1',
    gateName: 'Cửa A1 - Nhập cảnh',
    direction: 'ENTRY',
    decision: 'ALLOW',
    actorName: 'Nguyễn Văn Công',
    ...mau,
  };
}

function tongHopCong(mau: Partial<GateSummary> = {}): GateSummary {
  return { gateCode: null, allowed: 12, denied: 3, total: 15, ...mau };
}

describe('GateControlPageComponent — kiểm soát cổng (2 làn)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<GateControlPageComponent>;
  let component: GateControlPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  /** State của một làn (Vào = 'in' · Ra = 'out'). */
  function lan(dir: 'in' | 'out'): any {
    return noiBo()['lanes'][dir];
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [GateControlPageComponent],
      providers: [provideRouter([{ path: 'declarations/:id', children: [] }]), { provide: ApiService, useValue: api }],
    });

    fixture = TestBed.createComponent(GateControlPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Tra cứu ở một làn cụ thể — mặc định làn Vào. */
  function traCuu(dir: 'in' | 'out' = 'in', ma = 'HS-250519-0015'): void {
    lan(dir).codeInput = ma;
    noiBo()['lookup'](lan(dir));
    fixture.detectChanges();
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  function khungLan(dir: 'in' | 'out'): HTMLElement | null {
    return fixture.nativeElement.querySelector(`.lane[data-dir="${dir}"]`);
  }

  /** Nút "Xác nhận vào/ra cổng" (ALLOW) của làn — nhãn khác nhau theo làn. */
  function nutChoQua(dir: 'in' | 'out' = 'in'): HTMLButtonElement | null {
    const scope = khungLan(dir);
    if (!scope) return null;
    const nut = Array.from(scope.querySelectorAll('button')) as HTMLButtonElement[];
    const nhan = dir === 'in' ? 'Xác nhận vào cổng' : 'Xác nhận ra cổng';
    return nut.find((item) => (item.textContent || '').includes(nhan)) || null;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'lookupGateDossier',
      'createGateEvent',
      'getGateEvents',
      'getGateSummary',
      'getAccessProfile',
    ]);
    api.lookupGateDossier.and.returnValue(of(ketQua()));
    api.createGateEvent.and.returnValue(of({ id: 'ev-1', decision: 'ALLOW' } as GateEvent));
    api.getGateEvents.and.returnValue(of(trangSuKien()));
    api.getGateSummary.and.returnValue(of(tongHopCong()));
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Tra cứu hồ sơ theo làn', () => {
    it('có đúng hai làn Vào / Ra', () => {
      taoTrang();

      expect(khungLan('in')).not.toBeNull();
      expect(khungLan('out')).not.toBeNull();
    });

    it('chưa nhập mã thì báo lỗi tại chỗ của làn, không gọi API', () => {
      taoTrang();
      noiBo()['lookup'](lan('in'));

      expect(api.lookupGateDossier).not.toHaveBeenCalled();
      expect(lan('in').lookupError()).toBe('Vui lòng nhập mã hồ sơ cần tra cứu.');
    });

    it('tra cứu làn Vào thành công thì panel hiện hồ sơ, cổng và checklist', () => {
      taoTrang();
      traCuu('in');

      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'ENTRY');
      const noiDung = khungLan('in')?.textContent || '';
      expect(noiDung).toContain('HS-250519-0015');
      expect(noiDung).toContain('26C-123.45');
      expect(noiDung).toContain('Cty CP Nông sản Tây Bắc');
      expect(noiDung).toContain('Hồ sơ khớp với phương tiện');
    });

    it('hai làn độc lập: tra cứu làn Vào không đụng làn Ra', () => {
      taoTrang();
      traCuu('in');

      expect(lan('in').result()).not.toBeNull();
      expect(lan('out').result()).toBeNull();
      expect(khungLan('out')?.textContent).toContain('Nhập mã hoặc quét QR để đối chiếu hồ sơ');
    });

    it('nút xác nhận đổi nhãn theo làn (vào cổng / ra cổng)', () => {
      taoTrang();
      traCuu('in');
      traCuu('out');

      expect(nutChoQua('in')?.textContent).toContain('Xác nhận vào cổng');
      expect(nutChoQua('out')?.textContent).toContain('Xác nhận ra cổng');
    });

    it('cắt khoảng trắng thừa của mã trước khi gọi API', () => {
      taoTrang();
      traCuu('in', '  HS-250519-0015  ');

      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'ENTRY');
    });

    it('BUG-018: mỗi làn tra cứu với đúng chiều của làn (Vào=ENTRY · Ra=EXIT)', () => {
      taoTrang();
      traCuu('in');
      traCuu('out');

      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'ENTRY');
      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'EXIT');
    });

    it('không tìm thấy hồ sơ (404) thì báo rõ ở làn, không hiện panel kết quả', () => {
      api.lookupGateDossier.and.returnValue(throwError(() => ({ status: 404, error: { message: 'Không tìm thấy hồ sơ HS-000.' } })));
      taoTrang();
      traCuu('in', 'HS-000');

      expect(lan('in').result()).toBeNull();
      expect(lan('in').lookupError()).toBe('Không tìm thấy hồ sơ HS-000.');
      expect(khungLan('in')?.textContent).toContain('Không tìm thấy hồ sơ HS-000.');
    });

    it('hồ sơ không đủ điều kiện tra cứu theo cổng (409) thì báo lỗi và không hiện panel', () => {
      api.lookupGateDossier.and.returnValue(
        throwError(() => ({ status: 409, error: { message: 'Hồ sơ HS-COMPLETED đã hoàn thành hoặc đã rời cửa khẩu.' } })),
      );
      taoTrang();
      traCuu('in', 'HS-COMPLETED');

      expect(lan('in').result()).toBeNull();
      expect(lan('in').lookupError()).toBe('Hồ sơ HS-COMPLETED đã hoàn thành hoặc đã rời cửa khẩu.');
      expect(khungLan('in')?.textContent).toContain('Hồ sơ HS-COMPLETED đã hoàn thành hoặc đã rời cửa khẩu.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('canOpen = false — chặn cho qua và nêu rõ điều kiện còn thiếu (DoD P4)', () => {
    const chuaDu = ketQua({
      evaluation: {
        canOpen: false,
        statusColor: 'RED',
        blockingReasons: ['Chưa thanh toán phí hạ tầng cửa khẩu', 'Hồ sơ đang ở trạng thái chờ bổ sung'],
        requiredCompletedSteps: ['Kiểm dịch thực vật'],
      },
    });

    it('BUG-019: điều kiện workflow chưa đạt thì khóa nút cho qua', () => {
      api.lookupGateDossier.and.returnValue(of(chuaDu));
      taoTrang();
      traCuu('in');

      expect(noiBo()['canAllow'](lan('in'))).toBe(false);
      expect(nutChoQua('in')?.disabled).toBe(true);
    });

    it('khóa nút xác nhận cho qua của làn', () => {
      api.lookupGateDossier.and.returnValue(of(chuaDu));
      taoTrang();
      traCuu('in');

      expect(noiBo()['canAllow'](lan('in'))).toBe(false);
      expect(nutChoQua('in')?.disabled).toBe(true);
      expect(khungLan('in')?.textContent).toContain('Nút xác nhận cho qua đang bị khóa');
    });

    it('ép gọi ALLOW vẫn bị chặn ở web, không gửi request nào', () => {
      api.lookupGateDossier.and.returnValue(of(chuaDu));
      taoTrang();
      traCuu('in');

      noiBo()['record'](lan('in'), 'ALLOW');
      fixture.detectChanges();

      expect(api.createGateEvent).not.toHaveBeenCalled();
      expect(lan('in').actionError()).toBe('Hồ sơ chưa đủ điều kiện qua cổng nên không thể xác nhận cho qua.');
    });

    it('vẫn cho phép ghi nhận từ chối cho qua kèm lý do', () => {
      api.lookupGateDossier.and.returnValue(of(chuaDu));
      taoTrang();
      traCuu('in');

      lan('in').note = 'Thiếu chứng thư kiểm dịch';
      noiBo()['record'](lan('in'), 'DENY');

      expect(api.createGateEvent).toHaveBeenCalledWith(
        jasmine.objectContaining({ dossierId: 'hs-1', gateCode: 'A1', decision: 'DENY', note: 'Thiếu chứng thư kiểm dịch' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ghi nhận sự kiện cổng per-lane (F38)', () => {
    it('đủ điều kiện thì gửi ALLOW theo cổng của hồ sơ', () => {
      taoTrang();
      traCuu('in');

      expect(noiBo()['canAllow'](lan('in'))).toBe(true);
      expect(nutChoQua('in')?.disabled).toBe(false);

      noiBo()['record'](lan('in'), 'ALLOW');

      const payload = api.createGateEvent.calls.mostRecent().args[0];
      expect(payload.decision).toBe('ALLOW');
      expect(payload.gateCode).toBe('A1');
    });

    it('làn Ra ghi nhận theo cổng của chính hồ sơ đã tra ở làn Ra', () => {
      api.lookupGateDossier.and.returnValue(
        of(ketQua({ dossier: hoSo({ id: 'hs-9', code: 'HS-OUT' }), gate: { code: 'B1', name: 'Cửa B1', direction: 'EXIT' } })),
      );
      taoTrang();
      traCuu('out', 'HS-OUT');

      noiBo()['record'](lan('out'), 'ALLOW');

      expect(api.createGateEvent).toHaveBeenCalledWith(
        jasmine.objectContaining({ dossierId: 'hs-9', gateCode: 'B1', decision: 'ALLOW' }),
      );
    });

    it('từ chối cho qua mà không nhập lý do thì báo lỗi tại ô ghi chú của làn', () => {
      taoTrang();
      traCuu('in');

      noiBo()['record'](lan('in'), 'DENY');

      expect(api.createGateEvent).not.toHaveBeenCalled();
      expect(lan('in').noteError()).toBe('Vui lòng nhập lý do từ chối cho qua.');
    });

    it('API trả 409 thì hiện NGUYÊN danh sách điều kiện còn thiếu ở làn, không nuốt lỗi', () => {
      api.createGateEvent.and.returnValue(
        throwError(() => ({
          status: 409,
          error: {
            message: 'Hồ sơ chưa đủ điều kiện qua cổng.',
            blockingReasons: ['Chưa thanh toán phí hạ tầng cửa khẩu', 'Chưa hoàn thành kiểm dịch động vật'],
          },
        })),
      );
      taoTrang();
      traCuu('in');

      noiBo()['record'](lan('in'), 'ALLOW');
      fixture.detectChanges();

      expect(lan('in').blockingReasons()).toEqual(['Chưa thanh toán phí hạ tầng cửa khẩu', 'Chưa hoàn thành kiểm dịch động vật']);
      const noiDung = khungLan('in')?.textContent || '';
      expect(noiDung).toContain('Hồ sơ chưa đủ điều kiện qua cổng');
      expect(noiDung).toContain('Chưa thanh toán phí hạ tầng cửa khẩu');
      expect(noiDung).toContain('Chưa hoàn thành kiểm dịch động vật');
      expect(lan('in').actionError()).toBe('Hồ sơ chưa đủ điều kiện qua cổng.');
    });

    it('409 không kèm danh sách thì vẫn báo cho người dùng biết phải tra cứu lại', () => {
      api.createGateEvent.and.returnValue(throwError(() => ({ status: 409, error: {} })));
      taoTrang();
      traCuu('in');

      noiBo()['record'](lan('in'), 'ALLOW');

      expect(lan('in').blockingReasons().length).toBe(1);
      expect(lan('in').blockingReasons()[0]).toContain('tra cứu lại');
    });

    it('ghi nhận thành công thì báo thành công và tra cứu lại hồ sơ của làn', () => {
      taoTrang();
      traCuu('in');
      const soLan = api.lookupGateDossier.calls.count();

      noiBo()['record'](lan('in'), 'ALLOW');
      fixture.detectChanges();

      expect(lan('in').feedback()).toContain('Đã ghi nhận sự kiện cổng');
      expect(api.lookupGateDossier.calls.count()).toBe(soLan + 1);
    });

    it('không có quyền gate.approve thì ẩn hẳn nút ghi nhận sự kiện', () => {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(['gate.view']) }),
      );
      taoTrang();
      traCuu('in');

      expect(noiBo()['canOperate']()).toBe(false);
      expect(nutChoQua('in')).toBeNull();
    });

    it('có quyền gate.approve thì bật thao tác cho qua/từ chối (A1)', () => {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(['gate.view', 'gate.approve']) }),
      );
      taoTrang();
      traCuu('in');

      expect(noiBo()['canOperate']()).toBe(true);
      expect(nutChoQua('in')).not.toBeNull();
    });

    it('có gate.update nhưng KHÔNG có gate.approve thì vẫn khóa thao tác (A1)', () => {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(['gate.view', 'gate.update']) }),
      );
      taoTrang();
      traCuu('in');

      expect(noiBo()['canOperate']()).toBe(false);
      expect(nutChoQua('in')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('CR2 — "Ưu tiên kiểm dịch" chỉ ở làn Vào, gắn với CHO QUA', () => {
    /** Kết quả tra cứu cổng RA (EXIT) còn đủ điều kiện — cho phép ghi ALLOW ở làn Ra. */
    function ketQuaRa(): GateLookupResult {
      return ketQua({
        dossier: hoSo({ id: 'hs-out', code: 'HS-OUT' }),
        gate: { code: 'B1', name: 'Cửa B1', direction: 'EXIT' },
      });
    }

    it('ô "Ưu tiên kiểm dịch" chỉ xuất hiện ở làn Vào, không có ở làn Ra', () => {
      taoTrang();
      traCuu('in');
      api.lookupGateDossier.and.returnValue(of(ketQuaRa()));
      traCuu('out', 'HS-OUT');

      expect(khungLan('in')?.querySelector('.epidemic input[type="checkbox"]')).not.toBeNull();
      expect(khungLan('out')?.querySelector('.epidemic')).toBeNull();
    });

    it('làn Vào + CHO QUA + đã tích thì gửi prioritizeQuarantine = true', () => {
      taoTrang();
      traCuu('in');
      lan('in').prioritizeQuarantine = true;

      noiBo()['record'](lan('in'), 'ALLOW');

      expect(api.createGateEvent.calls.mostRecent().args[0].prioritizeQuarantine).toBe(true);
    });

    it('làn Vào + CHO QUA nhưng KHÔNG tích thì không gửi cờ (undefined)', () => {
      taoTrang();
      traCuu('in');

      noiBo()['record'](lan('in'), 'ALLOW');

      expect(api.createGateEvent.calls.mostRecent().args[0].prioritizeQuarantine).toBeUndefined();
    });

    it('làn Vào + TỪ CHỐI dù đã tích cũng không gửi cờ (chỉ áp cho CHO QUA)', () => {
      taoTrang();
      traCuu('in');
      lan('in').prioritizeQuarantine = true;
      lan('in').note = 'Xe quay đầu bổ sung chứng từ';

      noiBo()['record'](lan('in'), 'DENY');

      expect(api.createGateEvent.calls.mostRecent().args[0].prioritizeQuarantine).toBeUndefined();
    });

    it('làn Ra + CHO QUA không bao giờ gửi cờ dịch tễ', () => {
      api.lookupGateDossier.and.returnValue(of(ketQuaRa()));
      taoTrang();
      traCuu('out', 'HS-OUT');
      lan('out').prioritizeQuarantine = true;

      noiBo()['record'](lan('out'), 'ALLOW');

      expect(api.createGateEvent.calls.mostRecent().args[0].prioritizeQuarantine).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ranh giới phạm vi MVP', () => {
    it('không vẽ nút điều khiển barie (F40 thuộc Giai đoạn 2)', () => {
      taoTrang();
      traCuu('in');
      const noiDung = noiDungTrang();

      expect(noiDung).not.toContain('Mở cổng');
      expect(noiDung).not.toContain('Đóng cổng');
      expect(noiDung).toContain('ghi nhận sự kiện xe qua cổng');
    });

    it('mỗi làn có ô nhập mã hồ sơ riêng bên cạnh khung quét QR', () => {
      taoTrang();

      expect(fixture.nativeElement.querySelector('.lane[data-dir="in"] input[name="dossierCode-in"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.lane[data-dir="out"] input[name="dossierCode-out"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.scanner').length).toBe(2);
    });

    it('không còn nhãn "Placeholder" trên khung camera', () => {
      taoTrang();

      expect(noiDungTrang()).not.toContain('Placeholder');
      expect(noiDungTrang()).toContain('Camera nhận diện biển số');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Quét QR bằng camera (F34) — theo làn, camera là đường phụ', () => {
    function scannerGia(mau: Partial<QrScannerService> = {}): QrScannerService {
      return {
        supportCheck: () => null,
        isRunning: () => false,
        start: async () => undefined,
        stop: () => undefined,
        ...mau,
      } as unknown as QrScannerService;
    }

    function taoTrangVoiScanner(scanner: QrScannerService): void {
      TestBed.configureTestingModule({
        imports: [GateControlPageComponent],
        providers: [
          provideRouter([{ path: 'declarations/:id', children: [] }]),
          { provide: ApiService, useValue: api },
          { provide: QrScannerService, useValue: scanner },
        ],
      });

      fixture = TestBed.createComponent(GateControlPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    }

    function videoLan(dir: 'in' | 'out'): HTMLVideoElement {
      return fixture.nativeElement.querySelector(`.lane[data-dir="${dir}"] video`) as HTMLVideoElement;
    }

    /** Bật quét ở một làn rồi trả về cách bắn kết quả quét vào làn đó. */
    async function batDauQuet(dir: 'in' | 'out' = 'in'): Promise<{ batDuoc: (text: string) => void; demDung: () => number }> {
      let onText: (text: string) => void = () => undefined;
      let soLanDung = 0;
      taoTrangVoiScanner(
        scannerGia({
          start: async (_video: HTMLVideoElement, callback: (text: string) => void) => {
            onText = callback;
          },
          stop: () => {
            soLanDung++;
          },
        }),
      );

      await noiBo()['startScan'](lan(dir), videoLan(dir));
      fixture.detectChanges();
      expect(noiBo()['scanning'](lan(dir))).toBe(true);

      return { batDuoc: (text: string) => onText(text), demDung: () => soLanDung };
    }

    it('máy trạm không có camera: nêu rõ lý do và ô nhập mã vẫn tra cứu được', () => {
      taoTrangVoiScanner(scannerGia({ supportCheck: () => 'NO_CAMERA' }));

      const noiDung = noiDungTrang();
      expect(noiDung).toContain('Không tìm thấy camera nào trên máy trạm này.');
      expect(noiDung).not.toContain('Bật camera');

      traCuu('in');

      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'ENTRY');
    });

    it('chạy trên HTTP thường thì báo đúng lý do, không vẽ nút bật camera', () => {
      taoTrangVoiScanner(scannerGia({ supportCheck: () => 'INSECURE_CONTEXT' }));

      expect(noiDungTrang()).toContain('Trình duyệt chỉ cho dùng camera trên kết nối HTTPS.');
      expect(fixture.nativeElement.querySelector('video')).toBeNull();
    });

    it('người dùng từ chối quyền camera: báo lý do ở làn, không khóa ô nhập mã', async () => {
      taoTrangVoiScanner(scannerGia({ start: () => Promise.reject(new QrScannerError('PERMISSION_DENIED')) }));

      await noiBo()['startScan'](lan('in'), videoLan('in'));
      fixture.detectChanges();

      expect(noiBo()['scanning'](lan('in'))).toBe(false);
      expect(lan('in').scanError()).toBe('Quyền dùng camera đã bị từ chối.');

      traCuu('in');
      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'ENTRY');
    });

    it('quét trúng mã ở làn thì TẮT camera ngay rồi tra cứu cho làn đó', async () => {
      const { batDuoc, demDung } = await batDauQuet('in');
      const truoc = demDung();

      batDuoc(`SG1|HS-250519-0015|${Math.floor(Date.now() / 1000)}`);
      fixture.detectChanges();

      expect(demDung()).toBeGreaterThan(truoc);
      expect(noiBo()['scanning'](lan('in'))).toBe(false);
      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'ENTRY');
      expect(lan('in').result()).not.toBeNull();
    });

    it('quét nhầm mã QR của thứ khác thì cảnh báo tại làn, KHÔNG bắn tra cứu vô nghĩa', async () => {
      const { batDuoc } = await batDauQuet('in');

      batDuoc('https://example.com/khuyen-mai');
      fixture.detectChanges();

      expect(api.lookupGateDossier).not.toHaveBeenCalled();
      expect(noiBo()['scanning'](lan('in'))).toBe(true);
      expect(lan('in').scanError()).toContain('không phải mã hồ sơ của hệ thống');
    });

    it('mã QR quá hạn vẫn tra cứu được nhưng có cảnh báo (điểm C3 chưa chốt)', async () => {
      const { batDuoc } = await batDauQuet('in');
      const haiNgayTruoc = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;

      batDuoc(`SG1|HS-250519-0015|${haiNgayTruoc}`);
      fixture.detectChanges();

      expect(api.lookupGateDossier).toHaveBeenCalledWith('HS-250519-0015', 'ENTRY');
      expect(lan('in').scanNotice()).toContain('quá hạn hiệu lực');
    });

    it('rời màn hình thì tắt camera, không để đèn camera sáng mãi', () => {
      let daDung = 0;
      taoTrangVoiScanner(scannerGia({ stop: () => { daDung++; } }));

      fixture.destroy();

      expect(daDung).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bảng nhật ký chung — sg-table (Đợt 2)', () => {
    function demTaiGanDay(): number {
      return api.getGateEvents.calls.all().filter((call) => (call.args[0] as { pageSize?: number })?.pageSize === 10).length;
    }

    it('tải nhật ký gần đây ngay khi mở màn hình (phân trang 10, không lọc theo hồ sơ)', () => {
      taoTrang();

      expect(api.getGateEvents).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    });

    it('render các dòng qua sg-table với thời gian từ occurredAt, không rơi về "—"', () => {
      api.getGateEvents.and.returnValue(
        of(
          trangSuKien([
            suKienCong({ id: 'in-1', direction: 'ENTRY', plateNumber: '26C-111.11' }),
            suKienCong({ id: 'out-1', direction: 'EXIT', plateNumber: '26C-222.22', decision: 'DENY' }),
          ]),
        ),
      );
      taoTrang();

      const bang = fixture.nativeElement.querySelector('.log sg-table') as HTMLElement;
      expect(bang).not.toBeNull();
      const hang = bang.querySelectorAll('tbody tr');
      // 2 dòng dữ liệu (không có hàng trạng thái loading/empty vì đã có dữ liệu).
      expect(hang.length).toBe(2);
      const oThoiGian = hang[0].querySelector('td') as HTMLElement;
      expect(oThoiGian.textContent?.trim()).not.toBe('—');
      expect(oThoiGian.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('cột Hướng hiển thị tag Vào / Ra theo trường direction', () => {
      api.getGateEvents.and.returnValue(
        of(
          trangSuKien([
            suKienCong({ id: 'in-1', direction: 'ENTRY' }),
            suKienCong({ id: 'out-1', direction: 'EXIT' }),
          ]),
        ),
      );
      taoTrang();

      const tags = Array.from(fixture.nativeElement.querySelectorAll('.log .direction-tag')) as HTMLElement[];
      expect(tags.length).toBe(2);
      expect(tags.find((el) => el.getAttribute('data-dir') === 'in')?.textContent?.trim()).toBe('Vào');
      expect(tags.find((el) => el.getAttribute('data-dir') === 'out')?.textContent?.trim()).toBe('Ra');
    });

    it('hiển thị cột Ghi chú và nội dung lý do từ chối / ghi chú trong nhật ký', () => {
      api.getGateEvents.and.returnValue(
        of(
          trangSuKien([
            suKienCong({
              id: 'deny-1',
              direction: 'ENTRY',
              plateNumber: '26C-999.99',
              decision: 'DENY',
              note: 'Hồ sơ chưa có kết quả kiểm dịch thực vật',
            }),
            suKienCong({ id: 'allow-1', direction: 'ENTRY', plateNumber: '26C-111.11', decision: 'ALLOW', note: undefined }),
          ]),
        ),
      );
      taoTrang();

      const columns = noiBo()['logColumns']();
      expect(columns.some((c: any) => c.key === 'note')).toBeTrue();

      const hang = fixture.nativeElement.querySelectorAll('.log sg-table tbody tr');
      expect(hang.length).toBe(2);

      const oGhiChuDong1 = hang[0].querySelectorAll('td')[6];
      expect(oGhiChuDong1.textContent?.trim()).toBe('Hồ sơ chưa có kết quả kiểm dịch thực vật');

      const oGhiChuDong2 = hang[1].querySelectorAll('td')[6];
      expect(oGhiChuDong2.textContent?.trim()).toBe('—');
    });

    it('không có sự kiện thì bảng báo trống đúng thông điệp', () => {
      api.getGateEvents.and.returnValue(of(trangSuKien([])));
      taoTrang();

      expect(fixture.nativeElement.querySelector('.log').textContent).toContain('Chưa có sự kiện qua cổng nào gần đây.');
    });

    it('ghi nhận sự kiện cổng xong thì LÀM MỚI nhật ký gần đây', () => {
      taoTrang();
      traCuu('in');
      const truoc = demTaiGanDay();

      noiBo()['record'](lan('in'), 'ALLOW');
      fixture.detectChanges();

      expect(demTaiGanDay()).toBe(truoc + 1);
    });

    it('bấm làm mới thì gọi lại getGateEvents (trang 20)', () => {
      taoTrang();
      const truoc = demTaiGanDay();

      noiBo()['reloadRecent']();

      expect(demTaiGanDay()).toBe(truoc + 1);
    });

    it('lỗi tải nhật ký thì báo lỗi riêng và bảng rỗng, không làm hỏng luồng tra cứu', () => {
      api.getGateEvents.and.returnValue(throwError(() => new Error('mat ket noi')));
      taoTrang();

      expect(noiBo()['recentError']()).toBe('Không tải được nhật ký qua cổng gần đây.');
      expect(noiBo()['recentEvents']().length).toBe(0);
    });

    it('SG-235: hiển thị phân trang và chọn kích thước trang cho nhật ký qua cổng (kiểm tra wiring sg-pager & DOM)', () => {
      api.getGateEvents.and.returnValue(
        of(trangSuKien([suKienCong({ id: 'in-1' })], 45)),
      );
      taoTrang();

      const pagerEl = fixture.nativeElement.querySelector('.log sg-pager');
      expect(pagerEl).not.toBeNull();
      expect(noiBo()['recentTotal']()).toBe(45);
      expect(noiBo()['recentTotalPages']()).toBe(5);
      expect(noiBo()['recentSummary']()).toBe('Hiển thị 1 đến 10 trong tổng số 45 bản ghi');

      // Kiểm tra wiring sg-select có nhãn "Hiển thị" và aria-label chuẩn ui.common.pageSizeAria
      const selectEl = fixture.nativeElement.querySelector('.pager sg-select');
      expect(selectEl).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.pager__label')?.textContent?.trim()).toBe('Hiển thị');
      expect(selectEl.getAttribute('ng-reflect-aria-label') || selectEl.getAttribute('aria-label')).toContain('Số dòng mỗi trang');

      // Thao tác qua DOM của sg-pager
      const pageButtons = Array.from(fixture.nativeElement.querySelectorAll('sg-pager button')) as HTMLButtonElement[];
      expect(pageButtons.length).toBeGreaterThan(1);
      const btnPage2 = pageButtons.find((btn) => btn.textContent?.trim() === '2');
      expect(btnPage2).not.toBeUndefined();
      btnPage2?.click();
      fixture.detectChanges();

      expect(api.getGateEvents).toHaveBeenCalledWith(jasmine.objectContaining({ page: 2, pageSize: 10 }));

      // Thao tác đổi pageSize
      noiBo()['changeRecentPageSize']('50');
      expect(api.getGateEvents).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1, pageSize: 50 }));
    });
  });

  // ---------------------------------------------------------------------------
  describe('KPI lượt qua cổng hôm nay (getGateSummary)', () => {
    function giaTriKpi(loai: 'allow' | 'deny' | 'total'): string {
      const the = fixture.nativeElement.querySelector(`.kpi--${loai} .kpi__value`) as HTMLElement;
      return (the?.textContent ?? '').trim();
    }

    it('nạp KPI ngay khi mở màn hình và hiện 3 thẻ Cho qua / Từ chối / Tổng', () => {
      taoTrang();

      expect(api.getGateSummary).toHaveBeenCalled();
      const noiDung = noiDungTrang();
      expect(noiDung).toContain('Lượt cho qua hôm nay');
      expect(noiDung).toContain('Lượt từ chối hôm nay');
      expect(noiDung).toContain('Tổng lượt hôm nay');
      expect(giaTriKpi('allow')).toBe('12');
      expect(giaTriKpi('deny')).toBe('3');
      expect(giaTriKpi('total')).toBe('15');
    });

    it('làm mới KPI sau khi ghi nhận sự kiện cổng', () => {
      taoTrang();
      traCuu('in');
      const truoc = api.getGateSummary.calls.count();
      api.getGateSummary.and.returnValue(of(tongHopCong({ allowed: 13, denied: 3, total: 16 })));

      noiBo()['record'](lan('in'), 'ALLOW');
      fixture.detectChanges();

      expect(api.getGateSummary.calls.count()).toBe(truoc + 1);
      expect(giaTriKpi('allow')).toBe('13');
      expect(giaTriKpi('total')).toBe('16');
    });

    it('lỗi tải KPI thì báo cảnh báo và giá trị về "—"', () => {
      api.getGateSummary.and.returnValue(throwError(() => new Error('mat ket noi')));
      taoTrang();

      expect(noiBo()['summaryError']()).toBe('Không tải được số liệu qua cổng hôm nay.');
      expect(giaTriKpi('allow')).toBe('—');
      expect(giaTriKpi('total')).toBe('—');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bộ lọc nhật ký qua cổng gần đây (6 tiêu chí)', () => {
    it('không bị trùng option "tất cả" trong bộ lọc Hướng và Kết quả', () => {
      taoTrang();

      const directionSelect = fixture.nativeElement.querySelector('sg-select[ariaLabel="ui.gate.filterDirection"] select') as HTMLSelectElement;
      if (directionSelect) {
        const emptyOptions = Array.from(directionSelect.options).filter((opt) => opt.value === '');
        expect(emptyOptions.length).toBe(1);
      }

      const decisionSelect = fixture.nativeElement.querySelector('sg-select[ariaLabel="ui.gate.filterDecision"] select') as HTMLSelectElement;
      if (decisionSelect) {
        const emptyOptions = Array.from(decisionSelect.options).filter((opt) => opt.value === '');
        expect(emptyOptions.length).toBe(1);
      }
    });

    it('không có bộ lọc Cổng và cột Cổng trong bảng nhật ký qua cổng', () => {
      taoTrang();

      const gateSelect = fixture.nativeElement.querySelector('sg-select[ariaLabel="ui.gate.filterGate"]');
      expect(gateSelect).toBeNull();

      const columns = noiBo()['logColumns']();
      expect(columns.some((c: any) => c.key === 'gate')).toBeFalse();
    });

    it('áp dụng đầy đủ 6 tiêu chí lọc vào getGateEvents của nhật ký', () => {
      taoTrang();

      noiBo()['filterPlate'] = '26C-123.45';
      noiBo()['filterDossierCode'] = 'HS-250519-0015';
      noiBo()['filterDirection'] = 'ENTRY';
      noiBo()['filterDecision'] = 'ALLOW';
      noiBo()['filterActor'] = 'Nguyễn Văn Công';
      noiBo()['filterFrom'] = '2026-07-20';
      noiBo()['filterTo'] = '2026-07-25';

      noiBo()['loadRecentEvents']();

      const call = api.getGateEvents.calls
        .all()
        .map((item) => item.args[0] as Record<string, unknown>)
        .filter((args) => args?.['pageSize'] === 10)
        .pop();

      expect(call?.['plateNumber']).toBe('26C-123.45');
      expect(call?.['dossierCode']).toBe('HS-250519-0015');
      expect(call?.['direction']).toBe('ENTRY');
      expect(call?.['decision']).toBe('ALLOW');
      expect(call?.['actorName']).toBe('Nguyễn Văn Công');
      expect(call?.['from']).toBe('2026-07-20T00:00:00');
      expect(call?.['to']).toBe('2026-07-25T23:59:59');
    });

    it('bấm đặt lại bộ lọc thì xóa sạch tiêu chí và tải lại danh sách', () => {
      taoTrang();

      noiBo()['filterPlate'] = '26C-123.45';
      noiBo()['filterDossierCode'] = 'HS-250519-0015';
      noiBo()['filterDirection'] = 'ENTRY';
      noiBo()['filterDecision'] = 'ALLOW';
      noiBo()['filterActor'] = 'Nguyễn Văn Công';
      noiBo()['filterFrom'] = '2026-07-20';
      noiBo()['filterTo'] = '2026-07-25';

      noiBo()['resetLogFilters']();

      expect(noiBo()['filterPlate']).toBe('');
      expect(noiBo()['filterDossierCode']).toBe('');
      expect(noiBo()['filterDirection']).toBe('');
      expect(noiBo()['filterDecision']).toBe('');
      expect(noiBo()['filterActor']).toBe('');
      expect(noiBo()['filterFrom']).toBe('');
      expect(noiBo()['filterTo']).toBe('');

      const lastCall = api.getGateEvents.calls.mostRecent().args[0] as Record<string, unknown>;
      expect(lastCall['plateNumber']).toBeUndefined();
      expect(lastCall['dossierCode']).toBeUndefined();
      expect(lastCall['direction']).toBeUndefined();
      expect(lastCall['decision']).toBeUndefined();
      expect(lastCall['actorName']).toBeUndefined();
      expect(lastCall['from']).toBeUndefined();
      expect(lastCall['to']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Đèn tín hiệu 3 màu + pill đúng/sai chiều (theo làn)', () => {
    function traCuuVoi(mau: Partial<GateLookupResult>): void {
      api.lookupGateDossier.and.returnValue(of(ketQua(mau)));
      taoTrang();
      traCuu('in');
    }

    it('đèn xanh sáng khi statusColor = GREEN', () => {
      traCuuVoi({ evaluation: { canOpen: true, statusColor: 'GREEN', blockingReasons: [], requiredCompletedSteps: [] } });

      expect(khungLan('in')?.querySelector('.light--green.on')).not.toBeNull();
      expect(khungLan('in')?.querySelector('.light--amber.on')).toBeNull();
      expect(khungLan('in')?.querySelector('.light--red.on')).toBeNull();
    });

    it('đèn vàng sáng khi statusColor = YELLOW', () => {
      traCuuVoi({ evaluation: { canOpen: true, statusColor: 'YELLOW', blockingReasons: [], requiredCompletedSteps: [] } });

      expect(khungLan('in')?.querySelector('.light--amber.on')).not.toBeNull();
      expect(khungLan('in')?.querySelector('.light--green.on')).toBeNull();
    });

    it('đèn đỏ sáng khi statusColor = RED', () => {
      traCuuVoi({ evaluation: { canOpen: false, statusColor: 'RED', blockingReasons: ['Chưa xong'], requiredCompletedSteps: [] } });

      expect(khungLan('in')?.querySelector('.light--red.on')).not.toBeNull();
      expect(khungLan('in')?.querySelector('.light--green.on')).toBeNull();
    });

    it('SG-238: không hiển thị thông tin cổng và pill đúng/sai chiều khi tra cứu cổng', () => {
      traCuuVoi({ dossier: hoSo({ type: 'IMPORT' }), gate: { code: 'B1', name: 'Cửa B1', direction: 'EXIT' } });

      const pill = khungLan('in')?.querySelector('.pill');
      expect(pill).toBeNull();

      const factsText = khungLan('in')?.querySelector('.facts')?.textContent || '';
      expect(factsText).not.toContain('B1 — Cổng ra');
    });
  });
});
