import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DossierFeeSummary } from '../../../core/models/fees.model';
import { ReasonCode } from '../../../core/models/workflow.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { DossierFeePageComponent } from './dossier-fee-page.component';

/**
 * UI-11 Thu phí theo hồ sơ.
 *
 * Bộ test khóa ba điều quan trọng nhất của màn hình: **điều chỉnh phí thiếu mã lý do bị chặn
 * ngay ở web** (F51), **số còn phải thu hiện đúng theo API** (điều kiện qua cổng — F39) và
 * **không có nút hoàn/hủy phí** (F50 thuộc Giai đoạn 2).
 */

function hoSoTruyCap(permissions: string[] = ['fee.view', 'fee.create', 'fee.update', 'fee.approve', 'fee.export']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'canbothu',
      displayName: 'Trần Thị Thu',
      title: 'Cán bộ thu phí',
      email: 'thu@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'CAN_BO_THU_PHI', name: 'Cán bộ thu phí', dataScope: 'ORGANIZATION' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

function bangKe(mau: Partial<DossierFeeSummary> = {}): DossierFeeSummary {
  return {
    items: [
      { ruleCode: 'PHI_HT', name: 'Phí hạ tầng cửa khẩu', unit: 'TRIP', quantity: 1, unitAmount: 200000, amount: 200000 },
      { ruleCode: 'PHI_BAI', name: 'Phí sử dụng bãi', unit: 'DAY', quantity: 4, unitAmount: 25000, amount: 100000 },
    ],
    subtotal: 300000,
    vatAmount: 30000,
    total: 330000,
    currency: 'VND',
    transactions: [
      { id: 'gd-1', amount: 100000, method: 'CASH', referenceCode: '', status: 'CONFIRMED', confirmedByName: 'Lê Văn A' },
      { id: 'gd-2', amount: 50000, method: 'TRANSFER', referenceCode: 'FT2607', status: 'CANCELLED' },
    ],
    settled: false,
    outstanding: 230000,
    // Mặc định hồ sơ ĐÃ tới bước thu phí — các test thu tiền một nhịp giữ nguyên ý nghĩa.
    feeStepReached: true,
    ...mau,
  };
}

const maLyDo: ReasonCode[] = [
  { code: 'FEE_ADJ_01', name: 'Sai số lượng hàng hóa', scope: 'FEE_ADJUST', active: true },
  { code: 'FEE_ADJ_02', name: 'Áp sai biểu phí', scope: 'FEE_ADJUST', active: true },
];

describe('DossierFeePageComponent — thu phí theo hồ sơ (UI-11)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<DossierFeePageComponent>;
  let component: DossierFeePageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  function taoTrang(quyen?: string[]): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(quyen) }));

    TestBed.configureTestingModule({
      imports: [DossierFeePageComponent],
      providers: [provideRouter([{ path: 'declarations/:id', children: [] }]), { provide: ApiService, useValue: api }],
    });

    fixture = TestBed.createComponent(DossierFeePageComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'hs-1');
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getDossierFees',
      'getDeclaration',
      'calculateDossierFees',
      'adjustDossierFee',
      'collectFee',
      'getReasonCodes',
      'uploadFile',
      'downloadFile',
      'getFileMetadata',
      'getAccessProfile',
    ]);
    api.getDossierFees.and.returnValue(of(bangKe({ dossierCode: 'EXP-20260811-000002' })));
    api.getDeclaration.and.returnValue(of({ id: 'hs-1', code: 'EXP-20260811-000002' } as any));
    api.calculateDossierFees.and.returnValue(of({ fees: bangKe() }));
    api.adjustDossierFee.and.returnValue(of({ fees: bangKe() }));
    api.collectFee.and.returnValue(of({ id: 'gd-3', amount: 230000, method: 'CASH', referenceCode: '', status: 'CONFIRMED' }));
    api.getReasonCodes.and.returnValue(of(maLyDo));
    api.downloadFile.and.returnValue(of(new Blob(['test-receipt-content'], { type: 'image/png' })));
    api.getFileMetadata.and.returnValue(
      of({
        id: 'att-1',
        fileName: 'bien-lai.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        storageKey: 'attachments/att-1.png',
        uploadedAt: '2026-08-14T00:00:00Z',
      }),
    );
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Bảng kê và số còn phải thu (F39, F46)', () => {
    it('hiện đủ khoản phí, tổng tiền, VAT và số còn phải thu do API trả', () => {
      taoTrang();
      const noiDung = noiDungTrang();

      expect(api.getDossierFees).toHaveBeenCalledWith('hs-1');
      expect(api.getDeclaration).toHaveBeenCalledWith('hs-1');
      expect(noiDung).toContain('EXP-20260811-000002');
      expect(noiDung).toContain('Phí hạ tầng cửa khẩu');
      expect(noiDung).toContain('Phí sử dụng bãi');
      expect(noiDung).toContain('Tổng phải thu');
      expect(noiDung).toContain('Thuế giá trị gia tăng');
      expect(noiBo()['outstanding']()).toBe(230000);
      expect(noiBo()['confirmedAmount']()).toBe(100000);
    });

    it('nút Quay lại hiển thị phía trước Xem hồ sơ đầy đủ và liên kết tới /fees/tax', () => {
      taoTrang();
      const headerActions = (fixture.nativeElement as HTMLElement).querySelector('.head__actions');
      expect(headerActions).not.toBeNull();
      const links = Array.from(headerActions!.querySelectorAll('a'));
      expect(links.length).toBeGreaterThanOrEqual(2);
      expect(links[0].getAttribute('href')).toBe('/fees/tax');
      expect(links[0].textContent).toContain('Quay lại');
      expect(links[1].textContent).toContain('Xem hồ sơ đầy đủ');
    });

    it('cột đơn vị hiện nhãn tiếng Việt, không hiện mã thô (TRIP/DAY)', () => {
      taoTrang();
      const noiDung = noiDungTrang();

      expect(noiDung).toContain('Lượt'); // TRIP → Lượt
      expect(noiDung).toContain('Ngày'); // DAY → Ngày
      expect(noiDung).not.toContain('TRIP');
      expect(noiDung).not.toContain('DAY');
    });

    it('chưa thu đủ thì nói rõ còn thiếu bao nhiêu — đây là điều kiện qua cổng', () => {
      taoTrang();

      expect(noiBo()['settled']()).toBe(false);
      expect(noiDungTrang()).toContain('chưa đạt điều kiện phí để qua cổng');
    });

    it('API không gửi outstanding thì tự tính tổng trừ phần đã xác nhận, không hiện số rỗng', () => {
      api.getDossierFees.and.returnValue(of(bangKe({ outstanding: undefined as unknown as number, settled: undefined as unknown as boolean })));
      taoTrang();

      expect(noiBo()['outstanding']()).toBe(230000);
      expect(noiBo()['settled']()).toBe(false);
    });

    it('thu đủ thì báo đạt điều kiện phí', () => {
      api.getDossierFees.and.returnValue(of(bangKe({ settled: true, outstanding: 0 })));
      taoTrang();

      expect(noiBo()['settled']()).toBe(true);
      expect(noiDungTrang()).toContain('đạt điều kiện phí để qua cổng');
    });

    it('không tải được bảng kê thì báo lỗi, không hiện bảng rỗng như thể không có phí', () => {
      api.getDossierFees.and.returnValue(throwError(() => ({ status: 500 })));
      taoTrang();

      expect(noiDungTrang()).toContain('Không tải được bảng kê phí của hồ sơ.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Điều chỉnh khoản phí — bắt buộc mã lý do (F51)', () => {
    it('thiếu mã lý do thì chặn ngay ở web, không gọi API', () => {
      taoTrang();
      noiBo()['openAdjust'](bangKe().items[0]);
      noiBo()['adjustAmount'] = 150000;

      noiBo()['submitAdjust']();

      expect(api.adjustDossierFee).not.toHaveBeenCalled();
      expect(noiBo()['adjustReasonError']()).toBe('Vui lòng chọn mã lý do điều chỉnh phí.');
    });

    it('số tiền âm cũng bị chặn trước khi gọi API', () => {
      taoTrang();
      noiBo()['openAdjust'](bangKe().items[0]);
      noiBo()['adjustAmount'] = -1;
      noiBo()['chooseReason']('FEE_ADJ_01');

      noiBo()['submitAdjust']();

      expect(api.adjustDossierFee).not.toHaveBeenCalled();
      expect(noiBo()['adjustAmountError']()).toContain('không nhỏ hơn 0');
    });

    it('mở hộp thoại thì nạp danh mục mã lý do đúng nhóm FEE_ADJUST', () => {
      taoTrang();
      noiBo()['openAdjust'](bangKe().items[0]);

      expect(api.getReasonCodes).toHaveBeenCalledWith('FEE_ADJUST');
    });

    it('đủ mã lý do thì gửi đúng khoản phí, số tiền và mã lý do', () => {
      taoTrang();
      noiBo()['openAdjust'](bangKe().items[0]);
      noiBo()['adjustAmount'] = 150000;
      noiBo()['chooseReason']('FEE_ADJ_01');
      noiBo()['adjustNote'] = 'Giảm theo biên bản kiểm tra';

      noiBo()['submitAdjust']();

      expect(api.adjustDossierFee).toHaveBeenCalledWith('hs-1', {
        ruleCode: 'PHI_HT',
        amount: 150000,
        reasonCode: 'FEE_ADJ_01',
        reasonNote: 'Giảm theo biên bản kiểm tra',
      });
    });

    it('khi hồ sơ đã thanh toán xong (settled = true) thì ẩn nút điều chỉnh và chặn openAdjust', () => {
      api.getDossierFees.and.returnValue(of(bangKe({ settled: true, outstanding: 0 })));
      taoTrang();

      const adjustButtons = (fixture.nativeElement as HTMLElement).querySelectorAll('table .adjust-link');
      expect(adjustButtons.length).toBe(0);

      noiBo()['openAdjust'](bangKe().items[0]);
      expect(noiBo()['adjustTarget']()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Thu tiền một nhịp (F47 + F48 gộp)', () => {
    it('tự động điền sẵn số tiền còn phải thu vào ô nhập số tiền thay vì để trống placeholder', async () => {
      taoTrang();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(noiBo()['paymentAmount']).toBe(230000);
      const input = (fixture.nativeElement as HTMLElement).querySelector('#fee-amount-input') as HTMLInputElement;
      expect(Number(input.value)).toBe(230000);
    });

    it('chưa nhập số tiền hoặc số tiền <= 0 thì báo lỗi tại chỗ, không gọi API', () => {
      taoTrang();
      noiBo()['paymentAmount'] = null;

      noiBo()['recordPayment']();

      expect(api.collectFee).not.toHaveBeenCalled();
      expect(noiBo()['amountError']()).toBe('Vui lòng nhập số tiền lớn hơn 0.');
    });

    it('chuyển khoản mà thiếu mã giao dịch thì bị chặn ở web', () => {
      taoTrang();
      noiBo()['paymentAmount'] = 230000;
      noiBo()['chooseMethod']('TRANSFER');

      noiBo()['recordPayment']();

      expect(api.collectFee).not.toHaveBeenCalled();
      expect(noiBo()['referenceError']()).toBe('Phương thức này bắt buộc có mã giao dịch.');
    });

    it('tiền mặt không cần mã giao dịch — thu một nhịp qua collectFee', () => {
      taoTrang();
      noiBo()['paymentAmount'] = 230000;
      noiBo()['chooseMethod']('CASH');

      noiBo()['recordPayment']();

      expect(api.collectFee).toHaveBeenCalledWith('hs-1', {
        amount: 230000,
        method: 'CASH',
        referenceCode: undefined,
        attachmentId: undefined,
        note: undefined,
      });
      expect(api.getDossierFees).toHaveBeenCalledTimes(2);
    });

    it('chọn tiền mặt thì ẩn trường nhập mã giao dịch; chọn chuyển khoản thì hiển thị', () => {
      taoTrang();
      noiBo()['chooseMethod']('CASH');
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('#fee-reference-input')).toBeNull();

      noiBo()['chooseMethod']('TRANSFER');
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('#fee-reference-input')).not.toBeNull();
    });

    it('chuyển từ phương thức khác sang tiền mặt thì tự động làm sạch mã giao dịch và lỗi', () => {
      taoTrang();
      noiBo()['chooseMethod']('TRANSFER');
      noiBo()['paymentReference'] = 'FT999';
      noiBo()['referenceError'].set('Lỗi cũ');

      noiBo()['chooseMethod']('CASH');
      expect(noiBo()['paymentReference']).toBe('');
      expect(noiBo()['referenceError']()).toBe('');
    });

    it('không có quyền fee.approve thì ẩn hẳn khối thu tiền', () => {
      taoTrang(['fee.view']);

      const submit = (fixture.nativeElement as HTMLElement).querySelector('aside .actions button');
      expect(submit).toBeNull();
    });

    it('khi hồ sơ đã hoàn thành thu phí (settled = true) thì vô hiệu hóa toàn bộ phần Thu tiền và chặn recordPayment', async () => {
      api.getDossierFees.and.returnValue(of(bangKe({ settled: true, outstanding: 0 })));
      taoTrang();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(noiBo()['settled']()).toBeTrue();

      const amountInput = (fixture.nativeElement as HTMLElement).querySelector('#fee-amount-input') as HTMLInputElement;
      const methodSelect = (fixture.nativeElement as HTMLElement).querySelector('#fee-method-select') as HTMLSelectElement;
      const dropzoneBtn = (fixture.nativeElement as HTMLElement).querySelector('aside .dropzone') as HTMLButtonElement;
      const noteTextarea = (fixture.nativeElement as HTMLElement).querySelector('#fee-note-textarea') as HTMLTextAreaElement;
      const submitBtn = (fixture.nativeElement as HTMLElement).querySelector('aside .submit-btn') as HTMLButtonElement;

      expect(amountInput.disabled).toBeTrue();
      expect(methodSelect.disabled).toBeTrue();
      expect(dropzoneBtn.disabled).toBeTrue();
      expect(noteTextarea.disabled).toBeTrue();
      expect(submitBtn.disabled).toBeTrue();

      noiBo()['paymentAmount'] = 100000;
      noiBo()['chooseMethod']('CASH');
      noiBo()['recordPayment']();

      expect(api.collectFee).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Quyết định chủ dự án — chỉ thu khi hồ sơ đã tới bước thu phí', () => {
    it('CHƯA tới bước phí → nút ghi giao dịch bị vô hiệu và hiện dòng giải thích', () => {
      api.getDossierFees.and.returnValue(of(bangKe({ feeStepReached: false })));
      taoTrang();

      expect(noiBo()['stepReached']()).toBe(false);
      expect(noiDungTrang()).toContain('chưa tới bước thu phí');
      const submit = (fixture.nativeElement as HTMLElement).querySelector('aside .actions button') as HTMLButtonElement;
      expect(submit.disabled).toBeTrue();
    });

    it('CHƯA tới bước phí → recordPayment bị chặn ở web, không gọi API', () => {
      api.getDossierFees.and.returnValue(of(bangKe({ feeStepReached: false })));
      taoTrang();
      noiBo()['paymentAmount'] = 230000;
      noiBo()['chooseMethod']('CASH');

      noiBo()['recordPayment']();

      expect(api.collectFee).not.toHaveBeenCalled();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text.includes('chưa tới bước thu phí'))).toBe(true);
    });

    it('ĐÃ tới bước phí → nút ghi giao dịch bật bình thường', () => {
      taoTrang();

      expect(noiBo()['stepReached']()).toBe(true);
      const submit = (fixture.nativeElement as HTMLElement).querySelector('aside .actions button') as HTMLButtonElement;
      expect(submit.disabled).toBeFalse();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ranh giới phạm vi MVP', () => {
    it('không vẽ nút hoàn phí / hủy phí (F50 thuộc Giai đoạn 2)', () => {
      taoTrang();
      const noiDung = noiDungTrang();

      expect(noiDung).not.toContain('Hoàn phí');
      expect(noiDung).not.toContain('Hủy phí');
    });

    it('tính lại phí gọi đúng endpoint và tải lại bảng kê', () => {
      taoTrang();

      noiBo()['recalculate']();

      expect(api.calculateDossierFees).toHaveBeenCalledWith('hs-1');
      expect(api.getDossierFees).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Thẻ thống kê tính ở web (F39/F46)', () => {
    it('tổng dòng phí, số dòng, đã thu và còn phải thu tính đúng từ bảng kê', () => {
      taoTrang();

      // Hai dòng: 200.000 + 100.000 = 300.000.
      expect(noiBo()['lineTotal']()).toBe(300000);
      expect(noiBo()['lineCount']()).toBe(2);
      // Chỉ giao dịch CONFIRMED (gd-1: 100.000) tính vào "Đã thu"; gd-2 đã hủy (CANCELLED).
      expect(noiBo()['confirmedAmount']()).toBe(100000);
      expect(noiBo()['outstanding']()).toBe(230000);
    });

    it('bảng kê rỗng thì các thẻ về 0', () => {
      api.getDossierFees.and.returnValue(of(bangKe({ items: [], transactions: [], outstanding: 0, subtotal: 0, total: 0, vatAmount: 0 })));
      taoTrang();

      expect(noiBo()['lineTotal']()).toBe(0);
      expect(noiBo()['lineCount']()).toBe(0);
      expect(noiBo()['confirmedAmount']()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Lọc theo loại phí (tính ở web, không gọi API)', () => {
    it('feeTypeOptions gồm "Tất cả" đứng đầu rồi tới từng mã quy tắc', () => {
      taoTrang();

      const options = noiBo()['feeTypeOptions']() as Array<{ value: string; label: string }>;
      expect(options[0].value).toBe('ALL');
      expect(options.map((o) => o.value)).toEqual(['ALL', 'PHI_HT', 'PHI_BAI']);
    });

    it('chọn một mã phí thì filteredItems chỉ còn dòng đúng mã đó', () => {
      taoTrang();

      noiBo()['chooseFeeType']('PHI_BAI');
      const rows = noiBo()['filteredItems']() as Array<{ ruleCode: string }>;
      expect(rows.length).toBe(1);
      expect(rows[0].ruleCode).toBe('PHI_BAI');
    });

    it('chọn "Tất cả" (hoặc chuỗi rỗng) thì hiện lại toàn bộ dòng', () => {
      taoTrang();

      noiBo()['chooseFeeType']('PHI_HT');
      expect(noiBo()['filteredItems']().length).toBe(1);

      noiBo()['chooseFeeType']('');
      expect(noiBo()['filteredItems']().length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Giao diện header và bộ lọc', () => {
    it('không có nút Xuất báo cáo trên header', () => {
      taoTrang();
      const headerActions = (fixture.nativeElement as HTMLElement).querySelector('.head__actions');
      const buttons = Array.from(headerActions?.querySelectorAll('button') || []);
      const exportBtn = buttons.find((b) => b.textContent?.includes('Xuất báo cáo'));
      expect(exportBtn).toBeUndefined();
    });

    it('bộ lọc Loại phí có nhãn Loại phí và giá trị mặc định là Tất cả', () => {
      taoTrang();
      const filterWrap = (fixture.nativeElement as HTMLElement).querySelector('.filter-wrap');
      expect(filterWrap).not.toBeNull();
      expect(filterWrap?.textContent).toContain('Loại phí');
      expect(noiBo()['feeTypeFilter']()).toBe('ALL');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chứng từ đính kèm giao dịch thanh toán', () => {
    it('giao dịch có attachmentId thì hiển thị nút tải và tải tệp về máy khi bấm', () => {
      api.getDossierFees.and.returnValue(
        of(
          bangKe({
            transactions: [
              { id: 'gd-1', amount: 100000, method: 'TRANSFER', referenceCode: 'FT01', status: 'CONFIRMED', attachmentId: 'att-1' },
            ],
          }),
        ),
      );
      taoTrang();

      const anchorGia = { href: '', download: '', click: jasmine.createSpy('click') } as unknown as HTMLAnchorElement;
      spyOn(document, 'createElement').and.returnValue(anchorGia);
      spyOn(URL, 'createObjectURL').and.returnValue('blob:gia-lap-att');
      spyOn(URL, 'revokeObjectURL');

      const btn = (fixture.nativeElement as HTMLElement).querySelector('.doc-btn') as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      btn?.click();

      expect(api.getFileMetadata).toHaveBeenCalledWith('att-1');
      expect(api.downloadFile).toHaveBeenCalledWith('att-1');
      expect(anchorGia.download).toBe('bien-lai.png');
      expect(anchorGia.click).toHaveBeenCalled();
    });
  });
});
