import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../common/http/pagination';
import { AUDIT_LOG_REPOSITORY, AuditLogRepository, AuditLogSearchCriteria } from '../ports/audit-log.repository';
import { AuditLog } from '../../domain/audit-log.entity';

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly logs: AuditLogRepository,
  ) {}

  execute(criteria: AuditLogSearchCriteria): Promise<PaginatedResult<AuditLog>> {
    return this.logs.findMany(criteria);
  }
}
