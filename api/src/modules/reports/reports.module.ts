import { Module } from '@nestjs/common';
import { DeclarationsModule } from '../declarations/declarations.module';
import { REPORT_QUERY_REPOSITORY } from './application/ports/report-query.repository';
import { ReportWorkbookService } from './application/services/report-workbook.service';
import { ExportReportUseCase } from './application/use-cases/export-report.use-case';
import { GetDashboardOverviewUseCase } from './application/use-cases/get-dashboard-overview.use-case';
import { ListReportCatalogUseCase } from './application/use-cases/list-report-catalog.use-case';
import { RunReportUseCase } from './application/use-cases/run-report.use-case';
import { TypeOrmReportQueryRepository } from './infrastructure/persistence/typeorm-report-query.repository';
import { DashboardController } from './presentation/http/dashboard.controller';
import { ReportsController } from './presentation/http/reports.controller';

/**
 * Phân hệ báo cáo và dashboard (P5 — F51–F56, F58).
 *
 * Phụ thuộc `DeclarationsModule` để dùng lại **đúng kho dữ liệu hồ sơ và đúng dịch vụ phạm vi**
 * (`DECLARATION_REPOSITORY`, `DossierScopeService`) mà màn hình danh sách đang dùng. Đây là điều
 * kiện để con số trên dashboard khớp với danh sách nguồn — không được thay bằng truy vấn riêng.
 *
 * ⚠️ Chưa có báo cáo thu phí: điểm D6 đã chốt hoãn tới khi có biểu phí chính thức.
 */
@Module({
  imports: [DeclarationsModule],
  controllers: [ReportsController, DashboardController],
  providers: [
    ListReportCatalogUseCase,
    RunReportUseCase,
    ExportReportUseCase,
    GetDashboardOverviewUseCase,
    ReportWorkbookService,
    { provide: REPORT_QUERY_REPOSITORY, useClass: TypeOrmReportQueryRepository },
  ],
})
export class ReportsModule {}
