import { Inject, Injectable } from '@nestjs/common';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import { WorkflowRoute } from '../../domain/workflow-route';
import {
  WORKFLOW_INSTANCE_REPOSITORY,
  WorkflowInstanceRepository,
} from '../ports/workflow-instance.repository';
import { appBadRequest } from '../../../../common/i18n';
import { SETTINGS_READER, SettingsReader } from '../../../../common/settings/settings-reader.port';
import { SYSTEM_SETTING_KEYS, parseBooleanSetting } from '../../../system/domain/system-setting.catalog';

/**
 * Mở phiên xử lý liên ngành cho hồ sơ.
 *
 * Phiên được tạo **lúc cần đến** chứ không phải lúc gửi hồ sơ: phân hệ `declarations` không được
 * phụ thuộc ngược vào `workflow` (sẽ tạo vòng module), nên nơi biết chắc phải có phiên là chính
 * phân hệ `workflow`. Hàm idempotent — gọi lại trả đúng phiên cũ.
 *
 * CR29 — cờ Thu phí chung (`fee.enabled`) được **đọc & đóng băng đúng lúc mở phiên**: cờ tắt thì lộ
 * trình bị cắt bước Thu phí trước khi dựng phiên, nên phiên **thật sự không có** bước phí. Vì chỉ đọc
 * lúc tạo mới (nhánh `existing` trả về sớm), đổi cờ về sau **không hồi tố** hồ sơ đang chạy — chỉ áp
 * cho hồ sơ mới.
 */
@Injectable()
export class WorkflowProvisioningService {
  constructor(
    @Inject(WORKFLOW_INSTANCE_REPOSITORY)
    private readonly instances: WorkflowInstanceRepository,
    @Inject(SETTINGS_READER)
    private readonly settings: SettingsReader,
  ) {}

  async ensure(declaration: Declaration, route: WorkflowRoute): Promise<WorkflowInstance> {
    const existing = await this.instances.findByDossierId(declaration.id);
    if (existing) return existing;

    if (declaration.status === DeclarationStatus.DRAFT) {
      throw appBadRequest('workflow.dossierNotSubmitted');
    }
    if (declaration.status === DeclarationStatus.CANCELLED) {
      throw appBadRequest('workflow.dossierCancelled');
    }

    // CR29 — đóng băng cờ Thu phí vào phiên: tắt → dựng phiên trên lộ trình đã bỏ bước Thu phí. Mặc
    // định BẬT (fallback `true`) để không vỡ khi bảng cấu hình chưa có bản ghi.
    const feeEnabled = parseBooleanSetting(
      await this.settings.getValue(SYSTEM_SETTING_KEYS.FEE_ENABLED),
      true,
    );
    const effectiveRoute = feeEnabled ? route : route.withoutFeeSteps();

    const startedAt = declaration.submittedAt ?? declaration.createdAt;
    // BUG-049 — bước khai báo mang tên người/DN đã khai (chủ hồ sơ), không để trống thành "Hệ thống".
    const declarantName = declaration.enterprise?.name?.trim() || null;
    return this.instances.save(
      WorkflowInstance.start(declaration.id, declaration.type, effectiveRoute, startedAt, declarantName),
    );
  }
}
