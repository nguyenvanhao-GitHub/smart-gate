import { UserAccessContext } from '../../../../common/auth/access-context';

export interface IssueQueueTicketCommand {
  dossierId: string;
  actorId: string;
  access: UserAccessContext;
}
