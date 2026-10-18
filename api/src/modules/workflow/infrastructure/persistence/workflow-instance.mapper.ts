import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { AgencyAction } from '../../domain/agency-action.entity';
import { WorkflowInstance, WorkflowStepState } from '../../domain/workflow-instance.entity';
import {
  WorkflowDecision,
  WorkflowInstanceStatus,
  WorkflowStepStatus,
} from '../../domain/workflow.enums';
import { AgencyActionOrmEntity } from './agency-action.orm-entity';
import { WorkflowInstanceStepOrmEntity } from './workflow-instance-step.orm-entity';
import { WorkflowInstanceOrmEntity } from './workflow-instance.orm-entity';

export class WorkflowInstanceMapper {
  static toDomain(row: WorkflowInstanceOrmEntity, steps: WorkflowInstanceStepOrmEntity[]): WorkflowInstance {
    return new WorkflowInstance(
      row.id,
      row.dossierId,
      row.dossierType as DeclarationType,
      row.currentStepCode,
      row.status as WorkflowInstanceStatus,
      row.startedAt,
      row.completedAt,
      steps
        .map(
          (step) =>
            new WorkflowStepState(
              step.id,
              step.stepCode,
              step.stepOrder,
              step.status as WorkflowStepStatus,
              step.enteredAt,
              step.completedAt,
              step.actorId,
              step.actorName,
              step.decision as WorkflowDecision | null,
              step.reasonCode,
              step.reasonNote,
            ),
        )
        .sort((left, right) => left.order - right.order),
    );
  }

  static toPersistence(instance: WorkflowInstance): WorkflowInstanceOrmEntity {
    const row = new WorkflowInstanceOrmEntity();
    row.id = instance.id;
    row.dossierId = instance.dossierId;
    row.dossierType = instance.dossierType;
    row.currentStepCode = instance.currentStepCode;
    row.status = instance.status;
    row.startedAt = instance.startedAt;
    row.completedAt = instance.completedAt;
    return row;
  }

  static toStepPersistence(instanceId: string, state: WorkflowStepState): WorkflowInstanceStepOrmEntity {
    const row = new WorkflowInstanceStepOrmEntity();
    row.id = state.id;
    row.instanceId = instanceId;
    row.stepCode = state.stepCode;
    row.stepOrder = state.order;
    row.status = state.status;
    row.enteredAt = state.enteredAt;
    row.completedAt = state.completedAt;
    row.actorId = state.actorId;
    row.actorName = state.actorName;
    row.decision = state.decision;
    row.reasonCode = state.reasonCode;
    row.reasonNote = state.reasonNote;
    return row;
  }

  static toActionPersistence(action: AgencyAction): AgencyActionOrmEntity {
    const row = new AgencyActionOrmEntity();
    row.id = action.id;
    row.dossierId = action.dossierId;
    row.instanceId = action.instanceId;
    row.stepCode = action.stepCode;
    row.agencyCode = action.agencyCode || null;
    row.actorId = action.actorId;
    row.actorName = action.actorName;
    row.decision = action.decision;
    row.reasonCode = action.reasonCode;
    row.reasonNote = action.reasonNote;
    row.elapsedSeconds = action.elapsedSeconds;
    row.actedAt = action.actedAt;
    return row;
  }

  static toActionDomain(row: AgencyActionOrmEntity): AgencyAction {
    return new AgencyAction(
      row.id,
      row.dossierId,
      row.instanceId,
      row.stepCode,
      row.agencyCode ?? '',
      row.actorId,
      row.actorName,
      row.decision as WorkflowDecision,
      row.reasonCode,
      row.reasonNote,
      row.elapsedSeconds,
      row.actedAt,
    );
  }
}
