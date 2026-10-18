import { Routes } from '@angular/router';
import { PERMISSION } from './core/auth/access-control.model';
import { authGuard, guestGuard, homeRedirectGuard } from './core/auth/auth.guard';
import { AdminUsersPageComponent } from './features/admin/pages/admin-users-page.component';
import { RoleManagementPageComponent } from './features/admin/pages/role-management-page.component';
import { CatalogAdminPageComponent } from './features/admin/pages/catalog-admin-page.component';
import { AuditLogPageComponent } from './features/admin/pages/audit-log-page.component';
import { SystemConfigPageComponent } from './features/system/pages/system-config-page.component';
import { LoginPageComponent } from './features/auth/pages/login-page.component';
import { RegisterPageComponent } from './features/auth/pages/register-page.component';
import { DeclarationDetailPageComponent } from './features/declarations/pages/declaration-detail-page.component';
import { DeclarationFormPageComponent } from './features/declarations/pages/declaration-form-page.component';
import { DeclarationListPageComponent } from './features/declarations/pages/declaration-list-page.component';
import { DashboardPageComponent } from './features/dashboard/pages/dashboard-page.component';
import { DispatchBoardPageComponent } from './features/dispatch/pages/dispatch-board-page.component';
import { DispatchHistoryPageComponent } from './features/dispatch/pages/dispatch-history-page.component';
import { DossierFeePageComponent } from './features/fees/pages/dossier-fee-page.component';
import { FeeRuleAdminPageComponent } from './features/fees/pages/fee-rule-admin-page.component';
import { FeeWorkbenchPageComponent } from './features/fees/pages/fee-workbench-page.component';
import { GateControlPageComponent } from './features/gate/pages/gate-control-page.component';
import { NotificationsPageComponent } from './features/notifications/pages/notifications-page.component';
import { ProfilePageComponent } from './features/profile/pages/profile-page.component';
import { ReportsPageComponent } from './features/reports/pages/reports-page.component';
import { WorkflowProcessPageComponent } from './features/workflow/pages/workflow-process-page.component';
import { WorkflowQueuePageComponent } from './features/workflow/pages/workflow-queue-page.component';
import { YardConfigPageComponent } from './features/yard/pages/yard-config-page.component';
import { YardMapPageComponent } from './features/yard/pages/yard-map-page.component';

/**
 * Phân quyền route khai bằng **mã quyền** (`data.permission`), không theo vai trò.
 * Trang gốc `/` điều hướng theo mục menu đầu tiên do API trả về.
 */
export const routes: Routes = [
  { path: 'login', component: LoginPageComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterPageComponent, canActivate: [guestGuard] },
  { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },

  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'notifications', component: NotificationsPageComponent, canActivate: [authGuard] },

  /*
   * UI-02 Dashboard tổng quan (P5). Đường dẫn lấy đúng mục menu `overview` do API seed
   * (`menu.catalog.ts` → `/operations/dashboard`).
   * Quyền: mục menu hiển thị theo `report.view`, còn số liệu là hồ sơ/phương tiện nên
   * `dossier.view` cũng vào được — khai cả hai để người thấy menu không bị chặn ở route.
   */
  { path: 'operations/dashboard', component: DashboardPageComponent, canActivate: [authGuard], data: { permission: [PERMISSION.dossierView, PERMISSION.reportView] } },

  /*
   * P4 — Đường dẫn ba màn dưới lấy đúng theo mục menu do API seed trong
   * `api/src/modules/access-control/domain/menu.catalog.ts`:
   *   dispatch → /operations/vehicle-confirmation
   *   gate     → /operations/vehicles-entered-gate
   *   yard     → /operations/customs-b5
   * Đổi đường dẫn ở một phía sẽ làm mục menu trỏ vào màn hình sai — sửa cả hai nơi.
   */
  { path: 'dispatch', redirectTo: 'operations/vehicle-confirmation', pathMatch: 'full' },
  { path: 'operations/vehicle-confirmation', component: DispatchBoardPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.dispatchView } },
  { path: 'dispatch/history', component: DispatchHistoryPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.dispatchView } },
  { path: 'operations/vehicles-entered-gate', component: GateControlPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.gateView } },
  { path: 'operations/customs-b5', component: YardMapPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.yardView } },
  { path: 'yard/config', component: YardConfigPageComponent, canActivate: [authGuard], data: { permission: [PERMISSION.yardApprove, PERMISSION.catalogUpdate] } },

  { path: 'declarations', component: DeclarationListPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.dossierView } },
  { path: 'declarations/new', component: DeclarationFormPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.dossierCreate } },
  { path: 'declarations/:id', component: DeclarationDetailPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.dossierView } },
  { path: 'declarations/:id/edit', component: DeclarationFormPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.dossierUpdate } },
  /*
   * UI-11 Thu phí THEO HỒ SƠ — khác màn phí theo lực lượng (`/fees/:slug`) bên dưới, vốn là
   * đích của mục menu `fee` do API seed (`menu.catalog.ts` → `/fees/tax`). Màn này vào bằng
   * cách mở một hồ sơ cụ thể nên cố ý **không** có mục menu riêng (route có tham số `:id`).
   */
  { path: 'declarations/:id/fees', component: DossierFeePageComponent, canActivate: [authGuard], data: { permission: PERMISSION.feeView } },

  { path: 'workflow/queue', component: WorkflowQueuePageComponent, canActivate: [authGuard], data: { permission: PERMISSION.workflowView } },
  { path: 'workflow/dossiers/:id', component: WorkflowProcessPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.workflowView } },

  // F46 Quản trị biểu phí — khai TRƯỚC `fees/:slug` để "rules" không bị nuốt thành slug. Quyền duyệt phí.
  { path: 'fees/rules', component: FeeRuleAdminPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.feeApprove } },
  { path: 'fees/:slug', component: FeeWorkbenchPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.feeView } },

  { path: 'reports', redirectTo: 'reports/general', pathMatch: 'full' },
  { path: 'reports/:group', component: ReportsPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.reportView } },

  { path: 'admin/users', component: AdminUsersPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.systemView } },
  { path: 'admin/roles', component: RoleManagementPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.systemView } },
  { path: 'admin/catalog', component: CatalogAdminPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.catalogView } },
  { path: 'admin/audit', component: AuditLogPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.systemView } },
  // BA-092 — màn "Cấu hình hệ thống" (mục menu `system-config` do API seed). Xem cần system.view;
  // nút Lưu chỉ hiện khi có system.update (kiểm thêm ở component qua *hasPermission).
  { path: 'admin/system-config', component: SystemConfigPageComponent, canActivate: [authGuard], data: { permission: PERMISSION.systemView } },
];
