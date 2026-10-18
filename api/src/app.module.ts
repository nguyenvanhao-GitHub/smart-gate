import { MailerModule } from '@nestjs-modules/mailer';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenGuard } from './common/auth/access-token.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { RequestContextMiddleware } from './common/context/request-context.middleware';
import { DatabaseModule } from './database/database.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DeclarationsModule } from './modules/declarations/declarations.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { FeesModule } from './modules/fees/fees.module';
import { FilesModule } from './modules/files/files.module';
import { GateModule } from './modules/gate/gate.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QueueModule } from './modules/queue/queue.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SmartGateModule } from './modules/smart-gate/smart-gate.module';
import { SystemModule } from './modules/system/system.module';
import { WorkflowModule } from './modules/workflow/workflow.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRootAsync({
      useFactory: () => {
        // SMTP đọc từ biến môi trường (giá trị thật chỉ nằm ở api/.env — không commit; production cấp
        // qua CI/CD). Không hard-code credential vào mã. Mailer offline/sai cấu hình được identity.service
        // bắt lỗi mềm nên app vẫn chạy.
        const port = parseInt(process.env.SMTP_PORT || '587', 10);
        return {
          transport: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port,
            secure: port === 465, // 465 = SSL; 587 = STARTTLS (Gmail)
            auth: {
              user: process.env.SMTP_USER || '',
              pass: process.env.SMTP_PASSWORD || '',
            },
          },
          defaults: {
            from: process.env.EMAIL_FROM || '"Cửa khẩu số" <no-reply@chc.gov.vn>',
          },
        };
      },
    }),
    DatabaseModule,
    AuditModule,
    SystemModule,
    AccessControlModule,
    IdentityModule,
    NotificationsModule,
    CatalogModule,
    DeclarationsModule,
    FilesModule,
    FeesModule,
    WorkflowModule,
    // P4 — điều phối, cổng, kho bãi. `GateModule` phải nằm sau `DispatchModule` vì nó dùng lại
    // kho vị trí để nhả ô đỗ khi xe được cho qua cổng ra.
    QueueModule,
    DispatchModule,
    GateModule,
    ReportsModule,
    SmartGateModule,
  ],
  providers: [
    // Thứ tự đăng ký = thứ tự chạy. AccessTokenGuard xác thực token và gắn `request.user`,
    // PermissionsGuard chạy sau để nạp quyền từ DB và đối chiếu @RequirePermission.
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Mở ngữ cảnh request (correlationId + IP) cho toàn bộ chuỗi xử lý — nhật ký kiểm toán cần.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
