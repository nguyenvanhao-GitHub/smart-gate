import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';

export interface ReplaceUserRolesCommand {
  userId: string;
  roles: { roleCode: string; dataScope: DataScopeLevel }[];
}

export interface ReplaceUserAssignmentsCommand {
  userId: string;
  assignments: { type: AssignmentType; code: string }[];
}
