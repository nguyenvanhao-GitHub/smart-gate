import { Inject, Injectable } from '@nestjs/common';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import {
  DISPATCH_ASSIGNMENT_REPOSITORY,
  DispatchAssignmentRepository,
} from '../../../dispatch/application/ports/dispatch-assignment.repository';
import { FeeBasis, parkingDaysBetween, weightTonsOf } from '../../domain/fee-calculation.rules';

/**
 * Gom **căn cứ tính phí** của một hồ sơ (F47): số lượt, số ngày lưu bãi, khối lượng quy tấn.
 *
 * Số ngày lưu bãi lấy từ vị trí đang giữ trong bãi (`dispatch_assignments`) chứ không phải từ một
 * cột riêng của hồ sơ — bãi là nơi duy nhất biết xe vào lúc nào. Xe chưa vào bãi thì 0 ngày, và
 * dòng phí lưu bãi vẫn hiện với số tiền 0 để người dùng thấy khoản đó tồn tại mà chưa phát sinh.
 */
@Injectable()
export class FeeBasisService {
  constructor(
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
  ) {}

  async basisFor(declaration: Declaration, at: Date): Promise<FeeBasis> {
    const assignment = await this.assignments.findActiveByDossier(declaration.id);
    return {
      dossierType: declaration.type,
      // Một hồ sơ = một lượt qua cửa khẩu (MVP).
      trips: 1,
      parkingDays: parkingDaysBetween(assignment?.assignedAt ?? null, at),
      weightTons: weightTonsOf(declaration.cargo?.grossWeightKg),
    };
  }
}
