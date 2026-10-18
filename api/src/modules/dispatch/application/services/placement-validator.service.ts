import { Inject, Injectable } from '@nestjs/common';
import { BorderFacilityService } from '../../../catalog/application/services/border-facility.service';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { DispatchPlacement } from '../../domain/dispatch-assignment.entity';
import { placementViolations, validatePlacement } from '../../domain/dispatch-placement.rules';
import { expectedGateDirection } from '../../domain/gate-direction.rules';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/**
 * Đối chiếu vị trí điều phối với **danh mục cấu hình cửa khẩu** (điểm D8) và bảng khu bãi.
 *
 * Cố ý không nhét thành enum: cổng/làn hợp lệ do danh mục quyết định, nên khi cửa khẩu bổ sung
 * cổng mới thì chỉ cần thêm mục danh mục, không phải sửa mã nguồn.
 */
@Injectable()
export class PlacementValidatorService {
  constructor(
    private readonly facilities: BorderFacilityService,
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
  ) {}

  async assertValid(placement: DispatchPlacement): Promise<void> {
    const violations = placementViolations(placement);
    if (violations.length > 0) {
      // Khóa của vi phạm đầu tiên đi vào `messageKey`; các lỗi còn lại vẫn được trả đủ trong
      // `errors[]` (kèm khóa) để giao diện hiện hết, không mất thông tin so với trước.
      throw appBadRequest(violations[0], undefined, {
        errors: validatePlacement(placement).map((message, index) => ({
          messageKey: violations[index],
          message,
        })),
      });
    }

    if (placement.gateCode) {
      const gate = await this.facilities.findGate(placement.gateCode);
      if (!gate) throw appBadRequest('gate.notFound', { gateCode: placement.gateCode });
      if (!gate.active) throw appBadRequest('gate.inactive', { gateName: gate.name });
    }

    if (placement.laneCode) {
      const lane = await this.facilities.findLane(placement.laneCode);
      if (!lane) throw appBadRequest('dispatch.laneNotFound', { laneCode: placement.laneCode });
      if (!lane.active) throw appBadRequest('dispatch.laneInactive', { laneName: lane.name });
      if (placement.gateCode && lane.gateCode !== placement.gateCode) {
        throw appBadRequest('dispatch.laneNotInGate', { laneName: lane.name, gateCode: placement.gateCode });
      }
    }

    if (placement.yardId && placement.slotCode) {
      const yard = await this.yards.findYardById(placement.yardId);
      if (!yard) throw appNotFound('yard.notFoundSelected');
      if (!yard.isActive) throw appBadRequest('yard.inactive', { yardName: yard.name });
      if (!yard.hasSlot(placement.slotCode)) {
        throw appBadRequest('yard.slotNotFound', { yardName: yard.name, slotCode: placement.slotCode });
      }
    }
  }

  /**
   * Chặn gán ngược chiều (nhóm B): hồ sơ nhập chỉ vào cổng `ENTRY`, hồ sơ xuất chỉ vào cổng `EXIT`.
   *
   * Kiểm **phòng thủ** ở tầng máy chủ — dù giao diện đã lọc sẵn danh sách cổng đúng chiều, request
   * chế tác thủ công vẫn có thể gửi cổng sai chiều. Cổng không có / tạm ngừng đã do `assertValid`
   * xử lý nên ở đây chỉ lo đúng/sai chiều; không có `gateCode` thì không có gì để kiểm.
   */
  async assertGateDirection(gateCode: string | null | undefined, dossierType: DeclarationType): Promise<void> {
    if (!gateCode) return;
    const gate = await this.facilities.findGate(gateCode);
    if (!gate) return;
    if (gate.direction !== expectedGateDirection(dossierType)) {
      throw appBadRequest('dispatch.gateDirectionMismatch', { gateName: gate.name, gateCode });
    }
  }
}
