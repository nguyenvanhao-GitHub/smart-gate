import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { FeeRuleVersion } from '../../../core/models/fees.model';
import { ApiService } from '../../../core/services/api.service';
import { FeeRuleAdminPageComponent } from './fee-rule-admin-page.component';

/**
 * F46 — Quản trị biểu phí (versioning).
 *
 * Khóa: nhóm bản theo mã và hiện đúng trạng thái ACTIVE/SCHEDULED/CLOSED, tải lỗi, modal thêm/sửa,
 * **chặn client khi mã/tên/số tiền sai (không gọi API)**, **khóa trường tiền khi sửa bản đã áp dụng**
 * và chỉ gửi metadata phi-tiền, còn bản chưa tới hiệu lực thì gửi đủ.
 * Tích hợp danh mục VEHICLE_TYPE cho đối tượng áp dụng loại phương tiện.
 */

const PAST = '2020-01-01';
const FUTURE = '2099-01-01';

function ban(mau: Partial<FeeRuleVersion> = {}): FeeRuleVersion {
  return {
    id: 'r-1',
    code: 'INFRA_GATE',
    name: 'Phí hạ tầng cửa khẩu',
    feeType: 'INFRASTRUCTURE',
    unit: 'TRIP',
    amount: 1_000_000,
    currency: 'VND',
    appliesTo: [],
    effectiveFrom: PAST,
    effectiveTo: null,
    active: true,
    sortOrder: 10,
    description: null,
    status: 'ACTIVE',
    ...mau,
  };
}

function hoSo(permissions: string[]): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'bql',
      displayName: 'Cán bộ BQL',
      title: 'BQL',
      email: 'bql@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'BQL', name: 'Ban quản lý', dataScope: 'ALL' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

describe('FeeRuleAdminPageComponent — quản trị biểu phí (F46)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<FeeRuleAdminPageComponent>;
  let component: FeeRuleAdminPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(quyen: string[] = ['fee.approve']): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: hoSo(quyen) }));
    TestBed.configureTestingModule({
      imports: [FeeRuleAdminPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(FeeRuleAdminPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getFeeRuleVersions',
      'createFeeRule',
      'updateFeeRule',
      'getDossierTypes',
      'getVehicleTypes',
    ]);
    api.getDossierTypes.and.returnValue(of([]));
    api.getVehicleTypes.and.returnValue(
      of([
        {
          id: 'v-1',
          typeCode: 'VEHICLE_TYPE',
          code: 'TRUCK',
          name: 'Xe tải',
          status: 'ACTIVE',
          sortOrder: 1,
          metadata: null,
          createdAt: PAST,
          updatedAt: PAST,
        },
        {
          id: 'v-2',
          typeCode: 'VEHICLE_TYPE',
          code: 'CONTAINER',
          name: 'Xe container',
          status: 'ACTIVE',
          sortOrder: 2,
          metadata: null,
          createdAt: PAST,
          updatedAt: PAST,
        },
      ]),
    );
    api.getFeeRuleVersions.and.returnValue(
      of([
        ban({ id: 'r-cu', effectiveFrom: '2019-01-01', effectiveTo: '2019-12-31', status: 'CLOSED' }),
        ban({ id: 'r-nay', effectiveFrom: PAST, effectiveTo: null, status: 'ACTIVE' }),
        ban({ id: 'r-sau', effectiveFrom: FUTURE, effectiveTo: null, status: 'SCHEDULED', amount: 1_500_000 }),
      ]),
    );
    api.createFeeRule.and.returnValue(of(ban({ id: 'r-moi' })));
    api.updateFeeRule.and.returnValue(of(ban()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('gộp các bản theo nhóm phí (feeType) và hiện đủ trạng thái, không hiện mã nhóm', () => {
    taoTrang();

    const groups = noiBo()['groups']();
    expect(groups.length).toBe(1);
    expect(groups[0].feeType).toBe('INFRASTRUCTURE');
    expect(groups[0].versions.length).toBe(3);

    // Không còn thẻ badge mã nhóm
    expect((fixture.nativeElement as HTMLElement).querySelector('.rule-group__badge')).toBeNull();

    // Cột đầu tiên là Tên khoản phí, không có cột Nhóm phí
    const ths = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('th')).map((el) =>
      el.textContent?.trim(),
    );
    expect(ths[0]).toBe('Tên khoản phí');
    expect(ths).not.toContain('Nhóm phí');

    const tones = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.status'),
    ).map((el) => (el as HTMLElement).getAttribute('data-tone'));
    // ACTIVE→done, SCHEDULED→waiting, CLOSED→idle đều xuất hiện.
    expect(tones).toContain('done');
    expect(tones).toContain('waiting');
    expect(tones).toContain('idle');
  });

  describe('Thẻ thống kê tính ở web từ danh sách bản đã tải', () => {
    it('tổng loại phí = tổng số bản; đang hiệu lực = số ACTIVE; đã đóng = số CLOSED (SCHEDULED không tính)', () => {
      taoTrang();

      // Mặc định 3 bản: 1 CLOSED + 1 ACTIVE + 1 SCHEDULED → 3 bản.
      expect(noiBo()['totalTypes']()).toBe(3);
      expect(noiBo()['activeCount']()).toBe(1);
      expect(noiBo()['closedCount']()).toBe(1);
    });

    it('nhiều mã: totalTypes đếm tổng số bản, active/closed đếm theo trạng thái bản', () => {
      api.getFeeRuleVersions.and.returnValue(
        of([
          ban({ id: 'a1', code: 'INFRA_GATE', feeType: 'INFRASTRUCTURE', status: 'ACTIVE' }),
          ban({ id: 'a2', code: 'PARKING', feeType: 'PARKING', status: 'ACTIVE', amount: 2_000_000 }),
          ban({ id: 'c1', code: 'INFRA_GATE', feeType: 'INFRASTRUCTURE', effectiveFrom: '2019-01-01', effectiveTo: '2019-12-31', status: 'CLOSED' }),
          ban({ id: 's1', code: 'STORAGE', feeType: 'SERVICE', effectiveFrom: FUTURE, status: 'SCHEDULED' }),
        ]),
      );
      taoTrang();

      expect(noiBo()['totalTypes']()).toBe(4); // 4 bản
      expect(noiBo()['activeCount']()).toBe(2);
      expect(noiBo()['closedCount']()).toBe(1);
    });

    it('mức phí trung bình = trung bình amount các bản ACTIVE (làm tròn)', () => {
      api.getFeeRuleVersions.and.returnValue(
        of([
          ban({ id: 'a1', code: 'INFRA_GATE', status: 'ACTIVE', amount: 1_000_000 }),
          ban({ id: 'a2', code: 'PARKING', status: 'ACTIVE', amount: 2_000_000 }),
          // Bản CLOSED và SCHEDULED không được đưa vào trung bình.
          ban({ id: 'c1', code: 'STORAGE', status: 'CLOSED', amount: 9_000_000 }),
        ]),
      );
      taoTrang();

      // (1.000.000 + 2.000.000) / 2 = 1.500.000 → có mặt trong nhãn tiền.
      expect(noiBo()['avgAmountLabel']()).toContain('1.500.000');
    });

    it('không có bản ACTIVE nào thì mức phí trung bình hiển thị 0', () => {
      api.getFeeRuleVersions.and.returnValue(
        of([ban({ id: 'c1', code: 'INFRA_GATE', status: 'CLOSED', amount: 5_000_000 })]),
      );
      taoTrang();

      expect(noiBo()['activeCount']()).toBe(0);
      expect(noiBo()['avgAmountLabel']()).toContain('0');
    });

    it('BUG-055 — mỗi thẻ có chú thích làm rõ tập tính (mọi bản vs chỉ bản hiệu lực)', () => {
      taoTrang();

      const hints = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.kpi__hint')).map(
        (el) => (el.textContent ?? '').trim(),
      );
      expect(hints.length).toBe(4);
      expect(hints[0]).toContain('mọi nhóm biểu phí');
      expect(hints[3]).toContain('đang hiệu lực');
    });
  });

  it('nạp danh mục VEHICLE_TYPE và danh mục DOSSIER_TYPE', () => {
    taoTrang();

    expect(api.getVehicleTypes).toHaveBeenCalled();
    expect(api.getDossierTypes).toHaveBeenCalled();
    expect(noiBo()['vehicleTypes']()).toContain('TRUCK');
    expect(noiBo()['vehicleTypes']()).toContain('CONTAINER');
  });

  it('lọc theo loại phương tiện chính xác', () => {
    api.getFeeRuleVersions.and.returnValue(
      of([
        ban({ id: 'r1', code: 'TRUCK_FEE', feeType: 'SERVICE', appliesTo: ['TRUCK'], status: 'ACTIVE' }),
        ban({ id: 'r2', code: 'CONTAINER_FEE', feeType: 'INFRASTRUCTURE', appliesTo: ['CONTAINER'], status: 'ACTIVE' }),
        ban({ id: 'r3', code: 'ALL_FEE', feeType: 'PARKING', appliesTo: [], status: 'ACTIVE' }),
      ]),
    );
    taoTrang();

    noiBo()['vehicleTypeFilter'].set('CONTAINER');
    fixture.detectChanges();

    const filtered = noiBo()['filteredGroups']();
    // CONTAINER_FEE và ALL_FEE (appliesTo rỗng) đều khớp
    expect(filtered.some((g: any) => g.feeType === 'INFRASTRUCTURE')).toBeTrue();
    expect(filtered.some((g: any) => g.feeType === 'PARKING')).toBeTrue();
    expect(filtered.some((g: any) => g.feeType === 'SERVICE')).toBeFalse();
  });

  it('SG-258 — tìm kiếm theo Tên khoản phí chính xác', () => {
    api.getFeeRuleVersions.and.returnValue(
      of([
        ban({ id: 'r1', code: 'FEE_1', name: 'Phí hạ tầng cửa khẩu', feeType: 'INFRASTRUCTURE', status: 'ACTIVE' }),
        ban({ id: 'r2', code: 'FEE_2', name: 'Phí lưu bãi đêm', feeType: 'PARKING', status: 'ACTIVE' }),
      ]),
    );
    taoTrang();

    noiBo()['ruleSearch'].set('lưu bãi');
    fixture.detectChanges();

    const filtered = noiBo()['filteredGroups']();
    expect(filtered.length).toBe(1);
    expect(filtered[0].feeType).toBe('PARKING');
    expect(filtered[0].versions[0].name).toBe('Phí lưu bãi đêm');
  });

  describe('Bộ lọc trạng thái (statusFilter)', () => {
    it('hiển thị đủ 4 tùy chọn trạng thái và mặc định là Tất cả', () => {
      taoTrang();

      const selects = (fixture.nativeElement as HTMLElement).querySelectorAll('.filter-select');
      const statusSelect = Array.from(selects).find((el) =>
        el.getAttribute('aria-label')?.includes('Trạng thái') || el.getAttribute('aria-label')?.includes('Status'),
      ) as HTMLSelectElement;

      expect(statusSelect).not.toBeNull();
      const options = Array.from(statusSelect.options);
      expect(options.length).toBe(4);
      expect(options.map((o) => o.value)).toEqual(['', 'active', 'scheduled', 'inactive']);
      expect(options.map((o) => o.text.trim())).toEqual([
        'Tất cả',
        'Đang áp dụng',
        'Chưa áp dụng',
        'Ngừng áp dụng',
      ]);
      expect(statusSelect.value).toBe('');
      expect(noiBo()['statusFilter']()).toBe('');
    });

    it('lọc theo trạng thái Đang áp dụng, Chưa áp dụng và Ngừng áp dụng chính xác', () => {
      api.getFeeRuleVersions.and.returnValue(
        of([
          ban({ id: 'r1', code: 'FEE_ACTIVE', feeType: 'INFRASTRUCTURE', status: 'ACTIVE' }),
          ban({ id: 'r2', code: 'FEE_SCHEDULED', feeType: 'PARKING', effectiveFrom: FUTURE, status: 'SCHEDULED' }),
          ban({ id: 'r3', code: 'FEE_CLOSED', feeType: 'SERVICE', effectiveFrom: '2018-01-01', effectiveTo: '2019-01-01', status: 'CLOSED' }),
        ]),
      );
      taoTrang();

      // Mặc định: hiện đủ cả 3
      expect(noiBo()['filteredGroups']().length).toBe(3);

      // Lọc Chưa áp dụng ('scheduled')
      noiBo()['statusFilter'].set('scheduled');
      fixture.detectChanges();
      let filtered = noiBo()['filteredGroups']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].feeType).toBe('PARKING');

      // Lọc Đang áp dụng ('active')
      noiBo()['statusFilter'].set('active');
      fixture.detectChanges();
      filtered = noiBo()['filteredGroups']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].feeType).toBe('INFRASTRUCTURE');

      // Lọc Ngừng áp dụng ('inactive')
      noiBo()['statusFilter'].set('inactive');
      fixture.detectChanges();
      filtered = noiBo()['filteredGroups']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].feeType).toBe('SERVICE');

      // Lọc Tất cả ('')
      noiBo()['statusFilter'].set('');
      fixture.detectChanges();
      expect(noiBo()['filteredGroups']().length).toBe(3);
    });
  });

  it('API lỗi khi tải thì báo lỗi và không có nhóm nào', () => {
    api.getFeeRuleVersions.and.returnValue(throwError(() => new Error('loi')));
    taoTrang();

    expect(noiBo()['error']()).toBeTruthy();
    expect(noiBo()['groups']().length).toBe(0);
  });

  it('không có quyền fee.approve thì canManage = false', () => {
    taoTrang([]);
    expect(noiBo()['canManage']()).toBeFalse();
  });

  it('sửa bản ĐÃ áp dụng thì khóa trường tiền (moneyLocked = true)', () => {
    taoTrang();

    noiBo()['openEdit'](ban({ id: 'r-nay', effectiveFrom: PAST }));
    fixture.detectChanges();

    expect(noiBo()['editApplied']()).toBeTrue();
    expect(noiBo()['moneyLocked']()).toBeTrue();
    expect(fixture.nativeElement.querySelector('sg-modal')).not.toBeNull();
  });

  it('sửa bản CHƯA tới hiệu lực thì KHÔNG khóa trường tiền', () => {
    taoTrang();

    noiBo()['openEdit'](ban({ id: 'r-sau', effectiveFrom: FUTURE }));

    expect(noiBo()['editApplied']()).toBeFalse();
    expect(noiBo()['moneyLocked']()).toBeFalse();
  });

  it('sửa bản đã áp dụng chỉ gửi metadata phi-tiền (không có amount)', () => {
    taoTrang();
    noiBo()['openEdit'](ban({ id: 'r-nay', effectiveFrom: PAST, name: 'Cũ' }));
    noiBo()['form'].name = 'Tên mới';
    noiBo()['form'].amount = 9_999_999;

    noiBo()['submit']();

    expect(api.updateFeeRule).toHaveBeenCalled();
    const [id, payload] = api.updateFeeRule.calls.mostRecent().args;
    expect(id).toBe('r-nay');
    expect(payload.name).toBe('Tên mới');
    expect(payload.amount).toBeUndefined();
  });

  it('sửa bản chưa tới hiệu lực thì gửi đủ cả trường tiền', () => {
    taoTrang();
    noiBo()['openEdit'](ban({ id: 'r-sau', effectiveFrom: FUTURE, amount: 1_500_000 }));
    noiBo()['form'].amount = 2_000_000;

    noiBo()['submit']();

    const [id, payload] = api.updateFeeRule.calls.mostRecent().args;
    expect(id).toBe('r-sau');
    expect(payload.amount).toBe(2_000_000);
  });

  it('thêm mới: mã sai định dạng bị chặn, không gọi API', () => {
    taoTrang();
    noiBo()['openCreate']();
    noiBo()['form'].code = 'x';
    noiBo()['form'].name = 'Tên';
    noiBo()['form'].amount = 1000;
    noiBo()['form'].effectiveFrom = '2099-05-01';

    noiBo()['submit']();

    expect(api.createFeeRule).not.toHaveBeenCalled();
    expect(noiBo()['fieldErrors']()['code']).toBeTruthy();
  });

  it('thêm mới: số tiền âm bị chặn, không gọi API', () => {
    taoTrang();
    noiBo()['openCreate']();
    noiBo()['form'].code = 'INFRA_GATE';
    noiBo()['form'].name = 'Tên';
    noiBo()['form'].amount = -1;
    noiBo()['form'].effectiveFrom = '2099-05-01';

    noiBo()['submit']();

    expect(api.createFeeRule).not.toHaveBeenCalled();
  });

  it('thêm mới hợp lệ thì gửi đúng payload rồi tải lại', () => {
    taoTrang();
    const soLan = api.getFeeRuleVersions.calls.count();
    noiBo()['openCreate']();
    noiBo()['form'].code = 'parking_day';
    noiBo()['form'].name = 'Phí lưu bãi xe tải';
    noiBo()['form'].feeType = 'PARKING';
    noiBo()['form'].unit = 'DAY';
    noiBo()['form'].amount = 50_000;
    noiBo()['form'].appliesTo = ['TRUCK'];
    noiBo()['form'].effectiveFrom = '2099-05-01';

    noiBo()['submit']();

    expect(api.createFeeRule).toHaveBeenCalled();
    const payload = api.createFeeRule.calls.mostRecent().args[0];
    // Mã được chuẩn hóa hoa.
    expect(payload.code).toBe('PARKING_DAY');
    expect(payload.unit).toBe('DAY');
    expect(payload.feeType).toBe('PARKING');
    expect(payload.appliesTo).toEqual(['TRUCK']);
    expect(payload.effectiveFrom).toBe('2099-05-01');
    expect(noiBo()['modalMode']()).toBeNull();
    expect(api.getFeeRuleVersions.calls.count()).toBe(soLan + 1);
  });

  it('thêm mới: khi để trống hoặc nhập giá trị không hợp lệ, khoanh đỏ (is-invalid) và hiện thông báo lỗi ngay bên dưới ô nhập', () => {
    taoTrang();
    noiBo()['openCreate']();
    noiBo()['form'].code = 'invalid code!';
    noiBo()['form'].name = '';
    noiBo()['form'].amount = -5;
    noiBo()['form'].effectiveFrom = '';

    noiBo()['submit']();
    fixture.detectChanges();

    const fieldErrors = noiBo()['fieldErrors']();
    expect(fieldErrors['code']).toBeTruthy();
    expect(fieldErrors['name']).toBeTruthy();
    expect(fieldErrors['amount']).toBeTruthy();
    expect(fieldErrors['effectiveFrom']).toBeTruthy();

    const invalidInputs = (fixture.nativeElement as HTMLElement).querySelectorAll('.form-control.is-invalid');
    expect(invalidInputs.length).toBeGreaterThanOrEqual(3);

    const errorSpans = (fixture.nativeElement as HTMLElement).querySelectorAll('.field-error');
    expect(errorSpans.length).toBeGreaterThanOrEqual(3);
  });

  it('SG-278 — hiển thị đúng nhãn "Mọi loại phương tiện" và "Mọi loại hồ sơ" khi chọn tất cả', () => {
    taoTrang();
    
    // Loại xe
    expect(noiBo()['appliesToVehicleLabel']([])).toBe('Mọi loại phương tiện');
    const allVehicles = noiBo()['vehicleTypes']();
    expect(noiBo()['appliesToVehicleLabel']([allVehicles[0]])).not.toBe('Mọi loại phương tiện');
    expect(noiBo()['appliesToVehicleLabel'](allVehicles)).toBe('Mọi loại phương tiện'); // Chọn tất cả
    expect(noiBo()['appliesToVehicleLabel']([allVehicles[0], allVehicles[0]])).not.toBe('Mọi loại phương tiện'); // Trùng lặp chưa đủ
    expect(noiBo()['appliesToVehicleLabel'](['INVALID_1', 'INVALID_2'])).toBe('Mọi loại phương tiện'); // Rác hoàn toàn (do !vehicles.length)
    expect(noiBo()['appliesToVehicleLabel']([allVehicles[0], 'INVALID'])).not.toBe('Mọi loại phương tiện'); // Có rác nhưng chưa đủ các loại hợp lệ

    // Loại hồ sơ
    expect(noiBo()['appliesToDossierLabel']([])).toBe('Mọi loại hồ sơ');
    const allDossiers = noiBo()['dossierTypes']();
    expect(noiBo()['appliesToDossierLabel']([allDossiers[0]])).not.toBe('Mọi loại hồ sơ');
    expect(noiBo()['appliesToDossierLabel'](allDossiers)).toBe('Mọi loại hồ sơ'); // Chọn tất cả
    expect(noiBo()['appliesToDossierLabel']([allDossiers[0], allDossiers[0]])).not.toBe('Mọi loại hồ sơ');
    expect(noiBo()['appliesToDossierLabel'](['INVALID_1', 'INVALID_2'])).toBe('Mọi loại hồ sơ');
    expect(noiBo()['appliesToDossierLabel']([allDossiers[0], 'INVALID'])).not.toBe('Mọi loại hồ sơ');
  });
});
