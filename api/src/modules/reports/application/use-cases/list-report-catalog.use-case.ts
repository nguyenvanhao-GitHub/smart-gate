import { Injectable } from '@nestjs/common';
import { REPORT_CATALOG } from '../../domain/report.catalog';
import { ReportCatalogView } from '../dto/report-view.dto';

/** Danh mục báo cáo cho UI-12 — chỉ siêu dữ liệu, không đụng dữ liệu nghiệp vụ. */
@Injectable()
export class ListReportCatalogUseCase {
  execute(): ReportCatalogView[] {
    return REPORT_CATALOG.map((item) => ({
      code: item.code,
      name: item.name,
      group: item.group,
      description: item.description,
      filters: item.filters,
    }));
  }
}
