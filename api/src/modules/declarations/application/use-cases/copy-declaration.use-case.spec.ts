import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DeclarationStatus, DeclarationType } from '../../domain/declaration.enums';
import {
  FakeDossierAttachments,
  InMemoryDeclarationRepository,
  makeAccess,
  makeDeclaration,
} from '../../testing/declaration.fixture';
import { CopyDeclarationUseCase } from './copy-declaration.use-case';
import { CreateDeclarationUseCase } from './create-declaration.use-case';
import { DossierScopeService } from '../services/dossier-scope.service';

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

describe('CopyDeclarationUseCase (Sao chép hồ sơ)', () => {
  const access = makeAccess({ userId: 'user-enterprise-1' });

  it('chỉ ghi nhận 01 log DECLARATION_COPY (không ghi log DECLARATION_CREATE)', async () => {
    const source = makeDeclaration({
      id: 'dossier-source-1',
      code: 'EXP-20260824-000001',
      type: DeclarationType.EXPORT,
      status: DeclarationStatus.COMPLETED,
      createdById: 'user-enterprise-1',
      enterprise: { taxCode: '0101234567', name: 'Công ty ABC' },
      vehicles: [{ plateNumber: '29B-1234' }],
    });

    const declarations = new InMemoryDeclarationRepository([source]);
    const scope = new DossierScopeService(new DataScopeService());
    const audit = new RecordingAudit();
    const createUseCase = new CreateDeclarationUseCase(declarations, audit);
    const copyUseCase = new CopyDeclarationUseCase(
      declarations,
      new FakeDossierAttachments(),
      scope,
      createUseCase,
      audit,
    );

    const result = await copyUseCase.execute({
      declarationId: source.id,
      access,
      actorId: 'user-enterprise-1',
      actorRole: 'ENTERPRISE',
    });

    expect(result.id).toBeDefined();
    expect(result.id).not.toBe(source.id);
    expect(result.code).not.toBe(source.code);
    expect(result.status).toBe(DeclarationStatus.DRAFT);

    // Kiểm tra chỉ có duy nhất 1 log DECLARATION_COPY được ghi nhận với đối tượng là hồ sơ gốc
    expect(audit.entries.length).toBe(1);
    expect(audit.entries[0].action).toBe('DECLARATION_COPY');
    expect(audit.entries[0].targetId).toBe(source.id);
    expect(audit.entries[0].after).toMatchObject({
      sourceCode: source.code,
      copiedCode: result.code,
    });
  });

  it('SG-269: Admin sao chép hồ sơ thay Doanh nghiệp thì Doanh nghiệp vẫn nhìn thấy và truy cập được hồ sơ mới', async () => {
    const source = makeDeclaration({
      id: 'dossier-source-2',
      code: 'EXP-20260824-000002',
      type: DeclarationType.EXPORT,
      status: DeclarationStatus.COMPLETED,
      createdById: 'user-enterprise-1',
      enterprise: { taxCode: '0101234567', name: 'Công ty ABC' },
      vehicles: [{ plateNumber: '29B-5678' }],
    });

    const declarations = new InMemoryDeclarationRepository([source]);
    const scope = new DossierScopeService(new DataScopeService());
    const audit = new RecordingAudit();
    const createUseCase = new CreateDeclarationUseCase(declarations, audit);
    const copyUseCase = new CopyDeclarationUseCase(
      declarations,
      new FakeDossierAttachments(),
      scope,
      createUseCase,
      audit,
    );

    const adminAccess = makeAccess({
      userId: 'admin-user-id',
      roles: [{ code: 'SYS_ADMIN', name: 'Quản trị viên', dataScope: DataScopeLevel.ALL }],
    });

    const result = await copyUseCase.execute({
      declarationId: source.id,
      access: adminAccess,
      actorId: 'admin-user-id',
      actorRole: 'SYS_ADMIN',
    });

    expect(result.id).toBeDefined();
    expect(result.enterprise.taxCode).toBe('0101234567');

    // Doanh nghiệp đăng nhập với taxCode được gán
    const enterpriseAccess = makeAccess({
      userId: 'user-enterprise-1',
      assignments: [{ type: AssignmentType.TAX_CODE, value: '0101234567' }],
    });

    const savedDecl = await declarations.findById(result.id);
    expect(savedDecl).toBeDefined();
    if (savedDecl) {
      expect(scope.isAccessible(savedDecl, enterpriseAccess)).toBe(true);
    }

    const criteria = scope.toCriteria(enterpriseAccess);
    expect(criteria.taxCodes).toContain('0101234567');
  });

  it('SG-281: Sao chép hồ sơ của tài khoản INTERNAL bảo toàn accountType, email, jobTitle, department', async () => {
    const source = makeDeclaration({
      id: 'dossier-internal-1',
      code: 'INT-20260824-000003',
      type: DeclarationType.EXPORT,
      status: DeclarationStatus.COMPLETED,
      createdById: 'user-internal-1',
      enterprise: {
        taxCode: '',
        name: 'Cán bộ A',
        email: 'staff@smartgate.vn',
        accountType: 'INTERNAL',
        jobTitle: 'Kiểm hóa viên',
        department: 'Chi cục Hải quan',
      },
      vehicles: [{ plateNumber: '29B-5678' }],
    });

    const declarations = new InMemoryDeclarationRepository([source]);
    const scope = new DossierScopeService(new DataScopeService());
    const audit = new RecordingAudit();
    const createUseCase = new CreateDeclarationUseCase(declarations, audit);
    const copyUseCase = new CopyDeclarationUseCase(
      declarations,
      new FakeDossierAttachments(),
      scope,
      createUseCase,
      audit,
    );

    const access = makeAccess({
      userId: 'user-internal-1',
      roles: [{ code: 'HAI_QUAN_B1', name: 'Hải quan', dataScope: DataScopeLevel.ALL }],
    });

    const result = await copyUseCase.execute({
      declarationId: source.id,
      access,
      actorId: 'user-internal-1',
      actorRole: 'HAI_QUAN_B1',
    });

    expect(result.id).toBeDefined();
    expect(result.enterprise.accountType).toBe('INTERNAL');
    expect(result.enterprise.email).toBe('staff@smartgate.vn');
    expect(result.enterprise.jobTitle).toBe('Kiểm hóa viên');
    expect(result.enterprise.department).toBe('Chi cục Hải quan');
  });

  it('SG-281: Sao chép hồ sơ của tài khoản INDIVIDUAL bảo toàn accountType, idNumber, createForOther', async () => {
    const source = makeDeclaration({
      id: 'dossier-individual-1',
      code: 'IND-20260824-000004',
      type: DeclarationType.IMPORT,
      status: DeclarationStatus.COMPLETED,
      createdById: 'user-ind-1',
      enterprise: {
        taxCode: '',
        idNumber: '038090001234',
        name: 'Nguyễn Văn B',
        accountType: 'INDIVIDUAL',
        createForOther: true,
      },
      vehicles: [{ plateNumber: '29B-9999' }],
    });

    const declarations = new InMemoryDeclarationRepository([source]);
    const scope = new DossierScopeService(new DataScopeService());
    const audit = new RecordingAudit();
    const createUseCase = new CreateDeclarationUseCase(declarations, audit);
    const copyUseCase = new CopyDeclarationUseCase(
      declarations,
      new FakeDossierAttachments(),
      scope,
      createUseCase,
      audit,
    );

    const access = makeAccess({
      userId: 'user-ind-1',
      roles: [{ code: 'DOANH_NGHIEP', name: 'Người khai', dataScope: DataScopeLevel.ALL }],
    });

    const result = await copyUseCase.execute({
      declarationId: source.id,
      access,
      actorId: 'user-ind-1',
      actorRole: 'DOANH_NGHIEP',
    });

    expect(result.id).toBeDefined();
    expect(result.enterprise.accountType).toBe('INDIVIDUAL');
    expect(result.enterprise.idNumber).toBe('038090001234');
    expect(result.enterprise.createForOther).toBe(true);
  });
});
