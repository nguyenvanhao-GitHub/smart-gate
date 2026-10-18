import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { DeclarationsModule } from '../declarations/declarations.module';
import { QueueModule } from '../queue/queue.module';
import { DISPATCH_ASSIGNMENT_REPOSITORY } from './application/ports/dispatch-assignment.repository';
import { YARD_REPOSITORY } from './application/ports/yard.repository';
import { PlacementValidatorService } from './application/services/placement-validator.service';
import { YardProvisioningService } from './application/services/yard-provisioning.service';
import { AssignDispatchUseCase } from './application/use-cases/assign-dispatch.use-case';
import { CallNextDispatchUseCase } from './application/use-cases/call-next-dispatch.use-case';
import { ChangeInspectionUseCase } from './application/use-cases/change-inspection.use-case';
import { GetDispatchBoardUseCase } from './application/use-cases/get-dispatch-board.use-case';
import { GetDispatchHistoryUseCase } from './application/use-cases/get-dispatch-history.use-case';
import { GetYardDetailUseCase } from './application/use-cases/get-yard-detail.use-case';
import { ListYardZonesUseCase } from './application/use-cases/list-yard-zones.use-case';
import { ListYardsUseCase } from './application/use-cases/list-yards.use-case';
import { MoveDispatchUseCase } from './application/use-cases/move-dispatch.use-case';
import { ReleaseDispatchUseCase } from './application/use-cases/release-dispatch.use-case';
import { ReleaseYardSlotUseCase } from './application/use-cases/release-yard-slot.use-case';
import { SetYardSlotLockUseCase } from './application/use-cases/set-yard-slot-lock.use-case';
import { UpdateYardZoneUseCase } from './application/use-cases/update-yard-zone.use-case';
import { DispatchAssignmentOrmEntity } from './infrastructure/persistence/dispatch-assignment.orm-entity';
import { ParkingSlotOrmEntity } from './infrastructure/persistence/parking-slot.orm-entity';
import { TypeOrmDispatchAssignmentRepository } from './infrastructure/persistence/typeorm-dispatch-assignment.repository';
import { TypeOrmYardRepository } from './infrastructure/persistence/typeorm-yard.repository';
import { YardOrmEntity } from './infrastructure/persistence/yard.orm-entity';
import { DispatchController } from './presentation/http/dispatch.controller';
import { YardZonesController } from './presentation/http/yard-zones.controller';
import { YardsController } from './presentation/http/yards.controller';

/**
 * Phân hệ điều phối phương tiện và kho bãi (P4 · F29, F31, F42–F44).
 *
 * Chiều phụ thuộc: `dispatch` → `declarations` (hồ sơ, phạm vi dữ liệu), `dispatch` → `catalog`
 * (cấu hình cổng/làn/khu bãi, điểm D8). Không có chiều ngược lại.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DispatchAssignmentOrmEntity, YardOrmEntity, ParkingSlotOrmEntity]),
    DeclarationsModule,
    CatalogModule,
    QueueModule,
  ],
  controllers: [DispatchController, YardsController, YardZonesController],
  providers: [
    PlacementValidatorService,
    YardProvisioningService,
    GetDispatchBoardUseCase,
    GetDispatchHistoryUseCase,
    AssignDispatchUseCase,
    CallNextDispatchUseCase,
    ChangeInspectionUseCase,
    MoveDispatchUseCase,
    ReleaseDispatchUseCase,
    ListYardsUseCase,
    ListYardZonesUseCase,
    UpdateYardZoneUseCase,
    GetYardDetailUseCase,
    ReleaseYardSlotUseCase,
    SetYardSlotLockUseCase,
    { provide: DISPATCH_ASSIGNMENT_REPOSITORY, useClass: TypeOrmDispatchAssignmentRepository },
    { provide: YARD_REPOSITORY, useClass: TypeOrmYardRepository },
  ],
  // Phân hệ cổng dùng lại kho vị trí để giải phóng chỗ khi xe được cho qua cổng ra (F44).
  exports: [DISPATCH_ASSIGNMENT_REPOSITORY],
})
export class DispatchModule {}
