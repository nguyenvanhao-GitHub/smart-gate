import { TestBed } from '@angular/core/testing';
import { I18nService, LOCALE_STORAGE_KEY } from '../i18n/i18n.service';
import {
  formatNotificationContent,
  groupByTime,
  notifIcon,
  notifRelativeTime,
  notifRoute,
  notifTimeGroup,
  notifTone,
  notifTypeLabel,
} from './notification.model';

/**
 * Hiển thị thông báo (F06). Khóa: sắc thái/biểu tượng suy từ **mã loại** (5 mã thật + mã lạ → fallback
 * `info`), nhãn dịch được, và nhóm thời gian theo ranh giới lịch (truyền `now` cố định, không phụ thuộc
 * đồng hồ hệ thống).
 */
describe('notification.model', () => {
  describe('notifTone — sắc thái theo mã loại', () => {
    it('5 mã thật ánh xạ đúng sắc thái', () => {
      expect(notifTone('DOSSIER_SUPPLEMENT_REQUESTED')).toBe('warn');
      expect(notifTone('DOSSIER_REJECTED')).toBe('danger');
      expect(notifTone('DOSSIER_STATUS_CHANGED')).toBe('info');
      expect(notifTone('DOSSIER_STEP_CONFIRMED')).toBe('success');
      expect(notifTone('SYSTEM')).toBe('system');
    });

    it('mã lạ do BE thêm mới rơi về info', () => {
      expect(notifTone('MA_LA_MOI')).toBe('info');
      expect(notifTone('')).toBe('info');
    });
  });

  describe('notifIcon — biểu tượng theo sắc thái', () => {
    it('mỗi mã thật ra đúng biểu tượng Material', () => {
      expect(notifIcon('DOSSIER_SUPPLEMENT_REQUESTED')).toBe('warning');
      expect(notifIcon('DOSSIER_REJECTED')).toBe('report');
      expect(notifIcon('DOSSIER_STEP_CONFIRMED')).toBe('check_circle');
      expect(notifIcon('SYSTEM')).toBe('settings');
      expect(notifIcon('DOSSIER_STATUS_CHANGED')).toBe('info');
    });

    it('mã lạ rơi về biểu tượng info', () => {
      expect(notifIcon('MA_LA')).toBe('info');
    });
  });

  describe('notifTimeGroup — ranh giới Hôm nay / Hôm qua / Trước đó', () => {
    const now = new Date(2026, 6, 15, 10, 0, 0); // 15/07/2026 10:00 giờ địa phương

    it('cùng ngày lịch với now → today (kể cả sớm hơn giờ trong ngày)', () => {
      expect(notifTimeGroup(new Date(2026, 6, 15, 0, 1, 0).toISOString(), now)).toBe('today');
      expect(notifTimeGroup(new Date(2026, 6, 15, 23, 59, 0).toISOString(), now)).toBe('today');
    });

    it('ngày lịch trước đó một ngày → yesterday', () => {
      expect(notifTimeGroup(new Date(2026, 6, 14, 23, 0, 0).toISOString(), now)).toBe('yesterday');
    });

    it('từ hai ngày trở lên trước → earlier', () => {
      expect(notifTimeGroup(new Date(2026, 6, 13, 12, 0, 0).toISOString(), now)).toBe('earlier');
      expect(notifTimeGroup(new Date(2026, 5, 1, 12, 0, 0).toISOString(), now)).toBe('earlier');
    });

    it('mốc tương lai coi như today (không âm)', () => {
      expect(notifTimeGroup(new Date(2026, 6, 20, 12, 0, 0).toISOString(), now)).toBe('today');
    });

    it('ngày không hợp lệ rơi về earlier (không vỡ)', () => {
      expect(notifTimeGroup('khong-phai-ngay', now)).toBe('earlier');
    });
  });

  describe('groupByTime — gom nhóm theo mốc thời gian', () => {
    const now = new Date(2026, 6, 15, 10, 0, 0);

    function item(id: string, date: Date) {
      return { id, createdAt: date.toISOString() };
    }

    it('gom đúng nhóm, giữ thứ tự hôm nay → hôm qua → trước đó, bỏ nhóm rỗng', () => {
      const items = [
        item('a', new Date(2026, 6, 15, 9, 0, 0)),
        item('b', new Date(2026, 6, 14, 9, 0, 0)),
        item('c', new Date(2026, 6, 10, 9, 0, 0)),
        item('d', new Date(2026, 6, 15, 8, 0, 0)),
      ];

      const sections = groupByTime(items, now);

      expect(sections.map((section) => section.key)).toEqual(['today', 'yesterday', 'earlier']);
      expect(sections[0].items.map((it) => it.id)).toEqual(['a', 'd']);
      expect(sections[0].labelKey).toBe('ui.notify.groupToday');
      expect(sections[1].items.map((it) => it.id)).toEqual(['b']);
      expect(sections[2].items.map((it) => it.id)).toEqual(['c']);
    });

    it('không có mục nào của một nhóm thì bỏ hẳn nhóm đó', () => {
      const sections = groupByTime([item('a', new Date(2026, 6, 15, 9, 0, 0))], now);
      expect(sections.length).toBe(1);
      expect(sections[0].key).toBe('today');
    });

    it('danh sách rỗng → không có nhóm nào', () => {
      expect(groupByTime([], now)).toEqual([]);
    });
  });

  describe('notifRelativeTime — thời gian tương đối (BUG-087)', () => {
    const now = new Date(2026, 6, 15, 10, 0, 0);

    it('dưới 60 giây → Vừa xong (không kèm số)', () => {
      const rel = notifRelativeTime(new Date(2026, 6, 15, 9, 59, 30).toISOString(), now);
      expect(rel).toEqual({ key: 'ui.notify.relJustNow' });
    });

    it('dưới 60 phút → x phút trước', () => {
      const rel = notifRelativeTime(new Date(2026, 6, 15, 9, 28, 0).toISOString(), now);
      expect(rel).toEqual({ key: 'ui.notify.relMinutes', params: { count: 32 } });
    });

    it('dưới 24 giờ → x giờ trước', () => {
      const rel = notifRelativeTime(new Date(2026, 6, 15, 5, 0, 0).toISOString(), now);
      expect(rel).toEqual({ key: 'ui.notify.relHours', params: { count: 5 } });
    });

    it('dưới 7 ngày → x ngày trước', () => {
      const rel = notifRelativeTime(new Date(2026, 6, 12, 10, 0, 0).toISOString(), now);
      expect(rel).toEqual({ key: 'ui.notify.relDays', params: { count: 3 } });
    });

    it('từ 7 ngày trở lên → null để nơi hiển thị dùng ngày tuyệt đối', () => {
      expect(notifRelativeTime(new Date(2026, 6, 1, 10, 0, 0).toISOString(), now)).toBeNull();
    });

    it('mốc tương lai gần vẫn coi là Vừa xong (không âm)', () => {
      const rel = notifRelativeTime(new Date(2026, 6, 15, 10, 0, 30).toISOString(), now);
      expect(rel).toEqual({ key: 'ui.notify.relJustNow' });
    });

    it('ngày không hợp lệ → null', () => {
      expect(notifRelativeTime('khong-phai-ngay', now)).toBeNull();
    });
  });

  describe('notifTypeLabel — nhãn dịch được', () => {
    let i18n: I18nService;
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({});
      i18n = TestBed.inject(I18nService);
    });
    afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

    it('mã thật ra nhãn tiếng Việt, đổi theo ngôn ngữ', () => {
      expect(notifTypeLabel('DOSSIER_SUPPLEMENT_REQUESTED', i18n.t)).toBe('Yêu cầu bổ sung');
      expect(notifTypeLabel('SYSTEM', i18n.t)).toBe('Hệ thống');
      i18n.setLocale('en');
      expect(notifTypeLabel('SYSTEM', i18n.t)).not.toBe('SYSTEM');
    });

    it('mã lạ giữ nguyên mã, không lộ khóa trần', () => {
      expect(notifTypeLabel('MA_LA', i18n.t)).toBe('MA_LA');
    });
  });

  describe('notifRoute — điều hướng thông báo (SG-227)', () => {
    it('trả về route của thông báo hoặc ưu tiên màn hình điều phối cho thông báo liên quan đến điều phối', () => {
      expect(notifRoute({ route: '/workflow/dossiers/d-1' })).toBe('/workflow/dossiers/d-1');
      expect(notifRoute({ route: '/dispatch' })).toBe('/operations/vehicle-confirmation');
      expect(notifRoute({ route: '/operations/vehicle-confirmation' })).toBe('/operations/vehicle-confirmation');
      expect(notifRoute({ title: 'Xe 29A-12345 đang chờ điều phối' })).toBe('/operations/vehicle-confirmation');
      expect(notifRoute({ content: 'Xe 29A-12345 đang chờ điều phối.', dossierId: 'd-1' })).toBe('/operations/vehicle-confirmation');
      expect(notifRoute({ dossierId: 'd-1' })).toBe('/declarations/d-1');
      expect(notifRoute({})).toBeNull();
    });
  });

  describe('formatNotificationContent — định dạng số thứ tự thông báo gọi xe (SG-216)', () => {
    it('chuyển đổi (Số thứ tự 1) thành (Số thứ tự 21/08/2026.0001)', () => {
      const result = formatNotificationContent(
        'Phương tiện 99B1-55555 (Số thứ tự 1) đã được gọi vào khu vực kiểm tra nghiệp vụ.',
        '2026-08-21T09:06:00.000Z',
      );
      expect(result).toBe('Phương tiện 99B1-55555 (Số thứ tự 21/08/2026.0001) đã được gọi vào khu vực kiểm tra nghiệp vụ.');
    });

    it('nội dung đã chuẩn định dạng thì giữ nguyên không đổi', () => {
      const result = formatNotificationContent(
        'Phương tiện 55C555 (Số thứ tự 20/08/2026.0006) đã được gọi vào khu vực kiểm tra nghiệp vụ.',
        '2026-08-20T17:01:00.000Z',
      );
      expect(result).toBe('Phương tiện 55C555 (Số thứ tự 20/08/2026.0006) đã được gọi vào khu vực kiểm tra nghiệp vụ.');
    });

    it('nội dung không chứa mốc số thứ tự giữ nguyên', () => {
      const result = formatNotificationContent('Hồ sơ EXP-20260821-000012 đang chờ xác nhận vào cổng.');
      expect(result).toBe('Hồ sơ EXP-20260821-000012 đang chờ xác nhận vào cổng.');
    });
  });
});
