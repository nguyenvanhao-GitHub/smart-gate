import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUDIT_LOGGER } from '../../common/audit/audit-logger.port';
import { AUDIT_LOG_REPOSITORY } from './application/ports/audit-log.repository';
import { AuditLoggerService } from './application/services/audit-logger.service';
import { ExportAuditLogsUseCase } from './application/use-cases/export-audit-logs.use-case';
import { ListAuditLogsUseCase } from './application/use-cases/list-audit-logs.use-case';
import { AuditLogOrmEntity } from './infrastructure/persistence/audit-log.orm-entity';
import { TypeOrmAuditLogRepository } from './infrastructure/persistence/typeorm-audit-log.repository';
import { AuditLogsController } from './presentation/http/audit-logs.controller';

/**
 * `@Global()` vì gần như mọi phân hệ đều phải ghi nhật ký (F05); nếu không, mỗi module lại phải
 * import AuditModule chỉ để lấy đúng một token `AUDIT_LOGGER`.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogOrmEntity])],
  controllers: [AuditLogsController],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: TypeOrmAuditLogRepository },
    { provide: AUDIT_LOGGER, useClass: AuditLoggerService },
    ListAuditLogsUseCase,
    ExportAuditLogsUseCase,
  ],
  // `AUDIT_LOG_REPOSITORY` được xuất để phân hệ khác đọc lại nhật ký (F33 lịch sử điều phối) mà
  // không phải dựng kho audit riêng — vẫn giữ 4 tầng: bên đọc chỉ phụ thuộc vào cổng, không vào ORM.
  exports: [AUDIT_LOGGER, AUDIT_LOG_REPOSITORY],
})
export class AuditModule {}
