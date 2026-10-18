import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FEE_CALCULATOR } from '../../common/fees/fee-calculator.port';
import { FEE_SETTLEMENT } from '../../common/fees/fee-settlement.port';
import { FEE_STEP_GATE } from '../../common/fees/fee-step-gate.port';
import { CatalogModule } from '../catalog/catalog.module';
import { DeclarationsModule } from '../declarations/declarations.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { UserOrmEntity } from '../identity/infrastructure/persistence/user.orm-entity';
import { WorkflowInstanceStepOrmEntity } from '../workflow/infrastructure/persistence/workflow-instance-step.orm-entity';
import { WorkflowInstanceOrmEntity } from '../workflow/infrastructure/persistence/workflow-instance.orm-entity';
import { FeeCatalogService } from './application/fee-catalog.service';
import { FEE_ACTOR_DIRECTORY } from './application/ports/fee-actor.port';
import { FEE_CHARGE_REPOSITORY } from './application/ports/fee-charge.repository';
import { FEE_REASON_CODE_CATALOG } from './application/ports/fee-reason-code.port';
import { FEE_RULE_REPOSITORY } from './application/ports/fee-rule.repository';
import { FEE_TRANSACTION_REPOSITORY } from './application/ports/fee-transaction.repository';
import { FeeBasisService } from './application/services/fee-basis.service';
import { FeeRuleSeedService } from './application/services/fee-rule-seed.service';
import { FeeSettlementService } from './application/services/fee-settlement.service';
import { AdjustFeeChargeUseCase } from './application/use-cases/adjust-fee-charge.use-case';
import { CalculateDossierFeesUseCase } from './application/use-cases/calculate-dossier-fees.use-case';
import { CollectFeeUseCase } from './application/use-cases/collect-fee.use-case';
import { CreateFeeRuleUseCase } from './application/use-cases/create-fee-rule.use-case';
import { GetDossierFeesUseCase } from './application/use-cases/get-dossier-fees.use-case';
import { ListFeeRuleVersionsUseCase } from './application/use-cases/list-fee-rule-versions.use-case';
import { ListFeeRulesUseCase } from './application/use-cases/list-fee-rules.use-case';
import { UpdateFeeRuleUseCase } from './application/use-cases/update-fee-rule.use-case';
import { CatalogFeeReasonAdapter } from './infrastructure/persistence/catalog-fee-reason.adapter';
import { DossierFeeCalculatorAdapter } from './infrastructure/persistence/dossier-fee-calculator.adapter';
import { FeeChargeOrmEntity } from './infrastructure/persistence/fee-charge.orm-entity';
import { FeeRuleOrmEntity } from './infrastructure/persistence/fee-rule.orm-entity';
import { FeeTransactionOrmEntity } from './infrastructure/persistence/fee-transaction.orm-entity';
import { TypeOrmFeeChargeRepository } from './infrastructure/persistence/typeorm-fee-charge.repository';
import { TypeOrmFeeRuleRepository } from './infrastructure/persistence/typeorm-fee-rule.repository';
import { TypeOrmFeeTransactionRepository } from './infrastructure/persistence/typeorm-fee-transaction.repository';
import { UserFeeActorAdapter } from './infrastructure/persistence/user-fee-actor.adapter';
import { WorkflowFeeStepGateAdapter } from './infrastructure/persistence/workflow-fee-step-gate.adapter';
import { DossierFeesController } from './presentation/http/dossier-fees.controller';
import { FeeRulesController } from './presentation/http/fee-rules.controller';
import { FeesController } from './presentation/http/fees.controller';

/**
 * Phân hệ thu phí (P5 · F46–F48).
 *
 * Chiều phụ thuộc: `fees` → `declarations` (hồ sơ + phạm vi dữ liệu), `fees` → `catalog` (mã lý do
 * điều chỉnh, nhóm `REASON_FEE_ADJUST`), `fees` → `dispatch` (số ngày lưu bãi lấy từ vị trí trong
 * bãi). Không có chiều ngược lại: phân hệ cổng chỉ biết `FEE_SETTLEMENT` — một cổng đặt ở
 * `common/` — nên **không** phụ thuộc vào chi tiết bên trong phân hệ phí (F39).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeeRuleOrmEntity,
      FeeChargeOrmEntity,
      FeeTransactionOrmEntity,
      // Chỉ để đọc tên người xác nhận — không import IdentityModule để khỏi tạo vòng.
      UserOrmEntity,
      // Chỉ ĐỌC tiến độ bước phí của phiên xử lý (cổng FEE_STEP_GATE) — không import WorkflowModule
      // để khỏi tạo vòng (workflow đã phụ thuộc fees qua FEE_SETTLEMENT).
      WorkflowInstanceOrmEntity,
      WorkflowInstanceStepOrmEntity,
    ]),
    DeclarationsModule,
    CatalogModule,
    DispatchModule,
  ],
  controllers: [FeesController, DossierFeesController, FeeRulesController],
  providers: [
    FeeCatalogService,
    FeeBasisService,
    FeeSettlementService,
    FeeRuleSeedService,
    GetDossierFeesUseCase,
    CalculateDossierFeesUseCase,
    AdjustFeeChargeUseCase,
    CollectFeeUseCase,
    ListFeeRulesUseCase,
    ListFeeRuleVersionsUseCase,
    CreateFeeRuleUseCase,
    UpdateFeeRuleUseCase,
    { provide: FEE_RULE_REPOSITORY, useClass: TypeOrmFeeRuleRepository },
    { provide: FEE_CHARGE_REPOSITORY, useClass: TypeOrmFeeChargeRepository },
    { provide: FEE_TRANSACTION_REPOSITORY, useClass: TypeOrmFeeTransactionRepository },
    { provide: FEE_REASON_CODE_CATALOG, useClass: CatalogFeeReasonAdapter },
    { provide: FEE_ACTOR_DIRECTORY, useClass: UserFeeActorAdapter },
    { provide: FEE_SETTLEMENT, useExisting: FeeSettlementService },
    { provide: FEE_STEP_GATE, useClass: WorkflowFeeStepGateAdapter },
    { provide: FEE_CALCULATOR, useClass: DossierFeeCalculatorAdapter },
  ],
  // Cổng tra nghĩa vụ tài chính cho phân hệ cổng/smart-gate (F39) và cổng tự tính phí cho phân hệ
  // workflow (tự tính khi hồ sơ tới bước thu phí — quyết định chủ dự án).
  exports: [FEE_SETTLEMENT, FEE_CALCULATOR],
})
export class FeesModule {}
