import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeVi from '@angular/common/locales/vi';
import { LOCALE_ID } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authTokenInterceptor } from './app/core/auth/auth-token.interceptor';

// Locale tiếng Việt cho các pipe `number`/`date`/`currency`: số nhóm bằng dấu chấm (18.000),
// không phải dấu phẩy kiểu Anh (18,000). Phải đăng ký dữ liệu locale trước khi provide LOCALE_ID.
registerLocaleData(localeVi);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: LOCALE_ID, useValue: 'vi-VN' },
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    // Nạp ECharts theo kiểu **động**: esbuild tách thành chunk riêng nên bundle khởi động
    // không cõng thư viện biểu đồ. Bản dựng tối giản ở `shared/charts/echarts-core.ts`.
    provideEchartsCore({ echarts: () => import('./app/shared/charts/echarts-core') }),
  ],
}).catch((error) => console.error(error));
