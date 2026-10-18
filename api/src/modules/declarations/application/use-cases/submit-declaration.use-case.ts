import { Inject, Injectable, Optional } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { DeclarationType, WorkflowStepCode } from '../../domain/declaration.enums';
import { SubmitDeclarationCommand, SubmitDeclarationResult } from '../dto/submit-declaration.command';
import { DossierScopeService } from '../services/dossier-scope.service';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { ValidateDeclarationUseCase } from './validate-declaration.use-case';
import { appBadRequest, appNotFound } from '../../../../common/i18n';
import {
  WORKFLOW_INSTANCE_REPOSITORY,
  WorkflowInstanceRepository,
} from '../../../workflow/application/ports/workflow-instance.repository';
import { WorkflowRouteService } from '../../../workflow/application/services/workflow-route.service';
import { dossierStatusFor } from '../../../workflow/domain/workflow-status.rules';

/**
 * Gửi hồ sơ (F13 + F14) — điều kiện nghiệm thu P2.
 *
 * Hồ sơ thiếu dữ liệu bị **chặn ở API** kèm danh sách lỗi có tên trường, không chỉ ẩn nút trên
 * giao diện. Gửi thành công thì trả mã hồ sơ + chuỗi QR để web tự vẽ.
 */
@Injectable()
export class SubmitDeclarationUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly validate: ValidateDeclarationUseCase,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
    @Optional()
    @Inject(WORKFLOW_INSTANCE_REPOSITORY)
    private readonly instances?: WorkflowInstanceRepository,
    @Optional()
    private readonly routes?: WorkflowRouteService,
  ) {}

  async execute(command: SubmitDeclarationCommand): Promise<SubmitDeclarationResult> {
    const declaration = await this.declarations.findById(command.declarationId);
    if (!declaration) throw appNotFound('dossier.notFound');
    this.scope.assertAccessible(declaration, command.access);

    const errors = await this.validate.collectErrors(declaration);
    if (errors.length > 0) {
      await this.audit.record({
        action: 'DECLARATION_SUBMIT_REJECTED',
        targetType: 'DECLARATION',
        targetId: declaration.id,
        actorId: command.actorId,
        actorRole: command.actorRole,
        result: AuditResult.FAILURE,
        before: { status: declaration.status, code: declaration.code },
        after: {
          code: declaration.code,
          errors: errors.map((e) => ({
            field: e.field,
            message: e.message,
            messageKey: e.messageKey,
          })),
        },
      });
      throw appBadRequest('dossier.submitIncomplete', undefined, { errors });
    }

    const before = { status: declaration.status, code: declaration.code };
    declaration.submit(command.actorId, command.actorRole);

    if (this.instances && this.routes) {
      const instance = await this.instances.findByDossierId(declaration.id);
      if (instance) {
        instance.resumeAfterSupplement();
        await this.instances.save(instance);
        const route = await this.routes.routeFor(declaration.type);
        declaration.applyWorkflowStatus(dossierStatusFor(instance, route));
      }
    }

    const saved = await this.declarations.save(declaration);

    await this.audit.record({
      action: 'DECLARATION_SUBMIT',
      targetType: 'DECLARATION',
      targetId: saved.id,
      actorId: command.actorId,
      actorRole: command.actorRole,
      result: AuditResult.SUCCESS,
      before,
      after: { status: saved.status, code: saved.code, submittedAt: saved.submittedAt?.toISOString() },
    });
    // 1. Thông báo cho người nộp hồ sơ
    await this.notifications.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      titleKey: 'notification.dossierSubmittedTitle',
      titleParams: { code: saved.code },
      contentKey: 'notification.dossierSubmittedContent',
      contentParams: { code: saved.code },
      dossierId: saved.id,
      dossierCode: saved.code,
      ownerUserId: saved.createdById,
      enterpriseTaxCode: saved.enterprise.taxCode,
    });

    // 2. SG-110: Gửi thông báo đến tài khoản phụ trách bước tiếp nhận đầu tiên (Biên phòng)
    const initialStep =
      saved.type === DeclarationType.IMPORT ? WorkflowStepCode.IMPORT_B1_ENTRY : WorkflowStepCode.EXPORT_B2_ENTRY;
    await this.notifications.publish({
      type: NotificationType.DOSSIER_TURN_PROCESSING,
      titleKey: 'notification.dossierNewPendingTitle',
      titleParams: { code: saved.code },
      contentKey: 'notification.dossierNewPendingContent',
      contentParams: { code: saved.code },
      dossierId: saved.id,
      dossierCode: saved.code,
      route: `/declarations/${saved.id}`,
      stepCodes: [initialStep],
      recipientRoleCodes: ['BORDER_GUARD'],
    });

    return {
      code: saved.code,
      // `submit()` luôn đặt hai giá trị này; ép kiểu để chữ ký trả về không lẫn null.
      qrCode: saved.qrCode as string,
      submittedAt: saved.submittedAt as Date,
    };
  }
}
