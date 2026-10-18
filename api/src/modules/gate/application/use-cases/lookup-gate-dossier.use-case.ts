import { Inject, Injectable } from '@nestjs/common';
import { toDossierSummary } from '../../../declarations/application/dto/dossier-view.dto';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateLookupView } from '../dto/gate-view.dto';
import { LookupGateDossierCommand } from '../dto/record-gate-event.command';
import { GATE_EVENT_REPOSITORY, GateEventRepository } from '../ports/gate-event.repository';
import { GateEvaluationService } from '../services/gate-evaluation.service';
import { appConflict, appNotFound } from '../../../../common/i18n';

/**
 * Tra cứu hồ sơ tại cổng theo **mã hồ sơ** (F37 · UI-09).
 *
 * - Tại cổng VÀO: chỉ tra cứu được hồ sơ ở trạng thái Đã gửi (SUBMITTED) và chưa qua cổng vào.
 * - Tại cổng RA: chỉ tra cứu được hồ sơ đã được duyệt vào cổng và chưa hoàn thành / chưa rời cửa khẩu.
 * - Hồ sơ đã rời cửa khẩu / hoàn thành (EXITED/COMPLETED) không được tra cứu ở cả hai cổng.
 */
@Injectable()
export class LookupGateDossierUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(GATE_EVENT_REPOSITORY)
    private readonly events: GateEventRepository,
    private readonly scope: DossierScopeService,
    private readonly evaluator: GateEvaluationService,
  ) {}

  async execute(command: LookupGateDossierCommand): Promise<GateLookupView> {
    const code = command.code?.trim();
    const declaration = code ? await this.declarations.findByCode(code) : null;
    if (!declaration) throw appNotFound('gate.dossierNotFoundByCode', { code: command.code });
    this.scope.assertAccessible(declaration, command.access);

    const gate = await this.evaluator.resolveGate(command.gateCode, command.direction);

    const allowedDirections = await this.events.findAllowedDirections(declaration.id);
    const alreadyLeft =
      declaration.status === DeclarationStatus.EXITED || declaration.status === DeclarationStatus.COMPLETED;

    if (gate.direction === GateDirection.ENTRY) {
      if (
        alreadyLeft ||
        allowedDirections.includes(GateDirection.ENTRY) ||
        declaration.status !== DeclarationStatus.WAITING_GATE
      ) {
        throw appConflict('gate.notEligibleForEntry', { code: declaration.code });
      }
    } else if (gate.direction === GateDirection.EXIT) {
      if (
        alreadyLeft ||
        !allowedDirections.includes(GateDirection.ENTRY) ||
        allowedDirections.includes(GateDirection.EXIT)
      ) {
        throw appConflict('gate.notEligibleForExit', { code: declaration.code });
      }
    }

    const snapshot = await this.evaluator.evaluate(declaration, gate);

    return {
      dossier: toDossierSummary(declaration),
      gate: { code: gate.code, name: gate.name, direction: gate.direction },
      evaluation: snapshot.evaluation,
      checklist: snapshot.checklist,
    };
  }
}
