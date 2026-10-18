import { DecimalPipe, Location } from '@angular/common';
import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Observable, Subject, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  extractErrorMessage,
  fieldErrorText,
  extractFieldErrors,
  fieldRoot,
  normalizeFieldName,
  toFieldErrorMap,
} from '../../../core/forms/field-errors';
import {
  DOSSIER_TYPE_LABEL_KEYS,
  DocumentTypeOption,
  DossierAttachment,
  DossierDetail,
  DossierDraftPayload,
  DossierDriver,
  DossierEnterprise,
  DossierFieldError,
  DossierSubmitResult,
  RequiredDocument,
  dossierTypeLabel,
  isDossierEditable,
  vehicleTypeLabel,
} from '../../../core/models/declaration.model';
import { formatDateTime } from '../../../core/models/workflow.model';
import { CatalogItem } from '../../../core/models/admin.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  UPLOAD_ACCEPT_ATTRIBUTE,
  uploadHint,
  fileIcon,
  formatFileSize,
  validateUploadFile,
} from '../../../core/upload/file-rules';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgQrCodeComponent } from '../../../shared/ui/sg-qr-code.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/message-catalog';

/**
 * Section chứa từng nhóm trường — biểu mẫu nay là MỘT TRANG cuộn (không còn wizard), nên khi API
 * báo lỗi ta cuộn tới và tô đỏ đúng section thay vì nhảy bước. Thứ tự section:
 * doanh nghiệp (gộp loại hồ sơ, thời gian dự kiến) · phương tiện & lái xe · hàng hóa · tờ khai & chứng từ · xác nhận & gửi.
 * Lái xe và phương tiện dùng chung section `vehicle` (đã gộp).
 */
const FIELD_SECTION: Record<string, string> = {
  type: 'enterprise',
  enterprise: 'enterprise',
  driver: 'vehicle',
  vehicle: 'vehicle',
  vehicles: 'vehicle',
  appointment: 'enterprise',
  cargo: 'cargo',
  cargoItems: 'cargo',
  documents: 'documents',
  attachments: 'documents',
  status: 'enterprise',
};

/**
 * Danh mục các trường thông tin tổ chức/doanh nghiệp hiển thị theo ngữ cảnh biểu mẫu.
 * Dùng chung giữa isFieldOnForm và template để tránh phân mảnh khi bổ sung trường.
 */
const ENTERPRISE_FIELDS_BY_TYPE = {
  FOR_OTHER: {
    INDIVIDUAL: ['taxCode', 'name', 'phone', 'address'] as const,
    ENTERPRISE: ['taxCode', 'name', 'representativeName', 'phone', 'address'] as const,
    INTERNAL: ['email', 'name', 'jobTitle', 'department'] as const,
  },
  SELF: {
    INTERNAL: ['name', 'jobTitle', 'department', 'phone', 'address'] as const,
    INDIVIDUAL: ['name', 'taxCode', 'phone', 'address'] as const,
    ENTERPRISE_BASE: ['name', 'taxCode', 'phone', 'address'] as const,
  },
} as const;

/**
 * Ánh xạ tên trường phương tiện / lái xe sang khóa cấu hình hiển thị (fieldConfigs).
 */
const VEHICLE_CONFIG_FIELDS: Record<string, string> = {
  containerNumber: 'containerNumber',
  trailerNumber: 'trailerNumber',
  transportLicenseNumber: 'transportLicense',
  transportLicense: 'transportLicense',
  weightKg: 'payloadWeight',
  payloadWeight: 'payloadWeight',
  'driver.fullName': 'driverName',
  driverName: 'driverName',
  'driver.idType': 'driverDocType',
  driverDocType: 'driverDocType',
  'driver.idNumber': 'driverDocNo',
  driverDocNo: 'driverDocNo',
  'driver.licenseNumber': 'driverLicenseNo',
  driverLicenseNo: 'driverLicenseNo',
  'driver.phone': 'driverPhone',
  driverPhone: 'driverPhone',
  'driver.nationality': 'driverNationality',
  driverNationality: 'driverNationality',
};

/**
 * Ánh xạ tên trường hàng hóa sang khóa cấu hình hiển thị (fieldConfigs).
 */
const CARGO_CONFIG_FIELDS: Record<string, string> = {
  cargoTypeCode: 'cargoType',
  cargoType: 'cargoType',
  description: 'cargoName',
  cargoName: 'cargoName',
  name: 'cargoName',
  quantity: 'quantity',
  unitCode: 'unit',
  unit: 'unit',
  grossWeightKg: 'cargoWeight',
  cargoWeight: 'cargoWeight',
  weightKg: 'cargoWeight',
};

const ID_TYPE_KEYS: Array<{ value: string; labelKey: MessageKey }> = [
  { value: 'CCCD', labelKey: 'ui.idType.CCCD' },
  { value: 'PASSPORT', labelKey: 'ui.idType.PASSPORT' },
  { value: 'BORDER_PASS', labelKey: 'ui.idType.BORDER_PASS' },
];

interface CargoRow {
  /** Khóa cục bộ để `@for` theo dõi dòng, khác với `id` do API cấp. */
  key: string;
  id?: string;
  description: string;
  cargoTypeCode: string;
  quantity: number | null;
  unitCode: string;
  grossWeightKg: number | null;
}

/** Lái xe khai theo từng phương tiện (BUG-033). */
interface DriverRow {
  fullName: string;
  idNumber: string;
  idType: string;
  phone: string;
  licenseNumber: string;
  nationality: string;
}

/** Một dòng phương tiện của hồ sơ — một hồ sơ nhiều xe, mỗi xe một lái xe (F08/F09). */
interface VehicleRow {
  /** Khóa cục bộ để `@for` theo dõi dòng, khác với `id` do API cấp. */
  key: string;
  id?: string;
  plateNumber: string;
  containerNumber: string;
  trailerNumber: string;
  transportLicenseNumber: string;
  vehicleType: string;
  weightKg: number | null;
  driver: DriverRow;
}

/** Một dòng phương tiện nhận sang tải (CR9) — lái xe chỉ là tên theo mockup. */
interface TransshipmentRow {
  /** Khóa cục bộ để `@for` theo dõi dòng, khác với `id` do API cấp. */
  key: string;
  id?: string;
  sourcePlate: string;
  plateNumber: string;
  vehicleType: string;
  containerNumber: string;
  trailerNumber: string;
  driverName: string;
  fee01: string;
  transferPlace: string;
  note: string;
}

interface DossierForm {
  type: string;
  enterprise: {
    taxCode: string;
    name: string;
    representativeName: string;
    address: string;
    phone: string;
    email: string;
    username: string;
    jobTitle: string;
    department: string;
  };
  vehicles: VehicleRow[];
  cargoItems: CargoRow[];
  transshipmentVehicles: TransshipmentRow[];
  appointment: { id?: string; scheduledAt: string };
}

function emptyCargoRow(): CargoRow {
  return {
    key: `cargo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    cargoTypeCode: '',
    quantity: null,
    unitCode: 'KG',
    grossWeightKg: null,
  };
}

function emptyDriverRow(): DriverRow {
  return { fullName: '', idNumber: '', idType: 'CCCD', phone: '', licenseNumber: '', nationality: 'Việt Nam' };
}

function emptyVehicleRow(): VehicleRow {
  return {
    key: `vehicle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    plateNumber: '',
    containerNumber: '',
    trailerNumber: '',
    transportLicenseNumber: '',
    vehicleType: 'TRUCK',
    weightKg: null,
    driver: emptyDriverRow(),
  };
}

function emptyTransshipmentRow(): TransshipmentRow {
  return {
    key: `transship-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourcePlate: '',
    plateNumber: '',
    vehicleType: '',
    containerNumber: '',
    trailerNumber: '',
    driverName: '',
    fee01: '',
    transferPlace: '',
    note: '',
  };
}

function emptyForm(): DossierForm {
  return {
    type: 'IMPORT',
    enterprise: {
      taxCode: '',
      name: '',
      representativeName: '',
      address: '',
      phone: '',
      email: '',
      username: '',
      jobTitle: '',
      department: '',
    },
    vehicles: [emptyVehicleRow()],
    cargoItems: [emptyCargoRow()],
    transshipmentVehicles: [],
    appointment: { scheduledAt: '' },
  };
}

/**
 * UI-04 — Khai báo / tạo hồ sơ theo bước.
 * "Lưu nháp" và "Gửi hồ sơ" là hai hành động riêng; lỗi do API trả về được tô đỏ
 * đúng ô nhập kèm thông báo tại chỗ (F13), gửi thành công hiện mã hồ sơ và mã QR (F14).
 */
@Component({
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    MatIconModule,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgQrCodeComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ dossierId() ? t('ui.form.titleEdit') : t('ui.form.titleNew') }}</h1>
      </div>
      <div class="head__actions">
        <a sgButton="tertiary" routerLink="/declarations"><mat-icon fontSet="material-icons-round">close</mat-icon>{{ t('ui.common.cancelAction') }}</a>
      </div>
    </section>

    <!-- Điều hướng mỏ neo (anchor): bấm để cuộn tới section, tô đỏ section đang có lỗi. -->
    <nav class="steps" [attr.aria-label]="t('ui.form.stepsAria')">
      @for (section of sections(); track section.id; let i = $index) {
        <button
          type="button"
          class="step"
          [class.step--error]="sectionHasError(section.id)"
          (click)="scrollToSection(section.id)"
        >
          <span class="step__no">{{ i + 1 }}</span>
          <span class="step__label">{{ section.label }}</span>
          @if (sectionHasError(section.id)) { <mat-icon fontSet="material-icons-round">error</mat-icon> }
        </button>
      }
    </nav>

    @if (otherErrors().length) {
      <sg-alert class="feedback" type="warning" [title]="t('ui.form.needSupplementTitle')">
        <ul class="errorlist">
          @for (message of otherErrors(); track message) { <li>{{ message }}</li> }
        </ul>
      </sg-alert>
    }
    @if (readOnly()) {
      <sg-alert class="feedback" type="info" [message]="t('ui.form.readOnly')" />
    }

    <div class="layout">
      <div class="main">
        <!-- Section Thông tin khởi tạo -->
        <section id="sec-enterprise" class="section" [class.section--error]="sectionHasError('enterprise')">
          <sg-card [title]="accountSectionTitle()">
            <div class="grid">
              <sg-form-field [label]="t('ui.dossier.type')" [required]="true" [error]="fieldError('type')">
                <sg-select [placeholder]="t('ui.form.chooseType')" [options]="typeOptions()" [ngModel]="form.type" (ngModelChange)="onTypeChange($event)" [disabled]="readOnly()" [invalid]="!!fieldError('type')" />
              </sg-form-field>

              @if (isFieldVisible('estimatedTime')) {
                <sg-form-field [label]="t('ui.common.scheduledTime')" [required]="isFieldRequired('estimatedTime', true)" [error]="fieldError('appointment.scheduledAt')">
                  <input type="datetime-local" [min]="minScheduledAt()" [(ngModel)]="form.appointment.scheduledAt" [disabled]="readOnly()" />
                </sg-form-field>
              }

              @if (!createForOther()) {
                @if (isAccountInfoVisible()) {
                  @if (userAccountType() === 'INTERNAL') {
                    <sg-form-field [label]="t('ui.common.fullName')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.name')">
                      <input [(ngModel)]="form.enterprise.name" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.profile.fullNamePlaceholder')" />
                    </sg-form-field>

                    <sg-form-field [label]="t('ui.common.jobTitle')" [error]="fieldError('enterprise.jobTitle')">
                      <input [(ngModel)]="form.enterprise.jobTitle" [disabled]="readOnly()" [placeholder]="t('ui.profile.titlePlaceholder')" />
                    </sg-form-field>

                    <sg-form-field [label]="t('ui.common.organization')" [error]="fieldError('enterprise.department')">
                      <input [(ngModel)]="form.enterprise.department" [disabled]="readOnly()" [placeholder]="t('ui.form.departmentPlaceholder')" />
                    </sg-form-field>

                    <sg-form-field [label]="t('ui.common.phone')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.phone')">
                      <input [(ngModel)]="form.enterprise.phone" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.common.phonePlaceholder')" />
                    </sg-form-field>

                    <sg-form-field class="wide" [label]="t('ui.common.address')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.address')">
                      <input [(ngModel)]="form.enterprise.address" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.common.addressPlaceholder')" />
                    </sg-form-field>
                  } @else if (userAccountType() === 'INDIVIDUAL') {
                    <sg-form-field [label]="t('ui.common.fullName')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.name')">
                      <input [(ngModel)]="form.enterprise.name" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.profile.fullNamePlaceholder')" />
                    </sg-form-field>

                    <sg-form-field [label]="t('ui.register.idNumber')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.taxCode')">
                      <input [(ngModel)]="form.enterprise.taxCode" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.form.idNumberIndividualPlaceholder')" />
                    </sg-form-field>

                    <sg-form-field [label]="t('ui.common.phone')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.phone')">
                      <input [(ngModel)]="form.enterprise.phone" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.common.phonePlaceholder')" />
                    </sg-form-field>

                    <sg-form-field class="wide" [label]="t('ui.common.address')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.address')">
                      <input [(ngModel)]="form.enterprise.address" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.common.addressPlaceholder')" />
                    </sg-form-field>
                  } @else {
                    <sg-form-field [label]="t('ui.register.enterpriseName')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.name')">
                      <input [(ngModel)]="form.enterprise.name" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.register.enterpriseNamePlaceholder')" />
                    </sg-form-field>

                    <sg-form-field [label]="t('ui.register.taxCode')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.taxCode')">
                      <input [(ngModel)]="form.enterprise.taxCode" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.form.taxCodePlaceholder')" />
                    </sg-form-field>

                    @if (showRepresentative()) {
                      <sg-form-field [label]="t('ui.form.representative')" [required]="false" [error]="fieldError('enterprise.representativeName')">
                        <input [(ngModel)]="form.enterprise.representativeName" [disabled]="readOnly()" [placeholder]="t('ui.register.representativePlaceholder')" />
                      </sg-form-field>
                    }

                    <sg-form-field [label]="t('ui.common.phone')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.phone')">
                      <input [(ngModel)]="form.enterprise.phone" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.common.phonePlaceholder')" />
                    </sg-form-field>

                    <sg-form-field class="wide" [label]="t('ui.common.address')" [required]="isAccountInfoRequired()" [error]="fieldError('enterprise.address')">
                      <input [(ngModel)]="form.enterprise.address" [required]="isAccountInfoRequired()" [disabled]="readOnly()" [placeholder]="t('ui.common.addressPlaceholder')" />
                    </sg-form-field>
                  }
                }
              }

              @if (isAdmin()) {
                <div class="create-other-row">
                  <label class="checkbox-container">
                    <input type="checkbox" [checked]="createForOther()" (change)="toggleCreateForOther($event)" [disabled]="readOnly()" />
                    <span class="checkbox-label">{{ t('ui.form.createForOther') }}</span>
                  </label>

                  @if (createForOther()) {
                    <div class="account-type-select">
                      <sg-form-field [label]="t('ui.form.accountType')" [required]="true">
                        <sg-select
                          [showEmptyOption]="false"
                          [options]="targetAccountTypeOptions()"
                          [ngModel]="selectedAccountType()"
                          (ngModelChange)="onTargetAccountTypeChange($event)"
                          [disabled]="readOnly()"
                        />
                      </sg-form-field>
                    </div>
                  }
                </div>
              }

              @if (createForOther()) {
                @if (accountMatched()) {
                  <div class="account-matched-notice">
                    <mat-icon fontSet="material-icons-round">lock</mat-icon>
                    <span>{{ t('ui.form.accountMatchedNotice') }}</span>
                  </div>
                }

                @if (selectedAccountType() === 'INDIVIDUAL') {
                  <sg-form-field [label]="t('ui.form.idNumberIndividual')" [required]="true" [error]="fieldError('enterprise.taxCode')">
                    <input [(ngModel)]="form.enterprise.taxCode" (blur)="onIdentityBlur()" [disabled]="readOnly()" [placeholder]="t('ui.form.idNumberIndividualPlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.form.fullNameIndividual')" [required]="false" [error]="fieldError('enterprise.name')">
                    <input [(ngModel)]="form.enterprise.name" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.form.fullNameIndividualPlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.common.phone')" [required]="false" [error]="fieldError('enterprise.phone')">
                    <input [(ngModel)]="form.enterprise.phone" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.common.phonePlaceholder')" />
                  </sg-form-field>

                  <sg-form-field class="wide" [label]="t('ui.common.address')" [required]="false" [error]="fieldError('enterprise.address')">
                    <input [(ngModel)]="form.enterprise.address" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.form.addressPlaceholder')" />
                  </sg-form-field>
                } @else if (selectedAccountType() === 'ENTERPRISE') {
                  <sg-form-field [label]="t('ui.register.taxCode')" [required]="true" [error]="fieldError('enterprise.taxCode')">
                    <input [(ngModel)]="form.enterprise.taxCode" (blur)="onIdentityBlur()" [disabled]="readOnly()" [placeholder]="t('ui.form.taxCodePlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.form.enterpriseName')" [required]="false" [error]="fieldError('enterprise.name')">
                    <input [(ngModel)]="form.enterprise.name" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.form.enterpriseNamePlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.form.representative')" [required]="false" [error]="fieldError('enterprise.representativeName')">
                    <input [(ngModel)]="form.enterprise.representativeName" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.form.representativePlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.common.phone')" [required]="false" [error]="fieldError('enterprise.phone')">
                    <input [(ngModel)]="form.enterprise.phone" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.common.phonePlaceholder')" />
                  </sg-form-field>

                  <sg-form-field class="wide" [label]="t('ui.common.address')" [required]="false" [error]="fieldError('enterprise.address')">
                    <input [(ngModel)]="form.enterprise.address" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.form.addressPlaceholder')" />
                  </sg-form-field>
                } @else if (selectedAccountType() === 'INTERNAL') {
                  <sg-form-field [label]="t('ui.common.email')" [required]="true" [error]="fieldError('enterprise.email')">
                    <input type="email" [(ngModel)]="form.enterprise.email" (blur)="onIdentityBlur()" [disabled]="readOnly()" [placeholder]="t('ui.form.emailPlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.common.fullName')" [required]="false" [error]="fieldError('enterprise.name')">
                    <input [(ngModel)]="form.enterprise.name" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.profile.fullNamePlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.common.jobTitle')" [required]="false" [error]="fieldError('enterprise.jobTitle')">
                    <input [(ngModel)]="form.enterprise.jobTitle" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.profile.titlePlaceholder')" />
                  </sg-form-field>

                  <sg-form-field [label]="t('ui.common.organization')" [required]="false" [error]="fieldError('enterprise.department')">
                    <input [(ngModel)]="form.enterprise.department" [disabled]="readOnly() || accountMatched()" [placeholder]="t('ui.form.departmentPlaceholder')" />
                  </sg-form-field>
                }
              }
            </div>
          </sg-card>
        </section>

        <!-- Section Phương tiện & lái xe (F08) — gộp phương tiện và lái xe theo template.
             CR8: MỘT phương tiện vận chuyển/hồ sơ — không còn thêm/xóa dòng xe. -->
        <section id="sec-vehicle" class="section" [class.section--error]="sectionHasError('vehicle')">
          <sg-card [title]="t('ui.form.vehicleListTitle')" [subtitle]="t('ui.form.vehicleListSubtitle')">
            @for (row of form.vehicles; track row.key; let i = $index) {
                <div class="grid">
                  <sg-form-field [label]="t('ui.form.plateNumber')" [required]="true" [error]="vehicleError(i, 'plateNumber')">
                    <input [(ngModel)]="row.plateNumber" [disabled]="readOnly()" [placeholder]="t('ui.form.platePlaceholder')" />
                  </sg-form-field>
                  <sg-form-field [label]="t('ui.form.vehicleType')"[required]="true" [error]="vehicleError(i, 'vehicleType')">
                    <sg-select [placeholder]="t('ui.form.vehicleTypePlaceholder')" [options]="vehicleTypeOptions()" [(ngModel)]="row.vehicleType" [disabled]="readOnly()" [invalid]="!!vehicleError(i, 'vehicleType')" />
                  </sg-form-field>
                  @if (isFieldVisible('containerNumber')) {
                    <sg-form-field [label]="t('ui.form.containerNumber')" [required]="isFieldRequired('containerNumber', false)" [error]="vehicleError(i, 'containerNumber')">
                      <input [(ngModel)]="row.containerNumber" [disabled]="readOnly()" />
                    </sg-form-field>
                  }
                  @if (isFieldVisible('trailerNumber')) {
                    <sg-form-field [label]="t('ui.form.trailerNumber')" [required]="isFieldRequired('trailerNumber', false)" [error]="vehicleError(i, 'trailerNumber')">
                      <input [(ngModel)]="row.trailerNumber" [disabled]="readOnly()" />
                    </sg-form-field>
                  }
                  @if (isFieldVisible('transportLicense')) {
                    <sg-form-field [label]="t('ui.form.transportLicense')" [required]="isFieldRequired('transportLicense', false)" [error]="vehicleError(i, 'transportLicenseNumber')">
                      <input [(ngModel)]="row.transportLicenseNumber" [disabled]="readOnly()" />
                    </sg-form-field>
                  }
                  @if (isFieldVisible('payloadWeight')) {
                    <sg-form-field [label]="t('ui.form.weightKg')" [required]="isFieldRequired('payloadWeight', false)" [error]="vehicleError(i, 'weightKg')">
                      <input type="number" min="0" [(ngModel)]="row.weightKg" [disabled]="readOnly()" />
                    </sg-form-field>
                  }
                </div>

                <!-- Lái xe theo TỪNG xe (BUG-033): mỗi phương tiện khai người điều khiển riêng. -->
                <div class="driverblock">
                  <h4 class="driverblock__title">{{ t('ui.form.driverTitle') }}</h4>
                  <div class="grid">
                    @if (isFieldVisible('driverName')) {
                      <sg-form-field [label]="t('ui.common.fullName')" [required]="isFieldRequired('driverName', true)" [error]="vehicleError(i, 'driver.fullName')">
                        <input [(ngModel)]="row.driver.fullName" [disabled]="readOnly()" />
                      </sg-form-field>
                    }
                    @if (isFieldVisible('driverDocType')) {
                      <sg-form-field [label]="t('ui.form.idType')" [required]="isFieldRequired('driverDocType', false)" [error]="vehicleError(i, 'driver.idType')">
                        <sg-select [placeholder]="t('ui.form.chooseIdType')" [options]="idTypeOptions()" [(ngModel)]="row.driver.idType" [disabled]="readOnly()" [invalid]="!!vehicleError(i, 'driver.idType')" />
                      </sg-form-field>
                    }
                    @if (isFieldVisible('driverDocNo')) {
                      <sg-form-field [label]="t('ui.form.idNumber')" [required]="isFieldRequired('driverDocNo', true)" [error]="vehicleError(i, 'driver.idNumber')">
                        <input [(ngModel)]="row.driver.idNumber" [disabled]="readOnly()" />
                      </sg-form-field>
                    }
                    @if (isFieldVisible('driverLicenseNo')) {
                      <sg-form-field [label]="t('ui.form.licenseNumber')" [required]="isFieldRequired('driverLicenseNo', true)" [error]="vehicleError(i, 'driver.licenseNumber')">
                        <input [(ngModel)]="row.driver.licenseNumber" [disabled]="readOnly()" />
                      </sg-form-field>
                    }
                    @if (isFieldVisible('driverPhone')) {
                      <sg-form-field [label]="t('ui.common.phone')" [required]="isFieldRequired('driverPhone', false)" [error]="vehicleError(i, 'driver.phone')">
                        <input [(ngModel)]="row.driver.phone" [disabled]="readOnly()" />
                      </sg-form-field>
                    }
                    @if (isFieldVisible('driverNationality')) {
                      <sg-form-field [label]="t('ui.form.nationality')" [required]="isFieldRequired('driverNationality', true)" [error]="vehicleError(i, 'driver.nationality')">
                        <sg-select [placeholder]="t('ui.form.nationality')" [required]="isFieldRequired('driverNationality', true)" [options]="countryOptions()" [(ngModel)]="row.driver.nationality" [disabled]="readOnly()" [invalid]="!!vehicleError(i, 'driver.nationality')" />
                      </sg-form-field>
                    }
                  </div>
                </div>
            }

            @if (vehicleListError()) {
              <sg-alert type="error" [message]="vehicleListError()" />
            }
          </sg-card>
        </section>

        <!-- Section Xe nhận sang tải (CR9/CR18/CR33) — chỉ hiện khi loại hồ sơ là Sang tải. -->
        @if (isTransshipment()) {
          <section id="sec-transship" class="section">
            <sg-card [title]="t('ui.form.transshipTitle')" [subtitle]="t('ui.form.transshipSubtitle')">
              <button card-actions type="button" sgButton="secondary" size="sm" [disabled]="readOnly()" (click)="openTransshipModal()">
                <mat-icon fontSet="material-icons-round">add</mat-icon>{{ t('ui.form.transshipAdd') }}
              </button>

              @if (form.transshipmentVehicles.length) {
                <ul class="transship">
                  @for (row of form.transshipmentVehicles; track row.key; let i = $index) {
                    <li class="transship__row">
                      <div class="transship__body">
                        <strong>{{ row.plateNumber || t('ui.common.notEntered') }}</strong>
                        <span>{{ transshipSummary(row) }}</span>
                      </div>
                      <div class="transship__actions">
                        <button type="button" class="iconbtn" [title]="t('ui.form.transshipEdit')" [disabled]="readOnly()" (click)="openTransshipModal(i)">
                          <mat-icon fontSet="material-icons-round">edit</mat-icon>
                        </button>
                        <button
                          type="button"
                          class="iconbtn iconbtn--danger"
                          [title]="t('ui.form.transshipRemove')"
                          [disabled]="readOnly()"
                          (click)="removeTransshipRow(i)"
                        >
                          <mat-icon fontSet="material-icons-round">delete</mat-icon>
                        </button>
                      </div>
                    </li>
                  }
                </ul>
              } @else {
                <p class="transship__empty">{{ t('ui.form.transshipEmpty') }}</p>
              }
            </sg-card>
          </section>
        }

        <!-- Section Hàng hóa: dạng bảng gồm STT, Loại hàng hóa, Tên hàng hóa, Số lượng, Đơn vị tính, Trọng lượng, dòng Tổng trọng lượng ở cuối -->
        <section id="sec-cargo" class="section" [class.section--error]="sectionHasError('cargo')">
          <sg-card [title]="t('ui.form.cargoTitle')" [subtitle]="t('ui.form.cargoSubtitle')">
            <button card-actions type="button" sgButton="secondary" size="sm" [disabled]="readOnly()" (click)="addCargoRow()">
              <mat-icon fontSet="material-icons-round">add</mat-icon>{{ t('ui.form.addCargo') }}
            </button>

            <div class="sg-scroll-x">
              <table class="cargo-table">
                <thead>
                  <tr>
                    <th class="col-stt">STT</th>
                    @if (isFieldVisible('cargoType')) { <th class="col-type">{{ t('ui.form.cargoType') }}</th> }
                    @if (isFieldVisible('cargoName')) { <th class="col-name">{{ t('ui.form.cargoName') }} @if (isFieldRequired('cargoName', true)) { <span class="req">*</span> }</th> }
                    @if (isFieldVisible('quantity')) { <th class="col-qty">{{ t('ui.form.quantity') }}</th> }
                    @if (isFieldVisible('unit')) { <th class="col-unit">{{ t('ui.form.unitCode') }}</th> }
                    @if (isFieldVisible('cargoWeight')) { <th class="col-weight">{{ t('ui.form.grossWeight') }}</th> }
                    <th class="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of form.cargoItems; track row.key; let i = $index) {
                    <tr>
                      <td class="cell-stt">{{ i + 1 }}</td>
                      @if (isFieldVisible('cargoType')) {
                        <td class="cell-type">
                          <sg-select
                            [placeholder]="t('ui.form.cargoTypePlaceholder')"
                            [options]="cargoTypeOptions()"
                            [(ngModel)]="row.cargoTypeCode"
                            [disabled]="readOnly()"
                            [invalid]="!!cargoError(i, 'cargoTypeCode')"
                          />
                          @if (cargoError(i, 'cargoTypeCode')) {
                            <div class="cell-error">{{ cargoError(i, 'cargoTypeCode') }}</div>
                          }
                        </td>
                      }
                      @if (isFieldVisible('cargoName')) {
                        <td class="cell-name">
                          <input
                            [class.input--invalid]="!!cargoError(i, 'description')"
                            [(ngModel)]="row.description"
                            [disabled]="readOnly()"
                            [placeholder]="t('ui.form.cargoNamePlaceholder')"
                          />
                          @if (cargoError(i, 'description')) {
                            <div class="cell-error">{{ cargoError(i, 'description') }}</div>
                          }
                        </td>
                      }
                      @if (isFieldVisible('quantity')) {
                        <td class="cell-qty">
                          <input
                            type="number"
                            min="0"
                            [class.input--invalid]="!!cargoError(i, 'quantity')"
                            [(ngModel)]="row.quantity"
                            [disabled]="readOnly()"
                          />
                          @if (cargoError(i, 'quantity')) {
                            <div class="cell-error">{{ cargoError(i, 'quantity') }}</div>
                          }
                        </td>
                      }
                      @if (isFieldVisible('unit')) {
                        <td class="cell-unit">
                          <sg-select
                            [showEmptyOption]="false"
                            [options]="unitOptions()"
                            [(ngModel)]="row.unitCode"
                            [disabled]="readOnly()"
                            [invalid]="!!cargoError(i, 'unitCode')"
                          />
                          @if (cargoError(i, 'unitCode')) {
                            <div class="cell-error">{{ cargoError(i, 'unitCode') }}</div>
                          }
                        </td>
                      }
                      @if (isFieldVisible('cargoWeight')) {
                        <td class="cell-weight">
                          <input
                            type="number"
                            min="0"
                            [class.input--invalid]="!!cargoError(i, 'grossWeightKg')"
                            [(ngModel)]="row.grossWeightKg"
                            [disabled]="readOnly()"
                          />
                          @if (cargoError(i, 'grossWeightKg')) {
                            <div class="cell-error">{{ cargoError(i, 'grossWeightKg') }}</div>
                          }
                        </td>
                      }
                      <td class="cell-action">
                        <button
                          type="button"
                          class="iconbtn iconbtn--danger"
                          [title]="t('ui.form.removeCargo')"
                          [attr.aria-label]="t('ui.form.removeCargoAria', { index: i + 1 })"
                          [disabled]="readOnly() || form.cargoItems.length === 1"
                          (click)="removeCargoRow(i)"
                        >
                          <mat-icon fontSet="material-icons-round">delete</mat-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="cargo-total-row">
                    <td colspan="5" class="total-label">
                      <strong>{{ t('ui.form.totalWeight') }}</strong>
                    </td>
                    <td class="total-value">
                      <strong>{{ totalWeight() | number: '1.0-2' }} kg</strong>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </sg-card>
        </section>

        <!-- Section Tờ khai & chứng từ (F11 + D7): chứng từ bắt buộc + tải tệp đính kèm.
             Giữ luồng tải tệp qua ApiService (F11) và checklist chứng từ bắt buộc (D7) —
             không dùng bảng "tờ khai theo dòng" của mockup vì hợp đồng đính kèm không đổi. -->
        <section id="sec-documents" class="section" [class.section--error]="sectionHasError('documents')">
          <sg-card [title]="t('ui.form.attachmentsTitle')" [subtitle]="uploadHint()">
            @if (fieldError('documents')) {
              <sg-alert type="error" [message]="fieldError('documents')" />
            }
            <!-- D7 — chứng từ bắt buộc theo loại hồ sơ; đánh dấu đã tải / còn thiếu (F13). -->
            <div class="reqdocs">
              <div class="reqdocs__head">
                <strong>{{ t('ui.form.requiredDocsTitle') }} <span class="reqdocs__sub">· {{ t('ui.form.requiredDocsSubtitle') }}</span></strong>
                @if (mergedRequiredDocuments().length) {
                  <span class="reqdocs__summary">{{ t('ui.form.requiredDocsSummary', { done: requiredDocsDone(), total: mergedRequiredDocuments().length }) }}</span>
                }
              </div>
              @if (requiredDocsLoading()) {
                <p class="reqdocs__hint">{{ t('ui.form.requiredDocsLoading') }}</p>
              } @else if (requiredDocsError()) {
                <sg-alert type="error" [message]="requiredDocsError()" />
              } @else if (!mergedRequiredDocuments().length) {
                <p class="reqdocs__hint">{{ t('ui.form.requiredDocsEmpty') }}</p>
              } @else {
                <ul class="reqdocs__list">
                  @for (doc of requiredDocStatus(); track doc.code) {
                    <li class="reqdoc" [attr.data-uploaded]="doc.uploaded">
                      <mat-icon fontSet="material-icons-round">{{ doc.uploaded ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                      <span class="reqdoc__name">{{ doc.name }}</span>
                      <span class="reqdoc__badge" [attr.data-uploaded]="doc.uploaded">{{ doc.uploaded ? t('ui.form.requiredDocUploaded') : t('ui.form.requiredDocMissing') }}</span>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="upload">
              <sg-form-field [label]="t('ui.form.documentType')">
                <sg-select [placeholder]="t('ui.form.documentTypePlaceholder')" [options]="documentTypeOptions()" [(ngModel)]="documentTypeCode" [disabled]="readOnly()" />
              </sg-form-field>
              <div
                class="dropzone"
                [class.dropzone--over]="dragOver()"
                (dragover)="onDragOver($event)"
                (dragleave)="dragOver.set(false)"
                (drop)="onDrop($event)"
              >
                <mat-icon fontSet="material-icons-round">cloud_upload</mat-icon>
                <p>{{ t('ui.form.dropzone') }}</p>
                <input
                  #fileInput
                  type="file"
                  class="dropzone__input"
                  multiple
                  [accept]="acceptAttribute"
                  [disabled]="readOnly() || uploading()"
                  (change)="onFilesSelected($event)"
                />
                <button type="button" sgButton="secondary" size="sm" [disabled]="readOnly() || uploading()" (click)="fileInput.click()">
                  {{ uploading() ? t('ui.common.uploading') : t('ui.common.selectFile') }}
                </button>
                <span class="dropzone__hint">{{ uploadHint() }}</span>
              </div>
            </div>

            @if (uploadErrors().length) {
              <sg-alert type="error" [title]="t('ui.common.uploadFailedTitle')">
                <ul class="errorlist">
                  @for (message of uploadErrors(); track message) { <li>{{ message }}</li> }
                </ul>
              </sg-alert>
            }

            <ul class="files">
              @for (file of attachments(); track file.id) {
                <li class="files__row">
                  <mat-icon fontSet="material-icons-round">{{ iconOf(file) }}</mat-icon>
                  <div class="files__body">
                    <strong>{{ file.fileName || t('ui.detail.docFallback') }}</strong>
                    <span>{{ fileMeta(file) }}</span>
                  </div>
                  <button
                    type="button"
                    class="iconbtn iconbtn--danger"
                    [title]="t('ui.form.removeFile')"
                    [attr.aria-label]="t('ui.form.removeFileAria', { name: file.fileName })"
                    [disabled]="readOnly()"
                    (click)="removeAttachment(file)"
                  >
                    <mat-icon fontSet="material-icons-round">delete</mat-icon>
                  </button>
                </li>
              } @empty {
                <li class="files__empty">{{ t('ui.form.noAttachments') }}</li>
              }
            </ul>
          </sg-card>
        </section>

      </div>

      <aside class="side">
        <div class="side__sticky">
        <sg-card class="summary-card" [title]="t('ui.form.summaryTitle')">
          <dl class="summary">
            <dt>{{ t('ui.dossier.type') }}</dt><dd>{{ typeLabel(form.type) }}</dd>
            <dt>{{ t('ui.common.plateNumber') }}</dt><dd>{{ plateSummary('—') }}</dd>
            <dt>{{ t('ui.common.driver') }}</dt><dd>{{ primaryDriver().fullName || '—' }}</dd>
            <dt>{{ t('ui.common.enterprise') }}</dt><dd>{{ form.enterprise.name || '—' }}</dd>
            <dt>{{ t('ui.common.mainCargo') }}</dt><dd>{{ mainCargo() }}</dd>
            <dt>{{ t('ui.form.totalWeight') }}</dt><dd>{{ totalWeight() | number: '1.0-2' }} kg</dd>
            <dt>{{ t('ui.dossier.status') }}</dt><dd>{{ dossierId() ? t('ui.form.savedDraft') : t('ui.form.notSaved') }}</dd>
          </dl>
        </sg-card>

        <sg-alert type="warning" [title]="t('ui.form.notesTitle')">
          <ul class="notes">
            <li>{{ t('ui.form.note1') }}</li>
            <li>{{ t('ui.form.note2') }}</li>
            <li>{{ t('ui.form.note3') }}</li>
          </ul>
        </sg-alert>
        </div>
      </aside>
    </div>

    <!-- Thanh hành động cố định dưới cùng, đúng bố cục footer template (Lưu nháp · Gửi hồ sơ). -->
    <div class="actionbar">
      <div class="actionbar__left">
        <a sgButton="tertiary" routerLink="/declarations"><mat-icon fontSet="material-icons-round">arrow_back</mat-icon>{{ t('ui.common.cancelAction') }}</a>
      </div>
      <div class="actionbar__right">
        <button type="button" sgButton="secondary" [disabled]="busy()" (click)="saveDraft()">
          <mat-icon fontSet="material-icons-round">save</mat-icon>{{ saving() ? t('ui.common.saving') : t('ui.form.saveDraft') }}
        </button>
        <button type="button" sgButton [disabled]="busy()" (click)="submit()">
          <mat-icon fontSet="material-icons-round">send</mat-icon>{{ submitting() ? t('ui.common.sending') : t('ui.form.submit') }}
        </button>
      </div>
    </div>

    <!-- Modal "Xe nhận sang tải" (CR9) — theo mockup tao-ho-so-1trang.html. -->
    @if (transshipDraft(); as draft) {
      <sg-modal size="md" [title]="t('ui.form.transshipModalTitle')" (close)="closeTransshipModal()">
        <div class="grid">
          <sg-form-field [label]="t('ui.form.transshipSourcePlate')" [required]="true">
            <sg-select [placeholder]="t('ui.form.transshipSourcePlatePlaceholder')" [options]="sourcePlateOptions()" [(ngModel)]="draft.sourcePlate" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.transshipPlate')" [required]="true">
            <input [(ngModel)]="draft.plateNumber" [placeholder]="t('ui.form.transshipPlatePlaceholder')" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.vehicleType')" [required]="true">
            <sg-select [placeholder]="t('ui.form.vehicleTypePlaceholder')" [options]="vehicleTypeOptions()" [(ngModel)]="draft.vehicleType" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.containerNumber')">
            <input [(ngModel)]="draft.containerNumber" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.trailerNumber')">
            <input [(ngModel)]="draft.trailerNumber" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.transshipDriver')" [required]="true">
            <input [(ngModel)]="draft.driverName" [placeholder]="t('ui.form.transshipDriverPlaceholder')" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.transshipFee')">
            <input [(ngModel)]="draft.fee01" [placeholder]="t('ui.form.transshipFeePlaceholder')" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.form.transshipPlace')">
            <input [(ngModel)]="draft.transferPlace" [placeholder]="t('ui.form.transshipPlacePlaceholder')" />
          </sg-form-field>
          <sg-form-field class="wide" [label]="t('ui.form.transshipNote')">
            <input [(ngModel)]="draft.note" />
          </sg-form-field>
        </div>
        <button modal-footer type="button" sgButton="secondary" (click)="closeTransshipModal()">{{ t('ui.common.close') }}</button>
        <button modal-footer type="button" sgButton [disabled]="!transshipDraftValid(draft)" (click)="saveTransshipRow()">{{ t('ui.form.transshipSave') }}</button>
      </sg-modal>
    }

    @if (submitResult(); as result) {
      <sg-modal size="sm" [title]="t('ui.form.successTitle')" (close)="closeSuccess()">
        <div class="modal__body--center">
          <p class="modal__desc">{{ t('ui.form.successDesc') }}</p>
          <strong class="modal__code">{{ result.code }}</strong>
          <sg-qr-code [value]="result.qrCode" [size]="192" [caption]="result.code" [ariaLabel]="t('ui.form.qrAria', { code: result.code })" />
          @if (result.submittedAt) { <span class="modal__time">{{ t('ui.form.submittedAt', { time: submittedLabel(result.submittedAt) }) }}</span> }
        </div>
        <a modal-footer sgButton="secondary" routerLink="/declarations">{{ t('ui.form.backToList') }}</a>
        <button modal-footer type="button" sgButton (click)="openDetail()">{{ t('ui.form.openDetail') }}</button>
      </sg-modal>
    }
  `,
  styles: [
    `
      /* Bảng màu lấy đúng từ template chủ dự án (tao-ho-so-1trang.html) để khớp tuyệt đối;
         khoanh trong :host nên không rò ra ngoài, không đụng token --sg-* toàn cục. */
      :host {
        display: block;
        --navy-900: #101d3d;
        --blue-600: #2f6fed;
        --blue-500: #4a84f2;
        --blue-50: #eef3fe;
        --orange-500: #e8622c;
        --red-500: #e5484d;
        --red-50: #fdeced;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --amber-500: #e0a72e;
        --amber-50: #fbf3e2;
        --ink-900: #152040;
        --ink-700: #3d4a6b;
        --ink-500: #7885a3;
        --line: #e6e9f3;
        --card: #ffffff;
        --radius: 14px;
      }

      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
      .head h1 { margin: 0; font-size: 20px; font-weight: 700; color: var(--ink-900); }
      .head__actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .feedback { display: block; margin-bottom: 14px; }

      /* Thanh mỏ neo (stepper) — theo template: nền trắng, số tròn, chữ đậm, lỗi tô đỏ. */
      .steps {
        display: flex;
        gap: 6px;
        margin-bottom: 20px;
        padding: 4px 12px;
        overflow-x: auto;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius);
      }
      .step {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        min-height: 46px;
        padding: 0 12px;
        border: 0;
        background: transparent;
        color: var(--ink-500);
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
      }
      .step:hover .step__label { color: var(--blue-600); }
      .step__no {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #f4f6fb;
        border: 1.5px solid var(--line);
        color: var(--ink-500);
        font-size: 11px;
        font-weight: 700;
      }
      .step--error { color: var(--red-500); }
      .step--error .step__no { background: var(--red-500); border-color: var(--red-500); color: #fff; }
      .step mat-icon { width: 18px; height: 18px; font-size: 18px; color: var(--red-500); }

      /* Layout 2 cột: cột chính minmax(0, 1fr) và cột tóm tắt 320px, không để tràn ngang làm overlap thẻ sticky */
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 20px;
        align-items: start;
        min-width: 0;
        max-width: 100%;
      }
      .main {
        display: grid;
        gap: 16px;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
      }
      /* CR4 — ghim CẢ cụm "Tóm tắt hồ sơ" + "Lưu ý quan trọng" để cùng đi theo khi cuộn (SG-226) */
      .side {
        display: block;
        min-width: 0;
        width: 320px;
        align-self: stretch;
      }
      .side__sticky {
        position: sticky;
        top: calc(var(--sg-topbar-height) + 12px);
        z-index: 1;
        display: grid;
        gap: 16px;
        align-content: start;
      }

      /* Mỗi section là một mỏ neo cuộn tới; card bên trong xếp dọc. */
      .section {
        display: grid;
        gap: 16px;
        scroll-margin-top: 16px;
        min-width: 0;
        max-width: 100%;
      }
      .section--error { outline: 1px solid var(--red-500); outline-offset: 4px; border-radius: var(--radius); }

      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 16px; }
      .grid .wide { grid-column: span 2; }
      .create-other-row {
        grid-column: span 3;
        display: flex;
        align-items: center;
        gap: 20px;
        margin: 4px 0 8px 0;
        padding: 10px 14px;
        background: #f8fafc;
        border: 1px solid var(--line);
        border-radius: 10px;
        flex-wrap: wrap;
      }
      .checkbox-container {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--ink-900);
        white-space: nowrap;
      }
      .checkbox-container input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--blue-600);
      }
      .account-type-select {
        flex: 0 0 240px;
      }
      .account-type-select sg-form-field {
        margin: 0;
      }

      .account-matched-notice {
        grid-column: span 3;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: #eef6ff;
        border: 1px solid #b6d4fe;
        border-radius: 10px;
        color: #084298;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .account-matched-notice mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: #0d6efd;
      }

      input:disabled, select:disabled, textarea:disabled {
        background-color: #f1f5f9 !important;
        color: #64748b !important;
        opacity: 0.65;
        cursor: not-allowed !important;
        border-color: #cbd5e1 !important;
        box-shadow: none !important;
      }

      .cargo-table {
        width: 100%;
        min-width: 560px;
        border-collapse: separate;
        border-spacing: 0;
        margin-top: 4px;
        font-size: 13px;
      }
      .cargo-table th {
        background: #f4f6fb;
        color: var(--ink-700);
        font-weight: 700;
        text-align: left;
        padding: 9px 10px;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        white-space: nowrap;
      }
      .cargo-table td {
        padding: 8px 10px;
        border-bottom: 1px solid var(--line);
        vertical-align: middle;
      }
      .cargo-table .col-stt, .cargo-table .cell-stt {
        width: 44px;
        min-width: 44px;
        text-align: center;
        vertical-align: middle;
        font-weight: 600;
        color: var(--ink-500);
      }
      .cargo-table .col-type, .cargo-table .cell-type { min-width: 130px; }
      .cargo-table .col-name, .cargo-table .cell-name { min-width: 140px; }
      .cargo-table .col-qty, .cargo-table .cell-qty { width: 90px; min-width: 70px; }
      .cargo-table .col-unit, .cargo-table .cell-unit { width: 110px; min-width: 100px; }
      .cargo-table .col-weight, .cargo-table .cell-weight { width: 110px; min-width: 100px; }
      .cargo-table .col-action, .cargo-table .cell-action {
        width: 44px;
        min-width: 44px;
        text-align: center;
        vertical-align: middle;
      }
      .cargo-table input {
        width: 100%;
        min-height: 38px;
        padding: 4px 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
        font-size: 13px;
        color: var(--ink-900);
        background: #fff;
        box-sizing: border-box;
      }
      .cargo-table input:focus {
        outline: none;
        border-color: var(--blue-500);
        box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.15);
      }
      .cargo-table input.input--invalid {
        border-color: var(--red-500);
        background: var(--red-50);
      }
      .cargo-table .select__control--invalid {
        border-color: var(--red-500) !important;
        background: var(--red-50) !important;
      }
      .field--invalid .select__control {
        border-color: var(--red-500) !important;
        background: var(--red-50) !important;
      }
      .cell-error {
        margin-top: 4px;
        font-size: 11px;
        color: var(--red-500);
        line-height: 1.3;
      }
      .req { color: var(--red-500); font-weight: 700; margin-left: 2px; }
      .cargo-total-row {
        background: #f8fafc;
      }
      .cargo-total-row td {
        padding: 12px 10px;
        border-top: 2px solid var(--line);
        border-bottom: 2px solid var(--line);
      }
      .total-label {
        text-align: right;
        font-size: 13px;
        color: var(--ink-900);
      }
      .total-value {
        font-size: 14px;
        color: var(--blue-600);
        white-space: nowrap;
      }
      /* Danh sách xe nhận sang tải (CR9) */
      .transship { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      .transship__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
      .transship__body { display: grid; gap: 2px; }
      .transship__body strong { font-size: 13px; color: var(--ink-900); }
      .transship__body span { font-size: 12px; color: var(--ink-700); }
      .transship__actions { display: flex; gap: 6px; }
      .transship__empty { font-size: 12.5px; color: var(--ink-700); margin: 4px 0 0; }

      .upload { display: grid; grid-template-columns: minmax(200px, .5fr) minmax(0, 1fr); gap: 14px; align-items: start; }
      .dropzone {
        display: grid;
        justify-items: center;
        gap: 8px;
        padding: 22px 12px;
        border: 1.5px dashed var(--line);
        border-radius: 12px;
        background: #f4f6fb;
        text-align: center;
      }
      .dropzone--over { border-color: var(--blue-500); background: var(--blue-50); }
      .dropzone mat-icon { width: 28px; height: 28px; font-size: 28px; color: var(--blue-600); }
      .dropzone p { margin: 0; color: var(--ink-500); font-size: 12.5px; }
      .dropzone__input { display: none; }
      .dropzone__hint { color: var(--ink-500); font-size: 11px; }

      .files { display: grid; gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }
      .files__row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 9px 12px;
        border: 1px solid var(--line);
        border-radius: 9px;
      }
      .files__row mat-icon { color: var(--blue-600); }
      .files__body { flex: 1 1 auto; min-width: 0; }
      .files__body strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--ink-900); }
      .files__body span { color: var(--ink-500); font-size: 11px; }
      .files__empty { color: var(--ink-500); padding: 14px; font-size: 12.5px; }
      .errorlist { margin: 4px 0 0; padding-left: 20px; }

      .reqdocs { display: grid; gap: 8px; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
      .reqdocs__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .reqdocs__head strong { font-size: 13px; color: var(--ink-900); }
      .reqdocs__sub { color: var(--ink-500); font-weight: 400; font-size: 12px; }
      .reqdocs__summary { color: var(--ink-500); font-size: 12px; }
      .reqdocs__hint { margin: 0; color: var(--ink-500); font-size: 12px; }
      .reqdocs__list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .reqdoc { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 10px; background: var(--amber-50); }
      .reqdoc[data-uploaded='true'] { background: var(--green-50); }
      .reqdoc mat-icon { width: 20px; height: 20px; font-size: 20px; color: var(--amber-500); }
      .reqdoc[data-uploaded='true'] mat-icon { color: var(--green-600); }
      .reqdoc__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--ink-900); font-weight: 600; }
      .reqdoc__badge {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 10px;
        border-radius: 20px;
        background: var(--amber-50);
        color: #92620f;
        font-size: 10.5px;
        font-weight: 700;
      }
      .reqdoc__badge[data-uploaded='true'] { background: var(--green-50); color: var(--green-600); }

      .summary { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1fr); gap: 8px; margin: 0; }
      .summary dt { color: var(--ink-500); font-size: 12.5px; }
      .summary dd { margin: 0; font-weight: 600; color: var(--ink-900); overflow-wrap: anywhere; text-align: right; }
      .notes { margin: 4px 0 0; padding-left: 18px; }

      .iconbtn {
        display: inline-grid;
        place-items: center;
        width: 30px;
        min-width: 30px;
        height: 30px;
        min-height: 30px;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: var(--red-500);
        cursor: pointer;
      }
      .iconbtn:hover { border-color: var(--red-500); background: var(--red-50); }
      .iconbtn mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .iconbtn:disabled { color: var(--line); border-color: var(--line); background: #fff; cursor: not-allowed; }

      /* Thanh hành động cố định dưới cùng — bố cục footer template. */
      .actionbar {
        position: sticky;
        bottom: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 20px;
        padding: 14px 20px;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: 0 -4px 16px -12px rgba(13, 23, 48, 0.3);
      }
      .actionbar__left, .actionbar__right { display: flex; gap: 10px; flex-wrap: wrap; }

      .modal__body--center { display: grid; justify-items: center; gap: 14px; text-align: center; }
      .modal__desc { margin: 0; color: var(--ink-500); }
      .modal__code { font-size: 22px; font-weight: 800; color: var(--ink-900); letter-spacing: .04em; }
      .modal__time { color: var(--ink-500); font-size: 12.5px; }

      @media (max-width: 1100px) {
        .layout { grid-template-columns: 1fr; }
        .side { width: 100%; }
        .side__sticky { position: static; }
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .upload { grid-template-columns: 1fr; }
      }
      @media (max-width: 720px) {
        .grid { grid-template-columns: 1fr; }
        .grid .wide { grid-column: auto; }
      }
    `,
  ],
})
export class DeclarationFormPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly appMessages = inject(AppMessageService);
  private readonly destroyRef = inject(DestroyRef);
  private lastLookupKey: string | null = null;
  private readonly identityLookup$ = new Subject<{
    type: 'ENTERPRISE' | 'INDIVIDUAL' | 'INTERNAL';
    query: { taxCode?: string; idNumber?: string; email?: string };
    silent?: boolean;
  }>();

  constructor() {
    this.identityLookup$
      .pipe(
        switchMap(({ type, query, silent }) =>
          this.api.lookupUser({ ...query, accountType: type }).pipe(
            map((user) => ({ user, type, silent, error: false })),
            catchError(() => of({ user: null, type, silent, error: true })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ user, type, silent, error }) => {
        // Nếu người dùng đã chuyển sang loại tài khoản khác trong lúc request đang bay thì bỏ qua response cũ
        if (type !== this.selectedAccountType()) {
          return;
        }
        if (error) {
          // Lỗi mạng/API: xóa lastLookupKey để người dùng có thể blur thử lại đúng giá trị đó
          this.lastLookupKey = null;
          if (!silent) {
            this.appMessages.showKey('ui.form.lookupFailed', 'error');
          }
          return;
        }
        if (user) {
          this.accountMatched.set(true);
          this.form.enterprise.name = user.displayName || '';
          this.form.enterprise.phone = user.phone || '';
          this.form.enterprise.address = user.address || '';
          this.form.enterprise.representativeName = user.representativeName || '';
          this.form.enterprise.jobTitle = user.title || '';
          this.form.enterprise.department = user.organization?.name || '';
          this.form.enterprise.username = user.username || '';

          if (type === 'INDIVIDUAL') {
            this.form.enterprise.taxCode = user.idNumber || this.form.enterprise.taxCode;
          } else if (type === 'ENTERPRISE') {
            this.form.enterprise.taxCode = user.taxCode || this.form.enterprise.taxCode;
          } else if (type === 'INTERNAL') {
            this.form.enterprise.email = user.email || this.form.enterprise.email;
          }

          if (!silent) {
            this.appMessages.showKey('ui.form.accountMatchedToast', 'info');
          }
        } else {
          // Không tìm thấy tài khoản (định danh chưa tồn tại trên hệ thống)
          // 1. Nếu là tra cứu ngầm khi mở hồ sơ (silent = true): chỉ mở khóa (accountMatched = false), KHÔNG xóa dữ liệu đã lưu trên form
          // 2. Nếu người dùng chủ động đổi định danh (!silent) mà trước đó đã khớp tài khoản cũ: xóa các trường auto-fill cũ để người dùng nhập mới
          if (!silent && this.accountMatched()) {
            this.clearTargetAccountMatchedFields();
            this.appMessages.showKey('ui.form.accountNotFoundToast', 'info');
          } else {
            this.accountMatched.set(false);
          }
        }
      });
  }

  /**
   * Các section của biểu mẫu một trang.
   * `id` khớp với `id="sec-<id>"` trên khung để cuộn tới, và với giá trị trong `FIELD_SECTION`.
   */
  protected readonly sections = computed(() => {
    return [
      { id: 'enterprise', label: this.t('ui.form.accountSectionInit') },
      { id: 'vehicle', label: this.t('ui.form.sectionVehicle') },
      { id: 'cargo', label: this.t('ui.form.step4') },
      { id: 'documents', label: this.t('ui.form.sectionDocuments') },
    ];
  });

  protected form: DossierForm = emptyForm();
  /** Loại chứng từ đang chọn cho lần tải tệp; rỗng = không xác định loại (mã tùy chọn, không gửi). */
  protected documentTypeCode = '';

  protected readonly dossierId = signal('');
  protected readonly loaded = signal<DossierDetail | null>(null);
  protected readonly saving = signal(false);
  protected readonly submitting = signal(false);
  protected readonly uploading = signal(false);
  protected readonly dragOver = signal(false);
  protected readonly feedback = signal('');
  protected readonly generalError = signal('');
  protected readonly loadError = signal('');
  protected readonly cargoListError = signal('');
  protected readonly vehicleListError = signal('');
  protected readonly uploadErrors = signal<string[]>([]);
  protected readonly attachments = signal<DossierAttachment[]>([]);
  protected readonly submitResult = signal<DossierSubmitResult | null>(null);
  /** Bản nháp đang sửa trong modal "Xe nhận sang tải" (CR9); `null` = modal đóng. */
  protected readonly transshipDraft = signal<TransshipmentRow | null>(null);
  /** Chỉ số dòng đang sửa; `-1` = thêm mới. */
  private transshipEditIndex = -1;
  protected readonly readOnly = signal(false);
  /** Thông tin doanh nghiệp luôn cho phép chỉnh sửa. */
  protected readonly enterpriseLocked = signal(false);

  protected readonly createForOther = signal(false);
  protected readonly selectedAccountType = signal<'ENTERPRISE' | 'INDIVIDUAL' | 'INTERNAL'>('ENTERPRISE');
  /** Đã tìm thấy và tự điền thông tin tài khoản hợp lệ hay chưa */
  protected readonly accountMatched = signal(false);

  protected onTargetAccountTypeChange(type: string): void {
    this.selectedAccountType.set(type as 'ENTERPRISE' | 'INDIVIDUAL' | 'INTERNAL');
    this.resetTargetAccountFields();
  }

  protected readonly isAdmin = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return false;
    const roleCodes = typeof this.auth.roleCodes === 'function' ? this.auth.roleCodes() : [];
    return roleCodes.some((r) => ['SYS_ADMIN', 'ADMIN'].includes((r || '').toUpperCase()));
  });

  protected readonly targetAccountTypeOptions = computed<SgSelectOption[]>(() => [
    { value: 'ENTERPRISE', label: this.t('ui.form.accountTypeEnterprise') },
    { value: 'INDIVIDUAL', label: this.t('ui.form.accountTypeIndividual') },
    { value: 'INTERNAL', label: this.t('ui.form.accountTypeInternal') },
  ]);

  protected toggleCreateForOther(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.createForOther.set(checked);
    if (!checked) {
      this.prefillEnterpriseFromAccount();
    } else {
      this.selectedAccountType.set('ENTERPRISE');
      this.resetTargetAccountFields();
    }
  }

  protected clearTargetAccountMatchedFields(): void {
    this.accountMatched.set(false);
    const type = this.selectedAccountType();
    this.form.enterprise.name = '';
    this.form.enterprise.phone = '';
    this.form.enterprise.address = '';
    this.form.enterprise.representativeName = '';
    this.form.enterprise.jobTitle = '';
    this.form.enterprise.department = '';
    this.form.enterprise.username = '';

    // Dọn dẹp trường định danh chéo giữa các loại tài khoản:
    if (type === 'INTERNAL') {
      // Khi chọn loại Nội bộ: email là định danh chính, xóa taxCode dư thừa
      this.form.enterprise.taxCode = '';
    } else if (type === 'INDIVIDUAL' || type === 'ENTERPRISE') {
      // Khi chọn Cá nhân/Doanh nghiệp: taxCode là định danh chính, xóa email dư thừa
      this.form.enterprise.email = '';
    }
  }

  protected onIdentityBlur(silent = false): void {
    if (!this.createForOther() || !this.isAdmin()) return;
    const type = this.selectedAccountType();
    let query: { taxCode?: string; idNumber?: string; email?: string } | null = null;

    if (type === 'INDIVIDUAL' && this.form.enterprise.taxCode.trim()) {
      query = { idNumber: this.form.enterprise.taxCode.trim() };
    } else if (type === 'ENTERPRISE' && this.form.enterprise.taxCode.trim()) {
      query = { taxCode: this.form.enterprise.taxCode.trim() };
    } else if (type === 'INTERNAL' && this.form.enterprise.email.trim()) {
      query = { email: this.form.enterprise.email.trim() };
    }

    if (!query) {
      this.lastLookupKey = null;
      if (this.accountMatched()) {
        this.clearTargetAccountMatchedFields();
      }
      return;
    }

    const key = `${type}:${JSON.stringify(query)}`;
    if (this.lastLookupKey === key) return;
    this.lastLookupKey = key;

    this.identityLookup$.next({ type, query, silent });
  }

  protected resetTargetAccountFields(): void {
    this.lastLookupKey = null;
    this.accountMatched.set(false);
    this.form.enterprise = {
      taxCode: '',
      name: '',
      representativeName: '',
      address: '',
      phone: '',
      email: '',
      username: '',
      jobTitle: '',
      department: '',
    };
  }

  /** SG-191: Tự động tự điền thông tin tài khoản khi hồ sơ mới tạo và thông tin người dùng nạp xong. */
  private readonly autoPrefillEffect = effect(() => {
    const user = this.auth.currentUser();
    if (user && !this.dossierId() && !this.createForOther()) {
      if (!this.form.enterprise.name || !this.form.enterprise.phone || (!this.form.enterprise.taxCode && this.userAccountType() === 'ENTERPRISE')) {
        this.prefillEnterpriseFromAccount();
      }
    }
  });

  /** SG-191: Ẩn trường "Người đại diện" với tài khoản cá nhân (INDIVIDUAL) hoặc tài khoản nội bộ/admin (accountType rỗng). */
  protected readonly showRepresentative = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return true;
    const accountType = (user.accountType || '').toUpperCase();
    if (accountType === '' || accountType === 'INDIVIDUAL') return false;
    const roleCodes = typeof this.auth.roleCodes === 'function' ? this.auth.roleCodes() : [];
    if (roleCodes.includes('INDIVIDUAL') && !roleCodes.includes('ENTERPRISE')) return false;
    return true;
  });

  /** SG-191: Tự động phân loại tài khoản đăng nhập để thay đổi giao diện phù hợp. */
  protected userAccountType(): 'ENTERPRISE' | 'INDIVIDUAL' | 'INTERNAL' {
    const user = this.auth.currentUser();
    if (!user) return 'ENTERPRISE';
    const userAny = user as unknown as Record<string, unknown>;
    const typeVal =
      typeof user.accountType === 'string'
        ? user.accountType
        : typeof userAny['type'] === 'string'
          ? userAny['type']
          : '';
    const rawType = typeVal.toUpperCase();
    if (rawType === 'INDIVIDUAL' || rawType === 'INTERNAL' || rawType === 'ENTERPRISE') {
      return rawType;
    }
    const roleCodes = typeof this.auth.roleCodes === 'function' ? this.auth.roleCodes() : [];
    if (roleCodes.includes('ENTERPRISE') && !roleCodes.includes('INDIVIDUAL')) return 'ENTERPRISE';
    if (roleCodes.includes('INDIVIDUAL') && !roleCodes.includes('ENTERPRISE')) return 'INDIVIDUAL';
    const isInternal =
      !!user.organization ||
      roleCodes.some((r) =>
        ['SYS_ADMIN', 'BORDER_GUARD', 'CUSTOMS', 'QUARANTINE', 'FEE_COLLECTOR', 'DISPATCHER', 'YARD_MANAGER', 'MANAGEMENT', 'INTERNAL'].includes(r),
      );
    if (isInternal) return 'INTERNAL';
    if (!user.taxCode && (user.idNumber || userAny['citizenId'] || userAny['identityNumber'])) {
      return 'INDIVIDUAL';
    }
    return 'ENTERPRISE';
  }

  protected readonly accountSectionTitle = computed(() => {
    return this.t('ui.form.accountSectionInit');
  });

  protected readonly accountNameLabel = computed(() => {
    const type = this.userAccountType();
    if (type === 'INDIVIDUAL') return this.t('ui.form.fullNameIndividual');
    if (type === 'INTERNAL') return this.t('ui.form.nameInternal');
    return this.t('ui.form.enterpriseName');
  });

  protected readonly accountNamePlaceholder = computed(() => {
    const type = this.userAccountType();
    if (type === 'INDIVIDUAL') return this.t('ui.form.fullNameIndividualPlaceholder');
    if (type === 'INTERNAL') return this.t('ui.form.nameInternalPlaceholder');
    return this.t('ui.form.enterpriseNamePlaceholder');
  });

  protected readonly accountTaxCodeLabel = computed(() => {
    const type = this.userAccountType();
    if (type === 'INDIVIDUAL') return this.t('ui.form.idNumberIndividual');
    if (type === 'INTERNAL') return this.t('ui.form.codeInternal');
    return this.t('ui.register.taxCode');
  });

  protected readonly accountTaxCodePlaceholder = computed(() => {
    const type = this.userAccountType();
    if (type === 'INDIVIDUAL') return this.t('ui.form.idNumberIndividualPlaceholder');
    if (type === 'INTERNAL') return this.t('ui.form.codeInternalPlaceholder');
    return this.t('ui.form.taxCodePlaceholder');
  });

  protected readonly accountAddressLabel = computed(() => {
    const type = this.userAccountType();
    if (type === 'INTERNAL') return this.t('ui.form.addressInternal');
    return this.t('ui.form.address');
  });

  protected isAccountInfoVisible(): boolean {
    const cfg = this.fieldConfigs()['accountInfo'];
    if (cfg !== undefined) return cfg.isVisible;
    const nameCfg = this.fieldConfigs()['enterpriseName'];
    if (nameCfg !== undefined) return nameCfg.isVisible;
    const taxCfg = this.fieldConfigs()['enterpriseTaxCode'];
    if (taxCfg !== undefined) return taxCfg.isVisible;
    return true;
  }

  protected isAccountInfoRequired(): boolean {
    const cfg = this.fieldConfigs()['accountInfo'];
    if (cfg !== undefined) return cfg.isRequired;
    const nameCfg = this.fieldConfigs()['enterpriseName'];
    if (nameCfg !== undefined) return nameCfg.isRequired;
    return false;
  }

  // D7 — chứng từ bắt buộc theo loại hồ sơ.
  protected readonly requiredDocuments = signal<RequiredDocument[]>([]);
  protected readonly requiredDocsLoading = signal(false);
  protected readonly requiredDocsError = signal('');

  // F04 — danh mục loại chứng từ (nạp từ API, không hard-code) để đổ vào ô chọn khi đính kèm tệp.
  protected readonly documentTypes = signal<DocumentTypeOption[]>([]);

  private readonly apiErrors = signal<DossierFieldError[]>([]);
  // Lỗi có `messageKey` thì dịch theo ngôn ngữ đang chọn; không có bản dịch thì giữ `message` của API.
  protected readonly fieldErrors = computed(() => toFieldErrorMap(this.apiErrors(), this.i18n.fieldError));

  /** Lỗi không gắn được vào ô nào (tên trường rỗng hoặc trường không có trên biểu mẫu). */
  protected readonly otherErrors = computed(() =>
    this.apiErrors()
      .filter((item) => !this.isFieldOnForm(item.field))
      .map((item) => fieldErrorText(item, this.i18n.fieldError)),
  );

  /** Tập id section đang có lỗi — dùng để tô đỏ thanh mỏ neo và khung section. */
  protected readonly errorSections = computed(() => {
    const set = new Set<string>();
    for (const item of this.apiErrors()) {
      if (this.isFieldOnForm(item.field)) {
        const section = this.sectionOfField(item.field);
        if (section) set.add(section);
      }
    }
    return set;
  });

  /** Section đầu tiên (theo thứ tự hiển thị) có lỗi — nơi sẽ cuộn tới khi API từ chối. */
  protected readonly firstErrorSection = computed(() => {
    const sections = this.errorSections();
    return this.sections().find((section) => sections.has(section.id))?.id || '';
  });

  protected readonly busy = computed(() => this.saving() || this.submitting() || this.uploading());

  /** Cấu hình hiển thị trường theo Loại hồ sơ được chọn (g1..g5) */
  protected readonly fieldConfigs = signal<Record<string, { isVisible: boolean; isRequired: boolean }>>({});

  protected loadFieldConfigs(typeCode: string): void {
    if (!typeCode || typeof this.api?.getDossierFieldConfigs !== 'function') return;
    this.api.getDossierFieldConfigs(typeCode).subscribe({
      next: (configs) => {
        const map: Record<string, { isVisible: boolean; isRequired: boolean }> = {};
        (configs || []).forEach((c) => {
          map[c.fieldKey] = { isVisible: c.isVisible, isRequired: c.isRequired };
        });
        this.fieldConfigs.set(map);
      },
    });
  }

  protected isFieldVisible(fieldKey: string, defaultVisible = true): boolean {
    const cfg = this.fieldConfigs()[fieldKey];
    return cfg ? cfg.isVisible : defaultVisible;
  }

  protected isFieldRequired(fieldKey: string, defaultRequired = false): boolean {
    const cfg = this.fieldConfigs()[fieldKey];
    return cfg ? cfg.isRequired : defaultRequired;
  }

  /** D7 — đối chiếu chứng từ bắt buộc với tệp đã đính kèm để đánh dấu đã đủ / còn thiếu. */
  protected readonly requiredDocStatus = computed(() => {
    const uploaded = new Set(
      this.attachments()
        .map((file) => file.documentTypeCode || '')
        .filter((code) => !!code),
    );
    return this.mergedRequiredDocuments().map((doc) => ({
      code: doc.documentTypeCode,
      name: doc.documentTypeName || doc.documentTypeCode,
      uploaded: uploaded.has(doc.documentTypeCode),
    }));
  });

  protected readonly mergedRequiredDocuments = computed<RequiredDocument[]>(() => {
    const apiDocs = this.requiredDocuments();
    const map = new Map<string, RequiredDocument>();
    apiDocs.forEach((d) => map.set(d.documentTypeCode, d));

    const docTypes = this.documentTypes();
    docTypes.forEach((doc) => {
      if (this.isFieldRequired(doc.code, false) && !map.has(doc.code)) {
        map.set(doc.code, {
          documentTypeCode: doc.code,
          documentTypeName: doc.name,
          required: true,
        });
      }
    });

    return Array.from(map.values());
  });

  protected readonly requiredDocsDone = computed(() => this.requiredDocStatus().filter((doc) => doc.uploaded).length);

  protected readonly dossierTypes = signal<CatalogItem[]>([]);

  // Nhãn của các ô chọn là `computed` nên tự đổi khi người dùng đổi ngôn ngữ.
  protected readonly typeOptions = computed<SgSelectOption[]>(() => {
    const items = this.dossierTypes();
    if (items.length > 0) {
      return items.map((item) => ({ value: item.code, label: item.name }));
    }
    return Object.keys(DOSSIER_TYPE_LABEL_KEYS).map((value) => ({ value, label: dossierTypeLabel(value, this.t) }));
  });
  protected readonly vehicleTypes = signal<CatalogItem[]>([]);
  protected readonly vehicleTypeOptions = computed<SgSelectOption[]>(() => {
    const items = this.vehicleTypes();
    if (items.length > 0) {
      return items.map((item) => ({ value: item.code, label: item.name }));
    }
    return [
      { value: 'TRUCK', label: this.t('ui.vehicleType.TRUCK') },
      { value: 'CONTAINER', label: this.t('ui.vehicleType.CONTAINER') },
      { value: 'TRACTOR', label: this.t('ui.vehicleType.TRACTOR') },
      { value: 'TANKER', label: this.t('ui.vehicleType.TANKER') },
      { value: 'EMPTY', label: this.t('ui.vehicleType.EMPTY') },
    ];
  });
  protected readonly unitTypes = signal<CatalogItem[]>([]);
  protected readonly unitOptions = computed<SgSelectOption[]>(() => {
    const items = this.unitTypes();
    if (items.length > 0) {
      return items.map((item) => ({ value: item.code, label: item.name }));
    }
    return [
      { value: 'KG', label: this.t('ui.unit.KG') },
      { value: 'TON', label: this.t('ui.unit.TON') },
      { value: 'PIECE', label: this.t('ui.unit.PIECE') },
      { value: 'BOX', label: this.t('ui.unit.BOX') },
      { value: 'PALLET', label: this.t('ui.unit.PALLET') },
      { value: 'M3', label: this.t('ui.unit.M3') },
      { value: 'LITER', label: this.t('ui.unit.LITER') },
    ];
  });

  protected readonly cargoTypes = signal<CatalogItem[]>([]);
  protected readonly cargoTypeOptions = computed<SgSelectOption[]>(() => {
    const items = this.cargoTypes();
    if (items.length > 0) {
      return items.map((item) => ({ value: item.code, label: item.name }));
    }
    return [
      { value: 'AGRICULTURAL', label: this.t('ui.cargoType.AGRICULTURAL') },
      { value: 'FROZEN', label: this.t('ui.cargoType.FROZEN') },
      { value: 'CONSUMER', label: this.t('ui.cargoType.CONSUMER') },
      { value: 'MACHINERY', label: this.t('ui.cargoType.MACHINERY') },
      { value: 'MINERAL', label: this.t('ui.cargoType.MINERAL') },
      { value: 'OTHER', label: this.t('ui.cargoType.OTHER') },
    ];
  });

  protected readonly countryTypes = signal<CatalogItem[]>([]);
  protected readonly countryOptions = computed<SgSelectOption[]>(() => {
    const items = this.countryTypes();
    if (items.length > 0) {
      return items.map((item) => ({ value: item.name, label: item.name }));
    }
    return [
      { value: 'Việt Nam', label: this.t('ui.country.VN') },
      { value: 'Lào', label: this.t('ui.country.LA') },
      { value: 'Trung Quốc', label: this.t('ui.country.CN') },
      { value: 'Thái Lan', label: this.t('ui.country.TH') },
      { value: 'Campuchia', label: this.t('ui.country.KH') },
    ];
  });

  protected readonly documentTypeOptions = computed<SgSelectOption[]>(() =>
    this.documentTypes()
      .filter((item) => this.isFieldVisible(item.code, true))
      .map((item) => ({ value: item.code, label: item.name })),
  );
  protected readonly idTypeOptions = computed<SgSelectOption[]>(() =>
    ID_TYPE_KEYS.map((item) => ({ value: item.value, label: this.t(item.labelKey) })),
  );
  protected readonly acceptAttribute = UPLOAD_ACCEPT_ATTRIBUTE;
  protected readonly uploadHint = computed(() => uploadHint(this.t));

  /** Tệp đã tải lên khi hồ sơ chưa có id — sẽ gắn vào hồ sơ ngay sau khi lưu nháp lần đầu. */
  private pendingAttachmentIds: string[] = [];

  ngOnInit(): void {
    this.loadCatalogs();
    this.initFormState();
  }

  /** Nạp song song các danh mục dùng chung (F04). */
  private loadCatalogs(): void {
    this.loadDossierTypes();
    this.loadVehicleTypes();
    this.loadCargoTypes();
    this.loadDocumentTypes();
    this.loadUnits();
    this.loadCountries();
  }

  private loadDossierTypes(): void {
    this.api.getDossierTypes().subscribe({
      next: (items) => this.dossierTypes.set(items || []),
      error: () => this.dossierTypes.set([]),
    });
  }

  private loadVehicleTypes(): void {
    this.api.getVehicleTypes().subscribe({
      next: (items) => this.vehicleTypes.set(items || []),
      error: () => this.vehicleTypes.set([]),
    });
  }

  private loadCargoTypes(): void {
    this.api.getCargoTypes().subscribe({
      next: (items) => this.cargoTypes.set(items || []),
      error: () => this.cargoTypes.set([]),
    });
  }

  private loadDocumentTypes(): void {
    this.api.getDocumentTypes().subscribe({
      next: (types) => this.documentTypes.set(types || []),
      error: () => this.documentTypes.set([]),
    });
  }

  private loadUnits(): void {
    this.api.getUnits().subscribe({
      next: (items) => this.unitTypes.set(items || []),
      error: () => this.unitTypes.set([]),
    });
  }

  private loadCountries(): void {
    this.api.getCountries().subscribe({
      next: (items) => this.countryTypes.set(items || []),
      error: () => this.countryTypes.set([]),
    });
  }

  private initFormState(): void {
    const id = this.route.snapshot?.paramMap?.get('id') || '';
    const stateDossier = (history.state as { dossier?: DossierDetail } | undefined)?.dossier;
    if (id && stateDossier && stateDossier.id === id) {
      this.applyDossierDetail(stateDossier);
    } else if (id) {
      this.loadDossier(id);
    } else {
      this.prefillEnterpriseFromAccount();
      this.loadRequiredDocuments(this.form.type);
      this.loadFieldConfigs(this.form.type);
    }
  }

  /**
   * SG-191: Tự động lấy thông tin doanh nghiệp/người khai từ tài khoản đăng nhập và cho phép chỉnh sửa.
   * Áp dụng cho cả tài khoản Doanh nghiệp, Cá nhân và Nội bộ (Organization).
   */
  private prefillEnterpriseFromAccount(): void {
    const user = this.auth.currentUser();
    if (!user) return;
    const userType = this.userAccountType();

    if (userType === 'INTERNAL') {
      const orgName = typeof user.organization === 'string' ? user.organization : (user.organization?.name || user.organization?.code || '');
      this.form.enterprise = {
        taxCode: user.taxCode || user.idNumber || '',
        name: user.displayName || '',
        representativeName: '',
        address: user.address || '',
        phone: user.phone || '',
        email: user.email || '',
        username: user.username || '',
        jobTitle: user.title || ((user as unknown as Record<string, unknown>)['jobTitle'] as string) || '',
        department: orgName,
      };
      return;
    }

    const userAny = user as unknown as Record<string, unknown>;
    const taxOrId =
      user.taxCode ||
      user.idNumber ||
      (typeof userAny['citizenId'] === 'string' ? userAny['citizenId'] : '') ||
      (typeof userAny['identityNumber'] === 'string' ? userAny['identityNumber'] : '');

    this.form.enterprise = {
      taxCode: (userType === 'ENTERPRISE' ? user.taxCode : (user.idNumber || taxOrId)) || '',
      name: user.displayName || '',
      representativeName: user.representativeName || '',
      address: user.address || '',
      phone: user.phone || '',
      email: user.email || '',
      username: user.username || '',
      jobTitle: '',
      department: '',
    };
  }

  // --- Chứng từ bắt buộc theo loại hồ sơ (D7 / F13) --------------------------

  /** Đổi loại hồ sơ thì tải lại danh mục chứng từ bắt buộc và cấu hình trường hiển thị tương ứng. */
  protected onTypeChange(type: string): void {
    this.form.type = type;
    this.loadRequiredDocuments(type);
    this.loadFieldConfigs(type);
  }

  private loadRequiredDocuments(type: string): void {
    if (!type) {
      this.requiredDocuments.set([]);
      return;
    }
    this.requiredDocsLoading.set(true);
    this.requiredDocsError.set('');
    this.api.getRequiredDocuments(type).subscribe({
      next: (docs) => {
        this.requiredDocsLoading.set(false);
        this.requiredDocuments.set(docs || []);
      },
      error: () => {
        this.requiredDocsLoading.set(false);
        this.requiredDocuments.set([]);
        this.requiredDocsError.set(this.t('ui.form.requiredDocsLoadFailed'));
      },
    });
  }

  // --- Lịch dự kiến đến cửa khẩu (F12) ---------------------------------------

  /**
   * F12 / BUG-016 — chặn chọn lịch quá khứ ngay trên ô nhập: `min` = **đầu ngày hôm nay theo giờ VN**
   * (Asia/Ho_Chi_Minh). BE vẫn là nguồn sự thật (chặn lịch quá khứ khi submit); đây chỉ là lớp phụ
   * trợ giúp người dùng không gõ nhầm.
   */
  protected minScheduledAt(): string {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return `${today}T00:00`;
  }

  // --- Điều hướng section (một trang cuộn) -----------------------------------

  /** Cuộn tới section theo id; bọc trong guard để chạy an toàn khi phần tử chưa gắn DOM. */
  protected scrollToSection(id: string): void {
    const el = this.host.nativeElement.querySelector(`#sec-${id}`) as HTMLElement | null;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  protected sectionHasError(id: string): boolean {
    return this.errorSections().has(id);
  }

  /** Section chứa trường bị lỗi; chuỗi rỗng nghĩa là không xác định được ô nhập tương ứng. */
  protected sectionOfField(field: string): string {
    const root = fieldRoot(field);
    if (!root) return '';
    return FIELD_SECTION[root] || '';
  }

  /**
  /**
   * Kiểm tra xem trường lỗi có thực sự tương ứng với một ô nhập đang hiển thị trên DOM hay không.
   * Nếu ô nhập không hiển thị (ví dụ: tạo cho người khác = false thì không có ô enterprise.email,
   * hoặc loại tài khoản không render ô tương ứng), lỗi sẽ được đưa vào `otherErrors`
   * để hiển thị trên banner cảnh báo chung, thay vì bị nuốt mất hoặc tô đỏ section ảo.
   */
  protected isFieldOnForm(field: string): boolean {
    const normalized = normalizeFieldName(field);
    if (!normalized) return false;

    if (normalized === 'type') {
      return true;
    }

    if (normalized === 'appointment' || normalized === 'appointment.scheduledAt') {
      return this.isFieldVisible('estimatedTime');
    }

    if (normalized.startsWith('enterprise.')) {
      const sub = normalized.replace('enterprise.', '');
      if (this.createForOther()) {
        const type = this.selectedAccountType();
        const allowed = ENTERPRISE_FIELDS_BY_TYPE.FOR_OTHER[type];
        return allowed ? (allowed as readonly string[]).includes(sub) : false;
      }

      // Khi không bật createForOther
      if (!this.isAccountInfoVisible()) {
        return false;
      }
      const type = this.userAccountType();
      if (type === 'INTERNAL') {
        return (ENTERPRISE_FIELDS_BY_TYPE.SELF.INTERNAL as readonly string[]).includes(sub);
      }
      if (type === 'INDIVIDUAL') {
        return (ENTERPRISE_FIELDS_BY_TYPE.SELF.INDIVIDUAL as readonly string[]).includes(sub);
      }
      // ENTERPRISE
      if (sub === 'representativeName') {
        return this.showRepresentative();
      }
      return (ENTERPRISE_FIELDS_BY_TYPE.SELF.ENTERPRISE_BASE as readonly string[]).includes(sub);
    }

    if (normalized === 'vehicles') {
      return true;
    }

    if (normalized.startsWith('vehicles[') || normalized.startsWith('vehicles.')) {
      const match = /^vehicles(?:\[(\d+)\]|\.(\d+))\.(.+)$/.exec(normalized);
      if (!match) return false;
      const index = parseInt(match[1] ?? match[2], 10);
      if (isNaN(index) || index < 0 || index >= this.form.vehicles.length) {
        return false;
      }
      const sub = match[3];
      if (sub === 'plateNumber' || sub === 'vehicleType') return true;
      const configKey = VEHICLE_CONFIG_FIELDS[sub];
      return configKey ? this.isFieldVisible(configKey) : false;
    }

    if (normalized.startsWith('cargoItems[') || normalized.startsWith('cargoItems.')) {
      const match = /^cargoItems(?:\[(\d+)\]|\.(\d+))\.(.+)$/.exec(normalized);
      if (!match) return false;
      const index = parseInt(match[1] ?? match[2], 10);
      if (isNaN(index) || index < 0 || index >= this.form.cargoItems.length) {
        return false;
      }
      const sub = match[3];
      const configKey = CARGO_CONFIG_FIELDS[sub];
      return configKey ? this.isFieldVisible(configKey) : false;
    }

    if (normalized === 'documents' || normalized === 'attachments' || normalized.startsWith('attachments.')) {
      return true;
    }

    return false;
  }

  // --- Lỗi trên biểu mẫu -----------------------------------------------------

  protected fieldError(field: string): string {
    return this.fieldErrors()[field] || '';
  }

  protected cargoError(index: number, field: string): string {
    const map = this.fieldErrors();
    const prefixes = [`cargoItems[${index}]`, `cargoItems.${index}`];
    let fieldKeys: string[] = [field];
    if (field === 'description') fieldKeys = ['description', 'cargoName', 'name'];
    else if (field === 'cargoTypeCode') fieldKeys = ['cargoTypeCode', 'cargoType'];
    else if (field === 'unitCode') fieldKeys = ['unitCode', 'unit'];
    else if (field === 'grossWeightKg') fieldKeys = ['grossWeightKg', 'cargoWeight', 'weightKg'];

    for (const p of prefixes) {
      for (const k of fieldKeys) {
        const fullKey = `${p}.${k}`;
        if (map[fullKey]) return map[fullKey];
      }
    }
    return '';
  }

  protected vehicleError(index: number, field: string): string {
    const vehicle = this.form.vehicles[index];
    if (field === 'driver.idType' && vehicle?.driver?.idType?.trim()) {
      return '';
    }
    if (field === 'driver.nationality' && vehicle?.driver?.nationality?.trim()) {
      return '';
    }

    const map = this.fieldErrors();
    const prefixes = [`vehicles[${index}]`, `vehicles.${index}`];
    let fieldKeys: string[] = [field];
    if (field === 'transportLicenseNumber') fieldKeys = ['transportLicenseNumber', 'transportLicense'];
    else if (field === 'weightKg') fieldKeys = ['weightKg', 'payloadWeight'];
    else if (field === 'driver.idType') fieldKeys = ['driver.idType', 'driverDocType', 'idType'];
    else if (field === 'driver.idNumber') fieldKeys = ['driver.idNumber', 'driverDocNo', 'idNumber'];
    else if (field === 'driver.licenseNumber') fieldKeys = ['driver.licenseNumber', 'driverLicenseNo', 'licenseNumber'];
    else if (field === 'driver.phone') fieldKeys = ['driver.phone', 'driverPhone', 'phone'];
    else if (field === 'driver.nationality') fieldKeys = ['driver.nationality', 'driverNationality', 'nationality'];
    else if (field === 'driver.fullName') fieldKeys = ['driver.fullName', 'driverName', 'fullName'];

    for (const p of prefixes) {
      for (const k of fieldKeys) {
        const fullKey = `${p}.${k}`;
        if (map[fullKey]) return map[fullKey];
      }
    }
    return '';
  }

  /**
   * Nhận danh sách lỗi từ API: tô đỏ đúng ô, gom lỗi dòng hàng và cuộn tới section đầu tiên có lỗi.
   * Trả về `true` nếu có ít nhất một lỗi.
   */
  protected applyApiErrors(errors: readonly DossierFieldError[], message = ''): boolean {
    const list = (errors || []).filter((item) => !!item?.message);
    this.apiErrors.set([...list]);
    this.cargoListError.set(
      list.some((item) => item.field === 'cargoItems') ? this.t('ui.form.cargoRequired') : '',
    );
    this.vehicleListError.set(
      list.some((item) => item.field === 'vehicles') ? this.t('ui.form.vehicleRequired') : '',
    );
    if (!list.length) {
      this.generalError.set(message);
      // Lỗi submit không gắn được vào ô nào → báo toast tổng (không còn banner nền).
      if (message) this.appMessages.show(message, 'error');
      return false;
    }
    this.generalError.set(message || this.t('ui.form.missingRequired'));
    const target = this.firstErrorSection();
    if (target) {
      // Có ô nhập trên biểu mẫu bị lỗi: báo toast kiểm tra các trường được đánh dấu và cuộn tới section đó.
      this.appMessages.showKey('ui.common.formHasErrors', 'error');
      this.scrollToSection(target);
      this.focusFirstError();
    } else {
      // Không có ô nhập nào được đánh dấu đỏ (mọi lỗi rơi vào otherErrors):
      // Báo toast kiểm tra nội dung bổ sung và cuộn lên đầu trang tới banner.
      this.appMessages.showKey('ui.form.needSupplementNotice', 'error');
      setTimeout(() => {
        this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    return true;
  }

  /** Cuộn tới và focus ô nhập lỗi đầu tiên (theo thứ tự DOM) sau khi tô đỏ các trường. */
  private focusFirstError(): void {
    setTimeout(() => {
      const root = this.host.nativeElement as HTMLElement;
      const invalid = root.querySelector('.field--invalid');
      const control = invalid?.querySelector('input, select, textarea, [tabindex]') as HTMLElement | null;
      if (control) {
        control.scrollIntoView({ behavior: 'smooth', block: 'center' });
        control.focus();
      }
    });
  }

  private clearErrors(): void {
    this.apiErrors.set([]);
    this.generalError.set('');
    this.cargoListError.set('');
    this.vehicleListError.set('');
  }

  // --- Xe nhận sang tải (CR9) ------------------------------------------------

  /** Hồ sơ loại Sang tải mới có phần "Xe nhận sang tải" (mã tập đóng, không dò chuỗi hiển thị). */
  protected isTransshipment(): boolean {
    return (
      this.form.type === 'TRANSSHIPMENT_EXPORT' ||
      this.form.type === 'TRANSSHIPMENT_IMPORT'
    );
  }

  /** Biển số các phương tiện của hồ sơ, đổ vào ô chọn "xe chở hàng gốc" trong modal. */
  protected sourcePlateOptions(): Array<{ value: string; label: string }> {
    return this.form.vehicles
      .map((row) => row.plateNumber.trim())
      .filter((plate) => !!plate)
      .map((plate) => ({ value: plate, label: plate }));
  }

  /** Tóm tắt một dòng xe sang tải cho danh sách: loại xe · lái xe. */
  protected transshipSummary(row: TransshipmentRow): string {
    const parts = [vehicleTypeLabel(row.vehicleType, this.t) === '—' ? '' : vehicleTypeLabel(row.vehicleType, this.t), row.driverName];
    return parts.filter((part) => !!(part || '').trim()).join(' · ');
  }

  /** Điều kiện bật nút Lưu trong modal (theo mockup: biển sang tải + loại xe + lái xe). */
  protected transshipDraftValid(draft: TransshipmentRow): boolean {
    return !!(draft.plateNumber.trim() && draft.vehicleType.trim() && draft.driverName.trim());
  }

  protected openTransshipModal(index = -1): void {
    if (this.readOnly()) return;
    this.transshipEditIndex = index;
    const source = index >= 0 ? this.form.transshipmentVehicles[index] : emptyTransshipmentRow();
    // Nhân bản để nhấn "Đóng" không ghi đè dòng đang có; chỉ ghi vào form khi bấm "Lưu".
    this.transshipDraft.set({ ...source });
  }

  protected saveTransshipRow(): void {
    const draft = this.transshipDraft();
    if (!draft || !this.transshipDraftValid(draft)) return;
    const row: TransshipmentRow = {
      ...draft,
      plateNumber: draft.plateNumber.trim().toUpperCase(),
      sourcePlate: draft.sourcePlate.trim(),
      driverName: draft.driverName.trim(),
    };
    if (this.transshipEditIndex >= 0) {
      this.form.transshipmentVehicles = this.form.transshipmentVehicles.map((item, i) =>
        i === this.transshipEditIndex ? row : item,
      );
    } else {
      this.form.transshipmentVehicles = [...this.form.transshipmentVehicles, row];
    }
    this.closeTransshipModal();
  }

  protected removeTransshipRow(index: number): void {
    if (this.readOnly()) return;
    this.form.transshipmentVehicles = this.form.transshipmentVehicles.filter((_, i) => i !== index);
  }

  protected closeTransshipModal(): void {
    this.transshipDraft.set(null);
    this.transshipEditIndex = -1;
  }

  // --- Dòng hàng hóa ---------------------------------------------------------

  protected addCargoRow(): void {
    this.form.cargoItems = [...this.form.cargoItems, emptyCargoRow()];
  }

  protected removeCargoRow(index: number): void {
    if (this.form.cargoItems.length <= 1) return;
    this.form.cargoItems = this.form.cargoItems.filter((_, i) => i !== index);
  }

  // --- Tệp đính kèm ----------------------------------------------------------

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.readOnly()) this.dragOver.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (this.readOnly()) return;
    this.uploadFiles(Array.from(event.dataTransfer?.files || []));
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.uploadFiles(Array.from(input.files || []));
    input.value = '';
  }

  /** Kiểm dung lượng và định dạng ngay tại trình duyệt trước khi gọi API (F11). */
  protected uploadFiles(files: File[]): void {
    if (!files.length) return;
    const accepted: File[] = [];
    const errors: string[] = [];
    files.forEach((file) => {
      const error = validateUploadFile(file, this.t);
      if (error) errors.push(error);
      else accepted.push(file);
    });
    this.uploadErrors.set(errors);
    if (!accepted.length) return;

    this.uploading.set(true);
    let remaining = accepted.length;
    const done = () => {
      remaining--;
      if (remaining === 0) this.uploading.set(false);
    };

    accepted.forEach((file) => {
      this.api
        .uploadFile(file, { dossierId: this.dossierId() || undefined, documentTypeCode: this.documentTypeCode })
        .subscribe({
          next: (attachment) => {
            this.attachments.update((list) => [...list, attachment]);
            if (this.dossierId()) this.linkAttachments([attachment.id]);
            else this.pendingAttachmentIds.push(attachment.id);
            done();
          },
          error: () => {
            this.uploadErrors.update((list) => [...list, this.t('ui.form.uploadFileFailed', { name: file.name })]);
            done();
          },
        });
    });
  }

  protected removeAttachment(file: DossierAttachment): void {
    const id = this.dossierId();
    const request = id ? this.api.removeDeclarationAttachment(id, file.id) : this.api.deleteFile(file.id);
    request.subscribe({
      next: () => {
        this.attachments.update((list) => list.filter((item) => item.id !== file.id));
        this.pendingAttachmentIds = this.pendingAttachmentIds.filter((item) => item !== file.id);
      },
      error: () => this.uploadErrors.set([this.t('ui.form.removeFileFailed', { name: file.fileName })]),
    });
  }

  protected iconOf(file: DossierAttachment): string {
    return fileIcon(file.contentType || file.fileName);
  }

  protected sizeOf(file: DossierAttachment): string {
    return formatFileSize(file.sizeBytes);
  }

  protected documentTypeLabel(code?: string): string {
    if (!code) return '';
    return this.documentTypes().find((item) => item.code === code)?.name || code;
  }

  /** Dòng phụ của tệp: "loại chứng từ · kích thước". Tệp chưa gắn loại thì chỉ hiện kích thước. */
  protected fileMeta(file: DossierAttachment): string {
    const type = file.documentTypeName || this.documentTypeLabel(file.documentTypeCode);
    const size = this.sizeOf(file);
    return type ? `${type} · ${size}` : size;
  }

  private linkAttachments(ids: string[]): void {
    const id = this.dossierId();
    if (!id || !ids.length) return;
    this.api.attachDeclarationFiles(id, ids).subscribe({
      next: () => {
        this.pendingAttachmentIds = this.pendingAttachmentIds.filter((item) => !ids.includes(item));
      },
      error: () => this.uploadErrors.update((list) => [...list, this.t('ui.form.attachFailed')]),
    });
  }

  // --- Lưu nháp / gửi hồ sơ --------------------------------------------------

  /**
   * BUG-043 — chặn ngay tại trình duyệt việc lưu nháp/gửi khi biểu mẫu **hoàn toàn trống** (chưa nhập
   * gì ở bước 1 và các bước sau), tránh tạo hồ sơ nháp rác. BE vẫn là nguồn sự thật khi gửi; đây chỉ
   * là lớp chặn sớm cho cả lưu nháp lẫn gửi. Trả `true` nếu có tối thiểu dữ liệu để tiếp tục.
   */
  private hasMinimumInput(): boolean {
    if (this.dossierId()) return true;
    if (this.createForOther()) return true;
    const enterprise = this.form.enterprise;
    if (enterprise.taxCode.trim() || enterprise.name.trim()) return true;
    if (this.form.vehicles.some((row) => row.plateNumber.trim() || row.driver.fullName.trim() || row.driver.idNumber.trim())) {
      return true;
    }
    if (this.form.cargoItems.some((row) => row.description.trim() || row.cargoTypeCode.trim() || row.quantity || row.grossWeightKg)) {
      return true;
    }
    if (this.form.appointment.scheduledAt) return true;
    return this.attachments().length > 0;
  }

  /** Chặn hành động khi biểu mẫu trống, cuộn về đầu và báo rõ. Trả `false` để dừng lưu/gửi. */
  private ensureMinimumInput(): boolean {
    if (this.hasMinimumInput()) return true;
    this.clearErrors();
    this.feedback.set('');
    this.generalError.set(this.t('ui.form.emptyFormBlocked'));
    this.appMessages.showKey('ui.form.emptyFormBlocked', 'error');
    this.scrollToSection('enterprise');
    return false;
  }

  /** Gộp lỗi validate từ local và API (lỗi API ưu tiên ghi đè nếu trùng field). */
  private mergeFieldErrors(local: DossierFieldError[], api: DossierFieldError[]): DossierFieldError[] {
    const map = new Map<string, DossierFieldError>();
    local.forEach((err) => map.set(err.field, err));
    api.forEach((err) => map.set(err.field, err));
    return Array.from(map.values());
  }

  /**
   * SG-275: Kiểm tra đồng thời tất cả các trường thông tin trên toàn bộ biểu mẫu.
   * `forSubmit = true` khi gửi chính thức (bắt buộc đủ các trường và chứng từ);
   * `forSubmit = false` khi lưu nháp (chỉ kiểm tra định dạng các trường đã nhập).
   */
  private collectFormErrors(forSubmit = true): DossierFieldError[] {
    const errors: DossierFieldError[] = [];
    const enterprise = this.form.enterprise;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^(?:\+?84|0)[0-9\s.-]{8,14}$/;
    const taxCodeRegex = /^\d{10}(-\d{3})?$/;
    const idNumberRegex = /^[0-9A-Za-z]{6,50}$/;
    const platePattern = /^[A-Za-z0-9.\-\s]{6,32}$/;

    // 1. Loại hồ sơ
    if (!this.form.type) {
      errors.push({
        field: 'type',
        message: this.t('ui.form.missingRequired'),
        messageKey: 'ui.form.missingRequired',
      });
    }

    // 2. Thời gian dự kiến đến cửa khẩu
    if (this.isFieldVisible('estimatedTime')) {
      const isReq = this.isFieldRequired('estimatedTime', true);
      const scheduledAt = (this.form.appointment?.scheduledAt || '').trim();
      if (isReq && !scheduledAt && forSubmit) {
        errors.push({
          field: 'appointment.scheduledAt',
          message: this.t('dossier.missingScheduledAt'),
          messageKey: 'dossier.missingScheduledAt',
        });
      } else if (scheduledAt) {
        const d = new Date(scheduledAt);
        const minTime = new Date(this.minScheduledAt());
        if (!isNaN(d.getTime()) && d.getTime() < minTime.getTime()) {
          errors.push({
            field: 'appointment.scheduledAt',
            message: this.t('dossier.appointmentInPast'),
            messageKey: 'dossier.appointmentInPast',
          });
        }
      }
    }

    // 3. Thông tin người khai / Doanh nghiệp
    if (this.createForOther()) {
      const type = this.selectedAccountType();
      if (type === 'INDIVIDUAL') {
        if (!enterprise.taxCode.trim()) {
          errors.push({
            field: 'enterprise.taxCode',
            message: this.t('ui.register.idNumberRequired'),
            messageKey: 'ui.register.idNumberRequired',
          });
        } else if (!idNumberRegex.test(enterprise.taxCode.trim())) {
          errors.push({
            field: 'enterprise.taxCode',
            message: this.t('ui.register.idNumberInvalid'),
            messageKey: 'ui.register.idNumberInvalid',
          });
        }
      } else if (type === 'ENTERPRISE') {
        if (!enterprise.taxCode.trim()) {
          errors.push({
            field: 'enterprise.taxCode',
            message: this.t('ui.register.taxCodeRequired'),
            messageKey: 'ui.register.taxCodeRequired',
          });
        } else if (!taxCodeRegex.test(enterprise.taxCode.trim())) {
          errors.push({
            field: 'enterprise.taxCode',
            message: this.t('ui.register.taxCodeRequired'),
            messageKey: 'ui.register.taxCodeRequired',
          });
        }
      } else if (type === 'INTERNAL') {
        if (!enterprise.email || !enterprise.email.trim()) {
          errors.push({
            field: 'enterprise.email',
            message: this.t('ui.form.emailRequired'),
            messageKey: 'ui.form.emailRequired',
          });
        } else if (!emailRegex.test(enterprise.email.trim())) {
          errors.push({
            field: 'enterprise.email',
            message: this.t('ui.form.emailInvalid'),
            messageKey: 'ui.form.emailInvalid',
          });
        }
      }

      if (enterprise.phone && enterprise.phone.trim()) {
        const phone = enterprise.phone.trim();
        const digitsOnly = phone.replace(/[\s.\-+]/g, '');
        if (!phoneRegex.test(phone) || digitsOnly.length < 9 || digitsOnly.length > 12) {
          errors.push({
            field: 'enterprise.phone',
            message: this.t('ui.form.phoneInvalid'),
            messageKey: 'ui.form.phoneInvalid',
          });
        }
      }
    } else if (this.isAccountInfoVisible()) {
      const userType = this.userAccountType();
      const isReq = this.isAccountInfoRequired();

      if (isReq) {
        if (!enterprise.name.trim()) {
          const messageKey: MessageKey =
            userType === 'INDIVIDUAL'
              ? 'ui.register.nameRequired'
              : userType === 'INTERNAL'
                ? 'ui.form.missingRequired'
                : 'ui.register.enterpriseNameRequired';
          errors.push({ field: 'enterprise.name', message: this.t(messageKey), messageKey });
        }

        if (userType !== 'INTERNAL' && !enterprise.taxCode.trim()) {
          const messageKey: MessageKey =
            userType === 'INDIVIDUAL'
              ? 'ui.register.idNumberRequired'
              : 'ui.register.taxCodeRequired';
          errors.push({ field: 'enterprise.taxCode', message: this.t(messageKey), messageKey });
        } else if (userType === 'ENTERPRISE' && !taxCodeRegex.test(enterprise.taxCode.trim())) {
          errors.push({
            field: 'enterprise.taxCode',
            message: this.t('ui.register.taxCodeRequired'),
            messageKey: 'ui.register.taxCodeRequired',
          });
        }

        if (!enterprise.phone.trim()) {
          errors.push({
            field: 'enterprise.phone',
            message: this.t('ui.form.phoneRequired'),
            messageKey: 'ui.form.phoneRequired',
          });
        }

        if (!enterprise.address.trim()) {
          errors.push({
            field: 'enterprise.address',
            message: this.t('ui.register.addressRequired'),
            messageKey: 'ui.register.addressRequired',
          });
        }
      } else if (enterprise.taxCode.trim() && userType === 'ENTERPRISE' && !taxCodeRegex.test(enterprise.taxCode.trim())) {
        errors.push({
          field: 'enterprise.taxCode',
          message: this.t('ui.register.taxCodeRequired'),
          messageKey: 'ui.register.taxCodeRequired',
        });
      }

      if (enterprise.phone && enterprise.phone.trim()) {
        const phone = enterprise.phone.trim();
        const digitsOnly = phone.replace(/[\s.\-+]/g, '');
        if (!phoneRegex.test(phone) || digitsOnly.length < 9 || digitsOnly.length > 12) {
          if (!errors.some((e) => e.field === 'enterprise.phone')) {
            errors.push({
              field: 'enterprise.phone',
              message: this.t('ui.form.phoneInvalid'),
              messageKey: 'ui.form.phoneInvalid',
            });
          }
        }
      }
    }

    // 4. Phương tiện & Lái xe
    if (!this.form.vehicles || this.form.vehicles.length === 0) {
      if (forSubmit) {
        errors.push({
          field: 'vehicles',
          message: this.t('dossier.missingVehicles'),
          messageKey: 'dossier.missingVehicles',
        });
      }
    } else {
      this.form.vehicles.forEach((row, i) => {
        const prefix = `vehicles[${i}]`;
        const tag = this.form.vehicles.length > 1 ? this.t('dossier.tagVehicle', { index: i + 1 }) : '';

        // Biển số xe
        if (this.isFieldRequired('plateNumber', true)) {
          if (!row.plateNumber?.trim()) {
            if (forSubmit) {
              errors.push({
                field: `${prefix}.plateNumber`,
                message: this.t('dossier.missingPlateNumber', { tag }),
                messageKey: 'dossier.missingPlateNumber',
                messageParams: { tag },
              });
            }
          } else if (!platePattern.test(row.plateNumber.trim())) {
            errors.push({
              field: `${prefix}.plateNumber`,
              message: this.t('dossier.invalidPlateNumber', { tag }),
              messageKey: 'dossier.invalidPlateNumber',
              messageParams: { tag },
            });
          }
        }

        // Loại phương tiện
        if (this.isFieldRequired('vehicleType', true)) {
          if (!row.vehicleType?.trim() && forSubmit) {
            errors.push({
              field: `${prefix}.vehicleType`,
              message: this.t('dossier.missingVehicleType', { tag }),
              messageKey: 'dossier.missingVehicleType',
              messageParams: { tag },
            });
          }
        }

        // Số container
        if (this.isFieldVisible('containerNumber') && this.isFieldRequired('containerNumber', false)) {
          if (!row.containerNumber?.trim() && forSubmit) {
            errors.push({
              field: `${prefix}.containerNumber`,
              message: this.t('dossier.missingContainerNumber', { tag }),
              messageKey: 'dossier.missingContainerNumber',
              messageParams: { tag },
            });
          }
        }

        // Số moóc
        if (this.isFieldVisible('trailerNumber') && this.isFieldRequired('trailerNumber', false)) {
          if (!row.trailerNumber?.trim() && forSubmit) {
            errors.push({
              field: `${prefix}.trailerNumber`,
              message: this.t('dossier.missingTrailerNumber', { tag }),
              messageKey: 'dossier.missingTrailerNumber',
              messageParams: { tag },
            });
          }
        }

        // Giấy phép vận tải
        if (this.isFieldVisible('transportLicense') && this.isFieldRequired('transportLicense', false)) {
          if (!row.transportLicenseNumber?.trim() && forSubmit) {
            errors.push({
              field: `${prefix}.transportLicenseNumber`,
              message: this.t('dossier.missingTransportLicense', { tag }),
              messageKey: 'dossier.missingTransportLicense',
              messageParams: { tag },
            });
          }
        }

        // Trọng tải
        if (this.isFieldVisible('payloadWeight') && this.isFieldRequired('payloadWeight', false)) {
          if ((row.weightKg === undefined || row.weightKg === null) && forSubmit) {
            errors.push({
              field: `${prefix}.weightKg`,
              message: this.t('dossier.missingPayloadWeight', { tag }),
              messageKey: 'dossier.missingPayloadWeight',
              messageParams: { tag },
            });
          } else if (row.weightKg !== undefined && row.weightKg !== null && row.weightKg <= 0) {
            errors.push({
              field: `${prefix}.weightKg`,
              message: this.t('dossier.invalidPayloadWeight', { tag }),
              messageKey: 'dossier.invalidPayloadWeight',
              messageParams: { tag },
            });
          }
        }

        // Lái xe
        const driver = row.driver || emptyDriverRow();
        const driverPrefix = `${prefix}.driver`;

        if (this.isFieldVisible('driverName') && this.isFieldRequired('driverName', true)) {
          if (!driver.fullName?.trim() && forSubmit) {
            errors.push({
              field: `${driverPrefix}.fullName`,
              message: this.t('dossier.missingDriverName', { tag }),
              messageKey: 'dossier.missingDriverName',
              messageParams: { tag },
            });
          }
        }

        if (this.isFieldVisible('driverDocType') && this.isFieldRequired('driverDocType', false)) {
          if (!driver.idType?.trim() && forSubmit) {
            errors.push({
              field: `${driverPrefix}.idType`,
              message: this.t('dossier.missingDriverDocType', { tag }),
              messageKey: 'dossier.missingDriverDocType',
              messageParams: { tag },
            });
          }
        }

        if (this.isFieldVisible('driverDocNo') && this.isFieldRequired('driverDocNo', true)) {
          if (!driver.idNumber?.trim() && forSubmit) {
            errors.push({
              field: `${driverPrefix}.idNumber`,
              message: this.t('dossier.missingDriverDocNo', { tag }),
              messageKey: 'dossier.missingDriverDocNo',
              messageParams: { tag },
            });
          }
        }

        if (this.isFieldVisible('driverLicenseNo') && this.isFieldRequired('driverLicenseNo', true)) {
          if (!driver.licenseNumber?.trim() && forSubmit) {
            errors.push({
              field: `${driverPrefix}.licenseNumber`,
              message: this.t('dossier.missingDriverLicenseNo', { tag }),
              messageKey: 'dossier.missingDriverLicenseNo',
              messageParams: { tag },
            });
          }
        }

        if (this.isFieldVisible('driverPhone') && this.isFieldRequired('driverPhone', false)) {
          if (!driver.phone?.trim() && forSubmit) {
            errors.push({
              field: `${driverPrefix}.phone`,
              message: this.t('dossier.missingDriverPhone', { tag }),
              messageKey: 'dossier.missingDriverPhone',
              messageParams: { tag },
            });
          }
        }

        if (this.isFieldVisible('driverNationality') && this.isFieldRequired('driverNationality', true)) {
          if (!driver.nationality?.trim() && forSubmit) {
            errors.push({
              field: `${driverPrefix}.nationality`,
              message: this.t('dossier.missingDriverNationality', { tag }),
              messageKey: 'dossier.missingDriverNationality',
              messageParams: { tag },
            });
          }
        }
      });
    }

    // 5. Hàng hóa
    if (!this.form.cargoItems || this.form.cargoItems.length === 0) {
      if (forSubmit) {
        errors.push({
          field: 'cargoItems',
          message: this.t('dossier.missingCargoItems'),
          messageKey: 'dossier.missingCargoItems',
        });
      }
    } else {
      this.form.cargoItems.forEach((row, i) => {
        const prefix = `cargoItems[${i}]`;
        const tag = this.form.cargoItems.length > 1 ? this.t('dossier.tagCargo', { index: i + 1 }) : '';

        // Loại hàng hóa
        if (this.isFieldVisible('cargoType') && this.isFieldRequired('cargoType', false)) {
          if (!row.cargoTypeCode?.trim() && forSubmit) {
            errors.push({
              field: `${prefix}.cargoTypeCode`,
              message: this.t('dossier.missingCargoType', { tag }),
              messageKey: 'dossier.missingCargoType',
              messageParams: { tag },
            });
          }
        }

        // Tên hàng hóa (Mặc định bắt buộc nếu hiển thị)
        if (this.isFieldVisible('cargoName')) {
          const isReq = this.isFieldRequired('cargoName', true);
          if (isReq && !row.description?.trim() && forSubmit) {
            errors.push({
              field: `${prefix}.description`,
              message: this.t('dossier.missingCargoName', { tag }),
              messageKey: 'dossier.missingCargoName',
              messageParams: { tag },
            });
          }
        }

        // Số lượng
        if (this.isFieldVisible('quantity') && this.isFieldRequired('quantity', false)) {
          if ((row.quantity === undefined || row.quantity === null) && forSubmit) {
            errors.push({
              field: `${prefix}.quantity`,
              message: this.t('dossier.missingQuantity', { tag }),
              messageKey: 'dossier.missingQuantity',
              messageParams: { tag },
            });
          } else if (row.quantity !== undefined && row.quantity !== null && row.quantity <= 0) {
            errors.push({
              field: `${prefix}.quantity`,
              message: this.t('dossier.invalidQuantity', { tag }),
              messageKey: 'dossier.invalidQuantity',
              messageParams: { tag },
            });
          }
        }

        // Đơn vị tính
        if (this.isFieldVisible('unit') && this.isFieldRequired('unit', false)) {
          if (!row.unitCode?.trim() && forSubmit) {
            errors.push({
              field: `${prefix}.unitCode`,
              message: this.t('dossier.missingUnit', { tag }),
              messageKey: 'dossier.missingUnit',
              messageParams: { tag },
            });
          }
        }

        // Trọng lượng
        if (this.isFieldVisible('cargoWeight') && this.isFieldRequired('cargoWeight', false)) {
          if ((row.grossWeightKg === undefined || row.grossWeightKg === null) && forSubmit) {
            errors.push({
              field: `${prefix}.grossWeightKg`,
              message: this.t('dossier.missingCargoWeight', { tag }),
              messageKey: 'dossier.missingCargoWeight',
              messageParams: { tag },
            });
          } else if (row.grossWeightKg !== undefined && row.grossWeightKg !== null && row.grossWeightKg <= 0) {
            errors.push({
              field: `${prefix}.grossWeightKg`,
              message: this.t('dossier.invalidCargoWeight', { tag }),
              messageKey: 'dossier.invalidCargoWeight',
              messageParams: { tag },
            });
          }
        }
      });
    }

    // 6. Chứng từ bắt buộc (chỉ khi Submit)
    if (forSubmit) {
      const missingDocs = this.requiredDocStatus().filter((doc) => !doc.uploaded);
      missingDocs.forEach((doc) => {
        errors.push({
          field: `attachments.${doc.code}`,
          message: this.t('dossier.missingDocument', { name: doc.name }),
          messageKey: 'dossier.missingDocument',
          messageParams: { name: doc.name },
        });
      });
    }

    return errors;
  }

  protected saveDraft(): void {
    if (this.readOnly()) return;
    if (!this.ensureMinimumInput()) return;

    this.saving.set(true);
    this.clearErrors();
    this.persist().subscribe({
      next: (detail) => {
        this.saving.set(false);
        this.afterPersist(detail);
        const message = this.t('ui.form.draftSaved', { code: detail.code, time: this.timeLabel(new Date()) });
        this.feedback.set(message);
        this.appMessages.show(message, 'success');
      },
      error: (error) => {
        this.saving.set(false);
        const errors = extractFieldErrors(error);
        this.applyApiErrors(errors, extractErrorMessage(error) || this.t('ui.form.saveDraftFailed'));
      },
    });
  }

  protected submit(): void {
    if (this.readOnly()) return;
    if (!this.ensureMinimumInput()) return;

    const localErrors = this.collectFormErrors(true);

    this.submitting.set(true);
    this.clearErrors();
    this.feedback.set('');

    // Luôn lưu bản nháp trước để dữ liệu đang nhập không bị mất khi API từ chối gửi.
    this.persist()
      .pipe(
        switchMap((detail) => {
          this.afterPersist(detail);

          // SG-275: Nếu có lỗi validate cục bộ thì KHÔNG gọi submitDeclaration mà hiển thị lỗi đồng thời ngay
          if (localErrors.length > 0) {
            this.submitting.set(false);
            this.applyApiErrors(localErrors);
            return of(null);
          }

          // SG-109: Nếu có tệp đính kèm pending, gắn vào hồ sơ trước khi gửi chính thức để tránh mất tệp và trùng tệp
          if (this.pendingAttachmentIds.length > 0) {
            const pendingIds = [...this.pendingAttachmentIds];
            return this.api.attachDeclarationFiles(detail.id, pendingIds).pipe(
              switchMap(() => {
                this.pendingAttachmentIds = this.pendingAttachmentIds.filter((id) => !pendingIds.includes(id));
                return this.api.submitDeclaration(detail.id);
              }),
            );
          }
          return this.api.submitDeclaration(detail.id);
        }),
      )
      .subscribe({
        next: (result) => {
          if (!result) return;
          this.submitting.set(false);
          this.submitResult.set(result);
        },
        error: (error) => {
          this.submitting.set(false);
          const apiErrors = extractFieldErrors(error);
          const merged = this.mergeFieldErrors(localErrors, apiErrors);
          this.applyApiErrors(merged, extractErrorMessage(error) || this.t('ui.form.submitFailed'));
        },
      });
  }

  protected openDetail(): void {
    const id = this.dossierId();
    this.submitResult.set(null);
    void this.router.navigate(['/declarations', id]);
  }

  /** Đóng hộp thoại thành công (Esc / nút X) — quay về danh sách hồ sơ. */
  protected closeSuccess(): void {
    this.submitResult.set(null);
    void this.router.navigate(['/declarations']);
  }

  private persist(): Observable<DossierDetail> {
    const payload = this.buildPayload();
    const id = this.dossierId();
    return id ? this.api.updateDeclaration(id, payload) : this.api.createDeclaration(payload);
  }

  /** Sau khi lưu: nhớ id, gắn các tệp đã tải trước đó và đổi URL sang chế độ sửa mà không hủy component. */
  private afterPersist(detail: DossierDetail): void {
    if (!detail) return;
    const isNew = !this.dossierId();
    this.dossierId.set(detail.id);
    this.loaded.set(detail);
    if (detail.attachments && detail.attachments.length > 0) {
      const current = this.attachments();
      const map = new Map(detail.attachments.map((a) => [a.id, a]));
      current.forEach((a) => {
        if (!map.has(a.id)) map.set(a.id, a);
      });
      this.attachments.set(Array.from(map.values()));
    }
    if (this.pendingAttachmentIds.length && !this.submitting()) {
      this.linkAttachments([...this.pendingAttachmentIds]);
    }
    this.syncCargoIds(detail);
    this.syncVehicleIds(detail);
    if (isNew) {
      this.location.replaceState(`/declarations/${detail.id}/edit`);
    }
  }

  /** Gán `id` do API cấp cho các dòng hàng vừa tạo để lần lưu sau là cập nhật, không phải thêm mới. */
  private syncCargoIds(detail: DossierDetail): void {
    const items = detail.cargoItems || [];
    if (items.length !== this.form.cargoItems.length) return;
    this.form.cargoItems = this.form.cargoItems.map((row, index) => ({ ...row, id: items[index]?.id || row.id }));
  }

  /** Gán `id` do API cấp cho các dòng xe vừa tạo để lần lưu sau là cập nhật, không phải thêm mới. */
  private syncVehicleIds(detail: DossierDetail): void {
    const items = detail.vehicles || [];
    if (items.length !== this.form.vehicles.length) return;
    this.form.vehicles = this.form.vehicles.map((row, index) => ({ ...row, id: items[index]?.id || row.id }));
  }

  private buildPayload(): DossierDraftPayload {
    const isCreateForOther = this.createForOther();
    const targetAccountType = isCreateForOther
      ? this.selectedAccountType()
      : (this.auth.currentUser() ? this.userAccountType() : undefined);

    const shouldSendRepresentative = isCreateForOther
      ? this.selectedAccountType() === 'ENTERPRISE'
      : this.showRepresentative();

    const clearableField = (v: string | undefined): string | undefined => {
      const trimmed = (v || '').trim();
      return isCreateForOther ? (trimmed || '') : (trimmed || undefined);
    };

    const baseEnterprisePayload: DossierEnterprise = {
      name: clearableField(this.form.enterprise.name),
      phone: clearableField(this.form.enterprise.phone),
      address: clearableField(this.form.enterprise.address),
      email: clearableField(this.form.enterprise.email),
      username: clearableField(this.form.enterprise.username),
      accountType: targetAccountType,
      createForOther: isCreateForOther ? true : undefined,
    };

    let enterprisePayload: DossierEnterprise;
    if (targetAccountType === 'INDIVIDUAL') {
      enterprisePayload = {
        ...baseEnterprisePayload,
        idNumber: clearableField(this.form.enterprise.taxCode),
        taxCode: isCreateForOther ? '' : undefined,
        representativeName: isCreateForOther ? '' : undefined,
        jobTitle: isCreateForOther ? '' : undefined,
        department: isCreateForOther ? '' : undefined,
      };
    } else if (targetAccountType === 'INTERNAL') {
      enterprisePayload = {
        ...baseEnterprisePayload,
        email: clearableField(this.form.enterprise.email),
        jobTitle: clearableField(this.form.enterprise.jobTitle),
        department: clearableField(this.form.enterprise.department),
        taxCode: isCreateForOther ? '' : (this.form.enterprise.taxCode.trim() || undefined),
        idNumber: isCreateForOther ? '' : undefined,
        representativeName: isCreateForOther ? '' : undefined,
      };
    } else {
      // ENTERPRISE (mặc định)
      enterprisePayload = {
        ...baseEnterprisePayload,
        taxCode: clearableField(this.form.enterprise.taxCode),
        idNumber: isCreateForOther ? '' : undefined,
        jobTitle: isCreateForOther ? '' : undefined,
        department: isCreateForOther ? '' : undefined,
        representativeName: shouldSendRepresentative
          ? clearableField(this.form.enterprise.representativeName)
          : (isCreateForOther ? '' : undefined),
      };
    }

    const appointmentFilled = !!this.form.appointment.scheduledAt;

    const filteredCargo = this.form.cargoItems.filter(
      (row) => row.description.trim() || row.cargoTypeCode.trim() || row.quantity || row.grossWeightKg,
    );
    const cargoRowsToSend = filteredCargo.length > 0 ? filteredCargo : this.form.cargoItems.slice(0, 1);

    return {
      type: this.form.type,
      enterprise: enterprisePayload,
      vehicles: this.form.vehicles.map((row) => ({
        id: row.id,
        plateNumber: row.plateNumber.trim().toUpperCase(),
        containerNumber: row.containerNumber.trim() || undefined,
        trailerNumber: row.trailerNumber.trim() || undefined,
        transportLicenseNumber: row.transportLicenseNumber.trim() || undefined,
        vehicleType: row.vehicleType.trim() || undefined,
        weightKg: row.weightKg ?? undefined,
        // Lái xe nhúng theo từng xe (BUG-033): chỉ gửi khi có khai để bước nháp không sinh lái xe rỗng.
        driver: this.buildDriverPayload(row.driver),
      })),
      cargoItems: cargoRowsToSend.map((row) => ({
        id: row.id,
        description: row.description.trim(),
        cargoTypeCode: row.cargoTypeCode.trim() || undefined,
        quantity: row.quantity ?? undefined,
        unitCode: row.unitCode.trim() || undefined,
        grossWeightKg: row.grossWeightKg ?? undefined,
      })),
      transshipmentVehicles: this.isTransshipment()
        ? this.form.transshipmentVehicles.map((row) => ({
            id: row.id,
            sourcePlate: row.sourcePlate.trim() || undefined,
            plateNumber: row.plateNumber.trim().toUpperCase(),
            vehicleType: row.vehicleType.trim() || undefined,
            containerNumber: row.containerNumber.trim() || undefined,
            trailerNumber: row.trailerNumber.trim() || undefined,
            driverName: row.driverName.trim() || undefined,
            fee01: row.fee01.trim() || undefined,
            transferPlace: row.transferPlace.trim() || undefined,
            note: row.note.trim() || undefined,
          }))
        : [],
      // Bỏ `checkpoint` và `isSpecialCargo` theo CR5 (BE mặc định checkpoint = SMART_GATE).
      appointment: appointmentFilled
        ? {
            id: this.form.appointment.id,
            scheduledAt: new Date(this.form.appointment.scheduledAt).toISOString(),
          }
        : null,
    };
  }

  // --- Nạp hồ sơ đang có -----------------------------------------------------

  private applyDossierDetail(detail: DossierDetail): void {
    if (!detail) return;
    this.dossierId.set(detail.id);
    this.loaded.set(detail);
    this.readOnly.set(!isDossierEditable(detail.status));
    this.attachments.set(detail.attachments || []);
    this.form = this.toForm(detail);
    this.loadRequiredDocuments(detail.type);
    this.loadFieldConfigs(detail.type);
    if (this.createForOther() && !this.readOnly() && this.isAdmin()) {
      this.lastLookupKey = null;
      this.onIdentityBlur(true);
    }
  }

  private loadDossier(id: string): void {
    this.dossierId.set(id);
    this.api
      .getDeclaration(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.loaded.set(res);
          this.applyDossierDetail(res);
        },
        error: () => {
          this.loadError.set(this.t('ui.form.loadFailed'));
          this.appMessages.showKey('ui.form.loadFailed', 'error');
        },
      });
  }

  private toForm(detail: DossierDetail): DossierForm {
    const base = emptyForm();
    const cargoItems = (detail.cargoItems || []).map((item, index) => ({
      key: `cargo-${item.id || index}`,
      id: item.id,
      description: item.description || '',
      cargoTypeCode: item.cargoTypeCode || '',
      quantity: item.quantity ?? null,
      unitCode: item.unitCode || '',
      grossWeightKg: item.grossWeightKg ?? null,
    }));
    // CR8 — một xe/hồ sơ: API luôn trả tối đa một phương tiện (khóa duy nhất ở DB).
    const vehicles = (detail.vehicles || []).map((item, index) => ({
      key: `vehicle-${item.id || index}`,
      id: item.id,
      plateNumber: item.plateNumber || '',
      containerNumber: item.containerNumber || '',
      trailerNumber: item.trailerNumber || '',
      transportLicenseNumber: item.transportLicenseNumber || '',
      vehicleType: item.vehicleType || '',
      weightKg: item.weightKg ?? null,
      driver: {
        fullName: item.driver?.fullName || '',
        idNumber: item.driver?.idNumber || '',
        idType: item.driver?.idType || 'CCCD',
        phone: item.driver?.phone || '',
        licenseNumber: item.driver?.licenseNumber || '',
        nationality: item.driver?.nationality || 'Việt Nam',
      },
    }));
    const transshipmentVehicles = (detail.transshipmentVehicles || []).map((item, index) => ({
      key: `transship-${item.id || index}`,
      id: item.id,
      sourcePlate: item.sourcePlate || '',
      plateNumber: item.plateNumber || '',
      vehicleType: item.vehicleType || '',
      containerNumber: item.containerNumber || '',
      trailerNumber: item.trailerNumber || '',
      driverName: item.driverName || '',
      fee01: item.fee01 || '',
      transferPlace: item.transferPlace || '',
      note: item.note || '',
    }));

    // Chỉ bật cờ createForOther khi hồ sơ được lưu rõ ràng là createForOther (từ BE) VÀ người dùng hiện tại là Admin
    const isExplicitCreateForOther = this.isAdmin() && detail.enterprise?.createForOther === true;
    if (isExplicitCreateForOther) {
      this.createForOther.set(true);
      if (detail.enterprise?.accountType) {
        this.selectedAccountType.set(detail.enterprise.accountType as 'ENTERPRISE' | 'INDIVIDUAL' | 'INTERNAL');
      } else if (detail.enterprise?.idNumber && !detail.enterprise?.taxCode) {
        this.selectedAccountType.set('INDIVIDUAL');
      } else if (detail.enterprise?.email && !detail.enterprise?.taxCode && !detail.enterprise?.idNumber) {
        this.selectedAccountType.set('INTERNAL');
      } else if (detail.enterprise?.taxCode) {
        this.selectedAccountType.set('ENTERPRISE');
      }
      const hasIdentity = !!(detail.enterprise?.taxCode || detail.enterprise?.idNumber || detail.enterprise?.email);
      const hasAccountInfo = !!(detail.enterprise?.name || detail.enterprise?.phone || detail.enterprise?.address);
      this.accountMatched.set(hasIdentity && hasAccountInfo);
    } else {
      this.createForOther.set(false);
      this.accountMatched.set(false);
    }

    return {
      type: detail.type || base.type,
      enterprise: {
        taxCode: detail.enterprise?.taxCode || detail.enterprise?.idNumber || '',
        name: detail.enterprise?.name || '',
        representativeName: detail.enterprise?.representativeName || '',
        address: detail.enterprise?.address || '',
        phone: detail.enterprise?.phone || '',
        email: detail.enterprise?.email || '',
        username: detail.enterprise?.username || '',
        jobTitle: detail.enterprise?.jobTitle || '',
        department: detail.enterprise?.department || '',
      },
      vehicles: vehicles.length ? vehicles : base.vehicles,
      cargoItems: cargoItems.length ? cargoItems : base.cargoItems,
      transshipmentVehicles,
      appointment: {
        id: detail.appointment?.id,
        scheduledAt: this.toLocalDateTime(detail.appointment?.scheduledAt),
      },
    };
  }

  // --- Hiển thị --------------------------------------------------------------

  protected typeLabel(type: string): string {
    return dossierTypeLabel(type, this.t);
  }

  protected mainCargo(): string {
    const descriptions = this.form.cargoItems
      .map((row) => row.description.trim())
      .filter((description) => !!description);
    return descriptions.length ? descriptions.join(', ') : '—';
  }

  /** Lái xe của xe đầu — thẻ tóm tắt/rà soát hiển thị một người điều khiển tiêu biểu (BUG-033). */
  protected primaryDriver(): DriverRow {
    return this.form.vehicles[0]?.driver ?? emptyDriverRow();
  }

  /** Khối lái xe gửi lên API cho một xe; `null` khi chưa khai gì để bước nháp không sinh lái xe rỗng. */
  private buildDriverPayload(driver: DriverRow): DossierDriver | null {
    const filled = [driver.fullName, driver.idNumber, driver.phone, driver.licenseNumber].some(
      (value) => !!(value || '').trim(),
    );
    if (!filled) return null;
    return {
      fullName: driver.fullName.trim(),
      idNumber: driver.idNumber.trim(),
      idType: driver.idType || undefined,
      phone: driver.phone.trim() || undefined,
      licenseNumber: driver.licenseNumber.trim() || undefined,
      nationality: driver.nationality || undefined,
    };
  }

  /** Tóm tắt biển số cho thẻ rà soát: xe đầu, kèm số xe còn lại nếu hồ sơ có nhiều xe. */
  protected plateSummary(fallback = this.t('ui.common.notEntered')): string {
    const plates = this.form.vehicles.map((row) => row.plateNumber.trim()).filter((plate) => !!plate);
    if (!plates.length) return fallback;
    if (plates.length === 1) return plates[0];
    return this.t('ui.form.vehiclePlateSummary', { first: plates[0], more: plates.length - 1 });
  }

  protected totalWeight(): number {
    return this.form.cargoItems.reduce((sum, row) => sum + (row.grossWeightKg || 0), 0);
  }

  protected scheduledLabel(): string {
    return this.formatDateTime(this.toIsoDateTime(this.form.appointment.scheduledAt));
  }

  protected submittedLabel(value: string): string {
    return this.formatDateTime(value);
  }

  private formatDateTime(value?: string): string {
    return formatDateTime(value);
  }

  private timeLabel(date: Date): string {
    return new Intl.DateTimeFormat(this.i18n.dateLocale(), { timeStyle: 'short' }).format(date);
  }

  /** `<input type="datetime-local">` dùng giờ địa phương, API nhận ISO 8601. */
  private toIsoDateTime(value: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private toLocalDateTime(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
