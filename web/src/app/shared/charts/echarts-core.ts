// =============================================================================
// Bản dựng ECharts tối giản cho SmartGate (điểm C1 — chốt dùng ECharts).
//
// **Chỉ nạp đúng thứ đang dùng**: biểu đồ đường + cột, lưới, tooltip, chú giải,
// bộ vẽ canvas. Nạp cả gói `echarts` sẽ kéo theo bản đồ, đồ thị quan hệ, 3D...
// làm phình bundle mà không màn hình nào cần.
//
// Tệp này được nạp **động** (`() => import('./echarts-core')` trong `main.ts`) nên
// esbuild tách nó thành chunk riêng — người dùng không tải ECharts khi chưa mở
// màn hình có biểu đồ.
// =============================================================================

import { use } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

// `ngx-echarts` gọi `init` trên module này (xem `provideEchartsCore` trong `main.ts`).
export * from 'echarts/core';
