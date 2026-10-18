import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DossierDetail } from '../../../core/models/declaration.model';
import { ApiService } from '../../../core/services/api.service';
import { DeclarationDetailPageComponent } from './declaration-detail-page.component';

/**
 * UI-05 Chi tiết hồ sơ và timeline (P2).
 * Trọng tâm: stepper liên ngành đúng trạng thái, timeline đọc được, mã QR được vẽ,
 * và các trạng thái tải / lỗi theo SRS 8.1.
 */

function hoSoTruyCap(
  permissions: string[] = ['dossier.view', 'dossier.update', 'dossier.approve', 'workflow.view'],
): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'haiquan',
      displayName: 'Lê Văn Nam',
      title: 'Cán bộ Hải quan',
      email: 'nam@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', dataScope: 'ASSIGNMENT' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

function hoSo(mau: Partial<DossierDetail> = {}): DossierDetail {
  return {
    id: 'hs-1',
    code: 'HS-250519-0015',
    type: 'IMPORT',
    status: 'PROCESSING',
    enterprise: { taxCode: '5501234567', name: 'Cty CP Nông sản Tây Bắc', phone: '0912345678' },
    vehicle: { plateNumber: '26C-123.45', containerNumber: 'TCLU8765432' },
    vehicles: [
      {
        plateNumber: '26C-123.45',
        containerNumber: 'TCLU8765432',
        driver: { fullName: 'Nguyễn Văn Hùng', idNumber: '012345678901', phone: '0912345678' },
      },
    ],
    driver: { fullName: 'Nguyễn Văn Hùng', idNumber: '012345678901', phone: '0912345678' },
    cargoSummary: 'Ngô hạt',
    checkpoint: 'A1',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T02:00:00.000Z',
    submittedAt: '2026-07-22T01:00:00.000Z',
    cargoItems: [{ id: 'c1', description: 'Ngô hạt', grossWeightKg: 18000 }],
    appointment: { id: 'ap-1', scheduledAt: '2026-07-22T03:00:00.000Z', gateCode: 'A1', laneCode: 'Làn 1' },
    attachments: [
      { id: 'f1', fileName: 'hoa-don.pdf', contentType: 'application/pdf', sizeBytes: 204800, documentTypeName: 'Hóa đơn thương mại' },
    ],
    auditTrail: [
      { id: 'a1', at: '2026-07-22T01:00:00.000Z', actorRole: 'ENTERPRISE', action: 'CREATE_DRAFT', toStatus: 'DRAFT' },
      { id: 'a2', at: '2026-07-22T01:30:00.000Z', actorRole: 'BORDER_GUARD', action: 'BORDER_GUARD_CONFIRM', note: 'Đã kiểm tra giấy tờ', toStatus: 'PROCESSING' },
    ],
    // Phiên xử lý liên ngành THẬT — nguồn của mục 6 (stepper + bảng lịch sử). Hai bước đầu đã xong,
    // bước Biên phòng đang xử lý, bước Kiểm dịch chưa tới lượt.
    workflowSteps: [
      { code: 'IMPORT_DECLARED', order: 1, name: 'Khai báo hồ sơ', agencyCode: 'ENTERPRISE', agencyName: 'Doanh nghiệp/Tài xế', status: 'COMPLETED', actorName: 'Cty CP Nông sản Tây Bắc', actorRole: null, enteredAt: '2026-07-22T01:00:00.000Z', completedAt: '2026-07-22T01:00:00.000Z', decision: null, note: null },
      { code: 'IMPORT_B1_ENTRY', order: 2, name: 'Hải quan B1 tiếp nhận', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', status: 'COMPLETED', actorName: 'Lê Văn Nam', actorRole: null, enteredAt: '2026-07-22T01:10:00.000Z', completedAt: '2026-07-22T01:30:00.000Z', decision: 'APPROVE', note: 'Đã tiếp nhận' },
      { code: 'IMPORT_BORDER', order: 3, name: 'Biên phòng kiểm soát', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', status: 'IN_PROGRESS', actorName: null, actorRole: null, enteredAt: '2026-07-22T01:40:00.000Z', completedAt: null, decision: null, note: null },
      { code: 'IMPORT_QUARANTINE', order: 4, name: 'Kiểm dịch', agencyCode: 'QUARANTINE', agencyName: 'Kiểm dịch', status: 'PENDING', actorName: null, actorRole: null, enteredAt: null, completedAt: null, decision: null, note: null },
    ],
    qrCode: 'SG|HS-250519-0015|2026-07-22',
    ...mau,
  };
}

describe('DeclarationDetailPageComponent — chi tiết hồ sơ', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<DeclarationDetailPageComponent>;
  let component: DeclarationDetailPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(id = 'hs-1'): void {
    TestBed.configureTestingModule({
      imports: [DeclarationDetailPageComponent],
      providers: [
        provideRouter([
          { path: 'declarations', children: [] },
          { path: 'declarations/:id', children: [] },
          { path: 'declarations/:id/edit', children: [] },
        ]),
        { provide: ApiService, useValue: api },
      ],
    });

    fixture = TestBed.createComponent(DeclarationDetailPageComponent);
    component = fixture.componentInstance;
    component.id = id;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getDeclaration',
      'getGateEvaluation',
      'downloadFile',
      'cancelDownloadFile',
      'getAccessProfile',
      'getRequiredDocuments',
      'getCheckpoints',
      'getVehicleTypes',
      'getCargoTypes',
    ]);
    api.cancelDownloadFile.and.returnValue(of(undefined));
    api.getRequiredDocuments.and.returnValue(of([]));
    api.getCheckpoints.and.returnValue(of([]));
    api.getVehicleTypes.and.returnValue(of([]));
    api.getCargoTypes.and.returnValue(of([]));
    api.getDeclaration.and.returnValue(of(hoSo()));
    api.getGateEvaluation.and.returnValue(of({
      gate: 'Cổng ra',
      canOpen: false,
      statusColor: 'YELLOW',
      blockingReasons: ['Chưa hoàn thành thủ tục Hải quan'],
      requiredCompletedSteps: [],
    }));
    api.downloadFile.and.returnValue(of(new Blob(['x'])));
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Trạng thái tải và lỗi', () => {
    it('đang tải thì hiện thông báo, chưa dựng nội dung hồ sơ', () => {
      api.getDeclaration.and.returnValue(NEVER);
      taoTrang();

      expect(fixture.nativeElement.textContent).toContain('Đang tải hồ sơ...');
    });

    it('API lỗi thì hiện thông báo lỗi', () => {
      api.getDeclaration.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      expect(noiBo()['error']()).toBe('Không tải được hồ sơ. Vui lòng thử lại.');
    });

    it('không có id trên route thì báo lỗi thay vì gọi API', () => {
      taoTrang('');

      expect(api.getDeclaration).not.toHaveBeenCalled();
      expect(noiBo()['error']()).toBe('Không xác định được hồ sơ cần xem.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Stepper liên ngành (từ phiên xử lý thật)', () => {
    beforeEach(() => taoTrang());

    it('mỗi bước của phiên là một tile, dùng tên do API trả và trạng thái tương ứng', () => {
      const steps = noiBo()['progressSteps'](hoSo());

      expect(steps.map((step: { label: string }) => step.label)).toEqual([
        'Khai báo hồ sơ',
        'Hải quan B1 tiếp nhận',
        'Biên phòng kiểm soát',
        'Kiểm dịch',
      ]);
      expect(steps.map((step: { state: string }) => step.state)).toEqual(['done', 'done', 'active', 'waiting']);
    });

    it('nhãn tile lấy TÊN bước (không lộ mã), khóa track là mã bước', () => {
      const steps = noiBo()['progressSteps'](hoSo());
      expect(steps[1].label).toBe('Hải quan B1 tiếp nhận');
      expect(steps[1].key).toBe('IMPORT_B1_ENTRY');
    });

    it('bước bị từ chối được đánh dấu là lỗi', () => {
      const steps = noiBo()['progressSteps'](hoSo({
        workflowSteps: [{ code: 'IMPORT_B1_ENTRY', order: 2, name: 'Hải quan B1 tiếp nhận', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', status: 'REJECTED', actorName: 'Lê Văn Nam', actorRole: null, enteredAt: null, completedAt: '2026-07-22T01:30:00.000Z', decision: 'REJECT', note: 'Thiếu chứng từ' }],
      }));
      expect(steps[0].state).toBe('failed');
    });

    it('bước chờ bổ sung hiển thị nhãn "Chờ bổ sung" và trạng thái trung tính', () => {
      const steps = noiBo()['progressSteps'](hoSo({
        workflowSteps: [{ code: 'IMPORT_B1_ENTRY', order: 2, name: 'Hải quan B1 tiếp nhận', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', status: 'WAITING_SUPPLEMENT', actorName: 'Lê Văn Nam', actorRole: null, enteredAt: null, completedAt: null, decision: 'REQUEST_SUPPLEMENT', note: 'Bổ sung hóa đơn' }],
      }));
      expect(steps[0].statusLabel).toBe('Chờ bổ sung');
      expect(steps[0].state).toBe('waiting');
    });

    it('tóm tắt đếm đúng số bước đã hoàn thành', () => {
      expect(noiBo()['progressSubtitle'](hoSo())).toBe('Đã hoàn thành 2/4 bước');
    });

    it('hồ sơ chưa vào quy trình (không có phiên) thì stepper rỗng', () => {
      expect(noiBo()['progressSteps'](hoSo({ workflowSteps: [] }))).toEqual([]);
    });

    it('hồ sơ có cờ dịch tễ (epidemicFlag = true) đưa bước Kiểm dịch lên trước Biên phòng trong cụm và gắn cờ ưu tiên', () => {
      const steps = noiBo()['progressSteps'](hoSo({
        epidemicFlag: true,
        workflowSteps: [
          { code: 'IMPORT_DECLARED', order: 1, name: 'Khai báo', agencyCode: 'ENTERPRISE', agencyName: 'Doanh nghiệp', gate: null, status: 'COMPLETED', actorName: null, actorRole: null, enteredAt: null, completedAt: null, decision: null, note: null },
          { code: 'IMPORT_B1_ENTRY', order: 2, name: 'Biên phòng vào B1', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', gate: 'ENTRY', status: 'COMPLETED', actorName: null, actorRole: null, enteredAt: null, completedAt: null, decision: null, note: null },
          { code: 'IMPORT_BORDER', order: 3, name: 'Biên phòng kiểm soát', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', gate: null, status: 'PENDING', actorName: null, actorRole: null, enteredAt: null, completedAt: null, decision: null, note: null },
          { code: 'IMPORT_QUARANTINE', order: 4, name: 'Kiểm dịch', agencyCode: 'QUARANTINE', agencyName: 'Kiểm dịch', gate: null, status: 'IN_PROGRESS', actorName: null, actorRole: null, enteredAt: null, completedAt: null, decision: null, note: null },
        ],
      }));

      expect(steps.map((s: { key: string }) => s.key)).toEqual([
        'IMPORT_DECLARED',
        'IMPORT_B1_ENTRY',
        'IMPORT_QUARANTINE',
        'IMPORT_BORDER',
      ]);
      const quarantineStep = steps.find((s: { key: string }) => s.key === 'IMPORT_QUARANTINE');
      expect(quarantineStep.showsEpidemicBadge).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Không lộ mã tập-đóng thô lên giao diện: chốt kiểm soát và vai trò người xác nhận phải qua i18n.
  describe('Nhãn mã tập đóng (chống lộ mã thô)', () => {
    beforeEach(() => taoTrang());

    it('người xác nhận hiển thị TÊN người thao tác (actorName)', () => {
      const rows = noiBo()['historyRows'](hoSo());
      expect(rows[0].actor).toBe('Lê Văn Nam');
    });

    it('thiếu tên người thao tác thì rơi về nhãn vai trò đã dịch (ENTERPRISE → Doanh nghiệp/Tài xế)', () => {
      const rows = noiBo()['historyRows'](hoSo({
        workflowSteps: [{ code: 'IMPORT_DECLARED', order: 1, name: 'Khai báo hồ sơ', agencyCode: 'ENTERPRISE', agencyName: 'Doanh nghiệp/Tài xế', status: 'COMPLETED', actorName: null, actorRole: 'ENTERPRISE', enteredAt: null, completedAt: '2026-07-22T01:00:00.000Z', decision: null, note: null }],
      }));
      expect(rows[0].actor).toBe('Doanh nghiệp/Tài xế');
    });

    it('vai trò động lạ ngoài danh mục seed giữ nguyên mã', () => {
      const rows = noiBo()['historyRows'](hoSo({
        workflowSteps: [{ code: 'IMPORT_B1_ENTRY', order: 2, name: 'Hải quan B1 tiếp nhận', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', status: 'COMPLETED', actorName: null, actorRole: 'HAI_QUAN_B1', enteredAt: null, completedAt: '2026-07-22T01:30:00.000Z', decision: 'APPROVE', note: null }],
      }));
      expect(rows[0].actor).toBe('HAI_QUAN_B1');
    });

    it('bước chưa có quyết định thì cột trạng thái lấy nhãn trạng thái bước', () => {
      const rows = noiBo()['historyRows'](hoSo({
        workflowSteps: [{ code: 'IMPORT_DECLARED', order: 1, name: 'Khai báo hồ sơ', agencyCode: 'ENTERPRISE', agencyName: 'Doanh nghiệp/Tài xế', status: 'COMPLETED', actorName: 'Cty CP Nông sản Tây Bắc', actorRole: null, enteredAt: null, completedAt: '2026-07-22T01:00:00.000Z', decision: null, note: null }],
      }));
      expect(rows[0].statusLabel).toBe('Đã hoàn thành');
    });
  });

  // ---------------------------------------------------------------------------
  // Bố cục theo template chủ dự án: các mục hiển thị tuần tự (không còn tab chuyển qua lại),
  // nên mọi section đều dựng sẵn trong DOM.
  describe('Các mục nội dung', () => {
    beforeEach(() => taoTrang());

    it('hiện dữ liệu doanh nghiệp, phương tiện, lái xe', () => {
      const noiDung = fixture.nativeElement.textContent as string;
      expect(noiDung).toContain('Cty CP Nông sản Tây Bắc');
      expect(noiDung).toContain('26C-123.45');
      expect(noiDung).toContain('Nguyễn Văn Hùng');
    });

    it('mục Hàng hóa hiện bảng dòng hàng', () => {
      const noiDung = fixture.nativeElement.querySelector('.sec--cargo table.grid tbody').textContent as string;
      expect(noiDung).toContain('Ngô hạt');
    });

    it('mục Tờ khai & chứng từ hiện tên tệp gốc làm nhãn chính, loại · kích thước làm dòng phụ', () => {
      const noiDung = fixture.nativeElement.querySelector('.docs').textContent as string;
      expect(noiDung).toContain('hoa-don.pdf');
      expect(noiDung).toContain('200 KB');
      // Nhãn chính là TÊN TỆP gốc, không phải loại chứng từ.
      expect((fixture.nativeElement.querySelector('.doc__name').textContent as string).trim()).toBe('hoa-don.pdf');
      expect((fixture.nativeElement.querySelector('.doc__meta').textContent as string).trim()).toBe(
        'Hóa đơn thương mại · 200 KB',
      );
      expect(fixture.nativeElement.querySelector('.doc__thumb')).toBeTruthy();
    });

    it('mục Theo dõi trạng thái & lịch sử dựng bảng lịch sử xử lý từ phiên thật (CR21: mở thu gọn)', () => {
      // CR21 — bảng lịch sử mặc định ĐÓNG; phải mở mới hiện bảng.
      noiBo()['historyOpen'].set(true);
      fixture.detectChanges();
      const noiDung = fixture.nativeElement.querySelector('.sec--history table.history tbody').textContent as string;
      expect(noiDung).toContain('Hải quan B1 tiếp nhận');
      expect(noiDung).toContain('Đã tiếp nhận');
    });

    it('vẽ mã QR của hồ sơ ngay trên trang chi tiết', () => {
      expect(fixture.nativeElement.querySelector('sg-qr-code svg.qr')).toBeTruthy();
    });

    it('CR20/CR12/SG-141 — mục "Thời gian dự kiến đến cửa khẩu" hiện thời gian vào/ra cổng', () => {
      const noiDung = fixture.nativeElement.querySelector('.sec--schedule').textContent as string;
      expect(noiDung).toContain('Thời gian dự kiến đến cửa khẩu');
      expect(noiDung).toContain('Thời gian vào cổng');
      expect(noiDung).toContain('Thời gian ra cổng');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Thẻ mã QR theo hiệu lực (BUG-023)', () => {
    function qrText(mau: Partial<DossierDetail>): string {
      api.getDeclaration.and.returnValue(of(hoSo(mau)));
      taoTrang();
      return fixture.nativeElement.querySelector('.qr-layout').textContent as string;
    }

    it('hồ sơ Nháp chưa có mã QR: hiện "Chưa cấp mã", KHÔNG hiện "Còn hiệu lực" hay ngày cấp', () => {
      const noiDung = qrText({ status: 'DRAFT', qrCode: undefined });
      expect(noiDung).toContain('Chưa cấp mã');
      expect(noiDung).not.toContain('Còn hiệu lực');
      expect(noiDung).not.toContain('Ngày cấp mã');
    });

    it('hồ sơ Từ chối (đã có mã) hiển thị "Đã khóa", không còn "Còn hiệu lực"', () => {
      const noiDung = qrText({ status: 'REJECTED', qrCode: 'SG|HS-250519-0015|2026-07-22' });
      expect(noiDung).toContain('Đã khóa');
      expect(noiDung).not.toContain('Còn hiệu lực');
    });

    it('hồ sơ đang xử lý đã có mã QR: hiện "Còn hiệu lực" kèm ngày cấp', () => {
      const noiDung = qrText({ status: 'PROCESSING', qrCode: 'SG|HS-250519-0015|2026-07-22' });
      expect(noiDung).toContain('Còn hiệu lực');
      expect(noiDung).toContain('Ngày cấp mã');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chứng từ bắt buộc theo loại hồ sơ (D7 / F13)', () => {
    it('tab Chứng từ hiện danh mục chứng từ bắt buộc đủ/thiếu theo loại hồ sơ', () => {
      api.getRequiredDocuments.and.returnValue(of([
        { documentTypeCode: 'COMMERCIAL_INVOICE', documentTypeName: 'Hóa đơn thương mại', required: true },
        { documentTypeCode: 'PACKING_LIST', documentTypeName: 'Phiếu đóng gói', required: true },
      ]));
      // Hồ sơ có đính kèm đúng loại "Hóa đơn thương mại".
      api.getDeclaration.and.returnValue(of(hoSo({
        attachments: [{ id: 'f1', fileName: 'hd.pdf', contentType: 'application/pdf', sizeBytes: 2048, documentTypeCode: 'COMMERCIAL_INVOICE' }],
      })));
      taoTrang();
      fixture.detectChanges();

      expect(api.getRequiredDocuments).toHaveBeenCalledWith('IMPORT');
      const noiDung = fixture.nativeElement.querySelector('.reqdocs').textContent as string;
      expect(noiDung).toContain('Chứng từ bắt buộc');
      expect(noiDung).toContain('Hóa đơn thương mại');
      expect(noiDung).toContain('Phiếu đóng gói');
      expect(noiDung).toContain('Đã tải');
      expect(noiDung).toContain('Còn thiếu');
      expect(noiBo()['requiredDocsDone']()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Hành động theo quyền và trạng thái', () => {
    it('hồ sơ đang xử lý thì không cho sửa', () => {
      taoTrang();
      expect(noiBo()['canEdit']()).toBe(false);
    });

    it('hồ sơ bị yêu cầu bổ sung và có quyền sửa thì hiện nút sửa', () => {
      api.getDeclaration.and.returnValue(of(hoSo({ status: 'REVISION_REQUIRED' })));
      taoTrang();

      expect(noiBo()['canEdit']()).toBe(true);
    });

    it('không có quyền sửa thì không hiện nút sửa dù hồ sơ đang là nháp', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: hoSoTruyCap(['dossier.view']) }));
      api.getDeclaration.and.returnValue(of(hoSo({ status: 'DRAFT' })));
      taoTrang();

      expect(noiBo()['canEdit']()).toBe(false);
    });

    /**
     * P3 — hai lối tắt cũ ("Xác nhận Hải quan", "Yêu cầu bổ sung") đã bị gỡ khỏi màn này vì chúng
     * bỏ qua thứ tự bước và mã nguyên nhân bắt buộc. Trang chỉ còn dẫn sang màn Xử lý liên ngành.
     */
    it('không còn nút xác nhận/yêu cầu bổ sung, chỉ còn lối vào màn Xử lý liên ngành', () => {
      taoTrang();
      const noiDung = fixture.nativeElement.textContent as string;

      expect(noiDung).not.toContain('Xác nhận Hải quan');
      expect(noiDung).not.toContain('Yêu cầu bổ sung');
      expect(noiDung).toContain('Xử lý liên ngành');
      expect(noiBo()['confirmCustoms']).toBeUndefined();
      expect(noiBo()['requestRevision']).toBeUndefined();
    });

    it('không có quyền xem xử lý liên ngành thì ẩn luôn lối vào đó', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: hoSoTruyCap(['dossier.view']) }));
      taoTrang();

      expect(fixture.nativeElement.textContent as string).not.toContain('Xử lý liên ngành');
    });

    it('hồ sơ ở trạng thái Bản nháp (DRAFT) thì không hiển thị nút Xử lý liên ngành', () => {
      api.getDeclaration.and.returnValue(of(hoSo({ status: 'DRAFT' })));
      taoTrang();

      expect(fixture.nativeElement.textContent as string).not.toContain('Xử lý liên ngành');
    });
  });

  describe('SG-281: Định danh doanh nghiệp / cá nhân / nội bộ', () => {
    it('hiển thị nhãn Mã số thuế và giá trị taxCode cho hồ sơ doanh nghiệp', () => {
      api.getDeclaration.and.returnValue(
        of(
          hoSo({
            enterprise: { taxCode: '5501234567', name: 'Công ty CP Tây Bắc' },
          }),
        ),
      );
      taoTrang();

      expect(noiBo()['enterpriseIdentifierLabel'](noiBo()['dossier']())).toBe('Mã số thuế');
      expect(noiBo()['enterpriseIdentifierValue'](noiBo()['dossier']())).toBe('5501234567');
    });

    it('hiển thị nhãn Số CCCD / Hộ chiếu và giá trị idNumber cho cá nhân khi taxCode rỗng', () => {
      api.getDeclaration.and.returnValue(
        of(
          hoSo({
            enterprise: { taxCode: '', idNumber: '038090001234', accountType: 'INDIVIDUAL', name: 'Nguyễn Văn A' },
          }),
        ),
      );
      taoTrang();

      expect(noiBo()['enterpriseIdentifierLabel'](noiBo()['dossier']())).toBe('Số CCCD / Hộ chiếu');
      expect(noiBo()['enterpriseIdentifierValue'](noiBo()['dossier']())).toBe('038090001234');
    });

    it('hiển thị nhãn Email và giá trị email cho nội bộ khi taxCode rỗng', () => {
      api.getDeclaration.and.returnValue(
        of(
          hoSo({
            enterprise: { taxCode: '', email: 'canbo@smartgate.vn', accountType: 'INTERNAL', name: 'Lê Cán Bộ' },
          }),
        ),
      );
      taoTrang();

      expect(noiBo()['enterpriseIdentifierLabel'](noiBo()['dossier']())).toBe('Thư điện tử');
      expect(noiBo()['enterpriseIdentifierValue'](noiBo()['dossier']())).toBe('canbo@smartgate.vn');
    });
  });
});
