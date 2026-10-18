import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DossierDetail } from '../../../core/models/declaration.model';
import { WorkflowDossierView } from '../../../core/models/workflow.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { WorkflowProcessPageComponent } from './workflow-process-page.component';

/**
 * UI-07 Màn hình xử lý nghiệp vụ liên ngành (Batch C).
 *
 * Điểm bắt buộc:
 *   - CR36: đúng 3 quyết định (Xác nhận hoàn thành / Yêu cầu sửa đổi, bổ sung / Từ chối); web chỉ
 *     hiện các quyết định API trả trong `availableDecisions`.
 *   - CR37: **ghi chú bắt buộc** khi bổ sung/từ chối; **mã lý do KHÔNG bắt buộc** — chặn ngay ở web.
 *   - Lỗi 409 (sai thứ tự bước) phải hiện rõ, không bị nuốt.
 *   - CR35: KHÔNG còn khối upload ảnh hiện trường; CR25/CR37: KHÔNG còn "Trao đổi, ghi chú".
 */

function hoSoTruyCap(permissions: string[] = ['workflow.view', 'workflow.update', 'workflow.approve']): AccessProfile {
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
    roles: [{ code: 'HQ', name: 'Hải quan', dataScope: 'ASSIGNMENT' }],
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
    enterprise: { taxCode: '5501234567', name: 'Cty CP Nông sản Tây Bắc' },
    vehicle: { plateNumber: '26C-123.45', containerNumber: 'TCLU8765432' },
    vehicles: [{ plateNumber: '26C-123.45', containerNumber: 'TCLU8765432' }],
    driver: { fullName: 'Nguyễn Văn Hùng', idNumber: '012345678901', phone: '0912345678' },
    cargoSummary: 'Ngô hạt',
    checkpoint: 'A1',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T02:00:00.000Z',
    submittedAt: '2026-07-22T01:00:00.000Z',
    cargoItems: [{ id: 'c1', description: 'Ngô hạt', grossWeightKg: 12000 }],
    appointment: null,
    attachments: [],
    ...mau,
  };
}

function manHinh(mau: Partial<WorkflowDossierView> = {}): WorkflowDossierView {
  return {
    dossier: hoSo(),
    instance: {
      id: 'wf-1',
      currentStepCode: 'HQ_TIEP_NHAN',
      // CR44 — chỉ bước Hải quan đang mở (cụm 1 bước ở fixture này).
      activeStepCodes: ['HQ_TIEP_NHAN'],
      activeStage: 'INSPECTION',
      status: 'IN_PROGRESS',
      totalElapsedSeconds: 5400,
      steps: [
        {
          code: 'BP_TIEP_NHAN',
          name: 'Biên phòng tiếp nhận',
          agencyCode: 'BP',
          agencyName: 'Biên phòng',
          order: 1,
          status: 'COMPLETED',
          enteredAt: '2026-07-22T00:10:00.000Z',
          completedAt: '2026-07-22T00:40:00.000Z',
          elapsedSeconds: 1800,
          actorName: 'Trần Thị Lan',
          decision: 'APPROVE',
        },
        {
          code: 'HQ_TIEP_NHAN',
          name: 'Hải quan tiếp nhận',
          agencyCode: 'HQ',
          agencyName: 'Hải quan',
          order: 2,
          status: 'IN_PROGRESS',
          enteredAt: '2026-07-22T00:40:00.000Z',
          elapsedSeconds: 3600,
        },
        {
          code: 'KD_KIEM_DICH',
          name: 'Kiểm dịch thực vật',
          agencyCode: 'KD',
          agencyName: 'Kiểm dịch',
          order: 3,
          status: 'PENDING',
        },
      ],
    },
    checklist: [
      { code: 'BP1', label: 'Tiếp nhận hồ sơ', agencyCode: 'BP', required: true, checked: true, note: 'Giấy tờ đầy đủ' },
      { code: 'HQ1', label: 'Tiếp nhận hồ sơ', agencyCode: 'HQ', required: true, checked: true },
      { code: 'HQ2', label: 'Kiểm tra trị giá & thuế', agencyCode: 'HQ', required: true, checked: false },
      { code: 'KD1', label: 'Kiểm tra chứng thư', agencyCode: 'KD', required: false, checked: false },
    ],
    availableDecisions: ['APPROVE', 'REQUEST_SUPPLEMENT', 'REJECT'],
    ...mau,
  };
}

describe('WorkflowProcessPageComponent — xử lý nghiệp vụ liên ngành', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<WorkflowProcessPageComponent>;
  let component: WorkflowProcessPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  /** Có toast đúng tông chứa nội dung không (feedback/actionError nay đi qua toast góc màn hình). */
  function coToast(tone: string, text: string): boolean {
    return TestBed.inject(AppMessageService).messages().some((m) => m.tone === tone && m.text.includes(text));
  }

  function taoTrang(id = 'hs-1'): void {
    TestBed.configureTestingModule({
      imports: [WorkflowProcessPageComponent],
      providers: [
        provideRouter([
          { path: 'workflow/queue', children: [] },
          { path: 'declarations/:id', children: [] },
        ]),
        { provide: ApiService, useValue: api },
      ],
    });

    fixture = TestBed.createComponent(WorkflowProcessPageComponent);
    component = fixture.componentInstance;
    component.id = id;
    fixture.detectChanges();
  }

  function nhanQuyetDinh(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.decision__body strong')).map(
      (node) => (node as HTMLElement).textContent?.trim() || '',
    );
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement.textContent as string) || '';
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getWorkflowDossier',
      'decideWorkflowDossier',
      'getReasonCodes',
      'getAccessProfile',
    ]);
    api.getWorkflowDossier.and.returnValue(of(manHinh()));
    api.decideWorkflowDossier.and.returnValue(of({ instance: manHinh().instance }));
    api.getReasonCodes.and.returnValue(
      of([
        { code: 'BS01', name: 'Thiếu chứng từ xuất xứ', scope: 'SUPPLEMENT', active: true },
        { code: 'BS02', name: 'Sai thông tin phương tiện', scope: 'SUPPLEMENT', active: true },
        { code: 'BS09', name: 'Mã đã ngừng sử dụng', scope: 'SUPPLEMENT', active: false },
      ]),
    );
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Trạng thái tải và lỗi', () => {
    it('đang tải thì hiện thông báo, chưa dựng nội dung', () => {
      api.getWorkflowDossier.and.returnValue(NEVER);
      taoTrang();

      expect(noiDungTrang()).toContain('Đang tải hồ sơ xử lý...');
    });

    it('API lỗi thì báo lỗi và không dựng màn xử lý', () => {
      api.getWorkflowDossier.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      expect(noiBo()['error']()).toBe('Không tải được hồ sơ xử lý. Vui lòng thử lại.');
      expect(noiBo()['view']()).toBeNull();
    });

    it('không có id thì báo lỗi thay vì gọi API', () => {
      taoTrang('');

      expect(api.getWorkflowDossier).not.toHaveBeenCalled();
      expect(noiBo()['error']()).toBe('Không xác định được hồ sơ cần xử lý.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ba cột nghiệp vụ Biên phòng / Hải quan / Kiểm dịch', () => {
    it('dựng đúng 3 cột theo thứ tự bước của quy trình', () => {
      taoTrang();

      expect(noiBo()['columns']().map((column: { agencyCode: string }) => column.agencyCode)).toEqual(['BP', 'HQ', 'KD']);
      expect(noiDungTrang()).toContain('Biên phòng');
      expect(noiDungTrang()).toContain('Hải quan');
      expect(noiDungTrang()).toContain('Kiểm dịch');
    });

    it('chỉ cột của bước đang mở mới có quyền xử lý, các cột khác chỉ để đối chiếu', () => {
      taoTrang();
      const cot = noiBo()['columns']();

      expect(noiBo()['isEditable'](cot[0])).toBe(false);
      expect(noiBo()['isEditable'](cot[1])).toBe(true);
      expect(noiBo()['isEditable'](cot[2])).toBe(false);
      // Không còn các ô checkbox xác nhận thông tin giấy tờ trong cột
      expect(fixture.nativeElement.querySelectorAll('.columns input[type="checkbox"]').length).toBe(0);
    });

    it('thiếu quyền tác nghiệp thì không cột nào sửa được và không hiện panel quyết định', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: hoSoTruyCap(['workflow.view']) }));
      taoTrang();

      expect(noiBo()['canWork']()).toBe(false);
      expect(fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length).toBe(0);
      expect(noiDungTrang()).not.toContain('Quyết định xử lý');
    });

    it('availableDecisions rỗng thì không thể thao tác quyết định', () => {
      api.getWorkflowDossier.and.returnValue(of(manHinh({ availableDecisions: [] })));
      taoTrang();

      expect(noiBo()['decisionOptions']().length).toBe(0);
      expect(noiBo()['columns']().every((cot: unknown) => noiBo()['isEditable'](cot) === false)).toBe(true);
      expect(fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Quyết định khả dụng do API quyết định (CR36 — 3 lựa chọn)', () => {
    it('hiện đủ 3 lựa chọn với nhãn CR36', () => {
      taoTrang();

      expect(noiBo()['decisionOptions']()).toEqual(['APPROVE', 'REQUEST_SUPPLEMENT', 'REJECT']);
      expect(nhanQuyetDinh()).toEqual(['Xác nhận hoàn thành', 'Yêu cầu sửa đổi, bổ sung', 'Từ chối']);
    });

    it('chỉ hiện đúng các quyết định có trong availableDecisions', () => {
      api.getWorkflowDossier.and.returnValue(of(manHinh({ availableDecisions: ['APPROVE', 'REQUEST_SUPPLEMENT'] })));
      taoTrang();

      expect(nhanQuyetDinh()).toEqual(['Xác nhận hoàn thành', 'Yêu cầu sửa đổi, bổ sung']);
      expect(noiDungTrang()).not.toContain('Từ chối');
    });

    it('availableDecisions rỗng thì không vẽ radio nào', () => {
      api.getWorkflowDossier.and.returnValue(of(manHinh({ availableDecisions: [] })));
      taoTrang();

      expect(nhanQuyetDinh()).toEqual([]);
      expect(fixture.nativeElement.querySelectorAll('input[type="radio"]').length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tự chọn khi chỉ còn một quyết định', () => {
    it('chỉ có một quyết định khả dụng thì chọn sẵn, không cần bấm', () => {
      api.getWorkflowDossier.and.returnValue(of(manHinh({ availableDecisions: ['APPROVE'] })));
      taoTrang();

      expect(noiBo()['decision']()).toBe('APPROVE');
    });

    it('nhiều quyết định thì không tự chọn, để người dùng tự quyết và disable nút xóa lựa chọn', () => {
      taoTrang();

      expect(noiBo()['decision']()).toBe('');
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      const nutXoa = buttons.find((b) => b.textContent?.includes('Xóa lựa chọn'));
      expect(nutXoa?.disabled).toBe(true);
    });

    it('bấm chọn quyết định thì enable nút xóa lựa chọn', () => {
      taoTrang();
      noiBo()['chooseDecision']('APPROVE');
      fixture.detectChanges();

      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      const nutXoa = buttons.find((b) => b.textContent?.includes('Xóa lựa chọn'));
      expect(nutXoa?.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('CR37 — Ghi chú bắt buộc, mã lý do tùy chọn', () => {
    it('yêu cầu bổ sung mà chưa nhập ghi chú thì chặn gửi ngay tại web', () => {
      taoTrang();
      noiBo()['chooseDecision']('REQUEST_SUPPLEMENT');

      noiBo()['openConfirm']();
      fixture.detectChanges();

      expect(noiBo()['confirmOpen']()).toBe(false);
      expect(api.decideWorkflowDossier).not.toHaveBeenCalled();
      expect(noiBo()['reasonNoteError']()).toBe(
        'Vui lòng nhập ghi chú — bắt buộc khi yêu cầu sửa đổi, bổ sung hoặc từ chối.',
      );
    });

    it('từ chối mà chưa nhập ghi chú cũng bị chặn', () => {
      taoTrang();
      noiBo()['chooseDecision']('REJECT');

      noiBo()['openConfirm']();

      expect(noiBo()['confirmOpen']()).toBe(false);
      expect(api.decideWorkflowDossier).not.toHaveBeenCalled();
      expect(noiBo()['reasonNoteError']()).toContain('bắt buộc');
    });

    it('nhập ghi chú thì mở modal và gửi được KHÔNG cần mã lý do', () => {
      taoTrang();
      noiBo()['chooseDecision']('REQUEST_SUPPLEMENT');
      noiBo()['reasonNote'] = 'Bổ sung C/O bản gốc';

      noiBo()['openConfirm']();
      fixture.detectChanges();

      expect(noiBo()['reasonNoteError']()).toBe('');
      expect(noiBo()['confirmOpen']()).toBe(true);

      noiBo()['submitDecision']();

      expect(api.decideWorkflowDossier.calls.mostRecent().args[1]).toEqual(
        jasmine.objectContaining({ decision: 'REQUEST_SUPPLEMENT', reasonNote: 'Bổ sung C/O bản gốc', reasonCode: undefined }),
      );
    });

    it('mã lý do tùy chọn vẫn gửi kèm khi có chọn', () => {
      taoTrang();
      noiBo()['chooseDecision']('REQUEST_SUPPLEMENT');
      noiBo()['chooseReason']('BS01');
      noiBo()['reasonNote'] = 'Bổ sung C/O bản gốc';

      noiBo()['openConfirm']();
      noiBo()['submitDecision']();

      expect(api.decideWorkflowDossier.calls.mostRecent().args[1]).toEqual(
        jasmine.objectContaining({ reasonCode: 'BS01', reasonNote: 'Bổ sung C/O bản gốc' }),
      );
    });

    it('duyệt (xác nhận hoàn thành) thì không đòi ghi chú hay mã lý do và mở modal trực tiếp', () => {
      taoTrang();
      noiBo()['chooseDecision']('APPROVE');

      noiBo()['openConfirm']();

      expect(noiBo()['needsReasonNote']()).toBe(false);
      expect(noiBo()['showReasonCode']()).toBe(false);
      expect(noiBo()['confirmOpen']()).toBe(true);
      expect(api.getReasonCodes).not.toHaveBeenCalled();
    });

    it('chưa chọn quyết định thì báo lỗi và không mở modal', () => {
      taoTrang();

      noiBo()['openConfirm']();

      expect(noiBo()['confirmOpen']()).toBe(false);
      expect(coToast('error', 'Vui lòng chọn một quyết định xử lý trước khi gửi.')).toBe(true);
    });

    it('danh mục mã lý do lấy từ API theo đúng nhóm, không hard-code, và bỏ mã đã khóa', () => {
      taoTrang();

      noiBo()['chooseDecision']('REQUEST_SUPPLEMENT');
      expect(api.getReasonCodes).toHaveBeenCalledWith('SUPPLEMENT');
      expect(noiBo()['showReasonCode']()).toBe(true);
      expect(noiBo()['reasonOptions']().map((option: { value: string }) => option.value)).toEqual(['BS01', 'BS02']);

      noiBo()['chooseDecision']('REJECT');
      expect(api.getReasonCodes).toHaveBeenCalledWith('REJECT');
      expect(noiBo()['reasonCode']()).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Gửi quyết định và xử lý lỗi API', () => {
    it('gửi thành công thì báo kết quả, đóng modal và tải lại hồ sơ', () => {
      taoTrang();
      const soLanTai = api.getWorkflowDossier.calls.count();
      noiBo()['chooseDecision']('APPROVE');
      noiBo()['openConfirm']();

      noiBo()['submitDecision']();

      expect(noiBo()['confirmOpen']()).toBe(false);
      expect(coToast('success', 'Đã ghi nhận quyết định "Xác nhận hoàn thành" cho hồ sơ HS-250519-0015.')).toBe(true);
      expect(noiBo()['decision']()).toBe('');
      expect(api.getWorkflowDossier.calls.count()).toBe(soLanTai + 1);
    });

    it('API trả 409 sai thứ tự bước thì hiện nguyên thông báo của API, không nuốt lỗi', () => {
      api.decideWorkflowDossier.and.returnValue(
        throwError(() => ({ status: 409, error: { message: 'Hồ sơ chưa hoàn thành bước Biên phòng nên Hải quan chưa được xác nhận.' } })),
      );
      taoTrang();
      noiBo()['chooseDecision']('APPROVE');
      noiBo()['submitDecision']();
      fixture.detectChanges();

      expect(noiBo()['confirmOpen']()).toBe(false);
      expect(coToast('error', 'Hồ sơ chưa hoàn thành bước Biên phòng nên Hải quan chưa được xác nhận.')).toBe(true);
    });

    it('API trả 409 không kèm thông báo thì vẫn giải thích rõ là sai thứ tự bước', () => {
      api.decideWorkflowDossier.and.returnValue(throwError(() => ({ status: 409 })));
      taoTrang();
      noiBo()['chooseDecision']('APPROVE');
      noiBo()['submitDecision']();

      expect(coToast('error', 'thao tác sai thứ tự bước')).toBe(true);
    });

    it('API trả 400 mã lý do (messageKey) vẫn gắn đúng ô mã lý do, không dò chuỗi', () => {
      api.decideWorkflowDossier.and.returnValue(
        throwError(() => ({
          status: 400,
          error: { message: 'The "Reject" action requires a reason code.', messageKey: 'workflow.reasonCodeInvalid' },
        })),
      );
      taoTrang();
      noiBo()['chooseDecision']('REJECT');
      noiBo()['reasonNote'] = 'Từ chối do sai lệch';
      noiBo()['chooseReason']('TC01');
      noiBo()['submitDecision']();

      expect(noiBo()['reasonFieldError']()).toBe('The "Reject" action requires a reason code.');
    });

    it('lỗi khác thì vẫn báo cho người dùng thay vì im lặng', () => {
      api.decideWorkflowDossier.and.returnValue(throwError(() => ({ status: 500 })));
      taoTrang();
      noiBo()['chooseDecision']('APPROVE');
      noiBo()['submitDecision']();

      expect(coToast('error', 'Không gửi được quyết định xử lý. Vui lòng thử lại.')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('CR35/CR37 — không còn ảnh hiện trường và trao đổi ghi chú', () => {
    it('không hiện khối upload ảnh hiện trường', () => {
      taoTrang();
      expect(noiDungTrang()).not.toContain('Ảnh hiện trường');
      expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    });

    it('không hiện card "Trao đổi, ghi chú"', () => {
      taoTrang();
      expect(noiDungTrang()).not.toContain('Trao đổi, ghi chú');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Thông tin hồ sơ và tiến trình', () => {
    it('hiện thông tin hồ sơ, bước hiện tại và tổng thời gian đã xử lý', () => {
      taoTrang();

      expect(noiDungTrang()).toContain('HS-250519-0015');
      expect(noiDungTrang()).toContain('Cty CP Nông sản Tây Bắc');
      expect(noiDungTrang()).toContain('26C-123.45');
      expect(noiBo()['currentStep']().code).toBe('HQ_TIEP_NHAN');
      expect(noiDungTrang()).toContain('1 giờ 30 phút');
    });

    it('mỗi bước hiển thị thời gian đã trôi qua, không có hạn chót SLA', () => {
      taoTrang();

      expect(noiDungTrang()).toContain('Đã trôi qua 30 phút');
      expect(noiDungTrang()).not.toContain('SLA còn lại');
      expect(noiBo()['stepElapsed']({ code: 'KD_KIEM_DICH', enteredAt: null } as never)).toBe('Chưa vào bước');
    });
  });

  // ---------------------------------------------------------------------------
  // CR44/CR2 — cụm nghiệp vụ song song 2–3 bước, mã lực lượng ASCII đúng của BE.
  // ---------------------------------------------------------------------------
  describe('CR44/CR2 — cụm nghiệp vụ song song', () => {
    /** Hồ sơ truy cập của một lực lượng cụ thể (mã ASCII khớp agencyCode BE). */
    function vaiLucLuong(roleCode: string): AccessProfile {
      const base = hoSoTruyCap();
      return { ...base, roles: [{ code: roleCode, name: roleCode, dataScope: 'ALL' }] };
    }

    /** Cụm 3 bước Biên phòng/Kiểm dịch/Hải quan mở song song sau cổng vào; `epidemic` bật cờ dịch tễ. */
    function cum(epidemic = false, mau: Partial<WorkflowDossierView['instance']> = {}): WorkflowDossierView {
      return manHinh({
        dossier: hoSo({ epidemicFlag: epidemic }),
        instance: {
          id: 'wf-cum',
          currentStepCode: 'IMPORT_BORDER',
          activeStepCodes: ['IMPORT_BORDER', 'IMPORT_QUARANTINE', 'IMPORT_CUSTOMS'],
          activeStage: 'INSPECTION',
          status: 'IN_PROGRESS',
          totalElapsedSeconds: 600,
          steps: [
            { code: 'IMPORT_B1_ENTRY', name: 'Biên phòng xác nhận xe vào', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 1, status: 'COMPLETED', gate: 'ENTRY' },
            { code: 'IMPORT_BORDER', name: 'Biên phòng kiểm tra nghiệp vụ', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 2, status: 'IN_PROGRESS' },
            { code: 'IMPORT_QUARANTINE', name: 'Kiểm dịch nghiệp vụ', agencyCode: 'QUARANTINE', agencyName: 'Kiểm dịch', order: 3, status: 'IN_PROGRESS' },
            { code: 'IMPORT_CUSTOMS', name: 'Hải quan kiểm tra nghiệp vụ', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', order: 4, status: 'IN_PROGRESS' },
            { code: 'IMPORT_FEE', name: 'Thu phí', agencyCode: 'FEE_COLLECTOR', agencyName: 'Cơ quan thu phí', order: 5, status: 'PENDING' },
          ],
          ...mau,
        },
        checklist: [
          { code: 'BP1', label: 'Giấy tờ tùy thân', agencyCode: 'BORDER_GUARD', required: true, checked: false },
          { code: 'KD1', label: 'Giấy chứng nhận kiểm dịch', agencyCode: 'QUARANTINE', required: true, checked: false },
          { code: 'HQ1', label: 'Tờ khai hải quan', agencyCode: 'CUSTOMS', required: true, checked: false },
        ],
        availableDecisions: ['APPROVE', 'REQUEST_SUPPLEMENT', 'REJECT'],
      });
    }

    function dungVai(roleCode: string, view: WorkflowDossierView): void {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: vaiLucLuong(roleCode) }));
      api.getWorkflowDossier.and.returnValue(of(view));
      taoTrang();
    }

    it('myOpenStep là bước ĐANG MỞ của chính lực lượng người dùng, không phải bước đại diện', () => {
      // Bước đại diện (currentStepCode) là IMPORT_BORDER (của Biên phòng); người dùng là Hải quan.
      dungVai('CUSTOMS', cum());

      expect(noiBo()['myOpenStep']().code).toBe('IMPORT_CUSTOMS');
      expect(noiBo()['targetStepCode']()).toBe('IMPORT_CUSTOMS');
    });

    it('isActiveStep tô sáng cả ba bước mở của cụm, không tô bước cổng đã xong / bước phí còn chờ', () => {
      dungVai('CUSTOMS', cum());

      expect(noiBo()['isActiveStep']('IMPORT_BORDER')).toBe(true);
      expect(noiBo()['isActiveStep']('IMPORT_QUARANTINE')).toBe(true);
      expect(noiBo()['isActiveStep']('IMPORT_CUSTOMS')).toBe(true);
      expect(noiBo()['isActiveStep']('IMPORT_B1_ENTRY')).toBe(false);
      expect(noiBo()['isActiveStep']('IMPORT_FEE')).toBe(false);
    });

    it('lực lượng khác đang chờ bổ sung KHÔNG chặn thao tác của mình', () => {
      // Biên phòng chờ bổ sung; người dùng Hải quan vẫn có bước mở và cột sửa được.
      const view = cum(false, {
        steps: [
          { code: 'IMPORT_B1_ENTRY', name: 'Biên phòng xác nhận xe vào', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 1, status: 'COMPLETED', gate: 'ENTRY' },
          { code: 'IMPORT_BORDER', name: 'Biên phòng kiểm tra nghiệp vụ', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 2, status: 'WAITING_SUPPLEMENT' },
          { code: 'IMPORT_QUARANTINE', name: 'Kiểm dịch nghiệp vụ', agencyCode: 'QUARANTINE', agencyName: 'Kiểm dịch', order: 3, status: 'IN_PROGRESS' },
          { code: 'IMPORT_CUSTOMS', name: 'Hải quan kiểm tra nghiệp vụ', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', order: 4, status: 'IN_PROGRESS' },
          { code: 'IMPORT_FEE', name: 'Thu phí', agencyCode: 'FEE_COLLECTOR', agencyName: 'Cơ quan thu phí', order: 5, status: 'PENDING' },
        ],
      });
      dungVai('CUSTOMS', view);

      expect(noiBo()['myOpenStep']().code).toBe('IMPORT_CUSTOMS');
      const cotHQ = noiBo()['columns']().find((cot: { agencyCode: string }) => cot.agencyCode === 'CUSTOMS');
      expect(noiBo()['isEditable'](cotHQ)).toBe(true);
    });

    it('CR2 — cờ dịch tễ đưa Kiểm dịch lên trước trong danh sách hiển thị và gắn badge dịch tễ', () => {
      dungVai('CUSTOMS', cum(true));

      expect(noiBo()['displaySteps']().map((step: { code: string }) => step.code)).toEqual([
        'IMPORT_B1_ENTRY',
        'IMPORT_QUARANTINE',
        'IMPORT_BORDER',
        'IMPORT_CUSTOMS',
        'IMPORT_FEE',
      ]);
      const buocKD = noiBo()['displaySteps']().find((step: { code: string }) => step.code === 'IMPORT_QUARANTINE');
      const buocBP = noiBo()['displaySteps']().find((step: { code: string }) => step.code === 'IMPORT_BORDER');
      expect(noiBo()['showsEpidemicBadge'](buocKD)).toBe(true);
      expect(noiBo()['showsEpidemicBadge'](buocBP)).toBe(false);
    });

    it('không có cờ dịch tễ thì giữ nguyên thứ tự và không gắn badge', () => {
      dungVai('CUSTOMS', cum(false));

      expect(noiBo()['displaySteps']().map((step: { code: string }) => step.code)).toEqual([
        'IMPORT_B1_ENTRY',
        'IMPORT_BORDER',
        'IMPORT_QUARANTINE',
        'IMPORT_CUSTOMS',
        'IMPORT_FEE',
      ]);
      const buocKD = noiBo()['displaySteps']().find((step: { code: string }) => step.code === 'IMPORT_QUARANTINE');
      expect(noiBo()['showsEpidemicBadge'](buocKD)).toBe(false);
    });

    it('thẻ Biên phòng ở phần Xử lý liên ngành hiển thị bước kiểm tra nghiệp vụ (IN_PROGRESS) sau khi xác nhận vào cổng', () => {
      dungVai('BORDER_GUARD', cum(false));

      const cotBP = noiBo()['columns']().find((cot: { agencyCode: string }) => cot.agencyCode === 'BORDER_GUARD');
      expect(cotBP.step.code).toBe('IMPORT_BORDER');
      expect(cotBP.step.status).toBe('IN_PROGRESS');
    });

    it('tài khoản Admin (SYS_ADMIN) có thể thao tác xử lý trên cả 3 thẻ theo thứ tự tùy ý', () => {
      dungVai('SYS_ADMIN', cum(false));

      const cols = noiBo()['columns']();
      expect(cols.length).toBe(3);
      expect(cols.every((c: unknown) => noiBo()['isEditable'](c) === true)).toBe(true);

      // Admin có thể chọn quyết định trên thẻ Hải quan trước
      noiBo()['chooseCardDecision']('IMPORT_CUSTOMS', 'APPROVE');
      expect(noiBo()['cardDecision']('IMPORT_CUSTOMS')).toBe('APPROVE');
      // Thẻ Kiểm dịch chưa chọn vẫn có giá trị rỗng độc lập
      expect(noiBo()['cardDecision']('IMPORT_QUARANTINE')).toBe('');

      // Sau đó Admin chọn thẻ Kiểm dịch
      noiBo()['chooseCardDecision']('IMPORT_QUARANTINE', 'REQUEST_SUPPLEMENT');
      noiBo()['setCardReasonNote']('IMPORT_QUARANTINE', 'Bổ sung kết quả mẫu kiểm');
      expect(noiBo()['cardDecision']('IMPORT_QUARANTINE')).toBe('REQUEST_SUPPLEMENT');
      expect(noiBo()['cardReasonNote']('IMPORT_QUARANTINE')).toBe('Bổ sung kết quả mẫu kiểm');
      expect(noiBo()['cardDecision']('IMPORT_CUSTOMS')).toBe('APPROVE');
    });

    it('sau khi cả 3 thẻ nghiệp vụ hoàn tất xử lý thì hiển thị thông báo "Hồ sơ đã hoàn tất xử lý liên ngành."', () => {
      // 2 bước Biên phòng và Kiểm dịch đã COMPLETED, bước Hải quan đang xử lý
      const view = cum(false, {
        steps: [
          { code: 'IMPORT_B1_ENTRY', name: 'Biên phòng xác nhận xe vào', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 1, status: 'COMPLETED', gate: 'ENTRY' },
          { code: 'IMPORT_BORDER', name: 'Biên phòng kiểm tra nghiệp vụ', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', order: 2, status: 'COMPLETED' },
          { code: 'IMPORT_QUARANTINE', name: 'Kiểm dịch nghiệp vụ', agencyCode: 'QUARANTINE', agencyName: 'Kiểm dịch', order: 3, status: 'COMPLETED' },
          { code: 'IMPORT_CUSTOMS', name: 'Hải quan kiểm tra nghiệp vụ', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', order: 4, status: 'IN_PROGRESS' },
          { code: 'IMPORT_FEE', name: 'Thu phí', agencyCode: 'FEE_COLLECTOR', agencyName: 'Cơ quan thu phí', order: 5, status: 'PENDING' },
        ],
      });
      dungVai('CUSTOMS', view);

      const cotHQ = noiBo()['columns']().find((c: { agencyCode: string }) => c.agencyCode === 'CUSTOMS');
      noiBo()['chooseCardDecision']('IMPORT_CUSTOMS', 'APPROVE');
      noiBo()['openConfirmForCard'](cotHQ);
      noiBo()['submitDecision']();

      expect(coToast('success', 'Hồ sơ đã hoàn tất xử lý liên ngành.')).toBe(true);
    });
  });
});
