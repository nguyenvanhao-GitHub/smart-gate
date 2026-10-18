import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeStepGateQuery } from '../../../../common/fees/fee-step-gate.port';
import { NOTIFICATION_PUBLISHER, NotificationPublisher } from '../../../../common/notifications/notification-publisher.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { ForceStatus } from '../../../declarations/domain/declaration.enums';
import { workflowStepMetadata } from '../../../declarations/domain/workflow-step.catalog';
import { UserOrmEntity } from '../../../identity/infrastructure/persistence/user.orm-entity';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { WorkflowRouteService } from '../../../workflow/application/services/workflow-route.service';
import { hasReachedFeeStep } from '../../../workflow/domain/fee-step-gate.rules';
import { dossierStatusFor } from '../../../workflow/domain/workflow-status.rules';
import { WorkflowDecision, WorkflowStepStatus } from '../../../workflow/domain/workflow.enums';
import { WorkflowInstanceMapper } from '../../../workflow/infrastructure/persistence/workflow-instance.mapper';
import { WorkflowInstanceStepOrmEntity } from '../../../workflow/infrastructure/persistence/workflow-instance-step.orm-entity';
import { WorkflowInstanceOrmEntity } from '../../../workflow/infrastructure/persistence/workflow-instance.orm-entity';

/**
 * Hiện thực cổng `FEE_STEP_GATE` — đọc **phiên xử lý liên ngành** của hồ sơ và áp luật "đã tới bước
 * thu phí" (`hasReachedFeeStep`). Đặt ở phân hệ phí (không ở workflow) để tránh vòng phụ thuộc mô-đun:
 * `workflow` vốn đã import `fees` (cổng `FEE_SETTLEMENT`). Cùng nếp với việc `fees` đọc thẳng
 * `UserOrmEntity` của phân hệ định danh qua `forFeature` để khỏi tạo vòng.
 */
@Injectable()
export class WorkflowFeeStepGateAdapter implements FeeStepGateQuery {
  constructor(
    @InjectRepository(WorkflowInstanceOrmEntity)
    private readonly instances: Repository<WorkflowInstanceOrmEntity>,
    @InjectRepository(WorkflowInstanceStepOrmEntity)
    private readonly steps: Repository<WorkflowInstanceStepOrmEntity>,
    @InjectRepository(UserOrmEntity)
    private readonly users: Repository<UserOrmEntity>,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly routes: WorkflowRouteService,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
  ) {}

  async hasReachedFeeStep(dossierId: string): Promise<boolean> {
    const instanceRow = await this.instances.findOne({ where: { dossierId } });
    // Chưa có phiên (hồ sơ nháp/chưa nộp, hoặc chưa ai thao tác) → chưa tới bước phí.
    if (!instanceRow) return false;
    const stepRows = await this.steps.find({ where: { instanceId: instanceRow.id } });
    return hasReachedFeeStep(WorkflowInstanceMapper.toDomain(instanceRow, stepRows));
  }

  async completeFeeStepIfSettled(dossierId: string, actorId: string): Promise<boolean> {
    const instanceRow = await this.instances.findOne({ where: { dossierId } });
    if (!instanceRow) return false;

    const stepRows = await this.steps.find({ where: { instanceId: instanceRow.id } });
    const instance = WorkflowInstanceMapper.toDomain(instanceRow, stepRows);

    const declaration = await this.declarations.findById(dossierId);
    if (!declaration) return false;

    const route = await this.routes.routeFor(declaration.type);
    const feeStepCode = route.feeStep?.code;
    if (!feeStepCode) return false;

    const stepState = instance.step(feeStepCode);
    if (!stepState || stepState.status === WorkflowStepStatus.COMPLETED) {
      return false; // Đã hoàn thành hoặc không có bước phí
    }

    const at = new Date();
    const actorUser = await this.users.findOne({ where: { id: actorId } });
    const actorName = actorUser?.displayName ?? 'Cơ quan thu phí';

    instance.applyDecision(
      {
        stepCode: feeStepCode,
        decision: WorkflowDecision.APPROVE,
        actorId,
        actorName,
        reasonCode: null,
        reasonNote: 'Tự động hoàn thành bước thu phí sau khi xác nhận thu đủ tiền',
        at,
      },
      route,
      declaration.epidemicFlag,
    );

    const instanceOrm = WorkflowInstanceMapper.toPersistence(instance);
    const stepOrms = instance.steps.map((step) => WorkflowInstanceMapper.toStepPersistence(instance.id, step));
    await this.instances.save(instanceOrm);
    await this.steps.save(stepOrms);

    declaration.workflowProgress[feeStepCode] = ForceStatus.COMPLETED;
    const checkpoint = workflowStepMetadata(feeStepCode)?.checkpoint;
    if (checkpoint) declaration.setCheckpoint(checkpoint);
    declaration.applyWorkflowStatus(dossierStatusFor(instance, route));
    declaration.recordOperationAction(
      actorId,
      'FEE_COLLECTOR',
      `APPROVE tại bước ${feeStepCode} (Tự động hoàn thành sau khi thu đủ tiền)`,
    );
    await this.declarations.save(declaration);

    await this.notifications.publish({
      type: NotificationType.DOSSIER_TURN_PROCESSING,
      titleKey: 'notification.feeWaitingExitTitle',
      titleParams: { code: declaration.code },
      contentKey: 'notification.feeWaitingExitContent',
      contentParams: { code: declaration.code },
      dossierId: declaration.id,
      dossierCode: declaration.code,
      route: `/declarations/${declaration.id}`,
      recipientRoleCodes: ['BORDER_GUARD'],
    });

    return true;
  }
}

