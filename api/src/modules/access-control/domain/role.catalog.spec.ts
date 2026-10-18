import { MENU_CATALOG } from './menu.catalog';
import { PermissionModuleCode } from './permission.catalog';
import { ROLE_CATALOG, findRoleDefinition, permissionsForRole } from './role.catalog';

/**
 * Khóa ma trận quyền của vai trò ENTERPRISE sau BUG-032/BUG-015: doanh nghiệp chỉ thao tác hồ sơ
 * của chính mình, không được chạm phân hệ liên ngành/điều phối/cổng/kho bãi/thu phí/báo cáo/danh
 * mục/hệ thống. Đây là dữ liệu seed nên sai một mã là mở toang màn hình cho DN — test này chặn.
 */
describe('ROLE_CATALOG — vai trò tài khoản ngoài hệ thống', () => {
  const enterprise = findRoleDefinition('ENTERPRISE')!;
  const individual = findRoleDefinition('INDIVIDUAL')!;

  it('chỉ có đúng 5 mã quyền hồ sơ, không dư', () => {
    expect(permissionsForRole(enterprise)).toEqual([
      'dossier.create',
      'dossier.delete',
      'dossier.export',
      'dossier.update',
      'dossier.view',
    ]);
  });

  it('không có bất kỳ quyền nào ngoài phân hệ hồ sơ', () => {
    const nonDossier = permissionsForRole(enterprise).filter(
      (code) => !code.startsWith(`${PermissionModuleCode.DOSSIER}.`),
    );
    expect(nonDossier).toEqual([]);
  });

  it('cá nhân có cùng tập quyền hồ sơ OWN với doanh nghiệp, không có quyền nội bộ', () => {
    expect(permissionsForRole(individual)).toEqual(permissionsForRole(enterprise));
  });

  it.each([
    'workflow.view',
    'queue.view',
    'dispatch.view',
    'gate.view',
    'yard.view',
    'fee.view',
    'report.view',
    'catalog.view',
    'system.view',
    'dossier.approve',
  ])('không được cấp %s', (code) => {
    expect(permissionsForRole(enterprise)).not.toContain(code);
  });

  it('menu suy ra từ quyền: DN chỉ thấy mục "Hồ sơ", không thấy Danh mục/Liên ngành/Điều phối/Cổng/Kho bãi/Báo cáo/Hệ thống', () => {
    const permissions = permissionsForRole(enterprise);
    const visible = MENU_CATALOG.filter((item) => permissions.includes(item.permission)).map((item) => item.code);
    expect(visible).toEqual(['dossier']);
  });

  it('mọi vai trò lực lượng khác vẫn giữ catalog.view để dựng bộ lọc/dropdown', () => {
    const others = ROLE_CATALOG.filter((role) => !['ENTERPRISE', 'INDIVIDUAL'].includes(role.code));
    for (const role of others) {
      expect(permissionsForRole(role)).toContain('catalog.view');
    }
  });
});
