import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { PERMISSION } from '../../../core/auth/access-control.model';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import {
  DOSSIER_TYPE_LABEL_KEYS,
  DossierFilters,
  DossierSummary,
  dossierStatusLabel,
  dossierStatusTone,
  dossierTypeLabel,
  isDossierCancelable,
  isDossierDeletable,
  isDossierEditable,
  isDossierStatusGroup,
  formatEnterpriseIdentifierPrefix,
} from '../../../core/models/declaration.model';
import { CatalogItem } from '../../../core/models/admin.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgDatePickerComponent } from '../../../shared/ui/sg-date-picker.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';

const PAGE_SIZES = [10, 20, 50];

/** Trạng thái hiển thị ở bộ lọc — 10 trạng thái luồng nghiệp vụ của hồ sơ. */
const FILTER_STATUSES = [
  'DRAFT',
  'WAITING_GATE',
  'WAITING_CALL',
  'BUSINESS_PROCESSING',
  'REVISION_REQUIRED',
  'WAITING_FOR_FEE',
  'READY_FOR_EXIT',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
];

interface ListFilters {
  keyword: string;
  type: string;
  status: string;
  /** CR2 — cờ dịch tễ: '' = tất cả, 'true' = chỉ hồ sơ có cờ. Mã ASCII, không dò chuỗi hiển thị. */
  epidemic: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: ListFilters = { keyword: '', type: '', status: '', epidemic: '', from: '', to: '' };

/**
 * UI-03 — Danh sách hồ sơ phương tiện – hàng hóa.
 * Bắt buộc theo SRS 8.1: tìm kiếm, lọc, phân trang, trạng thái rỗng, trạng thái tải và thông báo lỗi.
 */
@Component({
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatIconModule,
    HasPermissionDirective,
    SgButtonDirective,
    SgCardComponent,
    SgDatePickerComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgPagerComponent,
    SgSearchInputComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t('ui.dossier.listTitle') }}</h1>
      </div>
      <a sgButton routerLink="/declarations/new" *hasPermission="permission.dossierCreate">
        <mat-icon fontSet="material-icons-round">note_add</mat-icon>{{ t('ui.dossier.create') }}
      </a>
    </section>

    <sg-card [flush]="true">
      <div class="filters">
        <sg-search-input
          class="filters__search"
          [placeholder]="t('ui.dossier.searchPlaceholder')"
          [ariaLabel]="t('ui.dossier.searchAria')"
          [(ngModel)]="filters.keyword"
          (search)="applyFilters()"
        />
        <sg-select [ariaLabel]="t('ui.dossier.type')" [placeholder]="t('ui.dossier.typeAll')" [options]="typeOptions()" [(ngModel)]="filters.type" (valueChange)="applyFilters()" />
        <sg-select [ariaLabel]="t('ui.dossier.status')" [placeholder]="t('ui.dossier.statusAll')" [options]="statusOptions()" [(ngModel)]="filters.status" (valueChange)="applyFilters()" />
        <sg-select [ariaLabel]="t('ui.dossier.epidemicFilter')" [placeholder]="t('ui.dossier.epidemicFilterAll')" [options]="epidemicOptions()" [(ngModel)]="filters.epidemic" (valueChange)="applyFilters()" />
        <sg-date-picker [ariaLabel]="t('ui.common.fromDate')" [value]="filters.from" [(ngModel)]="filters.from" (ngModelChange)="applyFilters()" (valueChange)="applyFilters()" />
        <sg-date-picker [ariaLabel]="t('ui.common.toDate')" [value]="filters.to" [(ngModel)]="filters.to" (ngModelChange)="applyFilters()" (valueChange)="applyFilters()" />
        <button type="button" sgButton (click)="applyFilters()"><mat-icon fontSet="material-icons-round">search</mat-icon>{{ t('ui.common.search') }}</button>
        <button type="button" sgButton="tertiary" (click)="resetFilters()"><mat-icon fontSet="material-icons-round">restart_alt</mat-icon>{{ t('ui.common.reset') }}</button>
      </div>


      <div class="sg-scroll-x">
        <table class="grid">
          <thead>
            <tr>
              <th>{{ t('ui.dossier.colCode') }}</th>
              <th>{{ t('ui.dossier.colType') }}</th>
              <th>{{ t('ui.dossier.colEnterprise') }}</th>
              <th>{{ t('ui.dossier.colVehicle') }}</th>
              <th>{{ t('ui.dossier.colDriver') }}</th>
              <th>{{ t('ui.dossier.colCargo') }}</th>
              <th>{{ t('ui.dossier.colCreatedAt') }}</th>
              <th>{{ t('ui.dossier.status') }}</th>
              <th class="grid__actions">{{ t('ui.common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="9" class="state"><mat-icon fontSet="material-icons-round">hourglass_top</mat-icon>{{ t('ui.dossier.loadingList') }}</td></tr>
            } @else if (error()) {
              <tr><td colspan="9" class="state">{{ t('ui.dossier.displayError') }}</td></tr>
            } @else if (!items().length) {
              <tr>
                <td colspan="9" class="state">
                  <mat-icon fontSet="material-icons-round">inbox</mat-icon>
                  {{ hasActiveFilters() ? t('ui.dossier.emptyFiltered') : t('ui.dossier.emptyAll') }}
                </td>
              </tr>
            } @else {
              @for (item of items(); track item.id) {
                <tr>
                  <td>
                    <div class="code-group">
                      <a class="code" [routerLink]="['/declarations', item.id]">{{ item.code }}</a>
                      <button type="button" class="btn-copy-code" [title]="t('ui.dossier.copyCodeHint')" [attr.aria-label]="t('ui.dossier.copyCodeHint')" (click)="copyCode(item.code, $event)">
                        <mat-icon fontSet="material-icons-round">content_copy</mat-icon>
                      </button>
                    </div>
                    @if (item.epidemicFlag) {
                      <span class="epidemic" [title]="t('ui.dossier.epidemicBadgeTitle')">
                        <mat-icon fontSet="material-icons-round">coronavirus</mat-icon>{{ t('ui.dossier.epidemicBadge') }}
                      </span>
                    }
                  </td>
                  <td>{{ typeLabel(item.type) }}</td>
                  <td>
                    <strong>{{ item.enterprise.name }}</strong>
                    <span class="sub">{{ enterpriseIdentifier(item) }}</span>
                  </td>
                  <td>
                    <strong>{{ item.vehicle.plateNumber }}</strong>
                    <span class="sub">{{ containerLabel(item) }}</span>
                  </td>
                  <td>
                    @if (item.driver) {
                      <strong>{{ item.driver.fullName }}</strong>
                      <span class="sub">{{ item.driver.idNumber }}</span>
                    } @else {
                      <span class="sub">{{ t('ui.dossier.noDriver') }}</span>
                    }
                  </td>
                  <td class="cargo">{{ item.cargoSummary || t('ui.dossier.noCargo') }}</td>
                  <td>{{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td><span class="chip" [attr.data-tone]="statusTone(item.status)">{{ statusLabel(item.status) }}</span></td>
                  <td class="grid__actions">
                    <a class="iconbtn" [routerLink]="['/declarations', item.id]" [title]="t('ui.dossier.viewDetail')" [attr.aria-label]="t('ui.dossier.viewDetail')">
                      <mat-icon fontSet="material-icons-round">visibility</mat-icon>
                    </a>
                    <button type="button" class="iconbtn" *hasPermission="permission.dossierCreate" [disabled]="copyingId() === item.id" [title]="t('ui.dossier.copy')" [attr.aria-label]="t('ui.dossier.copy')" (click)="copy(item)">
                      <mat-icon fontSet="material-icons-round">content_copy</mat-icon>
                    </button>
                    @if (canEdit(item)) {
                      <a class="iconbtn" [routerLink]="['/declarations', item.id, 'edit']" [title]="t('ui.dossier.edit')" [attr.aria-label]="t('ui.dossier.edit')">
                        <mat-icon fontSet="material-icons-round">edit</mat-icon>
                      </a>
                    }
                    @if (canCancel(item)) {
                      <button type="button" class="iconbtn iconbtn--danger" [title]="t('ui.dossier.cancel')" [attr.aria-label]="t('ui.dossier.cancel')" (click)="askCancel(item)">
                        <mat-icon fontSet="material-icons-round">cancel</mat-icon>
                      </button>
                    }
                    @if (canDelete(item)) {
                      <button type="button" class="iconbtn iconbtn--danger" [title]="t('ui.dossier.deleteDraft')" [attr.aria-label]="t('ui.dossier.deleteDraft')" (click)="askDelete(item)">
                        <mat-icon fontSet="material-icons-round">delete</mat-icon>
                      </button>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <div card-footer class="pager">
        <span>{{ summary() }}</span>
        <div class="pager__controls">
          <span class="pager__label">{{ t('ui.common.display') }}</span>
          <sg-select class="pager__size" [showEmptyOption]="false" [ariaLabel]="t('ui.dossier.pageSizeAria')" [options]="pageSizeOptions()" [value]="pageSizeValue()" (valueChange)="changePageSize($event)" />
        </div>
        <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()" (pageChange)="goToPage($event)" />
      </div>
    </sg-card>

    @if (cancelTarget(); as target) {
      <sg-modal size="sm" [title]="t('ui.dossier.cancelTitle')" (close)="closeCancelModal()">
        <p class="modal__desc">
          {{ t('ui.dossier.cancelDesc', { code: target.code, enterprise: target.enterprise.name }) }}
        </p>
        <sg-form-field [label]="t('ui.dossier.cancelReasonLabel')" [required]="true" [error]="cancelReasonError()">
          <input
            class="modal__input"
            [(ngModel)]="cancelReason"
            (ngModelChange)="onCancelReasonChange()"
            [placeholder]="t('ui.dossier.cancelReasonPlaceholder')"
          />
        </sg-form-field>
        <button modal-footer type="button" sgButton="secondary" (click)="closeCancelModal()">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton="danger" [disabled]="cancelling()" (click)="confirmCancel()">
          {{ cancelling() ? t('ui.dossier.cancelling') : t('ui.dossier.confirmCancel') }}
        </button>
      </sg-modal>
    }

    @if (deleteTarget(); as target) {
      <sg-modal size="sm" [title]="t('ui.dossier.deleteTitle')" (close)="deleteTarget.set(null)">
        <p class="modal__desc">
          {{ t('ui.dossier.deleteDesc', { code: target.code, enterprise: target.enterprise.name }) }}
        </p>
        <button modal-footer type="button" sgButton="secondary" (click)="deleteTarget.set(null)">{{ t('ui.common.cancelAction') }}</button>
        <button modal-footer type="button" sgButton="danger" [disabled]="deleting()" (click)="confirmDelete()">
          {{ deleting() ? t('ui.dossier.deleting') : t('ui.dossier.confirmDelete') }}
        </button>
      </sg-modal>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sg-space-3); margin-bottom: var(--sg-space-3); }
      .head h1 { margin: 0; }
      .feedback { display: block; margin: var(--sg-space-3) var(--sg-space-4) 0; }

      .filters {
        display: grid;
        grid-template-columns: minmax(220px, 1.6fr) repeat(3, minmax(140px, .9fr)) repeat(2, minmax(130px, .8fr)) auto auto;
        gap: var(--sg-space-3);
        align-items: center;
        padding: var(--sg-space-3) var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
      }

      .grid { width: 100%; min-width: 1060px; border-collapse: collapse; background: var(--sg-bg-surface); }
      .grid th, .grid td { padding: var(--sg-space-2) var(--sg-space-3); border-bottom: 1px solid var(--sg-border); text-align: left; vertical-align: middle; }
      .grid th { background: var(--sg-bg-subtle); font-size: var(--sg-small-size); text-transform: uppercase; letter-spacing: .02em; }
      .grid tbody tr:hover { background: var(--sg-bg-subtle); }
      .grid__actions { white-space: nowrap; text-align: right; }
      .state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--sg-space-2);
        padding: var(--sg-space-8);
        color: var(--sg-text-muted);
      }
      .code-group { display: inline-flex; align-items: center; gap: 6px; }
      .code { color: var(--sg-primary); font-weight: 700; text-decoration: none; }
      .code:hover { text-decoration: underline; }
      .btn-copy-code {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius-sm, 4px);
        background: var(--sg-bg-surface);
        color: var(--sg-text-muted);
        cursor: pointer;
        transition: all 0.15s ease-in-out;
      }
      .btn-copy-code:hover {
        background: var(--sg-bg-subtle);
        color: var(--sg-primary);
        border-color: var(--sg-primary);
      }
      .btn-copy-code mat-icon { font-size: 14px; width: 14px; height: 14px; }
      .epidemic {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-top: 4px;
        padding: 1px var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-state-warning-soft);
        color: var(--sg-state-warning-ink);
        font-size: var(--sg-small-size);
        font-weight: 700;
      }
      .epidemic mat-icon { width: 14px; height: 14px; font-size: 14px; }
      .sub { display: block; color: var(--sg-text-muted); font-size: var(--sg-small-size); }
      .cargo { max-width: 240px; }
      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-state-idle-soft);
        color: var(--sg-state-idle);
        font-size: var(--sg-small-size);
        font-weight: 700;
      }
      .chip[data-tone='processing'] { background: var(--sg-state-processing-soft); color: var(--sg-state-processing); }
      .chip[data-tone='done'] { background: var(--sg-state-done-soft); color: var(--sg-state-done); }
      .chip[data-tone='waiting'] { background: var(--sg-state-waiting-soft); color: var(--sg-state-waiting-ink); }
      .chip[data-tone='warning'] { background: var(--sg-state-warning-soft); color: var(--sg-state-warning-ink); }
      .chip[data-tone='rejected'] { background: var(--sg-state-rejected-soft); color: var(--sg-state-rejected); }

      .iconbtn {
        display: inline-grid;
        place-items: center;
        width: 30px;
        min-width: 30px;
        height: 30px;
        min-height: 30px;
        margin-left: 2px;
        padding: 0;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text-muted);
        cursor: pointer;
      }
      .iconbtn:hover { background: var(--sg-bg-muted); color: var(--sg-primary); }
      .iconbtn mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .iconbtn--danger:hover { color: var(--sg-danger); }

      .pager {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }
      .pager__controls { display: inline-flex; align-items: center; gap: 8px; justify-self: center; }
      .pager sg-pager { justify-self: end; }
      .pager__label { color: var(--sg-text-muted); font-size: var(--sg-small-size); white-space: nowrap; }
      .pager__size { width: 72px; }

      .modal__desc { margin: 0 0 var(--sg-space-3); color: var(--sg-text-muted); }
      .modal__input {
        width: 100%;
        min-height: var(--sg-control-height);
        padding: 0 var(--sg-space-3);
        border: 1px solid var(--sg-border-strong);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
        color: var(--sg-text);
        font-family: var(--sg-font-family);
        font-size: var(--sg-body-size);
      }

      @media (max-width: 1280px) {
        .filters { grid-template-columns: 1fr 1fr; }
      }
    `,
  ],
})
export class DeclarationListPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly appMessages = inject(AppMessageService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại, không tải lại trang. */
  protected readonly t = this.i18n.t;

  protected readonly permission = PERMISSION;
  protected readonly items = signal<DossierSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly loading = signal(false);
  /** Giữ để bảng tự hiện trạng thái lỗi tải; thông báo cho người dùng đi qua toast. */
  protected readonly error = signal('');
  protected readonly deleteTarget = signal<DossierSummary | null>(null);
  protected readonly deleting = signal(false);
  protected readonly cancelTarget = signal<DossierSummary | null>(null);
  protected readonly cancelling = signal(false);
  protected cancelReason = '';
  protected readonly cancelReasonError = signal('');
  /** Id hồ sơ đang được sao chép — để khóa nút Copy của đúng dòng đó trong lúc gọi API. */
  protected readonly copyingId = signal<string | null>(null);

  protected filters: ListFilters = { ...EMPTY_FILTERS };
  protected readonly dossierTypes = signal<CatalogItem[]>([]);

  // Nhãn của ô lọc là `computed` nên tự đổi khi người dùng đổi ngôn ngữ.
  protected readonly typeOptions = computed<SgSelectOption[]>(() => {
    const items = this.dossierTypes();
    if (items.length > 0) {
      return items.map((item) => ({ value: item.code, label: item.name }));
    }
    return Object.keys(DOSSIER_TYPE_LABEL_KEYS).map((value) => ({ value, label: dossierTypeLabel(value, this.t) }));
  });
  // Ô lọc trạng thái: 10 trạng thái theo luồng nghiệp vụ của hồ sơ.
  protected readonly statusOptions = computed<SgSelectOption[]>(() =>
    FILTER_STATUSES.map((value) => ({ value, label: dossierStatusLabel(value, this.t) })),
  );
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );
  // CR2 — ô lọc theo cờ dịch tễ: tất cả / chỉ hồ sơ có cờ. Giá trị là mã ASCII ('' | 'true').
  protected readonly epidemicOptions = computed<SgSelectOption[]>(() => [
    { value: 'true', label: this.t('ui.dossier.epidemicFilterOnly') },
  ]);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly summary = computed(() => {
    if (!this.total()) return this.t('ui.dossier.summaryEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.total(), this.page() * this.pageSize());
    return this.t('ui.dossier.summary', { start, end, total: this.total() });
  });

  ngOnInit(): void {
    this.loadCatalogs();
    this.loadListFromRoute();
  }

  /** Nạp các danh mục cấu hình từ API (F04). */
  private loadCatalogs(): void {
    this.loadDossierTypes();
  }

  private loadDossierTypes(): void {
    this.api.getDossierTypes().subscribe({
      next: (items) => this.dossierTypes.set(items || []),
      error: () => this.dossierTypes.set([]),
    });
  }

  private loadListFromRoute(): void {
    // Dashboard và thông báo điều hướng sang đây kèm bộ lọc trên query param.
    this.route.queryParamMap.subscribe((params) => {
      this.filters = {
        ...EMPTY_FILTERS,
        keyword: params.get('keyword') || '',
        type: params.get('type') || '',
        // Drilldown KPI "Đang xử lý" điều hướng kèm `statusGroup`; ô lọc trạng thái hiển thị chung
        // một trường nên nhận nhóm (nếu có) rồi mới đến trạng thái đơn.
        status: params.get('statusGroup') || params.get('status') || '',
        epidemic: params.get('epidemic') || '',
        from: params.get('from') || '',
        to: params.get('to') || '',
      };
      this.page.set(1);
      this.load();
    });
  }

  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  protected resetFilters(): void {
    this.filters = { ...EMPTY_FILTERS };
    this.page.set(1);
    void this.router.navigate([], { queryParams: {} });
    this.load();
  }

  protected hasActiveFilters(): boolean {
    return Object.values(this.filters).some((value) => !!value);
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
    this.load();
  }

  protected goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.page()) return;
    this.page.set(next);
    this.load();
  }

  protected typeLabel(type: string): string {
    const item = this.dossierTypes().find((i) => i.code === type);
    return dossierTypeLabel(type, this.t, item?.name);
  }

  protected statusLabel(status: string): string {
    return dossierStatusLabel(status, this.t);
  }

  protected statusTone(status: string): string {
    return dossierStatusTone(status);
  }

  protected containerLabel(item: DossierSummary): string {
    const parts = [
      item.vehicle.containerNumber ? this.t('ui.dossier.containerPrefix', { number: item.vehicle.containerNumber }) : '',
      item.vehicle.trailerNumber ? this.t('ui.dossier.trailerPrefix', { number: item.vehicle.trailerNumber }) : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : this.t('ui.dossier.noContainer');
  }

  protected canEdit(item: DossierSummary): boolean {
    return this.auth.hasPermission(PERMISSION.dossierUpdate) && isDossierEditable(item.status);
  }

  protected enterpriseIdentifier(item: DossierSummary): string {
    return formatEnterpriseIdentifierPrefix(item.enterprise, this.t);
  }

  protected canCancel(item: DossierSummary): boolean {
    if (!isDossierCancelable(item.status)) return false;
    const roles = this.auth.roleCodes();
    const isAdmin = roles.includes('SYS_ADMIN') || roles.includes('SUPER_ADMIN');
    const isEnterprise = roles.includes('DOANH_NGHIEP') || roles.includes('ENTERPRISE');
    const hasPerm = this.auth.hasPermission(PERMISSION.dossierDelete) || this.auth.hasPermission(PERMISSION.dossierUpdate);
    return (isAdmin || isEnterprise) && hasPerm;
  }

  protected canDelete(item: DossierSummary): boolean {
    return this.auth.hasPermission(PERMISSION.dossierDelete) && isDossierDeletable(item.status);
  }

  protected copyCode(code: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        () => this.appMessages.showKey('ui.dossier.copyCodeSuccess', 'success', { code }),
        () => this.fallbackCopyCode(code),
      );
    } else {
      this.fallbackCopyCode(code);
    }
  }

  private fallbackCopyCode(code: string): void {
    const input = document.createElement('input');
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    this.appMessages.showKey('ui.dossier.copyCodeSuccess', 'success', { code });
  }

  protected askDelete(item: DossierSummary): void {
    this.deleteTarget.set(item);
  }

  protected askCancel(item: DossierSummary): void {
    this.cancelReason = '';
    this.cancelReasonError.set('');
    this.cancelTarget.set(item);
  }

  protected closeCancelModal(): void {
    this.cancelTarget.set(null);
    this.cancelReason = '';
    this.cancelReasonError.set('');
  }

  protected onCancelReasonChange(): void {
    if (this.cancelReasonError() && this.cancelReason.trim()) {
      this.cancelReasonError.set('');
    }
  }

  protected confirmCancel(): void {
    const target = this.cancelTarget();
    if (!target || this.cancelling()) return;
    const reason = this.cancelReason.trim();
    if (!reason) {
      this.cancelReasonError.set(this.t('ui.dossier.cancelReasonRequired'));
      return;
    }
    this.cancelling.set(true);
    this.api.cancelDeclaration(target.id, { note: reason }).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.closeCancelModal();
        this.load();
        this.appMessages.showKey('ui.dossier.cancelSuccess', 'success', { code: target.code });
      },
      error: (caught: unknown) => {
        this.cancelling.set(false);
        this.closeCancelModal();
        this.appMessages.show(this.i18n.apiError(caught, 'ui.dossier.cancelFailed', { code: target.code }), 'error');
      },
    });
  }

  /** CR3 — sao chép hồ sơ (kèm tệp đính kèm) sang bản nháp mới rồi mở màn sửa bản mới. */
  protected copy(item: DossierSummary): void {
    if (this.copyingId()) return;
    this.copyingId.set(item.id);
    this.api.copyDeclaration(item.id).subscribe({
      next: (created) => {
        this.copyingId.set(null);
        this.appMessages.showKey('ui.dossier.copySuccess', 'success', { code: item.code, newCode: created.code });
        void this.router.navigate(['/declarations', created.id, 'edit'], { state: { dossier: created } });
      },
      error: (caught: unknown) => {
        this.copyingId.set(null);
        this.appMessages.show(this.i18n.apiError(caught, 'ui.dossier.copyFailed', { code: item.code }), 'error');
      },
    });
  }

  protected confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.api.deleteDeclaration(target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.load();
        this.appMessages.showKey('ui.dossier.deleteSuccess', 'success', { code: target.code });
      },
      error: (caught: unknown) => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        // Ưu tiên thông báo có khóa do API trả về; không có thì dùng câu mặc định của màn hình.
        this.appMessages.show(this.i18n.apiError(caught, 'ui.dossier.deleteFailed', { code: target.code }), 'error');
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    // Một trường lọc `status` gánh cả trạng thái đơn lẫn mã nhóm: nếu là nhóm thì gửi `statusGroup`
    // (và bỏ `status` để không rơi vào `@IsEnum` của API), ngược lại gửi `status` như cũ.
    const rawStatus = this.filters.status;
    const asGroup = isDossierStatusGroup(rawStatus);
    const params: DossierFilters = {
      keyword: this.filters.keyword.trim(),
      type: this.filters.type,
      status: asGroup ? '' : rawStatus,
      from: this.filters.from,
      to: this.filters.to,
      page: this.page(),
      pageSize: this.pageSize(),
    };
    if (asGroup) params.statusGroup = rawStatus;
    // Cờ dịch tễ: chỉ đính kèm khi lọc "chỉ hồ sơ có cờ" (toParams bỏ qua false/rỗng).
    if (this.filters.epidemic === 'true') params.epidemic = true;
    this.api
      .getDeclarations(params)
      .subscribe({
        next: (result) => {
          this.items.set(result?.items ?? []);
          this.total.set(result?.total ?? 0);
          this.loading.set(false);
        },
        error: (caught: unknown) => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.error.set(this.i18n.apiError(caught, 'ui.dossier.loadFailed'));
          this.appMessages.showApiError(caught, 'ui.dossier.loadFailed');
        },
      });
  }
}
