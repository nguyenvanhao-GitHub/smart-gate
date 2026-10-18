import { Inject, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { Attachment } from '../../domain/attachment.entity';
import { DOSSIER_OWNERSHIP, DossierOwnershipPort } from '../ports/dossier-ownership.port';
import { appForbidden } from '../../../../common/i18n';

/**
 * Kiểm phạm vi dữ liệu cho tệp đính kèm — hàng rào chống "đoán id là tải được tệp của doanh
 * nghiệp khác". Quyền `dossier.view` chỉ trả lời được câu hỏi "có được xem tệp nói chung không";
 * việc **tệp nào** thì phải hỏi tiếp `data_scope` của người dùng.
 */
@Injectable()
export class AttachmentScopeService {
  constructor(
    private readonly dataScope: DataScopeService,
    @Inject(DOSSIER_OWNERSHIP)
    private readonly dossiers: DossierOwnershipPort,
  ) {}

  async assertAccessible(attachment: Attachment, access: UserAccessContext): Promise<void> {
    // Người tải lên luôn xem lại được tệp của chính mình, kể cả khi tệp chưa gắn hồ sơ.
    if (attachment.uploadedById === access.userId) return;

    const filter = this.dataScope.resolve(access);
    if (filter.unrestricted) return;

    /**
     * `ORGANIZATION` và `ASSIGNMENT` tạm coi là không giới hạn — đúng bằng mức đang áp cho
     * `ListDeclarationsUseCase`: bảng `declarations` chưa có cột đơn vị, còn `checkpoint` chỉ ghi
     * chốt **đã đi qua** nên siết theo nó sẽ chặn nhầm chính lực lượng đang phải xử lý hồ sơ.
     * Siết ở P3 khi có `WorkflowInstance`. Giữ hai nơi cùng một mức để không tạo cảm giác an toàn giả.
     */
    if (filter.level !== DataScopeLevel.OWN) return;

    // Phạm vi OWN mà tệp chưa gắn hồ sơ thì không có căn cứ nào cho phép — chặn.
    if (!attachment.dossierId) {
      throw appForbidden('file.forbidden');
    }

    const ownership = await this.dossiers.findOwnership(attachment.dossierId);
    if (!ownership) {
      throw appForbidden('file.forbidden');
    }

    /**
     * Giữ đúng một quy tắc với `DossierScopeService` sau khi tách bảng `enterprises`:
     * - Tài khoản được phân công doanh nghiệp → căn cứ **duy nhất** là doanh nghiệp chủ hồ sơ.
     *   Không nới thêm theo `createdById` nữa, nếu không thì tài khoản đã chuyển doanh nghiệp
     *   vẫn còn tải được chứng từ của hồ sơ cũ.
     * - Tài khoản không gắn doanh nghiệp nào (tài xế…) → giữ căn cứ `createdById`.
     */
    const allowed =
      filter.taxCodes.length > 0
        ? !!ownership.taxCode && filter.taxCodes.includes(ownership.taxCode)
        : !!ownership.createdById && ownership.createdById === filter.ownerUserId;
    if (!allowed) {
      throw appForbidden('file.forbiddenDossier');
    }
  }
}
