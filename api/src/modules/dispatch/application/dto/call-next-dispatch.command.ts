import { UserAccessContext } from '../../../../common/auth/access-context';

export interface CallNextDispatchCommand {
  checkpoint?: string;
  date?: string;
  from?: Date;
  to?: Date;
  dossierId?: string;
  actorId: string;
  access: UserAccessContext;
}

export interface CallNextDispatchResult {
  called: boolean;
  dossierId?: string;
  dossierCode?: string;
  plateNumber?: string;
  ticketNumber?: number | null;
  ticketCode?: string | null;
  enterpriseName?: string;
  message?: string;
}
