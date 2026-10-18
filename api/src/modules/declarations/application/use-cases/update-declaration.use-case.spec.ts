import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DeclarationStatus, DeclarationType } from '../../domain/declaration.enums';
import { InMemoryDeclarationRepository, makeAccess, makeDeclaration } from '../../testing/declaration.fixture';
import { DossierScopeService } from '../services/dossier-scope.service';
import { UpdateDeclarationUseCase } from './update-declaration.use-case';

class SilentAudit implements AuditLogger {
  async record(_entry: AuditEntryInput): Promise<void> {
    // Không cần hành vi cho test này.
  }
}

const admin = makeAccess({
  userId: 'admin',
  roles: [{ code: 'ADMIN', name: 'Quản trị', dataScope: DataScopeLevel.ALL }],
  permissions: ['dossier.update'],
});

/** CR8 — một xe/hồ sơ: `vehicles` gửi lên bị khóa max-1, chỉ giữ xe đầu. */
describe('Cập nhật phương tiện vận chuyển (một xe/hồ sơ)', () => {
  function build() {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001', status: DeclarationStatus.DRAFT }),
    ]);
    const scope = new DossierScopeService(new DataScopeService());
    const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope);
    return { declarations, useCase };
  }

  it('khóa max-1: gửi nhiều xe chỉ giữ xe đầu, đồng bộ cột tóm tắt', async () => {
    const { useCase, declarations } = build();

    const result = await useCase.execute({
      declarationId: 'ho-so-1',
      vehicles: [{ plateNumber: '29C-000.01' }, { plateNumber: '29C-000.02' }],
      access: admin,
    });

    expect(result.vehicles.map((item) => item.plateNumber)).toEqual(['29C-000.01']);
    expect(result.vehicle.plateNumber).toBe('29C-000.01');
    const stored = await declarations.findById('ho-so-1');
    expect(stored?.plateNumbers).toEqual(['29C-000.01']);
  });

  it('thay đổi loại hồ sơ ở trạng thái nháp sẽ sinh lại mã hồ sơ theo tiền tố loại mới', async () => {
    const { useCase, declarations } = build();

    const result = await useCase.execute({
      declarationId: 'ho-so-1',
      type: DeclarationType.EXPORT,
      access: admin,
    });

    expect(result.type).toBe(DeclarationType.EXPORT);
    expect(result.code).toContain('EXP-');
    const stored = await declarations.findById('ho-so-1');
    expect(stored?.type).toBe(DeclarationType.EXPORT);
    expect(stored?.code).toContain('EXP-');
  });

  it('SG-282: cho phép cập nhật hồ sơ nháp ngay cả khi biển số hoặc CCCD thuộc hồ sơ khác chưa kết thúc', async () => {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({
        id: 'ho-so-active',
        code: 'IMP-20260831-000038',
        status: DeclarationStatus.PROCESSING,
        vehicles: [
          {
            plateNumber: '100C1001',
            driver: {
              fullName: 'Trần Quang Tuấn Anh',
              idNumber: '00959686533',
              idType: 'CCCD',
              phone: '031566666',
              licenseNumber: '986532',
              nationality: 'VNM',
            },
          },
        ],
      }),
      makeDeclaration({ id: 'ho-so-draft', code: 'IMP-0002', status: DeclarationStatus.DRAFT }),
    ]);
    const scope = new DossierScopeService(new DataScopeService());
    const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope);

    const result = await useCase.execute({
      declarationId: 'ho-so-draft',
      vehicles: [
        {
          plateNumber: '100C1001',
          driver: {
            fullName: 'Trần Quang Tuấn Anh',
            idNumber: '00959686533',
            idType: 'CCCD',
            phone: '031566666',
            licenseNumber: '986532',
            nationality: 'VNM',
          },
        },
      ],
      access: admin,
    });

    expect(result.id).toBe('ho-so-draft');
    expect(result.vehicles[0].plateNumber).toBe('100C1001');
    expect(result.vehicles[0].driver?.idNumber).toBe('00959686533');
  });

  describe('Cập nhật thông tin định danh và doanh nghiệp (SG-290)', () => {
    class MockLinker {
      async resolveAccountId(input: any): Promise<string | null> {
        if (input.accountType === 'ENTERPRISE' && input.taxCode === '0109998888') {
          return 'enterprise-user-id';
        }
        if (input.accountType === 'INDIVIDUAL' && input.idNumber === '038090001234') {
          return 'individual-user-id';
        }
        if (input.accountType === 'INTERNAL' && input.email === 'canbo@smartgate.vn') {
          return 'internal-user-id';
        }
        return null;
      }
    }

    const sysAdminAccess = makeAccess({
      userId: 'admin-1',
      roles: [{ code: 'SYS_ADMIN', name: 'Quản trị hệ thống', dataScope: DataScopeLevel.ALL }],
      permissions: ['dossier.update'],
    });

    const userAccess = makeAccess({
      userId: 'user-1',
      roles: [{ code: 'ENTERPRISE', name: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN }],
      permissions: ['dossier.update'],
    });

    it('PATCH bộ phận không đổi MST: giữ nguyên các trường thông tin doanh nghiệp cũ', async () => {
      const declarations = new InMemoryDeclarationRepository([
        makeDeclaration({
          id: 'ho-so-dn',
          code: 'IMP-0001',
          status: DeclarationStatus.DRAFT,
          enterprise: {
            taxCode: '0101234567',
            name: 'Công ty Cổ phần Alpha',
            representativeName: 'Nguyễn Văn Alpha',
            address: 'Hà Nội',
            phone: '0901234567',
            accountType: 'ENTERPRISE',
          },
        }),
      ]);
      const scope = new DossierScopeService(new DataScopeService());
      const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope);

      const result = await useCase.execute({
        declarationId: 'ho-so-dn',
        enterprise: {
          email: 'alpha@smartgate.vn',
        },
        access: sysAdminAccess,
      });

      expect(result.enterprise.taxCode).toBe('0101234567');
      expect(result.enterprise.name).toBe('Công ty Cổ phần Alpha');
      expect(result.enterprise.representativeName).toBe('Nguyễn Văn Alpha');
      expect(result.enterprise.address).toBe('Hà Nội');
      expect(result.enterprise.phone).toBe('0901234567');
      expect(result.enterprise.email).toBe('alpha@smartgate.vn');
    });

    it('Đổi MST sang MST mới: reset các trường thông tin và ghi nhận dữ liệu mới gửi lên', async () => {
      const declarations = new InMemoryDeclarationRepository([
        makeDeclaration({
          id: 'ho-so-dn',
          code: 'IMP-0001',
          status: DeclarationStatus.DRAFT,
          enterprise: {
            taxCode: '0101234567',
            name: 'Công ty Cổ phần Alpha',
            representativeName: 'Nguyễn Văn Alpha',
            address: 'Hà Nội',
            phone: '0901234567',
            accountType: 'ENTERPRISE',
          },
        }),
      ]);
      const scope = new DossierScopeService(new DataScopeService());
      const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope);

      const result = await useCase.execute({
        declarationId: 'ho-so-dn',
        enterprise: {
          taxCode: '0109998888',
          name: 'Công ty Beta',
          accountType: 'ENTERPRISE',
        },
        access: sysAdminAccess,
      });

      expect(result.enterprise.taxCode).toBe('0109998888');
      expect(result.enterprise.name).toBe('Công ty Beta');
      expect(result.enterprise.representativeName).toBeNull();
      expect(result.enterprise.address).toBeNull();
      expect(result.enterprise.phone).toBeNull();
    });

    it('Người dùng thường không được dùng createForOther để chuyển quyền sở hữu hồ sơ (createdById)', async () => {
      const declarations = new InMemoryDeclarationRepository([
        makeDeclaration({
          id: 'ho-so-user',
          code: 'IMP-0001',
          createdById: 'user-1',
          status: DeclarationStatus.DRAFT,
          enterprise: {
            taxCode: '0101234567',
            name: 'Công ty Của User',
            accountType: 'ENTERPRISE',
          },
        }),
      ]);
      const scope = new DossierScopeService(new DataScopeService());
      const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope, new MockLinker() as any);

      await useCase.execute({
        declarationId: 'ho-so-user',
        enterprise: {
          taxCode: '0109998888',
          name: 'Công ty Khác',
          createForOther: true,
        },
        access: userAccess,
      });

      const stored = await declarations.findById('ho-so-user');
      expect(stored?.createdById).toBe('user-1');
    });

    it('Admin dùng createForOther: tự động liên kết lại createdById khi đổi MST khớp tài khoản', async () => {
      const declarations = new InMemoryDeclarationRepository([
        makeDeclaration({
          id: 'ho-so-admin',
          code: 'IMP-0001',
          createdById: 'admin-1',
          status: DeclarationStatus.DRAFT,
          enterprise: {
            taxCode: '0101234567',
            name: 'Công ty Cũ',
            accountType: 'ENTERPRISE',
            createForOther: true,
          },
        }),
      ]);
      const scope = new DossierScopeService(new DataScopeService());
      const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope, new MockLinker() as any);

      await useCase.execute({
        declarationId: 'ho-so-admin',
        enterprise: {
          taxCode: '0109998888',
          name: 'Công ty Mới',
          createForOther: true,
        },
        access: sysAdminAccess,
      });

      const stored = await declarations.findById('ho-so-admin');
      expect(stored?.createdById).toBe('enterprise-user-id');
    });

    it('Đổi định danh cá nhân (CCCD) cho hồ sơ INDIVIDUAL: reset và cập nhật thông tin cá nhân', async () => {
      const declarations = new InMemoryDeclarationRepository([
        makeDeclaration({
          id: 'ho-so-ind',
          code: 'IMP-0001',
          createdById: 'admin-1',
          status: DeclarationStatus.DRAFT,
          enterprise: {
            taxCode: '',
            idNumber: '001090001111',
            name: 'Nguyễn Văn Cũ',
            phone: '0911111111',
            accountType: 'INDIVIDUAL',
            createForOther: true,
          },
        }),
      ]);
      const scope = new DossierScopeService(new DataScopeService());
      const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope, new MockLinker() as any);

      const result = await useCase.execute({
        declarationId: 'ho-so-ind',
        enterprise: {
          idNumber: '038090001234',
          name: 'Trần Văn Mới',
          accountType: 'INDIVIDUAL',
          createForOther: true,
        },
        access: sysAdminAccess,
      });

      expect(result.enterprise.idNumber).toBe('038090001234');
      expect(result.enterprise.name).toBe('Trần Văn Mới');
      expect(result.enterprise.phone).toBeNull();
      const stored = await declarations.findById('ho-so-ind');
      expect(stored?.createdById).toBe('individual-user-id');
    });

    it('Đổi loại tài khoản từ ENTERPRISE sang INDIVIDUAL: xóa sạch taxCode để không rò rỉ scope', async () => {
      const declarations = new InMemoryDeclarationRepository([
        makeDeclaration({
          id: 'ho-so-change-type',
          code: 'IMP-0001',
          createdById: 'admin-1',
          status: DeclarationStatus.DRAFT,
          enterprise: {
            taxCode: '0101234567',
            name: 'Công ty Cũ',
            representativeName: 'Đại Diện Cũ',
            accountType: 'ENTERPRISE',
          },
        }),
      ]);
      const scope = new DossierScopeService(new DataScopeService());
      const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope, new MockLinker() as any);

      const result = await useCase.execute({
        declarationId: 'ho-so-change-type',
        enterprise: {
          accountType: 'INDIVIDUAL',
          idNumber: '038090001234',
          name: 'Cá Nhân Mới',
        },
        access: sysAdminAccess,
      });

      expect(result.enterprise.accountType).toBe('INDIVIDUAL');
      expect(result.enterprise.taxCode).toBe('');
      expect(result.enterprise.idNumber).toBe('038090001234');
      expect(result.enterprise.name).toBe('Cá Nhân Mới');
      expect(result.enterprise.representativeName).toBeNull();

      const stored = await declarations.findById('ho-so-change-type');
      expect(stored?.enterprise?.taxCode).toBe('');
      expect(stored?.enterprise?.accountType).toBe('INDIVIDUAL');
      expect(stored?.createdById).toBe('individual-user-id');
    });

    it('Cán bộ đặc quyền sửa MST không truyền cờ createForOther: vẫn tự động relink createdById', async () => {
      const declarations = new InMemoryDeclarationRepository([
        makeDeclaration({
          id: 'ho-so-admin-edit',
          code: 'IMP-0001',
          createdById: 'old-owner-id',
          status: DeclarationStatus.DRAFT,
          enterprise: {
            taxCode: '0101234567',
            name: 'Công ty Cũ',
            accountType: 'ENTERPRISE',
          },
        }),
      ]);
      const scope = new DossierScopeService(new DataScopeService());
      const useCase = new UpdateDeclarationUseCase(declarations, new SilentAudit(), scope, new MockLinker() as any);

      await useCase.execute({
        declarationId: 'ho-so-admin-edit',
        enterprise: {
          taxCode: '0109998888',
          name: 'Công ty Mới',
        },
        access: sysAdminAccess,
      });

      const stored = await declarations.findById('ho-so-admin-edit');
      expect(stored?.createdById).toBe('enterprise-user-id');
    });
  });
});
