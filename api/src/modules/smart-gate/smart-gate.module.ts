import { Module } from '@nestjs/common';
import { DeclarationsModule } from '../declarations/declarations.module';
import { FeesModule } from '../fees/fees.module';
import { DashboardReadModelService } from './application/dashboard-read-model.service';
import { SmartGateRuleService } from './application/smart-gate-rule.service';
import { SmartGateController } from './presentation/http/smart-gate.controller';

/** `smart-gate` → `fees` chỉ để đọc cổng `FEE_SETTLEMENT` (nghĩa vụ tài chính, F39). */
@Module({
  imports: [DeclarationsModule, FeesModule],
  controllers: [SmartGateController],
  providers: [SmartGateRuleService, DashboardReadModelService],
})
export class SmartGateModule {}
