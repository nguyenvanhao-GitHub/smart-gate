import { Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { WORKFLOW_STEP_ROLE_CATALOG } from '../../../access-control/domain/workflow-step-role.catalog';
import { Declaration } from '../../domain/declaration.entity';
import { DeclarationStatus } from '../../domain/declaration.enums';
import { DeclarationScopeCriteria } from '../ports/declaration.repository';
import { appForbidden } from '../../../../common/i18n';

/**
 * Vai trò lãnh đạo/BQL: theo dõi tổng thể, **không** gắn với một bước nghiệp vụ cụ thể nên được
 * thấy toàn bộ hồ sơ (unrestricted) kể cả khi phạm vi dữ liệu chỉ là `ORGANIZATION`.
 */
const OVERSIGHT_ROLE_CODES = ['MANAGEMENT'];

/**
 * Ánh xạ **vai trò → các mã bước** mà vai trò đó được xử lý, suy từ danh mục `workflow_step_roles`.
 * Dùng để siết hồ sơ theo tiến trình liên ngành (một cán bộ chỉ thấy hồ sơ đã tới/đã qua bước của
 * lực lượng mình). Bảng cứng ở đây là ảnh tĩnh của cùng dữ liệu seed nên khớp với lộ trình dựng
 * trong `WorkflowRouteService`; giữ ở dạng đồng bộ để `toCriteria` không phải thành hàm bất đồng bộ.
 */
const STEP_CODES_BY_ROLE: Record<string, string[]> = WORKFLOW_STEP_ROLE_CATALOG.reduce(
  (map, def) => {
    const steps = map[def.roleCode] ?? [];
    steps.push(def.stepCode);
    map[def.roleCode] = steps;
    return map;
  },
  {} as Record<string, string[]>,
);

/**
 * Dịch `data_scope` của người dùng thành điều kiện lọc/chặn hồ sơ.
 *
 * Sau khi tách bảng `enterprises`, phạm vi `OWN` được siết theo **doanh nghiệp**:
 * - Tài khoản có phân công mã số thuế (doanh nghiệp) → chỉ thấy hồ sơ của đúng các doanh nghiệp đó.
 *   Đây là chỗ siết so với P1: trước đây điều kiện là `createdById = tôi` **HOẶC** `taxCode thuộc
 *   danh sách`, nên một tài khoản đã chuyển sang doanh nghiệp khác vẫn còn thấy hồ sơ cũ mình tạo.
 * - Tài khoản không gắn doanh nghiệp nào (ví dụ tài xế) → giữ căn cứ `createdById`.
 *
 * Phạm vi `ORGANIZATION`/`ASSIGNMENT` của cán bộ lực lượng nay được siết theo **tiến trình liên
 * ngành** (`WorkflowInstance` đã có từ P3): chỉ thấy hồ sơ mà workflow đã **chạm tới hoặc đã đi qua**
 * một bước thuộc vai trò của cán bộ. Xem `workflowScope`.
 */
@Injectable()
export class DossierScopeService {
  constructor(private readonly dataScope: DataScopeService) {}

  toCriteria(access: UserAccessContext): DeclarationScopeCriteria {
    const filter = this.dataScope.resolve(access);
    if (filter.level === DataScopeLevel.ALL) return { unrestricted: true };
    if (filter.level === DataScopeLevel.OWN) {
      const criteria: DeclarationScopeCriteria = {
        unrestricted: false,
        ownerUserId: filter.ownerUserId,
        taxCodes: filter.taxCodes,
      };
      if (filter.idNumbers?.length) {
        criteria.idNumbers = filter.idNumbers;
      }
      return criteria;
    }
    return this.workflowScope(access);
  }

  /**
   * Phạm vi theo tiến trình liên ngành cho cán bộ lực lượng (`ORGANIZATION`/`ASSIGNMENT`).
   *
   * - Lãnh đạo/BQL (`MANAGEMENT`) → thấy toàn bộ (unrestricted), nhưng loại trừ bản nháp (excludeDraft)
   *   của doanh nghiệp vì lãnh đạo không duyệt bản nháp chưa gửi.
   * - Vai trò không gắn bước nào trong luồng (kho bãi, điều phối…) → siết theo requireWorkflow = true
   *   để chỉ thấy hồ sơ đã vào cửa khẩu / đã có phiên xử lý, loại bỏ hồ sơ chưa đến lượt và bản nháp.
   * - Còn lại (Biên phòng, Hải quan, Kiểm dịch, Thu phí) → siết theo `reachedStepCodes` và excludeDraft.
   *
   * `unrestricted: true` kèm `reachedStepCodes`/`requireWorkflow` mang nghĩa: **không** ràng buộc theo doanh
   * nghiệp/mã số thuế; ràng buộc thật là chiều tiến trình xử lý tại cửa khẩu.
   */
  private workflowScope(access: UserAccessContext): DeclarationScopeCriteria {
    const roleCodes = access.roles.map((role) => role.code);
    if (roleCodes.some((code) => OVERSIGHT_ROLE_CODES.includes(code))) {
      return { unrestricted: true, excludeDraft: true };
    }
    const reachedStepCodes = this.stepCodesForRoles(roleCodes);
    if (reachedStepCodes.length === 0) {
      return { unrestricted: true, excludeDraft: true, requireWorkflow: true };
    }
    return { unrestricted: true, reachedStepCodes, excludeDraft: true };
  }

  private stepCodesForRoles(roleCodes: string[]): string[] {
    const codes = new Set<string>();
    roleCodes.forEach((role) => (STEP_CODES_BY_ROLE[role] ?? []).forEach((step) => codes.add(step)));
    return [...codes];
  }

  /** Chặn "đoán id là đọc/sửa được hồ sơ của doanh nghiệp khác". */
  assertAccessible(declaration: Declaration, access: UserAccessContext): void {
    if (this.isAccessible(declaration, access)) return;
    throw appForbidden('dossier.forbidden');
  }

  isAccessible(declaration: Declaration, access: UserAccessContext): boolean {
    const criteria = this.toCriteria(access);
    if (criteria.excludeDraft && declaration.status === DeclarationStatus.DRAFT) {
      return false;
    }
    if (criteria.unrestricted) return true;

    const taxCodes = criteria.taxCodes ?? [];
    if (taxCodes.length > 0) {
      const taxCode = declaration.enterprise?.taxCode;
      return !!taxCode && taxCodes.includes(taxCode);
    }
    const idNumbers = criteria.idNumbers ?? [];
    if (idNumbers.length > 0) {
      const driverIdNumber = declaration.vehicles[0]?.driver?.idNumber;
      if (driverIdNumber && idNumbers.includes(driverIdNumber)) return true;
    }
    return !!declaration.createdById && declaration.createdById === criteria.ownerUserId;
  }
}
