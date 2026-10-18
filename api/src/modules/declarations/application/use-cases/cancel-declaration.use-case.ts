import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { UserAccessContext } from '../../../../common/auth/access-context';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { Declaration } from '../../domain/declaration.entity';
import { DeclarationStatus } from '../../domain/declaration.enums';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { DossierScopeService } from '../services/dossier-scope.service';
import { appConflict, appNotFound } from '../../../../common/i18n';

@Injectable()
export class CancelDeclarationUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
  ) {}

  async execute(
    id: string,
    actorId: string,
    actorRole: string,
    note?: string,
    access?: UserAccessContext,
  ): Promise<Declaration> {
    const declaration = await this.declarations.findById(id);
    if (!declaration) throw appNotFound('dossier.notFound');
    if (access) {
      this.scope.assertAccessible(declaration, access);
    }

    // SG-209: Doanh nghiệp chỉ được phép hủy hồ sơ khi ở trạng thái Chờ vào cổng (SUBMITTED / WAITING_GATE) hoặc nháp (DRAFT).
    // Khi xe đã được Biên phòng duyệt vào cổng (chuyển sang WAITING_CALL hoặc các trạng thái sau), không được phép hủy.
    const allowedStatuses: string[] = [
      DeclarationStatus.SUBMITTED,
      DeclarationStatus.WAITING_GATE,
      DeclarationStatus.DRAFT,
    ];
    if (!allowedStatuses.includes(declaration.status)) {
      throw appConflict('dossier.cannotCancelPastGate');
    }

    const before = { status: declaration.status, code: declaration.code };
    declaration.cancel(actorId, actorRole, note);
    const saved = await this.declarations.save(declaration);

    await this.audit.record({
      action: 'DECLARATION_CANCEL',
      targetType: 'DECLARATION',
      targetId: saved.id,
      actorId,
      actorRole,
      result: AuditResult.SUCCESS,
      before,
      after: { status: saved.status, code: saved.code, note },
    });
    await this.notifications.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      titleKey: 'notification.dossierCancelledTitle',
      titleParams: { code: saved.code },
      contentKey: 'notification.dossierCancelledContent',
      contentParams: { note: note?.trim() || 'notification.dossierCancelledDefaultNote' },
      dossierId: saved.id,
      dossierCode: saved.code,
      ownerUserId: saved.createdById,
      enterpriseTaxCode: saved.enterprise.taxCode,
    });
    return saved;
  }
}
