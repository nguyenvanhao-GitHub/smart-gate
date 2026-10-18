import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { NotificationPublisher } from '../../../../common/notifications/notification-publisher.port';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DeclarationStatus } from '../../domain/declaration.enums';
import { InMemoryDeclarationRepository, makeAccess, makeDeclaration } from '../../testing/declaration.fixture';
import { DossierScopeService } from '../services/dossier-scope.service';
import { CancelDeclarationUseCase } from './cancel-declaration.use-case';

class SilentAudit implements AuditLogger {
  readonly records: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.records.push(entry);
  }
}

class SilentNotifications implements NotificationPublisher {
  readonly published: any[] = [];
  async publish(item: any): Promise<void> {
    this.published.push(item);
  }
}

const enterpriseUser = makeAccess({
  userId: 'dn-user-1',
  roles: [{ code: 'DOANH_NGHIEP', name: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN }],
  permissions: ['dossier.update', 'dossier.delete'],
});

const otherEnterpriseUser = makeAccess({
  userId: 'dn-user-2',
  roles: [{ code: 'DOANH_NGHIEP', name: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN }],
  permissions: ['dossier.update', 'dossier.delete'],
});

const adminUser = makeAccess({
  userId: 'admin-1',
  roles: [{ code: 'ADMIN', name: 'Quản trị', dataScope: DataScopeLevel.ALL }],
  permissions: ['dossier.update', 'dossier.delete'],
});

describe('CancelDeclarationUseCase (SG-130)', () => {
  function build() {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({
        id: 'hs-waiting-gate',
        code: 'HS-WAIT-001',
        status: DeclarationStatus.WAITING_GATE,
        createdById: 'dn-user-1',
      }),
    ]);
    const scope = new DossierScopeService(new DataScopeService());
    const audit = new SilentAudit();
    const notifications = new SilentNotifications();
    const useCase = new CancelDeclarationUseCase(declarations, scope, audit, notifications);
    return { declarations, useCase, audit, notifications };
  }

  it('Doanh nghiệp sở hữu có thể hủy hồ sơ ở trạng thái WAITING_GATE', async () => {
    const { useCase, declarations, audit, notifications } = build();

    const result = await useCase.execute(
      'hs-waiting-gate',
      'dn-user-1',
      'DOANH_NGHIEP',
      'Doanh nghiệp yêu cầu hủy',
      enterpriseUser,
    );

    expect(result.status).toBe(DeclarationStatus.CANCELLED);
    const saved = await declarations.findById('hs-waiting-gate');
    expect(saved?.status).toBe(DeclarationStatus.CANCELLED);
    expect(audit.records.length).toBe(1);
    expect(audit.records[0].action).toBe('DECLARATION_CANCEL');
    expect(notifications.published.length).toBe(1);
  });

  it('Admin có thể hủy hồ sơ của bất kỳ doanh nghiệp nào', async () => {
    const { useCase, declarations } = build();

    const result = await useCase.execute(
      'hs-waiting-gate',
      'admin-1',
      'ADMIN',
      'Admin hủy hồ sơ theo yêu cầu',
      adminUser,
    );

    expect(result.status).toBe(DeclarationStatus.CANCELLED);
    const saved = await declarations.findById('hs-waiting-gate');
    expect(saved?.status).toBe(DeclarationStatus.CANCELLED);
  });

  it('Doanh nghiệp khác không thể hủy hồ sơ không thuộc về mình', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute(
        'hs-waiting-gate',
        'dn-user-2',
        'DOANH_NGHIEP',
        'Hủy trộm',
        otherEnterpriseUser,
      ),
    ).rejects.toThrow();
  });

  it('SG-209 — Không cho phép hủy hồ sơ khi xe đã được duyệt vào cổng (trạng thái WAITING_CALL)', async () => {
    const { useCase, declarations } = build();
    const hsWaitingCall = makeDeclaration({
      id: 'hs-waiting-call',
      code: 'HS-CALL-001',
      status: DeclarationStatus.WAITING_CALL,
      createdById: 'dn-user-1',
    });
    await declarations.save(hsWaitingCall);

    await expect(
      useCase.execute(
        'hs-waiting-call',
        'dn-user-1',
        'DOANH_NGHIEP',
        'Yêu cầu hủy sau khi vào cổng',
        enterpriseUser,
      ),
    ).rejects.toThrow('Hồ sơ chỉ được phép hủy khi ở trạng thái "Chờ vào cổng". Khi xe đã được duyệt vào cổng, không thể hủy hồ sơ.');
  });
});
