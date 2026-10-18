import { WorkflowStepRole } from '../../domain/access-control.entities';
import { WorkflowStepRoleDefinition } from '../../domain/workflow-step-role.catalog';

export const WORKFLOW_STEP_ROLE_REPOSITORY = Symbol('WORKFLOW_STEP_ROLE_REPOSITORY');

export interface WorkflowStepRoleRepository {
  findAll(): Promise<WorkflowStepRole[]>;
  ensure(definitions: WorkflowStepRoleDefinition[]): Promise<void>;
}
