import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccessProfile } from '../auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../auth/session.storage';
import { ApiService } from '../services/api.service';
import { DeclarationListPageComponent } from '../../features/declarations/pages/declaration-list-page.component';
import { WorkflowQueuePageComponent } from '../../features/workflow/pages/workflow-queue-page.component';
import { YardMapPageComponent } from '../../features/yard/pages/yard-map-page.component';
import { GateControlPageComponent } from '../../features/gate/pages/gate-control-page.component';
import { I18nService, LOCALE_STORAGE_KEY } from './i18n.service';
import { VI_MESSAGES } from './locales/vi';

/**
 * ĐỔI NGÔN NGỮ PHẢI ĐỔI **THÂN MÀN HÌNH**, KHÔNG CHỈ TIÊU ĐỀ.
 *
 * Bộ test này chốt đúng điều mà bản dịch nửa vời hay vi phạm: tiêu đề đổi sang tiếng Anh
 * nhưng bảng, nút, trạng thái rỗng và nhãn danh mục (loại hồ sơ, trạng thái, mức ưu tiên…)
 * vẫn còn tiếng Việt. Vì vậy mỗi màn hình được kiểm ở **ba lớp**:
 *
 *   1. mặc định là tiếng Việt (NFR-20);
 *   2. đổi sang `en` thì **thân màn hình** đổi theo và **không còn** chuỗi tiếng Việt của
 *      chính phần thân đó;
 *   3. **không màn hình nào hiện khóa trần** kiểu `ui.dossier.…` ở bất kỳ ngôn ngữ nào.
 */

/** Bảng chữ cái tiếng Việt có dấu — dùng để phát hiện chữ Việt còn sót khi đang ở tiếng Anh. */
const CHU_VIET_CO_DAU =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂÂĐÈÉÊÌÍÒÓÔƠÙÚƯÝ]/;

/** Mọi tiền tố khóa `ui.*` đang có trong từ điển — không tiền tố nào được lọt ra màn hình. */
const TIEN_TO_KHOA = [...new Set(Object.keys(VI_MESSAGES).filter((key) => key.startsWith('ui.')).map((key) => key.split('.')[1]))];

function hoSoTruyCap(permissions: string[]): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'canbo',
      displayName: 'Lê Văn Nam',
      title: 'Cán bộ',
      email: 'nam@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [],
    permissions,
    assignments: [],
    menu: [],
  };
}

function dangNhap(permissions: string[]): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: hoSoTruyCap(permissions) }));
}

function chuTrenMan(fixture: ComponentFixture<unknown>): string {
  return (fixture.nativeElement as HTMLElement).textContent || '';
}

/** Không có khóa trần nào lọt ra màn hình, dù ở ngôn ngữ nào. */
function khongLoKhoaTran(fixture: ComponentFixture<unknown>): void {
  const chu = chuTrenMan(fixture);
  TIEN_TO_KHOA.forEach((tienTo) => expect(chu).not.toContain(`ui.${tienTo}.`));
}

describe('Đa ngữ — thân các màn hình lớn đổi theo ngôn ngữ', () => {
  let api: jasmine.SpyObj<ApiService>;
  let i18n: I18nService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getDeclarations',
      'getWorkflowQueue',
      'getYards',
      'getYard',
      'getGateEvents',
      'lookupGateDossier',
      'getAccessProfile',
      'getDossierTypes',
      'getCheckpoints',
    ]);
    api.getDossierTypes.and.returnValue(of([]));
    api.getCheckpoints.and.returnValue(of([]));
    api.getDeclarations.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 10 }));
    api.getWorkflowQueue.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 10 }));
    api.getYards.and.returnValue(of([]));
    // UI-09 nạp nhật ký qua cổng gần đây (2 kênh Vào/Ra) ngay khi mở màn hình.
    api.getGateEvents.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 10 }));
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function dungTrang<T>(component: Type<T>, queryParams: Record<string, string> = {}): ComponentFixture<T> {
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(queryParams)), snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });
    i18n = TestBed.inject(I18nService);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }

  // ---------------------------------------------------------------------------
  describe('UI-03 Danh sách hồ sơ — bộ lọc, tiêu đề cột và trạng thái rỗng', () => {
    let fixture: ComponentFixture<DeclarationListPageComponent>;

    beforeEach(() => {
      dangNhap(['dossier.view', 'dossier.create']);
      fixture = dungTrang(DeclarationListPageComponent);
    });

    it('mặc định tiếng Việt ở cả tiêu đề cột lẫn nhãn danh mục trong bộ lọc', () => {
      const chu = chuTrenMan(fixture);

      expect(chu).toContain('Doanh nghiệp'); // tiêu đề cột
      expect(chu).toContain('Nhập khẩu'); // nhãn loại hồ sơ trong ô lọc
      expect(chu).toContain('Cần bổ sung'); // nhãn trạng thái trong ô lọc
      expect(chu).toContain('Chưa có hồ sơ nào. Hãy tạo hồ sơ đầu tiên.'); // trạng thái rỗng
    });

    it('đổi sang tiếng Anh thì THÂN bảng và các ô lọc đổi theo, không còn chữ Việt', () => {
      i18n.setLocale('en');
      fixture.detectChanges();
      const chu = chuTrenMan(fixture);

      expect(chu).toContain('Enterprise');
      expect(chu).toContain('Import');
      expect(chu).toContain('Revision required');
      expect(chu).toContain('No dossier yet. Create the first one.');
      expect(chu).not.toContain('Doanh nghiệp');
      expect(chu).not.toContain('Nhập cảnh');
      expect(chu).not.toMatch(CHU_VIET_CO_DAU);
    });

    it('không hiện khóa trần ở cả hai ngôn ngữ', () => {
      khongLoKhoaTran(fixture);
      i18n.setLocale('en');
      fixture.detectChanges();
      khongLoKhoaTran(fixture);
    });
  });

  // ---------------------------------------------------------------------------
  describe('UI-06 Hàng đợi liên ngành — tab và cột (CR23–CR26)', () => {
    let fixture: ComponentFixture<WorkflowQueuePageComponent>;

    beforeEach(() => {
      dangNhap(['workflow.view', 'workflow.update']);
      fixture = dungTrang(WorkflowQueuePageComponent);
    });

    it('mặc định tiếng Việt ở tab và cột', () => {
      const chu = chuTrenMan(fixture);

      expect(chu).toContain('Cần xử lý');
      expect(chu).toContain('Trạng thái');
      expect(chu).toContain('Hàng đợi trống — hiện không có hồ sơ nào đến lượt đơn vị bạn.');
    });

    it('đổi sang tiếng Anh thì tab, cột và trạng thái rỗng đổi theo', () => {
      i18n.setLocale('en');
      fixture.detectChanges();
      const chu = chuTrenMan(fixture);

      expect(chu).toContain('To process');
      expect(chu).toContain('Status');
      expect(chu).toContain('The queue is empty');
      expect(chu).not.toContain('Cần xử lý');
      expect(chu).not.toMatch(CHU_VIET_CO_DAU);
    });

    it('không hiện khóa trần ở cả hai ngôn ngữ', () => {
      khongLoKhoaTran(fixture);
      i18n.setLocale('en');
      fixture.detectChanges();
      khongLoKhoaTran(fixture);
    });
  });

  // ---------------------------------------------------------------------------
  describe('UI-10 Kho bãi — thẻ chỉ số và trạng thái rỗng', () => {
    let fixture: ComponentFixture<YardMapPageComponent>;

    beforeEach(() => {
      dangNhap(['yard.view', 'yard.update']);
      fixture = dungTrang(YardMapPageComponent);
    });

    it('mặc định tiếng Việt ở thẻ chỉ số và danh sách bãi rỗng', () => {
      const chu = chuTrenMan(fixture);

      expect(chu).toContain('Tổng số vị trí');
      expect(chu).toContain('Đang sử dụng');
      expect(chu).toContain('Chưa có bãi nào trong danh mục.');
    });

    it('đổi sang tiếng Anh thì thẻ chỉ số và trạng thái rỗng đổi theo', () => {
      i18n.setLocale('en');
      fixture.detectChanges();
      const chu = chuTrenMan(fixture);

      expect(chu).toContain('Total slots');
      expect(chu).toContain('In use');
      expect(chu).toContain('There is no yard in the catalogue yet.');
      expect(chu).not.toContain('Tổng số vị trí');
      expect(chu).not.toMatch(CHU_VIET_CO_DAU);
    });

    it('không hiện khóa trần ở cả hai ngôn ngữ', () => {
      khongLoKhoaTran(fixture);
      i18n.setLocale('en');
      fixture.detectChanges();
      khongLoKhoaTran(fixture);
    });
  });

  // ---------------------------------------------------------------------------
  describe('UI-09 Kiểm soát cổng — ô tra cứu và gợi ý nhập liệu', () => {
    let fixture: ComponentFixture<GateControlPageComponent>;

    beforeEach(() => {
      dangNhap(['gate.view', 'gate.update']);
      fixture = dungTrang(GateControlPageComponent);
    });

    it('mặc định tiếng Việt ở gợi ý, nút và khu vực quét', () => {
      const chu = chuTrenMan(fixture);

      expect(chu).toContain('Tra cứu');
      expect(chu).toContain('Đưa mã QR trên phiếu vào khung hình');
      // BUG-083: mỗi làn có câu gợi ý riêng theo chiều VÀO / RA.
      expect(chu).toContain('Nhập mã hoặc quét QR để đối chiếu hồ sơ trước khi xác nhận xe VÀO cổng.');
      expect(chu).toContain('Nhập mã hoặc quét QR để đối chiếu hồ sơ trước khi xác nhận xe RA cổng.');
    });

    it('đổi sang tiếng Anh thì cả placeholder lẫn phần thân đổi theo', () => {
      i18n.setLocale('en');
      fixture.detectChanges();
      const chu = chuTrenMan(fixture);
      const oNhap = (fixture.nativeElement as HTMLElement).querySelector('input[name="dossierCode-in"]') as HTMLInputElement;

      expect(chu).toContain('Look up');
      expect(chu).toContain('Hold the QR code of the slip inside the frame');
      expect(chu).toContain('Enter the code or scan the QR to match the dossier before confirming vehicle ENTRY.');
      expect(chu).toContain('Enter the code or scan the QR to match the dossier before confirming vehicle EXIT.');
      expect(oNhap.placeholder).toBe('Enter or scan the dossier code...');
      expect(chu).not.toMatch(CHU_VIET_CO_DAU);
    });

    it('không hiện khóa trần ở cả hai ngôn ngữ', () => {
      khongLoKhoaTran(fixture);
      i18n.setLocale('en');
      fixture.detectChanges();
      khongLoKhoaTran(fixture);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Hàm nhãn của mô hình — dịch được, không chỉ tiếng Việt cứng', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      i18n = TestBed.inject(I18nService);
    });

    afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

    it('nhãn trạng thái / loại hồ sơ / quyết định đổi theo hàm dịch được truyền vào', async () => {
      const { dossierStatusLabel, dossierTypeLabel } = await import('../models/declaration.model');
      const { decisionLabel, formatElapsed } = await import('../models/workflow.model');

      // Không truyền hàm dịch ⇒ tiếng Việt (ngôn ngữ mặc định NFR-20).
      expect(dossierStatusLabel('NEED_SUPPLEMENT')).toBe('Cần bổ sung');
      expect(dossierTypeLabel('IMPORT')).toBe('Nhập khẩu');
      expect(decisionLabel('APPROVE')).toBe('Xác nhận hoàn thành');
      expect(formatElapsed(4530)).toBe('1 giờ 15 phút');

      i18n.setLocale('en');

      expect(dossierStatusLabel('NEED_SUPPLEMENT', i18n.t)).toBe('Revision required');
      expect(dossierTypeLabel('IMPORT', i18n.t)).toBe('Import');
      expect(decisionLabel('APPROVE', i18n.t)).toBe('Confirm completion');
      expect(formatElapsed(4530, i18n.t)).toBe('1 h 15 min');
    });

    it('mã lạ do BE thêm mới vẫn hiện nguyên mã, không rơi về khóa trần', async () => {
      const { dossierStatusLabel } = await import('../models/declaration.model');
      i18n.setLocale('en');

      expect(dossierStatusLabel('MA_LA', i18n.t)).toBe('MA_LA');
    });
  });
});
