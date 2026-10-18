import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/i18n/i18n.service';
import { YardZone } from '../../../core/models/yard.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';

/** Bản nháp đang sửa trong hộp thoại. */
interface ZoneDraft {
  name: string;
  capacity: string;
}

/**
 * F42 — Cấu hình bãi và sức chứa (UI-11).
 *
 * Bảng khu bãi với **tên và sức chứa sửa được** qua hộp thoại; lưu bằng `PATCH /catalog/yard-zones/:code`.
 * Khu bãi là danh mục `YARD_ZONE` (điểm D8) nên đây là nơi quản trị sức chứa — bảng `yards` được dựng
 * lại từ danh mục lúc khởi động. Cột "đang dùng" là số ô có xe hiện thời, chỉ để tham chiếu. Cần quyền
 * `yard.approve` hoặc `catalog.update`.
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.yardZones.title') }}</h1>
        <p class="head__desc">{{ t('ui.yardZones.subtitle') }}</p>
      </div>
      <a sgButton="secondary" routerLink="/operations/customs-b5">
        <mat-icon fontSet="material-icons-round">arrow_back</mat-icon>{{ t('ui.yardZones.backToMap') }}
      </a>
    </section>

    <sg-card [flush]="true">
      <div class="sg-scroll-x">
        <table class="grid">
          <thead>
            <tr>
              <th>{{ t('ui.yardZones.colCode') }}</th>
              <th>{{ t('ui.yardZones.colName') }}</th>
              <th>{{ t('ui.yardZones.colCapacity') }}</th>
              <th>{{ t('ui.yardZones.colUsed') }}</th>
              <th>{{ t('ui.yardZones.colStatus') }}</th>
              <th class="col-action">{{ t('ui.yardZones.colAction') }}</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="6" class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.yardZones.loading') }}</td></tr>
            } @else if (!zones().length) {
              <tr><td colspan="6" class="state">{{ t('ui.yardZones.empty') }}</td></tr>
            } @else {
              @for (zone of zones(); track zone.code) {
                <tr>
                  <td>{{ zone.code }}</td>
                  <td>{{ zone.name }}</td>
                  <td>{{ zone.capacity }}</td>
                  <td>{{ zone.used }} / {{ zone.slotCount }}</td>
                  <td>
                    <span class="pill" [class.pill--off]="!zone.active">
                      {{ zone.active ? t('ui.yardZones.statusActive') : t('ui.yardZones.statusInactive') }}
                    </span>
                  </td>
                  <td class="col-action">
                    <button type="button" sgButton="tertiary" size="sm" (click)="openEdit(zone)">
                      <mat-icon fontSet="material-icons-round">edit</mat-icon>{{ t('ui.yardZones.edit') }}
                    </button>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </sg-card>

    @if (editing(); as zone) {
      <sg-modal [title]="t('ui.yardZones.modalTitle', { name: zone.name })" [ariaLabel]="t('ui.yardZones.modalAria')" (close)="closeEdit()">
        <div class="form">
          <sg-form-field [label]="t('ui.yardZones.fieldName')" [required]="true" [error]="fieldErrors().name">
            <input type="text" name="name" [attr.aria-label]="t('ui.yardZones.fieldName')" [(ngModel)]="draft.name" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.yardZones.fieldCapacity')" [required]="true" [hint]="t('ui.yardZones.capacityHint')" [error]="fieldErrors().capacity">
            <input type="number" name="capacity" min="0" step="1" [attr.aria-label]="t('ui.yardZones.fieldCapacity')" [(ngModel)]="draft.capacity" />
          </sg-form-field>
        </div>

        <button modal-footer type="button" sgButton="secondary" [disabled]="submitting()" (click)="closeEdit()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton [disabled]="submitting()" (click)="save()">
          {{ submitting() ? t('ui.common.saving') : t('ui.yardZones.edit') }}
        </button>
      </sg-modal>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .head h1 { margin: 0; }
      .head__desc { margin: var(--sg-space-1) 0 0; color: var(--sg-text-muted); }

      .grid { width: 100%; min-width: 720px; border-collapse: collapse; background: var(--sg-bg-surface); }
      .grid th, .grid td { padding: var(--sg-space-2) var(--sg-space-3); border-bottom: 1px solid var(--sg-border); text-align: left; vertical-align: middle; }
      .grid th { background: var(--sg-bg-subtle); font-size: var(--sg-small-size); text-transform: uppercase; letter-spacing: .02em; }
      .col-action { text-align: right; }

      .pill { display: inline-block; padding: 2px var(--sg-space-2); border-radius: 999px; font-size: var(--sg-small-size); background: var(--sg-success-soft, #e6f4ea); color: var(--sg-success, #1b7f3b); }
      .pill--off { background: var(--sg-bg-subtle); color: var(--sg-text-muted); }

      .state { display: flex; align-items: center; justify-content: center; gap: var(--sg-space-2); padding: var(--sg-space-8); color: var(--sg-text-muted); }
      .form { display: grid; gap: var(--sg-space-3); }

      @media (max-width: 720px) {
        .head { flex-direction: column; }
      }
    `,
  ],
})
export class YardConfigPageComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly appMessages = inject(AppMessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly zones = signal<YardZone[]>([]);
  protected readonly loading = signal(true);

  protected readonly editing = signal<YardZone | null>(null);
  /** Lỗi validate theo từng ô trong hộp thoại sửa — hiện ngay dưới ô nhập. */
  protected readonly fieldErrors = signal<{ name: string; capacity: string }>({ name: '', capacity: '' });
  protected readonly submitting = signal(false);
  protected draft: ZoneDraft = { name: '', capacity: '' };

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getYardZones().subscribe({
      next: (list) => {
        this.loading.set(false);
        this.zones.set(list ?? []);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.zones.set([]);
        this.appMessages.showApiError(err, 'ui.yardZones.loadFailed');
      },
    });
  }

  // --- Sửa -------------------------------------------------------------------

  protected openEdit(zone: YardZone): void {
    this.editing.set(zone);
    this.fieldErrors.set({ name: '', capacity: '' });
    this.draft = { name: zone.name, capacity: String(zone.capacity) };
  }

  protected closeEdit(): void {
    this.editing.set(null);
    this.fieldErrors.set({ name: '', capacity: '' });
  }

  protected save(): void {
    const zone = this.editing();
    if (!zone) return;

    // Lỗi validate theo từng ô → hiện ngay dưới ô, cuộn/focus ô đầu tiên lỗi và báo toast tổng.
    const name = this.draft.name.trim();
    if (!name) {
      this.setFieldError('name', this.t('ui.yardZones.invalidName'));
      return;
    }
    const capacity = Number(this.draft.capacity);
    if (!Number.isInteger(capacity) || capacity < 0) {
      this.setFieldError('capacity', this.t('ui.yardZones.invalidCapacity'));
      return;
    }
    this.fieldErrors.set({ name: '', capacity: '' });

    this.submitting.set(true);
    this.api.updateYardZone(zone.code, { name, capacity }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeEdit();
        this.load();
        this.appMessages.showKey('ui.yardZones.saved', 'success', { name });
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.appMessages.showApiError(err, 'ui.yardZones.saveFailed');
      },
    });
  }

  /** Đặt lỗi cho một ô, cuộn/focus tới ô đó và báo toast tổng "kiểm tra lại các trường". */
  private setFieldError(field: 'name' | 'capacity', message: string): void {
    this.fieldErrors.set({ name: '', capacity: '', [field]: message });
    this.appMessages.showKey('ui.common.formHasErrors', 'error');
    setTimeout(() => {
      const input = this.host.nativeElement.querySelector<HTMLInputElement>(`input[name="${field}"]`);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
    });
  }
}
