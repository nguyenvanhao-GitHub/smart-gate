import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AppMessageService } from './app-message.service';

/**
 * Hàng đợi thông báo nổi. Dùng `fakeAsync` + `tick` để kiểm timeout tự tắt —
 * không chờ thời gian thật, test phải tất định.
 */
describe('AppMessageService — hàng đợi thông báo dùng chung', () => {
  const MAC_DINH_MS = 6000;
  let service: AppMessageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AppMessageService);
  });

  function noiDung(): string[] {
    return service.messages().map((item) => item.text);
  }

  it('hiện thông báo mới kèm sắc thái và id tăng dần', fakeAsync(() => {
    service.show('Đã lưu hồ sơ.', 'success');
    service.show('Không tải được danh sách.', 'error');

    expect(service.messages().map((item) => ({ tone: item.tone, text: item.text }))).toEqual([
      { tone: 'success', text: 'Đã lưu hồ sơ.' },
      { tone: 'error', text: 'Không tải được danh sách.' },
    ]);
    expect(service.messages()[1].id).toBeGreaterThan(service.messages()[0].id);

    tick(MAC_DINH_MS);
  }));

  it('sắc thái mặc định là info', fakeAsync(() => {
    service.show('Thông tin chung.');
    expect(service.messages()[0].tone).toBe('info');
    tick(MAC_DINH_MS);
  }));

  it('trùng nội dung thì chỉ hiện một thông báo', fakeAsync(() => {
    service.show('Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.', 'warning');
    service.show('Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.', 'warning');
    service.show('Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.', 'error');

    expect(service.messages().length).toBe(1);
    tick(MAC_DINH_MS);
  }));

  it('nội dung rỗng bị bỏ qua', fakeAsync(() => {
    service.show('');
    expect(service.messages()).toEqual([]);
  }));

  it('tự tắt sau đúng 6000ms', fakeAsync(() => {
    service.show('Đã lưu ma trận phân quyền.', 'success');

    tick(MAC_DINH_MS - 1);
    expect(noiDung()).toEqual(['Đã lưu ma trận phân quyền.']);

    tick(1);
    expect(noiDung()).toEqual([]);
  }));

  it('mỗi thông báo tự tắt theo timeout riêng của nó', fakeAsync(() => {
    service.show('Thông báo A', 'info', 1000);
    service.show('Thông báo B', 'info', 3000);

    tick(1000);
    expect(noiDung()).toEqual(['Thông báo B']);

    tick(2000);
    expect(noiDung()).toEqual([]);
  }));

  it('timeout bằng 0 thì thông báo không tự tắt', fakeAsync(() => {
    service.show('Thông báo giữ nguyên', 'error', 0);
    tick(60_000);
    expect(noiDung()).toEqual(['Thông báo giữ nguyên']);
  }));

  it('sau khi thông báo cũ đã tắt thì nội dung đó hiện lại được', fakeAsync(() => {
    service.show('Bạn không có quyền thực hiện thao tác này.', 'error');
    tick(MAC_DINH_MS);
    expect(noiDung()).toEqual([]);

    service.show('Bạn không có quyền thực hiện thao tác này.', 'error');
    expect(noiDung()).toEqual(['Bạn không có quyền thực hiện thao tác này.']);
    tick(MAC_DINH_MS);
  }));

  it('dismiss thủ công gỡ đúng thông báo theo id', fakeAsync(() => {
    service.show('Thông báo A', 'info', 0);
    service.show('Thông báo B', 'info', 0);
    const idA = service.messages()[0].id;

    service.dismiss(idA);
    expect(noiDung()).toEqual(['Thông báo B']);

    // Gỡ id không tồn tại không ảnh hưởng hàng đợi.
    service.dismiss(9999);
    expect(noiDung()).toEqual(['Thông báo B']);
  }));

  it('timeout của thông báo đã bị gỡ thủ công không gỡ nhầm thông báo khác', fakeAsync(() => {
    service.show('Thông báo A', 'info', 1000);
    service.dismiss(service.messages()[0].id);
    service.show('Thông báo B', 'info', 0);

    tick(1000);
    expect(noiDung()).toEqual(['Thông báo B']);
  }));

  it('clear xóa toàn bộ hàng đợi', fakeAsync(() => {
    service.show('Thông báo A', 'info', 0);
    service.show('Thông báo B', 'info', 0);

    service.clear();
    expect(noiDung()).toEqual([]);
  }));
});
