
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DeclarationStatus, DeclarationType } from '../../domain/declaration.enums';
import { InMemoryDeclarationRepository, makeDeclaration } from '../../testing/declaration.fixture';
import { CreateDeclarationUseCase } from './create-declaration.use-case';

class SilentAudit implements AuditLogger {
  async record(_entry: AuditEntryInput): Promise<void> {}
}

describe('CreateDeclarationUseCase (SG-282 & SG-115)', () => {
  it('cho phép tạo hồ sơ nháp ngay cả khi biển số phương tiện đang thuộc hồ sơ chưa kết thúc (SG-282)', async () => {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({
        id: 'decl-active-1',
        code: 'IMP-20260814-000001',
        status: DeclarationStatus.PROCESSING,
        vehicles: [{ plateNumber: '29B-1920' }],
      }),
    ]);
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit());

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: { taxCode: '0101234567', name: 'Công ty ABC' },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'user-01',
      actorRole: 'ENTERPRISE',
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe(DeclarationStatus.DRAFT);
    expect(result.vehicles[0].plateNumber).toBe('29B-1920');
  });

  it('cho phép tạo hồ sơ nháp ngay cả khi số CCCD lái xe đang thuộc hồ sơ chưa kết thúc (SG-282)', async () => {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({
        id: 'decl-active-2',
        code: 'IMP-20260814-000002',
        status: DeclarationStatus.WAITING_FOR_FEE,
        vehicles: [
          {
            plateNumber: '29C-123.45',
            driver: {
              fullName: 'Nguyễn Văn A',
              idNumber: '01928283938',
              idType: 'CCCD',
              phone: '0912345678',
              licenseNumber: 'GPLX-01',
              nationality: 'VNM',
            },
          },
        ],
      }),
    ]);
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit());

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: { taxCode: '0101234567', name: 'Công ty ABC' },
      vehicles: [
        {
          plateNumber: '30A-999.99',
          vehicleType: 'TRUCK',
          driver: {
            fullName: 'Nguyễn Văn A',
            idNumber: '01928283938',
            idType: 'CCCD',
            phone: '0912345678',
            licenseNumber: 'GPLX-01',
            nationality: 'VNM',
          },
        },
      ],
      actorId: 'user-01',
      actorRole: 'ENTERPRISE',
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe(DeclarationStatus.DRAFT);
  });

  it('cho phép tạo hồ sơ nếu hồ sơ cũ cùng biển số/CCCD đã kết thúc (COMPLETED hoặc REJECTED)', async () => {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({
        id: 'decl-completed-1',
        code: 'IMP-20260814-000003',
        status: DeclarationStatus.COMPLETED,
        vehicles: [{ plateNumber: '29B-1920' }],
      }),
    ]);
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit());

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: { taxCode: '0101234567', name: 'Công ty ABC' },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'user-01',
      actorRole: 'ENTERPRISE',
    });

    expect(result.id).toBeDefined();
    expect(result.vehicles[0].plateNumber).toBe('29B-1920');
  });

  it('cho phép sao chép (skipConflictCheck: true) ngay cả khi biển số đang ở hồ sơ chưa kết thúc', async () => {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({
        id: 'decl-active-3',
        code: 'IMP-20260814-000004',
        status: DeclarationStatus.PROCESSING,
        vehicles: [{ plateNumber: '29B-1920' }],
      }),
    ]);
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit());

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: { taxCode: '0101234567', name: 'Công ty ABC' },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'user-01',
      actorRole: 'ENTERPRISE',
      skipConflictCheck: true,
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe(DeclarationStatus.DRAFT);
  });

  it('bỏ qua ghi nhận log DECLARATION_CREATE khi skipAudit = true', async () => {
    class RecordingAudit implements AuditLogger {
      readonly entries: AuditEntryInput[] = [];
      async record(entry: AuditEntryInput): Promise<void> {
        this.entries.push(entry);
      }
    }
    const declarations = new InMemoryDeclarationRepository();
    const audit = new RecordingAudit();
    const useCase = new CreateDeclarationUseCase(declarations, audit);

    await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: { taxCode: '0101234567', name: 'Công ty ABC' },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'user-01',
      actorRole: 'ENTERPRISE',
      skipAudit: true,
    });

    expect(audit.entries.length).toBe(0);
  });

  it('gán đúng createdById khi admin khai hộ cho cá nhân (accountType = INDIVIDUAL)', async () => {
    class MockLinker {
      async resolveAccountId(input: any): Promise<string | null> {
        if (input.accountType === 'INDIVIDUAL' && input.idNumber === '038090001234') {
          return 'individual-user-id';
        }
        return null;
      }
    }
    const declarations = new InMemoryDeclarationRepository();
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit(), new MockLinker() as any);

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: {
        taxCode: '',
        idNumber: '038090001234',
        name: 'Trần Văn C',
        accountType: 'INDIVIDUAL',
        createForOther: true,
      },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'admin-user-id',
      actorRole: 'SYS_ADMIN',
    });

    const saved = await declarations.findById(result.id);
    expect(saved?.createdById).toBe('individual-user-id');
  });

  it('gán đúng createdById khi admin khai hộ cho doanh nghiệp (accountType = ENTERPRISE)', async () => {
    class MockLinker {
      async resolveAccountId(input: any): Promise<string | null> {
        if (input.accountType === 'ENTERPRISE' && input.taxCode === '0109998888') {
          return 'enterprise-user-id';
        }
        return null;
      }
    }
    const declarations = new InMemoryDeclarationRepository();
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit(), new MockLinker() as any);

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: {
        taxCode: '0109998888',
        name: 'Công ty XYZ',
        accountType: 'ENTERPRISE',
        createForOther: true,
      },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'admin-user-id',
      actorRole: 'SYS_ADMIN',
    });

    const saved = await declarations.findById(result.id);
    expect(saved?.createdById).toBe('enterprise-user-id');
  });

  it('gán đúng createdById khi khai hộ cho cán bộ nội bộ (accountType = INTERNAL)', async () => {
    class MockLinker {
      async resolveAccountId(input: any): Promise<string | null> {
        if (input.accountType === 'INTERNAL' && input.email === 'canbo@smartgate.vn') {
          return 'internal-user-id';
        }
        return null;
      }
    }
    const declarations = new InMemoryDeclarationRepository();
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit(), new MockLinker() as any);

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: {
        email: 'canbo@smartgate.vn',
        name: 'Cán bộ X',
        accountType: 'INTERNAL',
        createForOther: true,
      },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'admin-user-id',
      actorRole: 'SYS_ADMIN',
    });

    const saved = await declarations.findById(result.id);
    expect(saved?.createdById).toBe('internal-user-id');
  });

  it('không liên kết tài khoản khi role thường dù body gửi createForOther = true', async () => {
    const resolveSpy = jest.fn();
    class MockLinker {
      async resolveAccountId(input: any): Promise<string | null> {
        resolveSpy(input);
        return 'someone-else-id';
      }
    }
    const declarations = new InMemoryDeclarationRepository();
    const useCase = new CreateDeclarationUseCase(declarations, new SilentAudit(), new MockLinker() as any);

    const result = await useCase.execute({
      type: DeclarationType.IMPORT,
      enterprise: {
        taxCode: '0109998888',
        name: 'Công ty ABC',
        accountType: 'ENTERPRISE',
        createForOther: true,
      },
      vehicles: [{ plateNumber: '29B-1920', vehicleType: 'TRUCK' }],
      actorId: 'regular-user-id',
      actorRole: 'DECLARANT',
    });

    expect(resolveSpy).not.toHaveBeenCalled();
    const saved = await declarations.findById(result.id);
    expect(saved?.createdById).toBe('regular-user-id');
  });
});
