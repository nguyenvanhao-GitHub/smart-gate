import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { YardZone } from '../../../core/models/yard.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { YardConfigPageComponent } from './yard-config-page.component';

/**
 * F42 — Cấu hình bãi và sức chứa (UI-11).
 *
 * Khóa: bảng khu bãi hiển thị "used / slotCount", tải lỗi, mở hộp thoại sửa nạp bản nháp,
 * **chặn tên rỗng và sức chứa âm/không nguyên ngay ở client (không gọi PATCH)**, sức chứa 0
 * hợp lệ, và khi hợp lệ thì gửi đúng payload rồi tải lại.
 */

function khu(mau: Partial<YardZone> = {}): YardZone {
  return { code: 'A', name: 'Khu A', capacity: 16, slotCount: 16, active: true, used: 3, ...mau };
}

describe('YardConfigPageComponent — cấu hình khu bãi (F42)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<YardConfigPageComponent>;
  let component: YardConfigPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [YardConfigPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(YardConfigPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['getYardZones', 'updateYardZone']);
    api.getYardZones.and.returnValue(of([khu(), khu({ code: 'B', name: 'Khu B', active: false, used: 0 })]));
    api.updateYardZone.and.returnValue(of(khu({ capacity: 20 })));
  });

  afterEach(() => TestBed.resetTestingModule());

  it('hiển thị bảng khu bãi với "đang dùng / tổng ô" và trạng thái', () => {
    taoTrang();
    const noiDung = noiDungTrang();

    expect(noiDung).toContain('Khu A');
    expect(noiDung).toContain('Khu B');
    expect(noiDung).toContain('3 / 16');
  });

  it('API lỗi khi tải thì báo lỗi và để bảng rỗng', () => {
    api.getYardZones.and.returnValue(throwError(() => new Error('loi')));
    taoTrang();

    expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error')).toBe(true);
    expect(noiBo()['zones']().length).toBe(0);
  });

  it('mở hộp thoại sửa thì nạp bản nháp từ khu đang chọn', () => {
    taoTrang();

    noiBo()['openEdit'](khu({ name: 'Khu A', capacity: 16 }));
    fixture.detectChanges();

    expect(noiBo()['editing']()).not.toBeNull();
    expect(noiBo()['draft']).toEqual({ name: 'Khu A', capacity: '16' });
    expect(fixture.nativeElement.querySelector('sg-modal')).not.toBeNull();
  });

  it('tên rỗng bị chặn, không gọi PATCH', () => {
    taoTrang();
    noiBo()['openEdit'](khu());
    noiBo()['draft'] = { name: '   ', capacity: '10' };

    noiBo()['save']();

    expect(api.updateYardZone).not.toHaveBeenCalled();
    expect(noiBo()['fieldErrors']().name).toBeTruthy();
  });

  it('sức chứa âm bị chặn, không gọi PATCH', () => {
    taoTrang();
    noiBo()['openEdit'](khu());
    noiBo()['draft'] = { name: 'Khu A', capacity: '-5' };

    noiBo()['save']();

    expect(api.updateYardZone).not.toHaveBeenCalled();
    expect(noiBo()['fieldErrors']().capacity).toBeTruthy();
  });

  it('sức chứa không nguyên bị chặn, không gọi PATCH', () => {
    taoTrang();
    noiBo()['openEdit'](khu());
    noiBo()['draft'] = { name: 'Khu A', capacity: '3.5' };

    noiBo()['save']();

    expect(api.updateYardZone).not.toHaveBeenCalled();
  });

  it('hợp lệ thì gửi đúng payload theo mã khu rồi tải lại danh sách', () => {
    taoTrang();
    const soLan = api.getYardZones.calls.count();
    noiBo()['openEdit'](khu({ code: 'A' }));
    noiBo()['draft'] = { name: '  Khu A mới  ', capacity: '20' };

    noiBo()['save']();
    fixture.detectChanges();

    expect(api.updateYardZone).toHaveBeenCalledWith('A', { name: 'Khu A mới', capacity: 20 });
    expect(noiBo()['editing']()).toBeNull();
    expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'success')).toBe(true);
    expect(api.getYardZones.calls.count()).toBe(soLan + 1);
  });

  it('sức chứa 0 là hợp lệ (tạm ngừng nhận xe) — vẫn gửi PATCH capacity 0', () => {
    taoTrang();
    noiBo()['openEdit'](khu());
    noiBo()['draft'] = { name: 'Khu A', capacity: '0' };

    noiBo()['save']();

    expect(api.updateYardZone).toHaveBeenCalledWith('A', { name: 'Khu A', capacity: 0 });
  });

  it('hiển thị dấu (*) bắt buộc tại các trường Tên khu và Sức chứa (SG-172)', () => {
    taoTrang();
    noiBo()['openEdit'](khu());
    fixture.detectChanges();

    const requiredElements = fixture.nativeElement.querySelectorAll('.field__required');
    expect(requiredElements.length).toBe(2);
  });
});
