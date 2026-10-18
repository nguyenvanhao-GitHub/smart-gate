import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { DeclarationsModule } from '../declarations/declarations.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { FeesModule } from '../fees/fees.module';
import { QueueModule } from '../queue/queue.module';
import { GATE_CHECKLIST_CATALOG } from './application/ports/gate-checklist.port';
import { GATE_EVENT_REPOSITORY } from './application/ports/gate-event.repository';
import { GateEvaluationService } from './application/services/gate-evaluation.service';
import { ListGateEventsUseCase } from './application/use-cases/list-gate-events.use-case';
import { LookupGateDossierUseCase } from './application/use-cases/lookup-gate-dossier.use-case';
import { RecordGateEventUseCase } from './application/use-cases/record-gate-event.use-case';
import { SummarizeGateTodayUseCase } from './application/use-cases/summarize-gate-today.use-case';
import { CatalogGateChecklistAdapter } from './infrastructure/persistence/catalog-gate-checklist.adapter';
import { GateEventOrmEntity } from './infrastructure/persistence/gate-event.orm-entity';
import { TypeOrmGateEventRepository } from './infrastructure/persistence/typeorm-gate-event.repository';
import { GateController } from './presentation/http/gate.controller';

/**
 * Phân hệ cổng (P4 · F37–F39).
 *
 * Chiều phụ thuộc: `gate` → `declarations` (hồ sơ + **`WorkflowPolicyService.evaluateGate()`**),
 * `gate` → `catalog` (danh mục cổng và checklist), `gate` → `dispatch` (nhả vị trí khi xe qua
 * cổng ra), `gate` → `fees` (**chỉ** cổng `FEE_SETTLEMENT` — nghĩa vụ tài chính của hồ sơ, F39),
 * `gate` → `queue` (**chỉ** cổng `QUEUE_TICKET_ISSUER` — tự cấp số khi xe qua cổng vào, SRS 4.1).
 * Không có chiều ngược lại (`queue` chỉ phụ thuộc `declarations`, không biết tới `gate`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GateEventOrmEntity]),
    DeclarationsModule,
    CatalogModule,
    DispatchModule,
    FeesModule,
    QueueModule,
  ],
  controllers: [GateController],
  providers: [
    GateEvaluationService,
    LookupGateDossierUseCase,
    RecordGateEventUseCase,
    ListGateEventsUseCase,
    SummarizeGateTodayUseCase,
    { provide: GATE_EVENT_REPOSITORY, useClass: TypeOrmGateEventRepository },
    { provide: GATE_CHECKLIST_CATALOG, useClass: CatalogGateChecklistAdapter },
  ],
})
export class GateModule {}
