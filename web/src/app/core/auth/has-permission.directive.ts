import { Directive, effect, inject, Input, signal, TemplateRef, ViewContainerRef } from '@angular/core';
import { PermissionRequirement } from './access-control.model';
import { AuthService } from './auth.service';

/**
 * Ẩn/hiện phần tử theo quyền lấy từ API — thay cho `*ngIf="role === 'CUSTOMS'"`.
 *
 *   <button *hasPermission="'dossier.approve'">Duyệt hồ sơ</button>
 *   <a *hasPermission="['fee.view', 'fee.approve']">Thu phí</a>   <!-- có bất kỳ quyền nào -->
 *
 * Lưu ý: đây chỉ là lớp che giao diện. Quyền vẫn phải được kiểm ở API (SRS mục 3.2).
 */
@Directive({
  selector: '[hasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);
  private readonly required = signal<PermissionRequirement>([]);
  private visible = false;

  @Input()
  set hasPermission(value: PermissionRequirement) {
    this.required.set(value);
  }

  constructor() {
    effect(() => {
      const allowed = this.auth.hasPermission(this.required());
      if (allowed === this.visible) return;
      this.visible = allowed;
      this.viewContainer.clear();
      if (!allowed) return;
      // Effect chạy SAU lượt kiểm tra của view cha, nên khung nhìn vừa tạo phải tự chạy
      // ràng buộc lần đầu — nếu không, `{{ t('…') }}` và `[routerLink]` bên trong sẽ rỗng
      // cho tới lượt kiểm tra kế tiếp.
      this.viewContainer.createEmbeddedView(this.template).detectChanges();
    });
  }
}
