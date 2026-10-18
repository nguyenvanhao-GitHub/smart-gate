import { translate } from '../../../../common/i18n/translate';
import { NotificationPublisher, PublishNotificationInput } from '../../../../common/notifications/notification-publisher.port';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { InMemoryDeclarationRepository, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { WorkflowRouteService } from '../../../workflow/application/services/workflow-route.service';
import { WorkflowInstanceMapper } from '../../../workflow/infrastructure/persistence/workflow-instance.mapper';
import { FakeStepDirectory, makeApprovedInstance, makeRoute } from '../../../workflow/testing/workflow.fixture';
import { WorkflowFeeStepGateAdapter } from './workflow-fee-step-gate.adapter';

class RecordingNotificationPublisher implements NotificationPublisher {
  readonly published: PublishNotificationInput[] = [];
  async publish(input: PublishNotificationInput): Promise<void> {
    const title = input.titleKey ? translate(input.titleKey, input.titleParams, 'vi') : input.title;
    const content = input.contentKey ? translate(input.contentKey, input.contentParams, 'vi') : input.content;
    this.published.push({ ...input, title, content });
  }
}

describe('WorkflowFeeStepGateAdapter', () => {
  const DOSSIER_ID = 'dossier-123';
  const ACTOR_ID = 'user-fee-collector';

  it('gửi thông báo tới BORDER_GUARD khi tự động hoàn tất bước thu phí', async () => {
    const declaration = makeDeclaration({
      id: DOSSIER_ID,
      code: 'HS-2026-0001',
      type: DeclarationType.IMPORT,
    });
    const declarationRepo = new InMemoryDeclarationRepository([declaration]);

    const routeService = new WorkflowRouteService(new FakeStepDirectory());
    const route = makeRoute(declaration.type);
    const businessStepsExceptFee = route.actionableSteps.filter((s) => !route.isGateStep(s.code) && s.code !== route.feeStep?.code).length;

    // Approve all steps prior to fee step so fee step is IN_PROGRESS
    const instance = makeApprovedInstance(DOSSIER_ID, declaration.type, businessStepsExceptFee);

    const instanceOrm = WorkflowInstanceMapper.toPersistence(instance);
    const stepOrms = instance.steps.map((step) => WorkflowInstanceMapper.toStepPersistence(instance.id, step));

    const mockInstancesRepo = {
      findOne: jest.fn().mockResolvedValue(instanceOrm),
      save: jest.fn().mockResolvedValue(instanceOrm),
    };
    const mockStepsRepo = {
      find: jest.fn().mockResolvedValue(stepOrms),
      save: jest.fn().mockResolvedValue(stepOrms),
    };
    const mockUsersRepo = {
      findOne: jest.fn().mockResolvedValue({ id: ACTOR_ID, displayName: 'Thu Ngân' }),
    };

    const notifications = new RecordingNotificationPublisher();

    const adapter = new WorkflowFeeStepGateAdapter(
      mockInstancesRepo as any,
      mockStepsRepo as any,
      mockUsersRepo as any,
      declarationRepo,
      routeService,
      notifications,
    );

    const result = await adapter.completeFeeStepIfSettled(DOSSIER_ID, ACTOR_ID);

    expect(result).toBe(true);
    expect(notifications.published).toHaveLength(1);
    expect(notifications.published[0]).toMatchObject({
      type: NotificationType.DOSSIER_TURN_PROCESSING,
      title: 'Hồ sơ HS-2026-0001 đang chờ xác nhận ra cổng',
      content: 'Hồ sơ HS-2026-0001 đã hoàn tất thu phí và đang chờ xác nhận ra cổng.',
      dossierId: DOSSIER_ID,
      dossierCode: 'HS-2026-0001',
      recipientRoleCodes: ['BORDER_GUARD'],
    });
  });
});
