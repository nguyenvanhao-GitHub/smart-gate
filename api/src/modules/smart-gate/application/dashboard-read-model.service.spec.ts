import { DataScopeService } from '../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../declarations/domain/declaration.entity';
import { DeclarationStatus } from '../../declarations/domain/declaration.enums';
import { InMemoryDeclarationRepository, makeAccess, makeDeclaration } from '../../declarations/testing/declaration.fixture';
import { DashboardReadModelService } from './dashboard-read-model.service';

/**
 * Dashboard smart gate đọc thẳng **trạng thái hồ sơ** sau khi gỡ cột `forceProgress` (LÔ 5):
 * - `pendingForce` suy nhãn lực lượng đang giữ hồ sơ từ nhóm `WAITING_*`; trạng thái ngoài nhóm chỉ
 *   hiển thị nhãn chung "Đang xử lý", **không bịa** một lực lượng cụ thể.
 * - Cảnh báo "chờ thanh toán phí" đếm đúng số hồ sơ `WAITING_FOR_FEE`.
 */
describe('DashboardReadModelService', () => {
  // Tài khoản phạm vi ALL để không bị lọc dữ liệu (repo trong bộ nhớ trả toàn bộ hồ sơ đã nạp).
  const access = makeAccess({
    userId: 'user-admin',
    roles: [{ code: 'SYS_ADMIN', name: 'Quản trị hệ thống', dataScope: DataScopeLevel.ALL }],
    permissions: ['report.view'],
  });

  const build = (seed: Declaration[]) => {
    const declarations = new InMemoryDeclarationRepository(seed);
    const scope = new DossierScopeService(new DataScopeService());
    return new DashboardReadModelService(declarations, scope);
  };

  // Mỗi trạng thái một hồ sơ, id/biển số riêng để giữ đúng thứ tự và không lẫn.
  const dossierOf = (status: DeclarationStatus, index: number): Declaration =>
    makeDeclaration({ id: `decl-${index}`, status, vehicle: { plateNumber: `26C-000.${index}` } });

  describe('pendingForce — lực lượng đang giữ hồ sơ suy từ trạng thái', () => {
    // Bảng trạng thái → nhãn lực lượng kỳ vọng, khớp với ánh xạ trong service.
    const MAPPING: Array<[DeclarationStatus, string]> = [
      [DeclarationStatus.WAITING_BORDER_GUARD, 'Biên phòng'],
      [DeclarationStatus.WAITING_CUSTOMS, 'Hải quan'],
      [DeclarationStatus.WAITING_QUARANTINE, 'Kiểm dịch'],
      [DeclarationStatus.WAITING_FOR_FEE, 'Thu phí'],
      [DeclarationStatus.READY_FOR_EXIT, 'Hoàn tất'],
      [DeclarationStatus.EXITED, 'Hoàn tất'],
      [DeclarationStatus.COMPLETED, 'Hoàn tất'],
      // Nhánh mặc định: trạng thái không chỉ đích danh lực lượng → nhãn chung, không bịa.
      [DeclarationStatus.SUBMITTED, 'Đang xử lý'],
      [DeclarationStatus.PROCESSING, 'Đang xử lý'],
      [DeclarationStatus.DRAFT, 'Đang xử lý'],
    ];

    it('mỗi trạng thái sinh đúng nhãn lực lượng đang xử lý', async () => {
      const seed = MAPPING.map(([status], index) => dossierOf(status, index));
      const service = build(seed);

      const dto = await service.getChiengKhuongDashboard(access);

      // vehicleRows giữ đúng thứ tự hồ sơ đã nạp (≤ 12 dòng nên hiện đủ).
      MAPPING.forEach(([, expectedForce], index) => {
        expect(dto.vehicleRows[index].force).toBe(expectedForce);
      });
    });
  });

  describe('cảnh báo "chờ thanh toán phí" — đếm đúng WAITING_FOR_FEE', () => {
    it('đếm số hồ sơ đang chờ thu phí, không lẫn các trạng thái khác', async () => {
      const service = build([
        dossierOf(DeclarationStatus.WAITING_FOR_FEE, 1),
        dossierOf(DeclarationStatus.WAITING_FOR_FEE, 2),
        dossierOf(DeclarationStatus.WAITING_FOR_FEE, 3),
        dossierOf(DeclarationStatus.WAITING_CUSTOMS, 4),
        dossierOf(DeclarationStatus.COMPLETED, 5),
      ]);

      const dto = await service.getChiengKhuongDashboard(access);

      const feeAlert = dto.alerts.find((alert) => alert.action === 'OPEN_FEE_PENDING');
      expect(feeAlert?.title).toBe('3 hồ sơ chờ thanh toán phí');
    });

    it('không có hồ sơ chờ thu phí thì cảnh báo về 0', async () => {
      const service = build([dossierOf(DeclarationStatus.WAITING_CUSTOMS, 1)]);

      const dto = await service.getChiengKhuongDashboard(access);

      const feeAlert = dto.alerts.find((alert) => alert.action === 'OPEN_FEE_PENDING');
      expect(feeAlert?.title).toBe('0 hồ sơ chờ thanh toán phí');
    });
  });
});
