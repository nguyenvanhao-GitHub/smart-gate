import { makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { SYSTEM_SETTING_KEYS } from '../../../system/domain/system-setting.catalog';
import { instanceIncludesFeeStep } from '../../domain/fee-step-gate.rules';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import {
  FakeSettingsReader,
  InMemoryWorkflowInstanceRepository,
  makeRoute,
} from '../../testing/workflow.fixture';
import { WorkflowProvisioningService } from './workflow-provisioning.service';

/**
 * CR29 — `WorkflowProvisioningService` đọc & **đóng băng** cờ `fee.enabled` đúng lúc mở phiên:
 *   · cờ tắt → phiên mới không có bước Thu phí;
 *   · cờ mặc định (chưa cấu hình) → BẬT, phiên có bước Thu phí;
 *   · đổi cờ về sau **không hồi tố** phiên đang chạy (chỉ áp hồ sơ mới).
 */
describe('WorkflowProvisioningService — đóng băng cờ Thu phí (CR29)', () => {
  const AT = new Date('2026-07-22T08:00:00.000Z');

  const submitted = () =>
    makeDeclaration({
      id: 'decl-cr29',
      type: DeclarationType.EXPORT,
      status: DeclarationStatus.SUBMITTED,
      submittedAt: AT,
    });

  it('cờ fee.enabled = false → phiên mới KHÔNG có bước Thu phí', async () => {
    const instances = new InMemoryWorkflowInstanceRepository();
    const service = new WorkflowProvisioningService(
      instances,
      new FakeSettingsReader({ [SYSTEM_SETTING_KEYS.FEE_ENABLED]: 'false' }),
    );

    const instance = await service.ensure(submitted(), makeRoute(DeclarationType.EXPORT));

    expect(instanceIncludesFeeStep(instance)).toBe(false);
  });

  it('chưa cấu hình cờ → mặc định BẬT, phiên mới có bước Thu phí', async () => {
    const instances = new InMemoryWorkflowInstanceRepository();
    const service = new WorkflowProvisioningService(instances, new FakeSettingsReader());

    const instance = await service.ensure(submitted(), makeRoute(DeclarationType.EXPORT));

    expect(instanceIncludesFeeStep(instance)).toBe(true);
  });

  it('phiên đã mở (có bước phí) không bị hồi tố khi cờ chuyển sang tắt', async () => {
    const instances = new InMemoryWorkflowInstanceRepository();
    const declaration = submitted();
    // Phiên cũ mở khi cờ còn BẬT → có bước phí.
    await instances.save(WorkflowInstance.start(declaration.id, declaration.type, makeRoute(DeclarationType.EXPORT), AT));

    // Cờ nay đã tắt, nhưng ensure phải trả đúng phiên cũ (idempotent), giữ nguyên bước phí.
    const service = new WorkflowProvisioningService(
      instances,
      new FakeSettingsReader({ [SYSTEM_SETTING_KEYS.FEE_ENABLED]: 'false' }),
    );
    const instance = await service.ensure(declaration, makeRoute(DeclarationType.EXPORT));

    expect(instanceIncludesFeeStep(instance)).toBe(true);
  });
});
