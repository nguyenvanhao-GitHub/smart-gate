import { IsUUID } from 'class-validator';

export class IssueQueueTicketRequest {
  @IsUUID('4', { message: 'Mã hồ sơ không đúng định dạng.' })
  dossierId!: string;
}
