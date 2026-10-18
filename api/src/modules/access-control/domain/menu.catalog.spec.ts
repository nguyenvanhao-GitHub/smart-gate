import { MENU_CATALOG } from './menu.catalog';

/**
 * Menu **không** có bảng riêng trong cơ sở dữ liệu: `GetMyAccessUseCase.buildMenu()` đọc thẳng
 * hằng số này rồi lọc theo quyền. Nghĩa là sửa hằng số là có hiệu lực ngay, không cần migration —
 * nhưng cũng nghĩa là không có gì ngăn ai đó sửa nhầm route. Test này khóa các mục dễ lệch.
 */
describe('MENU_CATALOG', () => {
  const itemByCode = (code: string) => MENU_CATALOG.find((item) => item.code === code);

  it('mục "Xử lý liên ngành" trỏ tới hàng đợi liên ngành mới của P3 (UI-06)', () => {
    const workflow = itemByCode('workflow');
    expect(workflow).toBeDefined();
    expect(workflow?.route).toBe('/workflow/queue');
    expect(workflow?.permission).toBe('workflow.view');
  });

  it('mục "Hàng đợi" (P4) đã bị gỡ khỏi menu theo mẫu menu-sidebar — route vẫn tồn tại nhưng không hiện ở menu', () => {
    expect(itemByCode('queue')).toBeUndefined();
    expect(MENU_CATALOG.some((item) => item.route === '/operations/by-role')).toBe(false);
  });

  it('top-level menu khớp thứ tự và nhãn của mẫu menu-sidebar.html', () => {
    expect(MENU_CATALOG.map((item) => item.label)).toEqual([
      'Tổng quan',
      'Hồ sơ',
      'Xử lý liên ngành',
      'Điều phối',
      'Cổng vào/ra',
      'Kho bãi',
      'Thu phí',
      'Báo cáo',
      'Danh mục',
      'Quản trị và cấu hình',
    ]);
  });

  it('nhóm Quản trị và cấu hình có 4 mục con (thêm "Cấu hình chung" — BA-092)', () => {
    expect(itemByCode('system')?.children?.map((child) => child.label)).toEqual([
      'Quản lý người dùng',
      'Phân quyền vai trò',
      'Nhật ký thao tác',
      'Cấu hình chung',
    ]);
  });

  it('mục "Cấu hình chung" trỏ tới màn cấu hình và bám quyền system.view', () => {
    const config = itemByCode('system')?.children?.find((child) => child.code === 'system-config');
    expect(config?.route).toBe('/admin/system-config');
    expect(config?.permission).toBe('system.view');
  });

  it('mục "Cấu hình bãi" trỏ tới /yard/config và bám quyền yard.approve', () => {
    const config = itemByCode('yard')?.children?.find((child) => child.code === 'yard-config');
    expect(config?.route).toBe('/yard/config');
    expect(config?.permission).toBe('yard.approve');
  });

  it('không có mục menu nào trỏ tới route có tham số động', () => {
    MENU_CATALOG.forEach((item) => expect(item.route).not.toContain(':'));
  });

  it('mã mục và thứ tự hiển thị không trùng nhau', () => {
    expect(new Set(MENU_CATALOG.map((item) => item.code)).size).toBe(MENU_CATALOG.length);
    expect(new Set(MENU_CATALOG.map((item) => item.sortOrder)).size).toBe(MENU_CATALOG.length);
  });
});
