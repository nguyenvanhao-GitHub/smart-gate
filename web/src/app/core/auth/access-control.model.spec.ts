import { firstMenuRoute, hasAnyPermission, MenuItem, menuTrail, PERMISSION } from './access-control.model';

/**
 * Ba hàm thuần này quyết định: có được vào route không (`hasAnyPermission`),
 * vào đâu sau khi đăng nhập (`firstMenuRoute`) và breadcrumb đang ở đâu (`menuTrail`).
 */

const MENU_LONG_2_CAP: MenuItem[] = [
  {
    key: 'dossier',
    label: 'Hồ sơ',
    icon: 'description',
    route: '',
    children: [
      { key: 'dossier-list', label: 'Danh sách hồ sơ', icon: 'list', route: '/declarations' },
      { key: 'dossier-new', label: 'Tạo hồ sơ', icon: 'add', route: '/declarations/new' },
    ],
  },
  { key: 'fee', label: 'Thu phí', icon: 'payments', route: '/fees/tax' },
];

describe('access-control.model — hàm phân quyền thuần', () => {
  // ---------------------------------------------------------------------------
  describe('hasAnyPermission', () => {
    it('một mã quyền — có thì true, không có thì false', () => {
      expect(hasAnyPermission(['dossier.view'], 'dossier.view')).toBe(true);
      expect(hasAnyPermission(['dossier.view'], 'dossier.approve')).toBe(false);
    });

    it('mảng mã quyền — chỉ cần có BẤT KỲ mã nào', () => {
      expect(hasAnyPermission(['fee.approve'], ['fee.view', 'fee.approve'])).toBe(true);
      expect(hasAnyPermission(['dossier.view'], ['fee.view', 'fee.approve'])).toBe(false);
    });

    it('yêu cầu quyền rỗng (null/undefined/mảng rỗng) thì TỪ CHỐI — fail-closed', () => {
      // "có bất kỳ quyền nào trong danh sách" mà danh sách rỗng thì không mã nào thỏa mãn.
      // Ngữ nghĩa "không ràng buộc" của route do `authGuard` tự xử lý, không nằm ở hàm này.
      expect(hasAnyPermission([], null)).toBe(false);
      expect(hasAnyPermission([], undefined)).toBe(false);
      expect(hasAnyPermission([], [])).toBe(false);
      expect(hasAnyPermission(['dossier.view'], [])).toBe(false);
      expect(hasAnyPermission(['dossier.view'], '')).toBe(false);
    });

    it('người dùng chưa có quyền nào thì mọi yêu cầu cụ thể đều bị từ chối', () => {
      expect(hasAnyPermission([], 'system.view')).toBe(false);
      expect(hasAnyPermission([], [PERMISSION.systemView, PERMISSION.systemUpdate])).toBe(false);
    });

    it('so khớp chính xác mã quyền, không so theo tiền tố', () => {
      expect(hasAnyPermission(['dossier.view'], 'dossier')).toBe(false);
      expect(hasAnyPermission(['dossier.viewer'], 'dossier.view')).toBe(false);
      expect(hasAnyPermission(['Dossier.View'], 'dossier.view')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('firstMenuRoute', () => {
    it('bỏ qua mục cha không có route và lấy mục con đầu tiên', () => {
      expect(firstMenuRoute(MENU_LONG_2_CAP)).toBe('/declarations');
    });

    it('menu rỗng thì trả về chuỗi rỗng', () => {
      expect(firstMenuRoute([])).toBe('');
    });

    it('mục cha có route thì lấy luôn route của cha, không xuống con', () => {
      const menu: MenuItem[] = [
        {
          key: 'ops',
          label: 'Nghiệp vụ',
          icon: 'work',
          route: '/operations',
          children: [{ key: 'b1', label: 'Hải quan B1', icon: 'gavel', route: '/operations/customs-b1' }],
        },
      ];
      expect(firstMenuRoute(menu)).toBe('/operations');
    });

    it('toàn bộ nhánh đầu không có route thì chuyển sang mục kế tiếp', () => {
      const menu: MenuItem[] = [
        { key: 'nhom-rong', label: 'Nhóm rỗng', icon: 'folder', route: '', children: [] },
        { key: 'fee', label: 'Thu phí', icon: 'payments', route: '/fees/tax' },
      ];
      expect(firstMenuRoute(menu)).toBe('/fees/tax');
    });

    it('menu chỉ toàn mục cha không route thì trả về chuỗi rỗng', () => {
      const menu: MenuItem[] = [
        { key: 'a', label: 'A', icon: 'folder', route: '' },
        { key: 'b', label: 'B', icon: 'folder', route: '', children: [{ key: 'c', label: 'C', icon: 'folder', route: '' }] },
      ];
      expect(firstMenuRoute(menu)).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  describe('menuTrail', () => {
    it('trả về đường dẫn nhãn từ cha xuống con', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/declarations').map((item) => item.label)).toEqual(['Hồ sơ', 'Danh sách hồ sơ']);
    });

    it('mục khớp CHÍNH XÁC thắng mục khớp theo tiền tố đứng trước nó', () => {
      // '/declarations/new' trùng khít mục "Tạo hồ sơ"; "Danh sách hồ sơ" (route '/declarations')
      // đứng trước và chỉ khớp theo tiền tố nên không được chọn.
      expect(menuTrail(MENU_LONG_2_CAP, '/declarations/new').map((item) => item.label)).toEqual(['Hồ sơ', 'Tạo hồ sơ']);
    });

    it('nhiều mục khớp tiền tố thì chọn mục có route dài nhất (cụ thể nhất)', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/declarations/new/buoc-2').map((item) => item.label)).toEqual([
        'Hồ sơ',
        'Tạo hồ sơ',
      ]);
      expect(menuTrail(MENU_LONG_2_CAP, '/declarations/HS-001').map((item) => item.label)).toEqual([
        'Hồ sơ',
        'Danh sách hồ sơ',
      ]);
    });

    it('mục cha có route vẫn nhường cho mục con khớp cụ thể hơn', () => {
      const menu: MenuItem[] = [
        {
          key: 'ops',
          label: 'Nghiệp vụ',
          icon: 'work',
          route: '/operations',
          children: [{ key: 'b1', label: 'Hải quan B1', icon: 'gavel', route: '/operations/customs-b1' }],
        },
      ];
      expect(menuTrail(menu, '/operations/customs-b1/123').map((item) => item.label)).toEqual([
        'Nghiệp vụ',
        'Hải quan B1',
      ]);
      expect(menuTrail(menu, '/operations/khac').map((item) => item.label)).toEqual(['Nghiệp vụ']);
    });

    it('mục một cấp trả về đúng một nhãn', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/fees/tax').map((item) => item.label)).toEqual(['Thu phí']);
    });

    it('bỏ qua query string và fragment khi so khớp', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/fees/tax?trang=2#dau-trang').map((item) => item.label)).toEqual(['Thu phí']);
    });

    it('khớp cả route con không khai trong menu (tiền tố có dấu /)', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/fees/tax/123').map((item) => item.label)).toEqual(['Thu phí']);
    });

    it('không khớp nhầm route có cùng tiền tố chuỗi', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/fees/taxes')).toEqual([]);
    });

    it('màn hình thu phí theo hồ sơ /declarations/:id/fees ánh xạ sang menu Thu phí', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/declarations/db84b297-616e-47af-ae86-2188f9467f3a/fees').map((item) => item.label)).toEqual(['Thu phí']);

      const menuCoCon: MenuItem[] = [
        {
          key: 'dossier',
          label: 'Hồ sơ',
          icon: 'description',
          route: '/declarations',
        },
        {
          key: 'fee',
          label: 'Thu phí',
          icon: 'payments',
          route: '/fees/tax',
          children: [
            { key: 'fee-collect', label: 'Thu phí tờ khai', icon: 'payments', route: '/fees/tax' },
            { key: 'fee-rules', label: 'Quản trị biểu phí', icon: 'request_quote', route: '/fees/rules' },
          ],
        },
      ];
      expect(menuTrail(menuCoCon, '/declarations/db84b297-616e-47af-ae86-2188f9467f3a/fees').map((item) => item.label)).toEqual([
        'Thu phí',
        'Thu phí tờ khai',
      ]);
    });

    it('url không thuộc menu thì trả mảng rỗng', () => {
      expect(menuTrail(MENU_LONG_2_CAP, '/admin/users')).toEqual([]);
    });
  });
});
