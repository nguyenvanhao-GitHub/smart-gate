import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { SystemSetting } from '../../../core/models/admin.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SystemConfigPageComponent } from './system-config-page.component';

/**
 * BA-092 — màn "Cấu hình hệ thống".
 *
 * Khóa: nạp và hiển thị tham số, **chặn giá trị ngoài khoảng ngay ở client (không gọi PUT)**, lưu
 * hợp lệ thì gửi đúng payload và báo thành công, và **nút Lưu chỉ hiện khi có quyền `system.update`**.
 */

function hoSoTruyCap(permissions: string[] = ['system.view', 'system.update']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'admin',
      displayName: 'Quản trị hệ thống',
      title: 'SYS_ADMIN',
      email: 'admin@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'SYS_ADMIN', name: 'Quản trị hệ thống', dataScope: 'ALL' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

function thamSo(mau: Partial<SystemSetting> = {}): SystemSetting {
  return {
    key: 'yard.maxStorageHours',
    value: '48',
    valueType: 'integer',
    group: 'yard',
    min: 1,
    max: 8760,
    defaultValue: '48',
    updatedAt: null,
    updatedById: null,
    ...mau,
  };
}

const danhSach: SystemSetting[] = [
  thamSo(),
  thamSo({ key: 'fee.paymentDeadlineHours', value: '72', group: 'fee', defaultValue: '72' }),
];

describe('SystemConfigPageComponent — cấu hình hệ thống (BA-092)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<SystemConfigPageComponent>;
  let component: SystemConfigPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  function taoTrang(quyen?: string[]): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(quyen) }));

    TestBed.configureTestingModule({
      imports: [SystemConfigPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(SystemConfigPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    api = jasmine.createSpyObj<ApiService>('ApiService', ['getSystemSettings', 'updateSystemSettings']);
    api.getSystemSettings.and.returnValue(of(danhSach.map((item) => ({ ...item }))));
    api.updateSystemSettings.and.returnValue(of(danhSach.map((item) => ({ ...item }))));
  });

  afterEach(() => TestBed.resetTestingModule());

  it('nạp và hiển thị nhãn tham số kèm giá trị ban đầu vào bản nháp', () => {
    taoTrang();

    expect(noiDungTrang()).toContain('Số giờ lưu bãi tối đa');
    expect(noiDungTrang()).toContain('Hạn thanh toán phí (giờ)');
    expect(noiBo()['draft']['yard.maxStorageHours']).toBe('48');
    expect(noiBo()['draft']['fee.paymentDeadlineHours']).toBe('72');
  });

  it('giá trị ngoài khoảng bị chặn ở client, không gọi PUT', () => {
    taoTrang();
    noiBo()['draft'] = { 'yard.maxStorageHours': '99999', 'fee.paymentDeadlineHours': '72' };

    noiBo()['save']();

    expect(api.updateSystemSettings).not.toHaveBeenCalled();
    expect(noiBo()['fieldErrors']()['yard.maxStorageHours']).toContain('Số giờ lưu bãi tối đa');
  });

  it('giá trị không phải số nguyên bị chặn ở client', () => {
    taoTrang();
    noiBo()['draft'] = { 'yard.maxStorageHours': '12.5', 'fee.paymentDeadlineHours': '72' };

    noiBo()['save']();

    expect(api.updateSystemSettings).not.toHaveBeenCalled();
  });

  it('lưu hợp lệ thì gửi đúng payload (giá trị dạng chuỗi) và báo thành công', () => {
    taoTrang();
    noiBo()['draft'] = { 'yard.maxStorageHours': '24', 'fee.paymentDeadlineHours': '96' };

    noiBo()['save']();
    fixture.detectChanges();

    expect(api.updateSystemSettings).toHaveBeenCalledWith([
      { key: 'yard.maxStorageHours', value: '24' },
      { key: 'fee.paymentDeadlineHours', value: '96' },
    ]);
    expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'success' && m.text.includes('Đã lưu cấu hình hệ thống'))).toBe(true);
  });

  it('CR29 — tham số boolean fee.enabled render công tắc và lưu giá trị true/false', () => {
    api.getSystemSettings.and.returnValue(
      of([
        thamSo(),
        thamSo({ key: 'fee.enabled', value: 'true', valueType: 'boolean', group: 'fee', defaultValue: 'true', min: 0, max: 1 }),
      ]),
    );
    taoTrang();

    // Công tắc bật/tắt hiện ra thay cho ô nhập số, và nháp mang đúng giá trị 'true'.
    expect(fixture.nativeElement.querySelector('.switch__input')).not.toBeNull();
    expect(noiBo()['draft']['fee.enabled']).toBe('true');

    // Tắt phí rồi lưu → payload gửi chuỗi 'false' đúng hợp đồng BE.
    noiBo()['setBoolean']('fee.enabled', false);
    noiBo()['save']();

    expect(api.updateSystemSettings).toHaveBeenCalledWith([
      { key: 'yard.maxStorageHours', value: '48' },
      { key: 'fee.enabled', value: 'false' },
    ]);
  });

  it('không có quyền system.update thì không hiện nút Lưu', () => {
    taoTrang(['system.view']);

    expect(fixture.nativeElement.querySelector('.actions')).toBeNull();
  });

  it('có quyền system.update thì hiện nút Lưu', () => {
    taoTrang();

    expect(fixture.nativeElement.querySelector('.actions')).not.toBeNull();
  });

  it('API lỗi khi tải thì báo lỗi và để danh sách rỗng', () => {
    api.getSystemSettings.and.returnValue(throwError(() => new Error('loi')));
    taoTrang();

    expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error' && m.text.includes('Không tải được cấu hình hệ thống'))).toBe(true);
    expect(noiBo()['settings']().length).toBe(0);
  });

  it('hiển thị đầy đủ panel hướng dẫn nghiệp vụ và sơ đồ luồng quy trình liên kết tham số', () => {
    taoTrang();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.kpi-banner')).not.toBeNull();
    expect(el.querySelector('.config-grid')).not.toBeNull();
    expect(el.querySelector('.main-column')).not.toBeNull();
    expect(el.querySelector('.security-card')).not.toBeNull();
    expect(el.querySelector('.side-panel')).not.toBeNull();
    expect(el.querySelector('.guide-card')).not.toBeNull();
    expect(el.querySelector('.pipeline-card')).not.toBeNull();
    expect(el.querySelector('.links-card')).not.toBeNull();
    expect(el.querySelector('.workflow-steps')).not.toBeNull();

    expect(noiDungTrang()).toContain('Hướng dẫn & Tác động nghiệp vụ');
    expect(noiDungTrang()).toContain('Luồng quy trình liên kết tham số');
    expect(noiDungTrang()).toContain('Thông tin vận hành hệ thống');
    expect(noiDungTrang()).toContain('Lưu ý vận hành & Quản trị an toàn');
    expect(noiDungTrang()).toContain('Phân hệ liên kết cấu hình');
  });

  it('thao tác đặt lại mặc định (resetDefaults) đưa các tham số về giá trị mặc định', () => {
    taoTrang();
    noiBo()['draft']['yard.maxStorageHours'] = '100';
    noiBo()['draft']['fee.paymentDeadlineHours'] = '200';

    noiBo()['resetDefaults']();

    expect(noiBo()['draft']['yard.maxStorageHours']).toBe('48');
    expect(noiBo()['draft']['fee.paymentDeadlineHours']).toBe('72');
    expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'info' && m.text.includes('Đã điền các giá trị mặc định'))).toBe(true);
  });

  it('thao tác hoàn tác (undoDraft) khôi phục lại giá trị vừa tải từ API', () => {
    taoTrang();
    noiBo()['draft']['yard.maxStorageHours'] = '999';

    noiBo()['undoDraft']();

    expect(noiBo()['draft']['yard.maxStorageHours']).toBe('48');
    expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'info' && m.text.includes('Đã hoàn tác các thay đổi chưa lưu'))).toBe(true);
  });
});
