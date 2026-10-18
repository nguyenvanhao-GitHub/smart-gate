import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { ShellComponent } from './core/layout/shell.component';
import { SgToastHostComponent } from './shared/ui/sg-toast-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ShellComponent, SgToastHostComponent],
  template: `
    @if (showShell()) {
      <app-shell><router-outlet /></app-shell>
    } @else {
      <router-outlet />
    }
    <!-- Nằm ngoài shell để thông báo 401/403 vẫn hiện được trên trang đăng nhập. -->
    <sg-toast-host />
  `,
})
export class AppComponent {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  protected showShell(): boolean {
    return this.auth.isAuthenticated() && !this.router.url.startsWith('/login');
  }
}
