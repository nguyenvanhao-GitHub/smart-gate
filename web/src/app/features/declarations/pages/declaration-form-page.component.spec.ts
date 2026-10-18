import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { DossierAttachment, DossierDetail } from '../../../core/models/declaration.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { AuthService } from '../../../core/auth/auth.service';
import { DeclarationFormPageComponent } from './declaration-form-page.component';

/**
 * UI-04 Khai báo hồ sơ (P2).
 * Trọng tâm: **ánh xạ lỗi API vào đúng ô nhập** (F13), tách bạch Lưu nháp / Gửi hồ sơ,
 * và chặn tệp sai định dạng hoặc quá 15 MB ngay tại trình duyệt (F11).
 */

function hoSo(mau: Partial<DossierDetail> = {}): DossierDetail {
  return {
    id: 'hs-1',
    code: 'HS-250519-0015',
    type: 'IMPORT',
    status: 'DRAFT',
    enterprise: { taxCode: '5501234567', name: 'Cty CP Nông sản Tây Bắc' },
    vehicle: { plateNumber: '26C-123.45' },
    vehicles: [{ plateNumber: '26C-123.45' }],
    driver: { fullName: 'Nguyễn Văn Hùng', idNumber: '012345678901' },
    cargoSummary: 'Ngô hạt',
    checkpoint: 'A1',
    createdAt: '2026-07-22T01:00:00.000Z',
    updatedAt: '2026-07-22T01:00:00.000Z',
    submittedAt: null,
    cargoItems: [{ id: 'cargo-1', description: 'Ngô hạt' }],
    appointment: null,
    attachments: [],
    ...mau,
  };
}

function tepDinhKem(mau: Partial<DossierAttachment> = {}): DossierAttachment {
  return {
    id: 'file-1',
    fileName: 'to-khai.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    documentTypeCode: 'COMMERCIAL_INVOICE',
    documentTypeName: 'Hóa đơn thương mại',
    ...mau,
  };
}

/** Tệp giả lập: component chỉ đọc name/size/type nên không cần dựng nội dung thật. */
function tep(name: string, size: number, type: string): File {
  return { name, size, type } as unknown as File;
}

describe('DeclarationFormPageComponent — khai báo hồ sơ', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<DeclarationFormPageComponent>;
  let component: DeclarationFormPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  /** Tài khoản đang đăng nhập cho stub AuthService; `null` = chưa/không phải tài khoản doanh nghiệp. */
  let authUser: Record<string, unknown> | null = { phone: '0369852369' };

  function taoTrang(idTrenRoute = ''): void {
    TestBed.configureTestingModule({
      imports: [DeclarationFormPageComponent],
      providers: [
        provideRouter([
          { path: 'declarations', children: [] },
          { path: 'declarations/:id', children: [] },
          { path: 'declarations/:id/edit', children: [] },
        ]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => authUser, roleCodes: () => (authUser && Array.isArray((authUser as any).roles) ? (authUser as any).roles : []) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(idTrenRoute ? { id: idTrenRoute } : {}) } },
        },
      ],
    });

    fixture = TestBed.createComponent(DeclarationFormPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function dienThongTinToiThieu(): void {
    const form = noiBo()['form'];
    form.appointment.scheduledAt = '2030-09-01T10:00';
    form.enterprise.taxCode = '5501234567';
    form.enterprise.name = 'Cty CP Nông sản Tây Bắc';
    form.enterprise.phone = '0369852369';
    form.enterprise.address = 'Hà Nội';
    form.vehicles[0].plateNumber = '26C-123.45';
    form.vehicles[0].vehicleType = 'TRUCK';
    form.vehicles[0].driver.fullName = 'Nguyễn Văn Hùng';
    form.vehicles[0].driver.idNumber = '012345678901';
    form.vehicles[0].driver.licenseNumber = '123456789';
    form.vehicles[0].driver.nationality = 'Việt Nam';
    form.cargoItems[0].description = 'Ngô hạt';
    form.cargoItems[0].grossWeightKg = 18000;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getDeclaration',
      'createDeclaration',
      'updateDeclaration',
      'submitDeclaration',
      'uploadFile',
      'attachDeclarationFiles',
      'removeDeclarationAttachment',
      'deleteFile',
      'getRequiredDocuments',
      'getDocumentTypes',
      'getDossierTypes',
      'getCheckpoints',
      'getVehicleTypes',
      'getCargoTypes',
      'getUnits',
      'getCountries',
      'lookupUser',
    ]);
    api.lookupUser.and.returnValue(of(null));
    api.getRequiredDocuments.and.returnValue(of([]));
    api.getDocumentTypes.and.returnValue(of([]));
    api.getDossierTypes.and.returnValue(of([]));
    api.getCheckpoints.and.returnValue(of([]));
    api.getVehicleTypes.and.returnValue(of([]));
    api.getCargoTypes.and.returnValue(of([]));
    api.getUnits.and.returnValue(of([]));
    api.getCountries.and.returnValue(of([]));
    api.getDeclaration.and.returnValue(of(hoSo()));
    api.createDeclaration.and.returnValue(of(hoSo()));
    api.updateDeclaration.and.returnValue(of(hoSo()));
    api.submitDeclaration.and.returnValue(of({ code: 'HS-250519-0015', qrCode: 'SG|HS-250519-0015|2026', submittedAt: '2026-07-22T02:00:00.000Z' }));
    api.uploadFile.and.returnValue(of(tepDinhKem()));
    api.attachDeclarationFiles.and.returnValue(of(void 0));
    api.removeDeclarationAttachment.and.returnValue(of(void 0));
    api.deleteFile.and.returnValue(of(void 0));
  });

  afterEach(() => {
    authUser = { phone: '0369852369' };
    TestBed.resetTestingModule();
  });

  // ---------------------------------------------------------------------------
  describe('Lưu nháp và gửi hồ sơ là hai hành động riêng', () => {
    it('hồ sơ mới: Lưu nháp gọi createDeclaration và không gọi submit', () => {
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['saveDraft']();

      expect(api.createDeclaration).toHaveBeenCalledTimes(1);
      expect(api.submitDeclaration).not.toHaveBeenCalled();
      expect(noiBo()['dossierId']()).toBe('hs-1');
      expect(noiBo()['feedback']()).toContain('Đã lưu nháp hồ sơ HS-250519-0015');
    });

    it('payload lưu nháp gồm doanh nghiệp, phương tiện, lái xe và dòng hàng hóa', () => {
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['saveDraft']();

      const payload = api.createDeclaration.calls.mostRecent().args[0];
      expect(payload.type).toBe('IMPORT');
      expect(payload.enterprise).toEqual(jasmine.objectContaining({ taxCode: '5501234567', name: 'Cty CP Nông sản Tây Bắc' }));
      expect(payload.vehicles?.length).toBe(1);
      expect(payload.vehicles?.[0]).toEqual(jasmine.objectContaining({ plateNumber: '26C-123.45' }));
      // Lái xe nhúng theo từng xe (BUG-033).
      expect(payload.vehicles?.[0]?.driver).toEqual(
        jasmine.objectContaining({ fullName: 'Nguyễn Văn Hùng', idNumber: '012345678901' }),
      );
      expect(payload.cargoItems?.length).toBe(1);
      expect(payload.cargoItems?.[0]).toEqual(jasmine.objectContaining({ description: 'Ngô hạt', grossWeightKg: 18000 }));
    });

    it('CR8 — một xe/hồ sơ: chỉ gửi đúng một phương tiện', () => {
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['saveDraft']();

      const payload = api.createDeclaration.calls.mostRecent().args[0];
      expect(payload.vehicles.length).toBe(1);
      expect(payload.vehicles[0].plateNumber).toBe('26C-123.45');
    });

    it('CR9 — hồ sơ Sang tải: thêm xe sang tải qua modal và gửi trong payload', () => {
      taoTrang();
      dienThongTinToiThieu();
      const form = noiBo()['form'];
      form.type = 'TRANSSHIPMENT_EXPORT';

      noiBo()['openTransshipModal']();
      const draft = noiBo()['transshipDraft']();
      draft.sourcePlate = '26C-123.45';
      draft.plateNumber = '29T-111.11';
      draft.vehicleType = 'TRUCK';
      draft.driverName = 'Trần Văn B';
      noiBo()['transshipDraft'].set(draft);
      noiBo()['saveTransshipRow']();
      noiBo()['saveDraft']();

      const payload = api.createDeclaration.calls.mostRecent().args[0];
      expect(payload.transshipmentVehicles?.length).toBe(1);
      expect(payload.transshipmentVehicles?.[0]).toEqual(
        jasmine.objectContaining({ plateNumber: '29T-111.11', driverName: 'Trần Văn B', sourcePlate: '26C-123.45' }),
      );
    });

    it('CR9 — loại hồ sơ không phải Sang tải thì không gửi xe sang tải', () => {
      taoTrang();
      dienThongTinToiThieu();
      const form = noiBo()['form'];
      form.transshipmentVehicles = [
        { key: 'k1', sourcePlate: '', plateNumber: '29T-111.11', vehicleType: 'TRUCK', containerNumber: '', trailerNumber: '', driverName: 'B', fee01: '', transferPlace: '', note: '' },
      ];

      noiBo()['saveDraft']();

      const payload = api.createDeclaration.calls.mostRecent().args[0];
      expect(payload.transshipmentVehicles).toEqual([]);
    });

    it('hồ sơ đã có id: Lưu nháp gọi updateDeclaration', () => {
      taoTrang('hs-1');
      dienThongTinToiThieu();

      noiBo()['saveDraft']();

      expect(api.updateDeclaration).toHaveBeenCalledTimes(1);
      expect(api.updateDeclaration.calls.mostRecent().args[0]).toBe('hs-1');
      expect(api.createDeclaration).not.toHaveBeenCalled();
    });

    it('Gửi hồ sơ luôn lưu dữ liệu đang nhập trước rồi mới gọi submit', () => {
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['submit']();

      expect(api.createDeclaration).toHaveBeenCalledTimes(1);
      expect(api.submitDeclaration).toHaveBeenCalledOnceWith('hs-1');
    });

    it('gửi thành công hồ sơ mới thì hiện mã hồ sơ, mã QR và cập nhật URL sang /declarations/:id/edit', () => {
      taoTrang();
      const location = TestBed.inject(Location);
      dienThongTinToiThieu();

      noiBo()['submit']();
      fixture.detectChanges();

      expect(location.path()).toBe('/declarations/hs-1/edit');
      expect(noiBo()['submitResult']()?.code).toBe('HS-250519-0015');
      const modal = fixture.nativeElement.querySelector('.modal__code') as HTMLElement;
      expect(modal.textContent).toContain('HS-250519-0015');
      // Mã QR được vẽ ngay trên giao diện, không cần thư viện ngoài.
      expect(fixture.nativeElement.querySelector('sg-qr-code svg.qr')).toBeTruthy();
    });

    it('hồ sơ không còn được sửa thì chặn cả lưu nháp lẫn gửi', () => {
      api.getDeclaration.and.returnValue(of(hoSo({ status: 'PROCESSING' })));
      taoTrang('hs-1');

      noiBo()['saveDraft']();
      noiBo()['submit']();

      expect(noiBo()['readOnly']()).toBe(true);
      expect(api.updateDeclaration).not.toHaveBeenCalled();
      expect(api.submitDeclaration).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('BUG-043 — chặn lưu/gửi khi biểu mẫu hoàn toàn trống', () => {
    it('Lưu nháp trên form trống bị chặn, không gọi createDeclaration', () => {
      taoTrang();

      noiBo()['saveDraft']();

      expect(api.createDeclaration).not.toHaveBeenCalled();
      expect(noiBo()['generalError']()).toBe(
        'Hồ sơ chưa có dữ liệu để lưu. Vui lòng nhập tối thiểu thông tin doanh nghiệp hoặc phương tiện trước khi lưu nháp/gửi.',
      );
    });

    it('Gửi hồ sơ trên form trống bị chặn, không gọi createDeclaration lẫn submitDeclaration', () => {
      taoTrang();

      noiBo()['submit']();

      expect(api.createDeclaration).not.toHaveBeenCalled();
      expect(api.submitDeclaration).not.toHaveBeenCalled();
      expect(noiBo()['generalError']()).toContain('Hồ sơ chưa có dữ liệu để lưu');
    });

    it('có tối thiểu dữ liệu (chỉ biển số) thì không bị chặn nữa', () => {
      taoTrang();
      noiBo()['form'].vehicles[0].plateNumber = '26C-123.45';

      noiBo()['saveDraft']();

      expect(api.createDeclaration).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Lỗi API được tô đỏ đúng ô nhập (F13)', () => {
    function loi400(errors: Array<{ field: string; message: string; messageKey?: string }>): unknown {
      return { status: 400, error: { message: 'Hồ sơ thiếu dữ liệu bắt buộc', errors } };
    }

    it('gửi thiếu dữ liệu: mỗi lỗi gắn vào đúng tên trường của biểu mẫu', () => {
      api.submitDeclaration.and.returnValue(throwError(() => loi400([
        { field: 'enterprise.taxCode', message: 'Mã số thuế là bắt buộc.' },
        { field: 'vehicles[0].driver.idNumber', message: 'Số CCCD/Hộ chiếu là bắt buộc.' },
        { field: 'cargoItems.0.description', message: 'Tên hàng hóa là bắt buộc.' },
      ])));
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['submit']();

      expect(noiBo()['fieldError']('enterprise.taxCode')).toBe('Mã số thuế là bắt buộc.');
      // Lái xe theo từng xe (BUG-033): lỗi gắn vào ô lái xe của đúng dòng phương tiện.
      expect(noiBo()['vehicleError'](0, 'driver.idNumber')).toBe('Số CCCD/Hộ chiếu là bắt buộc.');
      expect(noiBo()['cargoError'](0, 'description')).toBe('Tên hàng hóa là bắt buộc.');
      expect(noiBo()['vehicleError'](0, 'plateNumber')).toBe('');
    });

    it('đánh dấu section có lỗi và cuộn tới section lỗi đầu tiên', () => {
      api.submitDeclaration.and.returnValue(throwError(() => loi400([
        { field: 'vehicles[0].plateNumber', message: 'Biển số xe là bắt buộc.' },
        { field: 'enterprise.name', message: 'Tên doanh nghiệp là bắt buộc.' },
      ])));
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['submit']();

      // Một trang cuộn: các section: doanh nghiệp (gộp lịch hẹn) · phương tiện & lái xe · hàng hóa · tờ khai & chứng từ
      // Lỗi doanh nghiệp và lỗi xe ở 2 section khác nhau; section lỗi đầu tiên là "enterprise".
      expect(noiBo()['firstErrorSection']()).toBe('enterprise');
      expect(noiBo()['sectionHasError']('enterprise')).toBe(true); // doanh nghiệp
      expect(noiBo()['sectionHasError']('vehicle')).toBe(true); // phương tiện & lái xe — có lỗi
      expect(noiBo()['sectionHasError']('cargo')).toBe(false); // hàng hóa — không lỗi
    });

    it('lỗi chỉ ở hàng hóa thì section hàng hóa được đánh dấu và tô đúng dòng', () => {
      api.submitDeclaration.and.returnValue(throwError(() => loi400([
        { field: 'cargoItems[1].grossWeightKg', message: 'Khối lượng không hợp lệ.' },
      ])));
      taoTrang();
      dienThongTinToiThieu();
      noiBo()['addCargoRow']();
      noiBo()['form'].cargoItems[1].description = 'Hàng 2';

      noiBo()['submit']();

      // Hàng hóa là section "cargo" — lỗi chỉ ở đây nên section lỗi đầu tiên chính là nó.
      expect(noiBo()['firstErrorSection']()).toBe('cargo');
      expect(noiBo()['sectionHasError']('cargo')).toBe(true);
      expect(noiBo()['cargoError'](1, 'grossWeightKg')).toBe('Khối lượng không hợp lệ.');
      expect(noiBo()['cargoError'](0, 'grossWeightKg')).toBe('');
    });

    it('lỗi không gắn được vào ô nào thì hiện ở danh sách chung, không nuốt mất', () => {
      api.submitDeclaration.and.returnValue(throwError(() => loi400([
        { field: '', message: 'Hồ sơ chưa có chứng từ bắt buộc.' },
        { field: 'khongCoTrenForm', message: 'Thiếu thông tin tuyến vận chuyển.' },
      ])));
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['submit']();

      expect(noiBo()['otherErrors']()).toEqual([
        'Hồ sơ chưa có chứng từ bắt buộc.',
        'Thiếu thông tin tuyến vận chuyển.',
      ]);
      expect(noiBo()['generalError']()).toBe('Hồ sơ thiếu dữ liệu bắt buộc');
    });

    it('lỗi 400 không kèm danh sách trường thì vẫn báo thông báo chung', () => {
      api.submitDeclaration.and.returnValue(throwError(() => ({ status: 400, error: { message: 'Hồ sơ đã được gửi trước đó.' } })));
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['submit']();

      expect(noiBo()['generalError']()).toBe('Hồ sơ đã được gửi trước đó.');
      expect(noiBo()['otherErrors']()).toEqual([]);
    });

    it('gửi lại lần sau xóa hết lỗi cũ trước khi hiển thị lỗi mới', () => {
      api.submitDeclaration.and.returnValue(throwError(() => loi400([{ field: 'enterprise.taxCode', message: 'Mã số thuế là bắt buộc.' }])));
      taoTrang();
      dienThongTinToiThieu();
      noiBo()['submit']();
      expect(noiBo()['fieldError']('enterprise.taxCode')).toBe('Mã số thuế là bắt buộc.');

      api.submitDeclaration.and.returnValue(of({ code: 'HS-1', qrCode: 'SG|HS-1', submittedAt: '2026-07-22T02:00:00.000Z' }));
      noiBo()['submit']();

      expect(noiBo()['fieldError']('enterprise.taxCode')).toBe('');
      expect(noiBo()['generalError']()).toBe('');
    });

    it('lỗi enterprise.email khi không ở nhánh createForOther + INTERNAL thì rơi vào otherErrors, báo toast needSupplementNotice và không tô đỏ section enterprise', () => {
      api.submitDeclaration.and.returnValue(throwError(() => loi400([
        { field: 'enterprise.email', message: 'Chưa khai thư điện tử liên hệ.', messageKey: 'dossier.missingEmail' }
      ])));
      taoTrang();
      const appMessages = TestBed.inject(AppMessageService);
      spyOn(appMessages, 'showKey');
      dienThongTinToiThieu();

      noiBo()['submit']();

      expect(noiBo()['isFieldOnForm']('enterprise.email')).toBe(false);
      expect(noiBo()['otherErrors']()).toEqual(['Chưa khai thư điện tử liên hệ.']);
      expect(noiBo()['sectionHasError']('enterprise')).toBe(false);
      expect(appMessages.showKey).toHaveBeenCalledWith('ui.form.needSupplementNotice', 'error');
      expect(appMessages.showKey).not.toHaveBeenCalledWith('ui.common.formHasErrors', 'error');
    });

    it('lỗi enterprise.email khi ở nhánh createForOther + INTERNAL thì tô đỏ ô nhập và không rơi vào otherErrors', () => {
      api.submitDeclaration.and.returnValue(throwError(() => loi400([
        { field: 'enterprise.email', message: 'Chưa khai thư điện tử liên hệ.', messageKey: 'dossier.missingEmail' }
      ])));
      taoTrang();
      dienThongTinToiThieu();
      noiBo()['createForOther'].set(true);
      noiBo()['selectedAccountType'].set('INTERNAL');
      noiBo()['form'].enterprise.email = 'test@example.com';

      noiBo()['submit']();

      expect(noiBo()['isFieldOnForm']('enterprise.email')).toBe(true);
      expect(noiBo()['fieldError']('enterprise.email')).toBe('Chưa khai thư điện tử liên hệ.');
      expect(noiBo()['otherErrors']()).toEqual([]);
      expect(noiBo()['sectionHasError']('enterprise')).toBe(true);
    });

  });

  // ---------------------------------------------------------------------------
  describe('BUG-033 — lái xe theo từng phương tiện', () => {
    it('xe gửi lái xe nhúng trong payload', () => {
      taoTrang();
      const form = noiBo()['form'];
      form.enterprise.taxCode = '5501234567';
      form.enterprise.name = 'Cty CP Nông sản Tây Bắc';
      form.vehicles[0].plateNumber = '26C-123.45';
      form.vehicles[0].driver.fullName = 'Nguyễn Văn A';
      form.vehicles[0].driver.idNumber = '001';

      noiBo()['saveDraft']();

      const payload = api.createDeclaration.calls.mostRecent().args[0];
      expect(payload.vehicles?.[0]?.driver).toEqual(jasmine.objectContaining({ fullName: 'Nguyễn Văn A' }));
    });

    it('xe chưa khai lái xe thì gửi driver = null (bước nháp không sinh lái xe rỗng)', () => {
      taoTrang();
      const form = noiBo()['form'];
      form.vehicles[0].plateNumber = '26C-123.45';

      noiBo()['saveDraft']();

      const payload = api.createDeclaration.calls.mostRecent().args[0];
      expect(payload.vehicles?.[0]?.driver).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tự điền thông tin doanh nghiệp từ tài khoản đăng nhập và cho phép chỉnh sửa', () => {
    it('tài khoản doanh nghiệp: điền sẵn thông tin doanh nghiệp cho hồ sơ mới và cho phép sửa', () => {
      authUser = {
        accountType: 'ENTERPRISE',
        taxCode: '5501234567',
        displayName: 'Cty CP Nông sản Tây Bắc',
        representativeName: 'Nguyễn Văn A',
        address: 'Lạng Sơn',
        phone: '0912345678',
      };
      taoTrang();

      expect(noiBo()['enterpriseLocked']()).toBe(false);
      const form = noiBo()['form'];
      expect(form.enterprise.taxCode).toBe('5501234567');
      expect(form.enterprise.name).toBe('Cty CP Nông sản Tây Bắc');
      expect(form.enterprise.representativeName).toBe('Nguyễn Văn A');
      expect(form.enterprise.address).toBe('Lạng Sơn');
      expect(form.enterprise.phone).toBe('0912345678');
    });

    it('tài khoản cá nhân: tự điền nếu có thông tin và không khóa', () => {
      authUser = { accountType: 'INDIVIDUAL', taxCode: null, displayName: 'Nguyễn Văn Tài Xế' };
      taoTrang();

      expect(noiBo()['enterpriseLocked']()).toBe(false);
      expect(noiBo()['form'].enterprise.name).toBe('Nguyễn Văn Tài Xế');
      expect(noiBo()['form'].enterprise.taxCode).toBe('');
    });

    it('hồ sơ đang sửa: không ghi đè dữ liệu từ tài khoản', () => {
      authUser = { accountType: 'ENTERPRISE', taxCode: '9999999999', displayName: 'Cty Mới' };
      taoTrang('hs-1');

      expect(noiBo()['form'].enterprise.taxCode).toBe('5501234567');
    });

    it('loại phương tiện mặc định là TRUCK (Xe tải)', () => {
      taoTrang();
      expect(noiBo()['form'].vehicles[0].vehicleType).toBe('TRUCK');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tệp đính kèm — kiểm tại trình duyệt trước khi gọi API', () => {
    it('tệp sai định dạng bị chặn, không gọi API tải lên', () => {
      taoTrang();

      noiBo()['uploadFiles']([tep('virus.exe', 1024, 'application/octet-stream')]);

      expect(api.uploadFile).not.toHaveBeenCalled();
      expect(noiBo()['uploadErrors']()[0]).toContain('định dạng không được chấp nhận');
    });

    it('tệp quá 15 MB bị chặn kèm thông báo dung lượng', () => {
      taoTrang();

      noiBo()['uploadFiles']([tep('to-khai.pdf', 16 * 1024 * 1024, 'application/pdf')]);

      expect(api.uploadFile).not.toHaveBeenCalled();
      expect(noiBo()['uploadErrors']()[0]).toBe('Tệp "to-khai.pdf" nặng 16 MB, vượt giới hạn 15 MB.');
    });

    it('chọn nhiều tệp: chỉ tải lên tệp hợp lệ, tệp lỗi vẫn được báo rõ', () => {
      taoTrang();

      noiBo()['uploadFiles']([
        tep('hop-le.pdf', 1024, 'application/pdf'),
        tep('qua-nang.png', 20 * 1024 * 1024, 'image/png'),
      ]);

      expect(api.uploadFile).toHaveBeenCalledTimes(1);
      expect(api.uploadFile.calls.mostRecent().args[0].name).toBe('hop-le.pdf');
      expect(noiBo()['uploadErrors']().length).toBe(1);
      expect(noiBo()['attachments']().length).toBe(1);
    });

    it('ngay sau upload vẫn giữ tên tệp gốc và dòng phụ loại · kích thước', () => {
      api.uploadFile.and.returnValue(of(tepDinhKem({ fileName: 'bao-cao.pdf' })));
      taoTrang();

      noiBo()['uploadFiles']([tep('bao-cao.pdf', 1024, 'application/pdf')]);

      const added = noiBo()['attachments']()[0];
      expect(added.fileName).toBe('bao-cao.pdf');
      expect(noiBo()['fileMeta'](added)).toBe('Hóa đơn thương mại · 2 KB');
    });

    it('tệp chưa gắn loại chứng từ thì dòng phụ chỉ hiện kích thước', () => {
      taoTrang();
      const chuaGanLoai = tepDinhKem({ documentTypeCode: undefined, documentTypeName: undefined });
      expect(noiBo()['fileMeta'](chuaGanLoai)).toBe('2 KB');
    });

    it('hồ sơ đã lưu thì tệp được gắn ngay vào hồ sơ', () => {
      taoTrang('hs-1');

      noiBo()['uploadFiles']([tep('hop-le.pdf', 1024, 'application/pdf')]);

      expect(api.uploadFile.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ dossierId: 'hs-1' }));
      expect(api.attachDeclarationFiles).toHaveBeenCalledWith('hs-1', ['file-1']);
    });

    it('hồ sơ chưa lưu: tệp chờ sẵn và được gắn ngay sau khi lưu nháp lần đầu', () => {
      taoTrang();

      noiBo()['uploadFiles']([tep('hop-le.pdf', 1024, 'application/pdf')]);
      expect(api.attachDeclarationFiles).not.toHaveBeenCalled();

      noiBo()['saveDraft']();

      expect(api.attachDeclarationFiles).toHaveBeenCalledWith('hs-1', ['file-1']);
    });

    it('gỡ tệp của hồ sơ chưa lưu thì xóa hẳn tệp, hồ sơ đã lưu thì gỡ khỏi hồ sơ', () => {
      taoTrang();
      noiBo()['attachments'].set([tepDinhKem()]);
      noiBo()['removeAttachment'](tepDinhKem());
      expect(api.deleteFile).toHaveBeenCalledOnceWith('file-1');
      expect(noiBo()['attachments']().length).toBe(0);

      TestBed.resetTestingModule();
      taoTrang('hs-1');
      noiBo()['attachments'].set([tepDinhKem()]);
      noiBo()['removeAttachment'](tepDinhKem());
      expect(api.removeDeclarationAttachment).toHaveBeenCalledOnceWith('hs-1', 'file-1');
    });

    it('API tải lên lỗi thì báo tên tệp không tải được', () => {
      api.uploadFile.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      noiBo()['uploadFiles']([tep('hop-le.pdf', 1024, 'application/pdf')]);

      expect(noiBo()['uploadErrors']()).toEqual(['Không tải lên được tệp "hop-le.pdf". Vui lòng thử lại.']);
      expect(noiBo()['uploading']()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Dòng hàng hóa nhiều dòng', () => {
    beforeEach(() => taoTrang());

    it('thêm và xóa dòng hàng', () => {
      expect(noiBo()['form'].cargoItems.length).toBe(1);

      noiBo()['addCargoRow']();
      noiBo()['addCargoRow']();
      expect(noiBo()['form'].cargoItems.length).toBe(3);

      noiBo()['removeCargoRow'](1);
      expect(noiBo()['form'].cargoItems.length).toBe(2);
    });

    it('không cho xóa dòng cuối cùng', () => {
      noiBo()['removeCargoRow'](0);
      expect(noiBo()['form'].cargoItems.length).toBe(1);
    });

    it('dòng hàng trống hoàn toàn không được gửi lên API', () => {
      noiBo()['form'].cargoItems[0].description = 'Ngô hạt';
      noiBo()['addCargoRow']();

      noiBo()['saveDraft']();

      expect(api.createDeclaration.calls.mostRecent().args[0].cargoItems?.length).toBe(1);
    });

    it('hiển thị bảng hàng hóa gồm các cột và dòng tổng trọng lượng ở cuối', () => {
      noiBo()['form'].cargoItems[0].description = 'Ngô hạt';
      noiBo()['form'].cargoItems[0].grossWeightKg = 12000;
      noiBo()['addCargoRow']();
      noiBo()['form'].cargoItems[1].description = 'Đậu tương';
      noiBo()['form'].cargoItems[1].grossWeightKg = 8000;

      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('.cargo-table') as HTMLTableElement;
      expect(table).toBeTruthy();
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(headers).toContain('STT');
      expect(headers).toContain('Tên hàng hóa *');

      const totalValue = table.querySelector('.total-value') as HTMLElement;
      expect(totalValue.textContent).toContain('20,000 kg');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chứng từ bắt buộc theo loại hồ sơ (D7 / F13)', () => {
    it('hiện danh mục chứng từ bắt buộc và đánh dấu còn thiếu, tải rồi thì đã đủ', () => {
      api.getRequiredDocuments.and.returnValue(of([
        { documentTypeCode: 'COMMERCIAL_INVOICE', documentTypeName: 'Hóa đơn thương mại', required: true },
        { documentTypeCode: 'PACKING_LIST', documentTypeName: 'Phiếu đóng gói', required: true },
      ]));
      taoTrang();

      expect(api.getRequiredDocuments).toHaveBeenCalledWith('IMPORT');
      // Một trang cuộn: mọi section luôn hiển thị nên chứng từ bắt buộc có sẵn trong DOM.
      fixture.detectChanges();

      const noiDung = (fixture.nativeElement as HTMLElement).textContent || '';
      expect(noiDung).toContain('Hóa đơn thương mại');
      expect(noiDung).toContain('Phiếu đóng gói');
      expect(noiDung).toContain('Còn thiếu');
      expect(noiBo()['requiredDocStatus']().every((doc: { uploaded: boolean }) => !doc.uploaded)).toBe(true);

      // Tải một chứng từ đúng loại thì cái đó chuyển sang "đã đủ".
      noiBo()['attachments'].set([
        { id: 'f1', fileName: 'hd.pdf', contentType: 'application/pdf', sizeBytes: 1024, documentTypeCode: 'COMMERCIAL_INVOICE' },
      ]);
      fixture.detectChanges();

      expect(noiBo()['requiredDocsDone']()).toBe(1);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Đã tải');
    });

    it('đổi loại hồ sơ thì tải lại danh mục chứng từ bắt buộc tương ứng', () => {
      taoTrang();
      api.getRequiredDocuments.calls.reset();

      noiBo()['onTypeChange']('EXPORT');

      expect(noiBo()['form'].type).toBe('EXPORT');
      expect(api.getRequiredDocuments).toHaveBeenCalledWith('EXPORT');
    });

    it('khi thiếu chứng từ bắt buộc, isFieldOnForm("attachments.COMMERCIAL_INVOICE") là true, tô đỏ section documents và firstErrorSection là documents', () => {
      api.getRequiredDocuments.and.returnValue(of([
        { documentTypeCode: 'COMMERCIAL_INVOICE', documentTypeName: 'Hóa đơn thương mại', required: true },
      ]));
      taoTrang();
      dienThongTinToiThieu();

      noiBo()['submit']();

      expect(noiBo()['isFieldOnForm']('attachments.COMMERCIAL_INVOICE')).toBe(true);
      expect(noiBo()['sectionOfField']('attachments.COMMERCIAL_INVOICE')).toBe('documents');
      expect(noiBo()['sectionHasError']('documents')).toBe(true);
      expect(noiBo()['firstErrorSection']()).toBe('documents');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Loại chứng từ đổ từ danh mục (F04)', () => {
    it('ô chọn loại chứng từ được đổ từ API, không hard-code', () => {
      api.getDocumentTypes.and.returnValue(of([
        { code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan' },
        { code: 'COMMERCIAL_INVOICE', name: 'Hóa đơn thương mại' },
      ]));
      taoTrang();

      expect(api.getDocumentTypes).toHaveBeenCalledTimes(1);
      expect(noiBo()['documentTypeOptions']()).toEqual([
        { value: 'CUSTOMS_DECLARATION', label: 'Tờ khai hải quan' },
        { value: 'COMMERCIAL_INVOICE', label: 'Hóa đơn thương mại' },
      ]);
    });

    it('mặc định không chọn loại nào nên không gửi mã khi tải tệp', () => {
      taoTrang();

      expect(noiBo()['documentTypeCode']).toBe('');
      noiBo()['uploadFiles']([tep('hop-le.pdf', 1024, 'application/pdf')]);

      expect(api.uploadFile.calls.mostRecent().args[1]?.documentTypeCode).toBeFalsy();
    });

    it('chọn một loại thì gửi đúng mã đó khi tải tệp', () => {
      taoTrang();
      noiBo()['documentTypeCode'] = 'COMMERCIAL_INVOICE';

      noiBo()['uploadFiles']([tep('hop-le.pdf', 1024, 'application/pdf')]);

      expect(api.uploadFile.calls.mostRecent().args[1]?.documentTypeCode).toBe('COMMERCIAL_INVOICE');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Nạp hồ sơ đang có', () => {
    it('đổ dữ liệu từ API vào biểu mẫu, kể cả dòng hàng và chứng từ', () => {
      api.getDeclaration.and.returnValue(of(hoSo({
        cargoItems: [
          { id: 'c1', description: 'Ngô hạt', quantity: 900, unitCode: 'Bao', grossWeightKg: 18000 },
          { id: 'c2', description: 'Sắn lát', grossWeightKg: 5000 },
        ],
        attachments: [tepDinhKem()],
        appointment: { id: 'ap-1', scheduledAt: '2026-07-22T02:00:00.000Z' },
      })));

      taoTrang('hs-1');

      const form = noiBo()['form'];
      expect(form.enterprise.taxCode).toBe('5501234567');
      expect(form.cargoItems.length).toBe(2);
      expect(form.cargoItems[0].description).toBe('Ngô hạt');
      expect(form.appointment.scheduledAt).toBeTruthy();
      expect(noiBo()['attachments']().length).toBe(1);
      expect(noiBo()['readOnly']()).toBe(false);
    });

    it('không tải được hồ sơ thì báo lỗi rõ ràng', () => {
      api.getDeclaration.and.returnValue(throwError(() => new Error('loi')));
      taoTrang('hs-1');

      expect(noiBo()['loadError']()).toBe('Không tải được hồ sơ. Vui lòng quay lại danh sách và thử lại.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('SG-109 — Giữ chứng từ đính kèm và gắn trước khi nộp', () => {
    it('khi nộp hồ sơ có tệp pending: gắn tệp vào hồ sơ trước khi gọi submitDeclaration', () => {
      taoTrang();
      dienThongTinToiThieu();

      api.createDeclaration.and.returnValue(of(hoSo({ id: 'hs-new-1', attachments: [] })));
      api.attachDeclarationFiles.and.returnValue(of(undefined));
      api.submitDeclaration.and.returnValue(of({ code: 'HS-NEW', qrCode: 'QR', submittedAt: '2026-08-14T08:00:00.000Z' }));

      noiBo()['pendingAttachmentIds'] = ['f-1'];
      noiBo()['attachments'].set([tepDinhKem({ id: 'f-1' })]);

      noiBo()['submit']();

      expect(api.createDeclaration).toHaveBeenCalled();
      expect(api.attachDeclarationFiles).toHaveBeenCalledWith('hs-new-1', ['f-1']);
      expect(api.submitDeclaration).toHaveBeenCalledWith('hs-new-1');
      expect(noiBo()['pendingAttachmentIds']).toEqual([]);
      expect(noiBo()['attachments']().length).toBe(1);
    });

    it('khi submit thất bại: không làm mất danh sách tệp đính kèm trên giao diện', () => {
      taoTrang();
      dienThongTinToiThieu();

      api.createDeclaration.and.returnValue(of(hoSo({ id: 'hs-new-1', attachments: [] })));
      api.attachDeclarationFiles.and.returnValue(of(undefined));
      api.submitDeclaration.and.returnValue(throwError(() => ({
        status: 400,
        error: { message: 'Vui lòng kiểm tra lại các trường được đánh dấu.', errors: [{ field: 'enterprise.taxCode', message: 'Mã số thuế không hợp lệ.' }] },
      })));

      noiBo()['pendingAttachmentIds'] = ['f-1'];
      noiBo()['attachments'].set([tepDinhKem({ id: 'f-1' })]);

      noiBo()['submit']();

      expect(noiBo()['fieldError']('enterprise.taxCode')).toBe('Mã số thuế không hợp lệ.');
      expect(noiBo()['attachments']().length).toBe(1);
      expect(noiBo()['attachments']()[0].id).toBe('f-1');
    });
  });

  describe('SG-191 — Ẩn người đại diện cho tài khoản cá nhân, prefill thông tin tài khoản và validate số điện thoại', () => {
    it('tự động điền thông tin doanh nghiệp/người khai từ tài khoản đăng nhập khi tạo mới', () => {
      authUser = {
        taxCode: '5501234567',
        displayName: 'Cty CP Nông Sản Tây Bắc',
        representativeName: 'Nguyễn Văn Hùng',
        address: 'Số 10 Lê Lợi',
        phone: '0912345678',
      };
      taoTrang();
      const form = noiBo()['form'];
      expect(form.enterprise.taxCode).toBe('5501234567');
      expect(form.enterprise.name).toBe('Cty CP Nông Sản Tây Bắc');
      expect(form.enterprise.representativeName).toBe('Nguyễn Văn Hùng');
      expect(form.enterprise.address).toBe('Số 10 Lê Lợi');
      expect(form.enterprise.phone).toBe('0912345678');
    });

    it('ẩn trường người đại diện khi người dùng đăng nhập có accountType = INDIVIDUAL', () => {
      authUser = { accountType: 'INDIVIDUAL', displayName: 'Nguyễn Thị Thu Phương' };
      taoTrang();
      expect(noiBo()['showRepresentative']()).toBeFalse();
    });

    it('tự động điền taxCode từ idNumber/citizenId cho tài khoản cá nhân', () => {
      authUser = { accountType: 'INDIVIDUAL', displayName: 'Nguyễn Thị Thu Phương', idNumber: '012121212252', phone: '0369852369', address: 'Hà Nội' };
      taoTrang();
      expect(noiBo()['form'].enterprise.taxCode).toBe('012121212252');
      expect(noiBo()['form'].enterprise.name).toBe('Nguyễn Thị Thu Phương');
      expect(noiBo()['form'].enterprise.phone).toBe('0369852369');
      expect(noiBo()['form'].enterprise.address).toBe('Hà Nội');
    });

    it('hiện trường người đại diện khi người dùng đăng nhập là doanh nghiệp', () => {
      authUser = { accountType: 'ENTERPRISE', displayName: 'Cty CP Nông Sản' };
      taoTrang();
      expect(noiBo()['showRepresentative']()).toBeTrue();
    });

    it('khi accountInfo được cấu hình isRequired = true: báo lỗi khi để trống số điện thoại lúc gửi hồ sơ', () => {
      taoTrang();
      noiBo()['fieldConfigs'].set({ accountInfo: { isVisible: true, isRequired: true } });
      const form = noiBo()['form'];
      form.enterprise.name = 'Cty CP Nông sản Tây Bắc';
      form.enterprise.taxCode = '5501234567';
      form.enterprise.address = 'Hà Nội';
      form.enterprise.phone = '';
      form.vehicles[0].plateNumber = '26C-123.45';

      noiBo()['submit']();
      expect(noiBo()['fieldError']('enterprise.phone')).toBe('Vui lòng nhập số điện thoại.');
      expect(api.submitDeclaration).not.toHaveBeenCalled();
    });

    it('khi accountInfo được cấu hình isRequired = true: báo lỗi khi để trống tên hoặc mã số thuế/CCCD lúc gửi hồ sơ', () => {
      taoTrang();
      noiBo()['fieldConfigs'].set({ accountInfo: { isVisible: true, isRequired: true } });
      const form = noiBo()['form'];
      form.enterprise.name = '';
      form.enterprise.taxCode = '';
      form.vehicles[0].plateNumber = '26C-123.45';

      noiBo()['submit']();
      expect(noiBo()['fieldError']('enterprise.name')).toBeTruthy();
      expect(api.submitDeclaration).not.toHaveBeenCalled();
    });

    it('khi accountInfo bị ẩn (isVisible = false): nhóm thông tin tài khoản rỗng KHÔNG bị chặn và không gây deadlock', () => {
      taoTrang();
      noiBo()['fieldConfigs'].set({ accountInfo: { isVisible: false, isRequired: true } });
      const form = noiBo()['form'];
      form.enterprise.name = '';
      form.enterprise.taxCode = '';
      form.enterprise.phone = '';
      form.vehicles[0].plateNumber = '26C-123.45';

      noiBo()['saveDraft']();
      expect(noiBo()['fieldError']('enterprise.phone')).toBe('');
      expect(api.createDeclaration).toHaveBeenCalledTimes(1);
    });

    it('khi accountInfo không bắt buộc (isRequired = false): nhóm thông tin tài khoản rỗng KHÔNG bị chặn', () => {
      taoTrang();
      noiBo()['fieldConfigs'].set({ accountInfo: { isVisible: true, isRequired: false } });
      const form = noiBo()['form'];
      form.enterprise.name = '';
      form.enterprise.taxCode = '';
      form.enterprise.phone = '';
      form.vehicles[0].plateNumber = '26C-123.45';

      noiBo()['saveDraft']();
      expect(noiBo()['fieldError']('enterprise.phone')).toBe('');
      expect(api.createDeclaration).toHaveBeenCalledTimes(1);
    });

    it('báo lỗi khi nhập sai định dạng số điện thoại lúc gửi hồ sơ', () => {
      taoTrang();
      dienThongTinToiThieu();
      noiBo()['form'].enterprise.phone = '123';
      noiBo()['submit']();
      expect(noiBo()['fieldError']('enterprise.phone')).toBe('Số điện thoại không hợp lệ.');
      expect(api.submitDeclaration).not.toHaveBeenCalled();
    });

    it('SG-282: Lưu nháp không kiểm tra/validate dữ liệu của các trường thông tin kể cả khi để trống hoặc nhập dữ liệu không hợp lệ', () => {
      taoTrang();
      dienThongTinToiThieu();
      const form = noiBo()['form'];
      form.enterprise.phone = '123';
      form.enterprise.taxCode = 'invalid-tax';
      form.vehicles[0].plateNumber = '!@#';

      noiBo()['saveDraft']();

      expect(noiBo()['fieldError']('enterprise.phone')).toBe('');
      expect(noiBo()['fieldError']('enterprise.taxCode')).toBe('');
      expect(noiBo()['vehicleError'](0, 'plateNumber')).toBe('');
      expect(api.createDeclaration).toHaveBeenCalledTimes(1);
    });

    it('SG-226: thẻ tóm tắt và phần lưu ý có container side__sticky chứa thẻ tóm tắt và lưu ý quan trọng', () => {
      taoTrang();
      const el: HTMLElement = fixture.nativeElement;
      const side = el.querySelector('.side');
      const sideSticky = el.querySelector('.side__sticky');

      expect(side).not.toBeNull();
      expect(sideSticky).not.toBeNull();
      expect(sideSticky?.querySelector('.summary-card')).not.toBeNull();
      expect(sideSticky?.querySelector('.notes')).not.toBeNull();
    });

    it('hiển thị nhãn Bước 1 trên thanh tiến trình là Thông tin khởi tạo', () => {
      authUser = { accountType: 'ENTERPRISE', displayName: 'Cty CP Nông Sản' };
      taoTrang();
      expect(noiBo()['sections']()[0].label).toBe('Thông tin khởi tạo');

      TestBed.resetTestingModule();
      authUser = { accountType: 'INDIVIDUAL', displayName: 'Nguyễn Thị Thu Phương' };
      taoTrang();
      expect(noiBo()['sections']()[0].label).toBe('Thông tin khởi tạo');
    });

    it('SG-275: khi gửi hồ sơ có lỗi trùng biển số/CCCD từ API và đồng thời để trống tên hàng hóa, hệ thống báo lỗi đồng thời cả 3 trường', () => {
      taoTrang();
      const form = noiBo()['form'];
      form.appointment.scheduledAt = '2030-09-01T10:00';
      form.enterprise.taxCode = '5501234567';
      form.enterprise.name = 'Cty CP Nông sản Tây Bắc';
      form.enterprise.phone = '0369852369';
      form.enterprise.address = 'Hà Nội';
      form.vehicles[0].plateNumber = '656D665';
      form.vehicles[0].driver.idNumber = '038965895671';
      form.vehicles[0].driver.licenseNumber = '123456';
      form.vehicles[0].driver.fullName = 'Nguyễn Văn A';
      form.cargoItems[0].description = ''; // Để trống tên hàng hóa

      // Giả lập API trả về lỗi trùng biển số xe và CCCD
      api.createDeclaration.and.returnValue(
        throwError(() => ({
          status: 400,
          error: {
            code: 'dossier.submitIncomplete',
            errors: [
              {
                field: 'vehicles[0].plateNumber',
                message: 'Biển số xe 656D665 đang thuộc hồ sơ IMP-20260828-000036 chưa kết thúc.',
              },
              {
                field: 'vehicles[0].driver.idNumber',
                message: 'Số CCCD/Hộ chiếu 038965895671 của lái xe đang thuộc hồ sơ IMP-20260828-000036 chưa kết thúc.',
              },
            ],
          },
        })),
      );

      noiBo()['submit']();

      // Kiểm tra lỗi đồng thời xuất hiện ở cả biển số xe, CCCD và tên hàng hóa
      expect(noiBo()['vehicleError'](0, 'plateNumber')).toContain('Biển số xe 656D665 đang thuộc hồ sơ IMP-20260828-000036 chưa kết thúc.');
      expect(noiBo()['vehicleError'](0, 'driver.idNumber')).toContain('Số CCCD/Hộ chiếu 038965895671 của lái xe đang thuộc hồ sơ IMP-20260828-000036 chưa kết thúc.');
      expect(noiBo()['cargoError'](0, 'description')).toBeTruthy();
      expect(noiBo()['sectionHasError']('vehicle')).toBe(true);
      expect(noiBo()['sectionHasError']('cargo')).toBe(true);
    });
  });

  describe('Tạo hồ sơ cho tài khoản khác (createForOther)', () => {
    beforeEach(() => {
      authUser = {
        id: 'admin-01',
        username: 'admin',
        displayName: 'Quản trị viên',
        roles: ['SYS_ADMIN'],
      };
    });

    it('SG-297: Doanh nghiệp mở hồ sơ nháp do Admin tạo hộ (createForOther = true) thì không bật createForOther và không gọi API lookupUser', () => {
      authUser = {
        id: 'user-enterprise-01',
        username: 'enterprise_user',
        accountType: 'ENTERPRISE',
        taxCode: '0109157841',
        displayName: 'Công ty TNHH Dịch vụ Giải pháp ABC',
        roles: ['ENTERPRISE'],
      };
      taoTrang();
      const comp = noiBo();
      spyOn(comp as any, 'onIdentityBlur');

      const draftDetail = hoSo({
        id: 'hs-draft-01',
        status: 'DRAFT',
        enterprise: {
          createForOther: true,
          accountType: 'ENTERPRISE',
          taxCode: '0109157841',
          name: 'Công ty TNHH Dịch vụ Giải pháp ABC',
          representativeName: 'Nguyễn Thanh Lâm',
          phone: '0845.279.222',
          address: 'Hà Đông, Hà Nội',
        },
      });

      comp['applyDossierDetail'](draftDetail);

      // Doanh nghiệp mở hồ sơ: createForOther phải là false
      expect(comp['createForOther']()).toBe(false);
      expect(comp['accountMatched']()).toBe(false);
      expect((comp as any).onIdentityBlur).not.toHaveBeenCalled();
      expect(api.lookupUser).not.toHaveBeenCalled();

      // Dữ liệu hồ sơ vẫn được load đầy đủ
      expect(comp['form'].enterprise.taxCode).toBe('0109157841');
      expect(comp['form'].enterprise.name).toBe('Công ty TNHH Dịch vụ Giải pháp ABC');
      expect(comp['form'].enterprise.representativeName).toBe('Nguyễn Thanh Lâm');
      expect(comp['form'].enterprise.phone).toBe('0845.279.222');
    });

    it('Cá nhân (INDIVIDUAL): chỉ bắt buộc CCCD, các trường khác là tùy chọn', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['form'].enterprise = {
        ...comp['form'].enterprise,
        taxCode: '',
        name: '',
        phone: '',
        address: '',
      };

      const errors = comp['collectFormErrors'](true);
      const enterpriseErrors = errors.filter((e: any) => e.field.startsWith('enterprise.'));
      expect(enterpriseErrors.length).toBe(1);
      expect(enterpriseErrors[0].field).toBe('enterprise.taxCode');

      // Khi điền CCCD, không còn lỗi thông tin người khai
      comp['form'].enterprise.taxCode = '001201012345';
      const errorsAfter = comp['collectFormErrors'](true);
      expect(errorsAfter.filter((e: any) => e.field.startsWith('enterprise.')).length).toBe(0);
    });

    it('Doanh nghiệp (ENTERPRISE): chỉ bắt buộc Mã số thuế, tên/địa chỉ/sđt là tùy chọn', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise = {
        ...comp['form'].enterprise,
        taxCode: '',
        name: '',
        phone: '',
        address: '',
      };

      const errors = comp['collectFormErrors'](true);
      const enterpriseErrors = errors.filter((e: any) => e.field.startsWith('enterprise.'));
      expect(enterpriseErrors.length).toBe(1);
      expect(enterpriseErrors[0].field).toBe('enterprise.taxCode');

      // Khi điền Mã số thuế hợp lệ, không còn lỗi thông tin doanh nghiệp
      comp['form'].enterprise.taxCode = '0101234567';
      const errorsAfter = comp['collectFormErrors'](true);
      expect(errorsAfter.filter((e: any) => e.field.startsWith('enterprise.')).length).toBe(0);
    });

    it('Nội bộ (INTERNAL): chỉ bắt buộc Thư điện tử, tên/chức danh/đơn vị là tùy chọn', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INTERNAL');
      comp['form'].enterprise = {
        ...comp['form'].enterprise,
        email: '',
        name: '',
        jobTitle: '',
        department: '',
      };

      const errors = comp['collectFormErrors'](true);
      const enterpriseErrors = errors.filter((e: any) => e.field.startsWith('enterprise.'));
      expect(enterpriseErrors.length).toBe(1);
      expect(enterpriseErrors[0].field).toBe('enterprise.email');

      // Khi điền Email hợp lệ, không còn lỗi
      comp['form'].enterprise.email = 'officer@smartgate.vn';
      const errorsAfter = comp['collectFormErrors'](true);
      expect(errorsAfter.filter((e: any) => e.field.startsWith('enterprise.')).length).toBe(0);
    });

    it('onIdentityBlur cho Cá nhân (INDIVIDUAL): tự điền thông tin và bật cờ accountMatched', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['form'].enterprise.taxCode = '038090001234';

      api.lookupUser.and.returnValue(
        of({
          id: 'u-1',
          username: 'canhan1',
          displayName: 'Nguyễn Văn Cá Nhân',
          idNumber: '038090001234',
          phone: '0988776655',
          address: 'Hà Nội',
        } as any),
      );

      comp['onIdentityBlur']();

      expect(api.lookupUser).toHaveBeenCalledWith({ idNumber: '038090001234', accountType: 'INDIVIDUAL' });
      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.name).toBe('Nguyễn Văn Cá Nhân');
      expect(comp['form'].enterprise.phone).toBe('0988776655');
      expect(comp['form'].enterprise.address).toBe('Hà Nội');
      expect(comp['form'].enterprise.username).toBe('canhan1');
    });

    it('onIdentityBlur cho Doanh nghiệp (ENTERPRISE): tự điền tên DN, đại diện, SĐT, địa chỉ', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise.taxCode = '0109998888';

      api.lookupUser.and.returnValue(
        of({
          id: 'u-2',
          username: 'congtyxyz',
          displayName: 'Công ty TNHH XYZ',
          taxCode: '0109998888',
          representativeName: 'Trần Đại Diện',
          phone: '0243999999',
          address: 'Hải Phòng',
        } as any),
      );

      comp['onIdentityBlur']();

      expect(api.lookupUser).toHaveBeenCalledWith({ taxCode: '0109998888', accountType: 'ENTERPRISE' });
      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.name).toBe('Công ty TNHH XYZ');
      expect(comp['form'].enterprise.representativeName).toBe('Trần Đại Diện');
      expect(comp['form'].enterprise.phone).toBe('0243999999');
      expect(comp['form'].enterprise.address).toBe('Hải Phòng');
      expect(comp['form'].enterprise.username).toBe('congtyxyz');
    });

    it('onIdentityBlur cho Nội bộ (INTERNAL): tự điền họ tên, chức danh, đơn vị', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INTERNAL');
      comp['form'].enterprise.email = 'canbo@smartgate.vn';

      api.lookupUser.and.returnValue(
        of({
          id: 'u-3',
          username: 'canbo',
          displayName: 'Lê Cán Bộ',
          email: 'canbo@smartgate.vn',
          title: 'Kiểm hóa viên',
          organization: { id: 'org-1', code: 'HQ', name: 'Chi cục Hải quan' },
        } as any),
      );

      comp['onIdentityBlur']();

      expect(api.lookupUser).toHaveBeenCalledWith({ email: 'canbo@smartgate.vn', accountType: 'INTERNAL' });
      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.name).toBe('Lê Cán Bộ');
      expect(comp['form'].enterprise.jobTitle).toBe('Kiểm hóa viên');
      expect(comp['form'].enterprise.department).toBe('Chi cục Hải quan');
      expect(comp['form'].enterprise.username).toBe('canbo');
    });

    it('onIdentityBlur khi không tìm thấy tài khoản: chỉ xóa khi trước đó đã auto-fill (accountMatched = true)', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['accountMatched'].set(true);
      comp['form'].enterprise = {
        ...comp['form'].enterprise,
        taxCode: '000000000000',
        name: 'Tên cũ',
        phone: '0900000000',
        address: 'Địa chỉ cũ',
      };

      api.lookupUser.and.returnValue(of(null));

      comp['onIdentityBlur']();

      expect(comp['accountMatched']()).toBe(false);
      expect(comp['form'].enterprise.name).toBe('');
      expect(comp['form'].enterprise.phone).toBe('');
      expect(comp['form'].enterprise.address).toBe('');
      expect(comp['form'].enterprise.taxCode).toBe('000000000000'); // Giữ lại giá trị đang gõ
    });

    it('onIdentityBlur khi không tìm thấy tài khoản: giữ nguyên dữ liệu tự nhập nếu trước đó chưa auto-fill', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['accountMatched'].set(false);
      comp['form'].enterprise = {
        ...comp['form'].enterprise,
        taxCode: '099999999999',
        name: 'Tên người dùng tự gõ',
        phone: '0912345678',
        address: 'Địa chỉ tự gõ',
      };

      api.lookupUser.and.returnValue(of(null));

      comp['onIdentityBlur']();

      expect(comp['accountMatched']()).toBe(false);
      expect(comp['form'].enterprise.name).toBe('Tên người dùng tự gõ');
      expect(comp['form'].enterprise.phone).toBe('0912345678');
      expect(comp['form'].enterprise.address).toBe('Địa chỉ tự gõ');
    });

    it('onIdentityBlur khi API lỗi mạng: giữ nguyên accountMatched và không xóa dữ liệu đã nhập', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['accountMatched'].set(true);
      comp['form'].enterprise.taxCode = '0101234567';
      comp['form'].enterprise.name = 'DN đã auto-fill';

      api.lookupUser.and.returnValue(throwError(() => new Error('Network error')));

      comp['onIdentityBlur']();

      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.name).toBe('DN đã auto-fill');
    });

    it('buildPayload: gửi đủ createForOther, accountType và idNumber khi lưu nháp cho cá nhân (taxCode undefined)', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['form'].enterprise.taxCode = '038090001234';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBe(true);
      expect(payload.enterprise.accountType).toBe('INDIVIDUAL');
      expect(payload.enterprise.taxCode).toBe('');
      expect(payload.enterprise.idNumber).toBe('038090001234');
      expect(payload.enterprise.representativeName).toBe('');
    });

    it('buildPayload: không gán nhầm idNumber khi user INDIVIDUAL tạo hồ sơ cho ENTERPRISE', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise.taxCode = '5500123456';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBe(true);
      expect(payload.enterprise.accountType).toBe('ENTERPRISE');
      expect(payload.enterprise.taxCode).toBe('5500123456');
      expect(payload.enterprise.idNumber).toBe('');
    });

    it('buildPayload: gửi representativeName khi admin khai hộ cho ENTERPRISE kể cả khi showRepresentative() là false', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise.taxCode = '0109998888';
      comp['form'].enterprise.name = 'Công ty TNHH XYZ';
      comp['form'].enterprise.representativeName = 'Trần Đại Diện';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBe(true);
      expect(payload.enterprise.accountType).toBe('ENTERPRISE');
      expect(payload.enterprise.taxCode).toBe('0109998888');
      expect(payload.enterprise.representativeName).toBe('Trần Đại Diện');
    });

    it('applyDossierDetail: tự động tra cứu và bật accountMatched khi nạp hồ sơ doanh nghiệp đã copy', () => {
      authUser = {
        id: 'admin-01',
        username: 'admin',
        accountType: null,
        roles: ['SYS_ADMIN'],
      };
      taoTrang();
      const comp = noiBo();

      api.lookupUser.and.returnValue(of({
        id: 'user-dn-01',
        username: 'dn_alpha',
        displayName: 'Công ty Cổ phần Alpha',
        taxCode: '0101234567',
        phone: '0241234567',
        address: 'Hà Nội',
        representativeName: 'Nguyễn Văn A',
        title: '',
        defaultRoute: '/',
        accountType: null,
        idNumber: null,
      } as any));

      const copiedDetail = hoSo({
        id: 'dossier-copied-01',
        code: 'HS-2026-COPY01',
        type: 'IMPORT',
        status: 'DRAFT',
        enterprise: {
          taxCode: '0101234567',
          name: 'Công ty Cổ phần Alpha',
          representativeName: 'Nguyễn Văn A',
          address: 'Hà Nội',
          phone: '0241234567',
          accountType: 'ENTERPRISE',
          createForOther: true,
        },
      });

      comp['applyDossierDetail'](copiedDetail);

      expect(comp['createForOther']()).toBe(true);
      expect(comp['selectedAccountType']()).toBe('ENTERPRISE');
      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.name).toBe('Công ty Cổ phần Alpha');
    });

    it('khi đổi MST sang MST chưa tồn tại: xóa trắng dữ liệu cũ và cho phép nhập mới', () => {
      authUser = {
        id: 'admin-01',
        username: 'admin',
        roles: ['SYS_ADMIN'],
      };
      taoTrang();
      const comp = noiBo();

      api.lookupUser.and.returnValue(of({
        id: 'user-dn-01',
        username: 'dn_alpha',
        displayName: 'Công ty Cổ phần Alpha',
        taxCode: '0101234567',
        phone: '0241234567',
        address: 'Hà Nội',
        representativeName: 'Nguyễn Văn A',
        title: '',
        defaultRoute: '/',
        accountType: null,
        idNumber: null,
      } as any));

      const copiedDetail = hoSo({
        id: 'dossier-copied-01',
        status: 'DRAFT',
        enterprise: {
          taxCode: '0101234567',
          name: 'Công ty Cổ phần Alpha',
          representativeName: 'Nguyễn Văn A',
          phone: '0241234567',
          address: 'Hà Nội',
          accountType: 'ENTERPRISE',
          createForOther: true,
        },
      });
      comp['applyDossierDetail'](copiedDetail);
      expect(comp['accountMatched']()).toBe(true);

      // Đổi sang MST chưa tồn tại
      comp['form'].enterprise.taxCode = '9999999999';
      api.lookupUser.and.returnValue(of(null));

      comp['onIdentityBlur']();

      expect(comp['accountMatched']()).toBe(false);
      expect(comp['form'].enterprise.name).toBe('');
      expect(comp['form'].enterprise.phone).toBe('');
      expect(comp['form'].enterprise.address).toBe('');

      // Người dùng tự nhập thông tin cho MST mới
      comp['form'].enterprise.name = 'Công ty Beta Mới';
      comp['form'].enterprise.phone = '0988776655';
      comp['form'].enterprise.address = 'Hải Phòng';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.taxCode).toBe('9999999999');
      expect(payload.enterprise.name).toBe('Công ty Beta Mới');
      expect(payload.enterprise.phone).toBe('0988776655');
      expect(payload.enterprise.address).toBe('Hải Phòng');
    });

    it('buildPayload: không gửi taxCode và representativeName khi khai hộ cho INTERNAL', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INTERNAL');
      comp['form'].enterprise.email = 'canbo@smartgate.vn';
      comp['form'].enterprise.representativeName = 'Trần Đại Diện';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBe(true);
      expect(payload.enterprise.accountType).toBe('INTERNAL');
      expect(payload.enterprise.taxCode).toBe('');
      expect(payload.enterprise.email).toBe('canbo@smartgate.vn');
      expect(payload.enterprise.representativeName).toBe('');
    });

    it('onIdentityBlur: distinctUntilChanged ngăn chặn gọi API lặp lại khi blur liên tiếp cùng một định danh', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise.taxCode = '0109998888';

      api.lookupUser.and.returnValue(of(null));

      comp['onIdentityBlur']();
      expect(api.lookupUser).toHaveBeenCalledTimes(1);

      comp['onIdentityBlur']();
      expect(api.lookupUser).toHaveBeenCalledTimes(1);
    });

    it('onIdentityBlur: xóa trống định danh khi đã khớp trước đó sẽ reset các trường auto-fill', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['accountMatched'].set(true);
      comp['form'].enterprise.taxCode = '   ';
      comp['form'].enterprise.name = 'Tên cũ';

      comp['onIdentityBlur']();

      expect(comp['accountMatched']()).toBe(false);
      expect(comp['form'].enterprise.name).toBe('');
      expect(api.lookupUser).not.toHaveBeenCalled();
    });

    it('buildPayload: tự khai báo cho cán bộ INTERNAL vẫn giữ nguyên taxCode (Mã nội bộ)', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(false);
      comp['form'].enterprise.taxCode = 'NB-12345';
      comp['form'].enterprise.name = 'Cán bộ trực ban';

      spyOn(comp as any, 'userAccountType').and.returnValue('INTERNAL');

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBeUndefined();
      expect(payload.enterprise.accountType).toBe('INTERNAL');
      expect(payload.enterprise.taxCode).toBe('NB-12345');
      expect(payload.enterprise.idNumber).toBeUndefined();
      expect(payload.enterprise.name).toBe('Cán bộ trực ban');
    });

    it('buildPayload: khi khai hộ mà không khớp tài khoản và tên rỗng thì gửi name là chuỗi rỗng', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['form'].enterprise.taxCode = '038090001234';
      comp['form'].enterprise.name = '   ';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.name).toBe('');
    });

    it('toForm: nạp hồ sơ INDIVIDUAL có idNumber nhưng taxCode rỗng thì map đúng vào form.enterprise.taxCode', () => {
      taoTrang();
      const comp = noiBo();
      const form = comp['toForm']({
        id: 'decl-ind-1',
        code: 'DECL-001',
        type: 'EXPORT',
        status: 'DRAFT',
        enterprise: {
          accountType: 'INDIVIDUAL',
          idNumber: '038090001234',
          taxCode: '',
          name: 'Nguyễn Văn A',
        },
      } as any);

      expect(form.enterprise.taxCode).toBe('038090001234');
      expect(form.enterprise.name).toBe('Nguyễn Văn A');
    });

    it('toForm: admin mở hồ sơ do user tự tạo (createForOther != true) thì không bị ép createForOther = true', () => {
      authUser = {
        id: 'admin-01',
        username: 'admin',
        roles: ['SYS_ADMIN'],
      };
      taoTrang();
      const comp = noiBo();

      comp['toForm']({
        id: 'decl-user-1',
        code: 'DECL-USER',
        type: 'IMPORT',
        status: 'DRAFT',
        enterprise: {
          taxCode: '0101234567',
          name: 'Công ty Do User Tự Khai',
          createForOther: false,
        },
      } as any);

      expect(comp['createForOther']()).toBe(false);
    });

    it('toForm: nạp hồ sơ INTERNAL có createForOther = true thì chọn đúng selectedAccountType = INTERNAL', () => {
      taoTrang();
      const comp = noiBo();
      comp['toForm']({
        id: 'decl-internal-1',
        code: 'DECL-INT',
        type: 'IMPORT',
        status: 'DRAFT',
        enterprise: {
          email: 'canbo@smartgate.vn',
          taxCode: '',
          name: 'Cán bộ trực ban',
          createForOther: true,
          accountType: 'INTERNAL',
        },
      } as any);

      expect(comp['createForOther']()).toBe(true);
      expect(comp['selectedAccountType']()).toBe('INTERNAL');
    });

    it('applyDossierDetail: hồ sơ readOnly không kích hoạt tra cứu ngầm onIdentityBlur', () => {
      taoTrang();
      const comp = noiBo();
      spyOn(comp as any, 'onIdentityBlur');

      const submittedDetail = hoSo({
        id: 'dossier-sub-01',
        status: 'PROCESSING',
        enterprise: {
          taxCode: '0101234567',
          name: 'Công ty Snapshot',
          createForOther: true,
        },
      });

      comp['applyDossierDetail'](submittedDetail);

      expect(comp['readOnly']()).toBe(true);
      expect((comp as any).onIdentityBlur).not.toHaveBeenCalled();
    });

    it('collectFormErrors: CCCD 8 số hoặc 10 số từ tài khoản đăng ký hợp lệ không bị chặn', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');

      // 8 số
      comp['form'].enterprise.taxCode = '12345678';
      let errors = comp['collectFormErrors'](true);
      expect(errors.filter((e: any) => e.field === 'enterprise.taxCode').length).toBe(0);

      // 10 số
      comp['form'].enterprise.taxCode = '1234567890';
      errors = comp['collectFormErrors'](true);
      expect(errors.filter((e: any) => e.field === 'enterprise.taxCode').length).toBe(0);

      // < 6 ký tự -> lỗi định dạng
      comp['form'].enterprise.taxCode = '12345';
      errors = comp['collectFormErrors'](true);
      const err = errors.find((e: any) => e.field === 'enterprise.taxCode');
      expect(err).toBeDefined();
      expect(err?.messageKey).toBe('ui.register.idNumberInvalid');
    });

    it('onIdentityBlur: khớp tài khoản A rồi sửa CCCD sang tài khoản B (B chưa khai SĐT/địa chỉ) thì không bị rò rỉ dữ liệu của A', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');

      // 1. Khớp tài khoản A
      comp['form'].enterprise.taxCode = '038090001111';
      api.lookupUser.and.returnValue(
        of({
          id: 'u-A',
          username: 'userA',
          displayName: 'Người Dùng A',
          idNumber: '038090001111',
          phone: '0912345678',
          address: 'Hà Nội',
        } as any),
      );
      comp['onIdentityBlur']();

      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.phone).toBe('0912345678');
      expect(comp['form'].enterprise.address).toBe('Hà Nội');

      // 2. Đổi sang tài khoản B (B chưa khai SĐT và địa chỉ)
      comp['form'].enterprise.taxCode = '038090002222';
      api.lookupUser.and.returnValue(
        of({
          id: 'u-B',
          username: 'userB',
          displayName: 'Người Dùng B',
          idNumber: '038090002222',
          phone: '',
          address: '',
        } as any),
      );
      comp['onIdentityBlur']();

      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.name).toBe('Người Dùng B');
      // Dữ liệu của A phải được xóa sạch, không rò rỉ sang B:
      expect(comp['form'].enterprise.phone).toBe('');
      expect(comp['form'].enterprise.address).toBe('');
    });

    it('onIdentityBlur: blur lặp lại cùng giá trị không tìm thấy thì không gọi lại API lookupUser', () => {
      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['form'].enterprise.taxCode = '099999999999';

      api.lookupUser.and.returnValue(of(null));

      // Lần blur 1: gọi API
      comp['onIdentityBlur']();
      expect(api.lookupUser).toHaveBeenCalledTimes(1);

      // Lần blur 2 với cùng giá trị: cơ chế chống gọi lặp phải hoạt động, không gọi lại API
      comp['onIdentityBlur']();
      expect(api.lookupUser).toHaveBeenCalledTimes(1);
    });

    it('buildPayload: khai hộ INTERNAL khi xóa trắng gửi chuỗi rỗng cho address, jobTitle, department', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INTERNAL');
      comp['form'].enterprise.email = 'canbo_moi@smartgate.vn';
      comp['form'].enterprise.name = '';
      comp['form'].enterprise.phone = '';
      comp['form'].enterprise.address = '';
      comp['form'].enterprise.jobTitle = '';
      comp['form'].enterprise.department = '';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBe(true);
      expect(payload.enterprise.accountType).toBe('INTERNAL');
      expect(payload.enterprise.email).toBe('canbo_moi@smartgate.vn');
      expect(payload.enterprise.name).toBe('');
      expect(payload.enterprise.phone).toBe('');
      expect(payload.enterprise.address).toBe('');
      expect(payload.enterprise.jobTitle).toBe('');
      expect(payload.enterprise.department).toBe('');
    });

    it('buildPayload: khai hộ ENTERPRISE gửi đầy đủ các trường và chuỗi rỗng cho các trường không thuộc ENTERPRISE', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise.taxCode = '0109999999';
      comp['form'].enterprise.name = 'Doanh nghiệp Mới';
      comp['form'].enterprise.representativeName = 'Người Đại Diện';
      comp['form'].enterprise.phone = '0988776655';
      comp['form'].enterprise.address = 'Hải Phòng';
      comp['form'].enterprise.email = '';
      comp['form'].enterprise.username = '';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBe(true);
      expect(payload.enterprise.accountType).toBe('ENTERPRISE');
      expect(payload.enterprise.taxCode).toBe('0109999999');
      expect(payload.enterprise.name).toBe('Doanh nghiệp Mới');
      expect(payload.enterprise.representativeName).toBe('Người Đại Diện');
      expect(payload.enterprise.phone).toBe('0988776655');
      expect(payload.enterprise.address).toBe('Hải Phòng');
      expect(payload.enterprise.email).toBe('');
      expect(payload.enterprise.username).toBe('');
      expect(payload.enterprise.idNumber).toBe('');
      expect(payload.enterprise.jobTitle).toBe('');
      expect(payload.enterprise.department).toBe('');
    });

    it('buildPayload: đổi loại tài khoản khi khai hộ xóa trắng các trường định danh và thuộc tính cũ ở BE', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);

      // 1. Chuyển sang INDIVIDUAL (Cá nhân)
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['form'].enterprise.taxCode = '038090001234'; // Chứa CCCD
      comp['form'].enterprise.name = 'Nguyễn Văn Cá Nhân';
      comp['form'].enterprise.phone = '0912345678';
      comp['form'].enterprise.address = 'Hải Phòng';
      comp['form'].enterprise.email = '';
      comp['form'].enterprise.username = '';

      let payload = comp['buildPayload']();
      expect(payload.enterprise.accountType).toBe('INDIVIDUAL');
      expect(payload.enterprise.idNumber).toBe('038090001234');
      expect(payload.enterprise.taxCode).toBe('');
      expect(payload.enterprise.email).toBe('');
      expect(payload.enterprise.username).toBe('');
      expect(payload.enterprise.representativeName).toBe('');
      expect(payload.enterprise.jobTitle).toBe('');
      expect(payload.enterprise.department).toBe('');

      // 2. Chuyển sang INTERNAL (Nội bộ)
      comp['selectedAccountType'].set('INTERNAL');
      comp['form'].enterprise.email = 'canbo@smartgate.vn';
      comp['form'].enterprise.name = 'Trần Văn Cán Bộ';
      comp['form'].enterprise.jobTitle = 'Chuyên viên';
      comp['form'].enterprise.department = 'Đội Giám Sát';
      comp['form'].enterprise.username = 'canbo_01';

      payload = comp['buildPayload']();
      expect(payload.enterprise.accountType).toBe('INTERNAL');
      expect(payload.enterprise.email).toBe('canbo@smartgate.vn');
      expect(payload.enterprise.username).toBe('canbo_01');
      expect(payload.enterprise.taxCode).toBe('');
      expect(payload.enterprise.idNumber).toBe('');
      expect(payload.enterprise.representativeName).toBe('');
      expect(payload.enterprise.jobTitle).toBe('Chuyên viên');
      expect(payload.enterprise.department).toBe('Đội Giám Sát');
    });

    it('buildPayload: luồng TỰ KHAI bảo toàn email, username và các thông tin tài khoản đăng nhập', () => {
      authUser = {
        id: 'user-01',
        username: 'user_dn',
        email: 'doanhnghiep@gmail.com',
        accountType: 'ENTERPRISE',
        taxCode: '0101234567',
        fullName: 'Công ty Cổ phần ABC',
        phone: '0901234567',
        address: 'Hà Nội',
      };
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(false);
      comp['form'].enterprise.email = 'doanhnghiep@gmail.com';
      comp['form'].enterprise.username = 'user_dn';
      comp['form'].enterprise.taxCode = '0101234567';
      comp['form'].enterprise.name = 'Công ty Cổ phần ABC';
      comp['form'].enterprise.phone = '0901234567';
      comp['form'].enterprise.address = 'Hà Nội';

      const payload = comp['buildPayload']();
      expect(payload.enterprise.createForOther).toBeUndefined();
      expect(payload.enterprise.email).toBe('doanhnghiep@gmail.com');
      expect(payload.enterprise.username).toBe('user_dn');
      expect(payload.enterprise.taxCode).toBe('0101234567');
      expect(payload.enterprise.name).toBe('Công ty Cổ phần ABC');
    });

    it('buildPayload: khai hộ khi admin xóa trắng định danh taxCode/idNumber/email thì gửi chuỗi rỗng để BE nhận biết xóa', () => {
      taoTrang();
      dienThongTinToiThieu();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise.taxCode = '';
      comp['form'].enterprise.name = '';

      let payload = comp['buildPayload']();
      expect(payload.enterprise.taxCode).toBe('');
      expect(payload.enterprise.name).toBe('');

      // Đối với INDIVIDUAL:
      comp['selectedAccountType'].set('INDIVIDUAL');
      comp['form'].enterprise.taxCode = '';
      payload = comp['buildPayload']();
      expect(payload.enterprise.idNumber).toBe('');

      // Đối với INTERNAL:
      comp['selectedAccountType'].set('INTERNAL');
      comp['form'].enterprise.email = '';
      payload = comp['buildPayload']();
      expect(payload.enterprise.email).toBe('');
    });

    it('identityLookup: nếu người dùng chuyển loại tài khoản khi request đang bay thì response cũ bị bỏ qua không đè dữ liệu mới', () => {
      const lookupSubject = new Subject<any>();
      api.lookupUser.and.returnValue(lookupSubject.asObservable());

      taoTrang();
      const comp = noiBo();
      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('ENTERPRISE');
      comp['form'].enterprise.taxCode = '0101234567';

      // Kích hoạt lookup cho ENTERPRISE
      comp['onIdentityBlur']();

      // Trong lúc request đang bay, người dùng chuyển loại tài khoản sang INDIVIDUAL
      comp['onTargetAccountTypeChange']('INDIVIDUAL');
      expect(comp['selectedAccountType']()).toBe('INDIVIDUAL');
      expect(comp['form'].enterprise.name).toBe('');

      // Response của ENTERPRISE trả về sau đó
      lookupSubject.next({
        displayName: 'Công ty Cũ Trả Về Muộn',
        phone: '0909999999',
        address: 'Hà Nội',
        taxCode: '0101234567',
      });

      // Phải bị bỏ qua: không tự điền đè lên INDIVIDUAL và không bật accountMatched
      expect(comp['accountMatched']()).toBe(false);
      expect(comp['form'].enterprise.name).toBe('');
    });

    it('mở lại hồ sơ nháp khai hộ có MST chưa tồn tại: lookup ngầm trả về null không xóa dữ liệu đã lưu và mở khóa trường', () => {
      taoTrang();
      const comp = noiBo();
      api.lookupUser.and.returnValue(of(null));

      const draftDetail = hoSo({
        id: 'hs-draft-mst-moi',
        status: 'DRAFT',
        enterprise: {
          createForOther: true,
          accountType: 'ENTERPRISE',
          taxCode: '9999999999',
          name: 'Công ty Mới Admin Tự Nhập',
          representativeName: 'Trần Văn Tự Nhập',
          phone: '0911223344',
          address: 'Hải Phòng',
        },
      });

      comp['applyDossierDetail'](draftDetail);

      // Tra cứu ngầm trả về null: không match tài khoản trên hệ thống
      expect(comp['createForOther']()).toBe(true);
      expect(comp['accountMatched']()).toBe(false); // Mở khóa các trường cho phép admin sửa tiếp
      // Dữ liệu đã lưu phải được bảo toàn 100%, tuyệt đối không bị xóa trắng:
      expect(comp['form'].enterprise.taxCode).toBe('9999999999');
      expect(comp['form'].enterprise.name).toBe('Công ty Mới Admin Tự Nhập');
      expect(comp['form'].enterprise.representativeName).toBe('Trần Văn Tự Nhập');
      expect(comp['form'].enterprise.phone).toBe('0911223344');
      expect(comp['form'].enterprise.address).toBe('Hải Phòng');
    });

    it('tra cứu ngầm gặp lỗi mạng: fail-safe giữ nguyên trạng thái khóa, không mở khóa cho phép sửa đè', () => {
      taoTrang();
      const comp = noiBo();
      api.lookupUser.and.returnValue(throwError(() => new Error('Mất kết nối mạng')));

      const draftDetail = hoSo({
        id: 'hs-draft-mst-dn',
        status: 'DRAFT',
        enterprise: {
          createForOther: true,
          accountType: 'ENTERPRISE',
          taxCode: '0101234567',
          name: 'Công ty Cổ phần ABC Đã Có Sẵn',
          representativeName: 'Nguyễn Văn Đại Diện',
          phone: '0901234567',
          address: 'Hà Nội',
        },
      });

      comp['applyDossierDetail'](draftDetail);

      // Khi nạp hồ sơ có MST và thông tin: toForm khởi tạo accountMatched = true
      // Tra cứu ngầm gặp lỗi mạng: error handler return sớm, accountMatched vẫn giữ nguyên true (fail-safe an toàn)
      expect(comp['createForOther']()).toBe(true);
      expect(comp['accountMatched']()).toBe(true);
      expect(comp['form'].enterprise.taxCode).toBe('0101234567');
      expect(comp['form'].enterprise.name).toBe('Công ty Cổ phần ABC Đã Có Sẵn');
    });

    it('SG-293: Khi Admin/Internal tạo hồ sơ mới, thông tin khởi tạo tự động đồng bộ đầy đủ các trường từ Thông tin tài khoản', () => {
      authUser = {
        displayName: 'Quản trị hệ thống',
        title: 'Chuyên viên quản trị',
        organization: { id: 'org-1', code: 'CKCK', name: 'Cửa khẩu Chiềng Khương' },
        phone: '0987654321',
        address: 'Số 1 Cửa khẩu Chiềng Khương, Sơn La',
        email: 'admin@smartgate.vn',
      };
      taoTrang();
      const comp = noiBo();

      expect(comp['userAccountType']()).toBe('INTERNAL');
      expect(comp['form'].enterprise.name).toBe('Quản trị hệ thống');
      expect(comp['form'].enterprise.jobTitle).toBe('Chuyên viên quản trị');
      expect(comp['form'].enterprise.department).toBe('Cửa khẩu Chiềng Khương');
      expect(comp['form'].enterprise.phone).toBe('0987654321');
      expect(comp['form'].enterprise.address).toBe('Số 1 Cửa khẩu Chiềng Khương, Sơn La');

      const el = fixture.nativeElement as HTMLElement;
      const textContent = el.textContent || '';
      expect(textContent).toContain('Họ và tên');
      expect(textContent).toContain('Chức danh');
      expect(textContent).toContain('Đơn vị');
      expect(textContent).toContain('Số điện thoại');
    });

    it('SG-294: Khi Admin tạo hồ sơ cho tài khoản nội bộ (createForOther = true, accountType = INTERNAL), collectFormErrors không bắt buộc taxCode/phone/address và submit thành công', () => {
      authUser = {
        displayName: 'Admin User',
        roles: ['ADMIN'],
        email: 'admin@smartgate.vn',
      };
      taoTrang();
      const comp = noiBo();

      comp['createForOther'].set(true);
      comp['selectedAccountType'].set('INTERNAL');
      comp['form'].type = 'IMPORT';
      comp['form'].appointment.scheduledAt = '2030-09-01T10:00';
      comp['form'].enterprise.email = 'officer@smartgate.vn';
      comp['form'].enterprise.name = 'Cán bộ kiểm dịch';
      comp['form'].enterprise.jobTitle = 'Kiểm dịch viên';
      comp['form'].enterprise.department = 'Chi cục kiểm dịch';
      comp['form'].vehicles[0].plateNumber = '29A-999.99';
      comp['form'].vehicles[0].vehicleType = 'TRUCK';
      comp['form'].vehicles[0].driver.fullName = 'Lái xe Trần Văn B';
      comp['form'].vehicles[0].driver.idNumber = '001200001234';
      comp['form'].vehicles[0].driver.licenseNumber = 'GPLX12345';
      comp['form'].vehicles[0].driver.nationality = 'VN';
      comp['form'].cargoItems[0].description = 'Hàng hóa thử nghiệm';

      const errors = comp['collectFormErrors'](true);
      expect(errors).toEqual([]);

      const submitResult = {
        code: 'HS-250519-0099',
        qrCode: 'data:image/png;base64,mockQr',
        status: 'SUBMITTED',
        type: 'IMPORT',
        submittedAt: '2026-09-08T10:00:00.000Z',
      };
      api.createDeclaration.and.returnValue(of(hoSo({ id: 'hs-new-internal', code: 'HS-250519-0099' })));
      api.submitDeclaration.and.returnValue(of(submitResult as any));

      comp['submit']();

      expect(api.createDeclaration).toHaveBeenCalled();
      expect(api.submitDeclaration).toHaveBeenCalledWith('hs-new-internal');
      expect(comp['submitResult']()).toEqual(submitResult);
    });
  });
});

