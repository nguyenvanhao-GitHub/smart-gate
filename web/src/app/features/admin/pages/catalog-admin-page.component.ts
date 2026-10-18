import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/message-catalog';
import { ApiService } from '../../../core/services/api.service';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import {
  CATALOG_STATUS_LABEL_KEYS,
  CATALOG_STATUS_TONES,
  CatalogItem,
  CatalogItemStatus,
  CatalogType,
} from '../../../core/models/admin.model';
import { formatDateTime } from '../../../core/models/workflow.model';
import { AppMessageService, AppMessageTone } from '../../../core/services/app-message.service';
import { SgAlertComponent } from '../../../shared/ui/sg-alert.component';
import { SgButtonDirective } from '../../../shared/ui/sg-button.directive';
import { SgCardComponent } from '../../../shared/ui/sg-card.component';
import { SgFormFieldComponent } from '../../../shared/ui/sg-form-field.component';
import { SgModalComponent } from '../../../shared/ui/sg-modal.component';
import { SgPagerComponent } from '../../../shared/ui/sg-pager.component';
import { SgSearchInputComponent } from '../../../shared/ui/sg-search-input.component';
import { SgSelectComponent, SgSelectOption } from '../../../shared/ui/sg-select.component';
import { extractErrorMessageKey, extractFieldErrors, toFieldErrorMap } from '../../../core/forms/field-errors';

const PAGE_SIZES = [10, 20, 50];

const CATALOG_TYPE_KEY_MAP: Record<string, MessageKey> = {
  REQUIRED_DOCUMENT: 'ui.catalog.typeRequiredDocument',
  DOSSIER_TYPE: 'ui.catalog.typeDossierType',
  VEHICLE_TYPE: 'ui.catalog.typeVehicleType',
  CARGO_TYPE: 'ui.catalog.typeCargoType',
  DOCUMENT_TYPE: 'ui.catalog.typeDocumentType',
  COUNTRY: 'ui.catalog.typeCountry',
  UNIT: 'ui.catalog.typeUnit',
  REASON_REVOKE: 'ui.catalog.typeReasonRevoke',
  REASON_SUPPLEMENT: 'ui.catalog.typeReasonSupplement',
  REASON_REJECT: 'ui.catalog.typeReasonReject',
  REASON_FEE_ADJUST: 'ui.catalog.typeReasonFeeAdjust',
  WORKFLOW_CHECKLIST: 'ui.catalog.typeWorkflowChecklist',
  GATE_CHECKLIST: 'ui.catalog.typeGateChecklist',
  BORDER_GATE: 'ui.catalog.typeBorderGate',
  GATE_LANE: 'ui.catalog.typeGateLane',
  YARD_ZONE: 'ui.catalog.typeYardZone',
  TIME_SLOT: 'ui.catalog.typeTimeSlot',
  ORGANIZATION_TYPE: 'ui.catalog.typeOrganizationType',
  CHECKPOINT: 'ui.catalog.typeCheckpoint',
  REASON_DENY_ENTRY: 'ui.catalog.typeReasonDenyEntry',
  FEE_REJECTION: 'ui.catalog.typeFeeRejection',
};

const CATALOG_DESC_KEY_MAP: Record<string, MessageKey> = {
  REQUIRED_DOCUMENT: 'ui.catalog.descRequiredDocument',
  DOSSIER_TYPE: 'ui.catalog.descDossierType',
  VEHICLE_TYPE: 'ui.catalog.descVehicleType',
  CARGO_TYPE: 'ui.catalog.descCargoType',
  DOCUMENT_TYPE: 'ui.catalog.descDocumentType',
  COUNTRY: 'ui.catalog.descCountry',
  UNIT: 'ui.catalog.descUnit',
  REASON_REVOKE: 'ui.catalog.descReasonRevoke',
  REASON_SUPPLEMENT: 'ui.catalog.descReasonSupplement',
  REASON_REJECT: 'ui.catalog.descReasonReject',
  REASON_FEE_ADJUST: 'ui.catalog.descReasonFeeAdjust',
  WORKFLOW_CHECKLIST: 'ui.catalog.descWorkflowChecklist',
  GATE_CHECKLIST: 'ui.catalog.descGateChecklist',
  BORDER_GATE: 'ui.catalog.descBorderGate',
  GATE_LANE: 'ui.catalog.descGateLane',
  YARD_ZONE: 'ui.catalog.descYardZone',
  TIME_SLOT: 'ui.catalog.descTimeSlot',
  REASON_DENY_ENTRY: 'ui.catalog.descDenyReason',
  FEE_REJECTION: 'ui.catalog.descFeeRejection',
};

const CATALOG_ITEM_KEY_MAP: Record<string, Record<string, MessageKey>> = {
  DOSSIER_TYPE: {
    EXPORT: 'ui.audit.val.EXPORT',
    IMPORT: 'ui.audit.val.IMPORT',
    TRANSSHIPMENT_EXPORT: 'ui.audit.val.TRANSSHIPMENT_EXPORT',
    TRANSSHIPMENT_IMPORT: 'ui.audit.val.TRANSSHIPMENT_IMPORT',
    SELF_PROPELLED: 'ui.audit.val.SELF_PROPELLED',
    TRANSSHIPMENT: 'ui.audit.val.TRANSSHIPMENT',
  },
  VEHICLE_TYPE: {
    TRUCK: 'ui.audit.val.TRUCK',
    CONTAINER: 'ui.audit.val.CONTAINER',
    TRACTOR: 'ui.audit.val.TRACTOR',
    TANKER: 'ui.audit.val.TANKER',
    EMPTY: 'ui.audit.val.EMPTY',
  },
  CARGO_TYPE: {
    AGRICULTURAL: 'ui.audit.val.AGRICULTURAL',
    FROZEN: 'ui.audit.val.FROZEN',
    CONSUMER: 'ui.audit.val.CONSUMER',
    MACHINERY: 'ui.audit.val.MACHINERY',
    MINERAL: 'ui.audit.val.MINERAL',
    OTHER: 'ui.audit.val.OTHER',
  },
  DOCUMENT_TYPE: {
    CUSTOMS_DECLARATION: 'ui.audit.val.CUSTOMS_DECLARATION',
    COMMERCIAL_INVOICE: 'ui.audit.val.COMMERCIAL_INVOICE',
    PACKING_LIST: 'ui.audit.val.PACKING_LIST',
    BILL_OF_LADING: 'ui.audit.val.BILL_OF_LADING',
    CERTIFICATE_OF_ORIGIN: 'ui.audit.val.CERTIFICATE_OF_ORIGIN',
    QUARANTINE_CERTIFICATE: 'ui.audit.val.QUARANTINE_CERTIFICATE',
    TRANSPORT_LICENSE: 'ui.audit.val.TRANSPORT_LICENSE',
    VEHICLE_REGISTRATION: 'ui.audit.val.VEHICLE_REGISTRATION',
    DRIVER_LICENSE: 'ui.audit.val.DRIVER_LICENSE',
    INSURANCE_CERTIFICATE: 'ui.audit.val.INSURANCE_CERTIFICATE',
    PAYMENT_RECEIPT: 'ui.audit.val.PAYMENT_RECEIPT',
  },
  REQUIRED_DOCUMENT: {
    CUSTOMS_DECLARATION: 'ui.audit.val.CUSTOMS_DECLARATION',
    COMMERCIAL_INVOICE: 'ui.audit.val.COMMERCIAL_INVOICE',
    PACKING_LIST: 'ui.audit.val.PACKING_LIST',
    BILL_OF_LADING: 'ui.audit.val.BILL_OF_LADING',
    CERTIFICATE_OF_ORIGIN: 'ui.audit.val.CERTIFICATE_OF_ORIGIN',
    VEHICLE_REGISTRATION: 'ui.audit.val.VEHICLE_REGISTRATION',
  },
  COUNTRY: {
    VN: 'ui.audit.val.VN',
    LA: 'ui.audit.val.LA',
    CN: 'ui.audit.val.CN',
    TH: 'ui.audit.val.TH',
    KH: 'ui.audit.val.KH',
  },
  UNIT: {
    KG: 'ui.audit.val.KG',
    TON: 'ui.audit.val.TON',
    PIECE: 'ui.audit.val.PIECE',
    BOX: 'ui.audit.val.BOX',
    PALLET: 'ui.audit.val.PALLET',
    M3: 'ui.audit.val.M3',
    LITER: 'ui.audit.val.LITER',
  },
  REASON_REVOKE: {
    TH01: 'ui.catalog.revokeTH01',
    TH02: 'ui.catalog.revokeTH02',
    TH03: 'ui.catalog.revokeTH03',
  },
  REASON_SUPPLEMENT: {
    BS01: 'ui.audit.val.BS01',
    BS02: 'ui.audit.val.BS02',
    BS03: 'ui.audit.val.BS03',
    BS04: 'ui.audit.val.BS04',
    BS05: 'ui.audit.val.BS05',
  },
  REASON_REJECT: {
    TC01: 'ui.audit.val.TC01',
    TC02: 'ui.audit.val.TC02',
    TC03: 'ui.audit.val.TC03',
    TC04: 'ui.audit.val.TC04',
    TC05: 'ui.audit.val.TC05',
  },
  REASON_FEE_ADJUST: {
    DC01: 'ui.audit.val.DC01',
    DC02: 'ui.audit.val.DC02',
    DC03: 'ui.audit.val.DC03',
    DC04: 'ui.audit.val.DC04',
  },
  WORKFLOW_CHECKLIST: {
    BP_GIAY_TO_NGUOI: 'ui.audit.val.BP_GIAY_TO_NGUOI',
    BP_PHUONG_TIEN: 'ui.audit.val.BP_PHUONG_TIEN',
    BP_AN_NINH: 'ui.audit.val.BP_AN_NINH',
    HQ_TO_KHAI: 'ui.audit.val.HQ_TO_KHAI',
    HQ_CHUNG_TU: 'ui.audit.val.HQ_CHUNG_TU',
    HQ_KIEM_HOA: 'ui.audit.val.HQ_KIEM_HOA',
    KD_GIAY_CN: 'ui.audit.val.KD_GIAY_CN',
    KD_THUC_TE: 'ui.audit.val.KD_THUC_TE',
  },
  GATE_CHECKLIST: {
    BP_GIAY_TO_NGUOI: 'ui.audit.val.BP_GIAY_TO_NGUOI',
    BP_PHUONG_TIEN: 'ui.audit.val.BP_PHUONG_TIEN',
    CONG_HO_SO: 'ui.audit.val.CONG_HO_SO',
    CONG_BIEN_SO: 'ui.audit.val.CONG_BIEN_SO',
    CONG_LAI_XE: 'ui.audit.val.CONG_LAI_XE',
    CONG_NIEM_PHONG: 'ui.audit.val.CONG_NIEM_PHONG',
    CONG_HANG_HOA: 'ui.audit.val.CONG_HANG_HOA',
  },
  BORDER_GATE: {
    A1: 'ui.audit.val.A1',
    A2: 'ui.audit.val.A2',
    B1: 'ui.audit.val.B1',
    B2: 'ui.audit.val.B2',
  },
  GATE_LANE: {
    'A1-1': 'ui.audit.val.A1-1',
    'A1-2': 'ui.audit.val.A1-2',
    'A2-1': 'ui.audit.val.A2-1',
    'A2-2': 'ui.audit.val.A2-2',
    'B1-1': 'ui.audit.val.B1-1',
    'B1-2': 'ui.audit.val.B1-2',
    'B2-1': 'ui.audit.val.B2-1',
    'B2-2': 'ui.audit.val.B2-2',
  },
  YARD_ZONE: {
    A: 'ui.audit.val.A',
    B: 'ui.audit.val.B',
    C: 'ui.audit.val.C',
    D: 'ui.audit.val.D',
  },
  TIME_SLOT: {
    SLOT_07_09: 'ui.audit.val.SLOT_07_09',
    SLOT_09_11: 'ui.audit.val.SLOT_09_11',
    SLOT_13_15: 'ui.audit.val.SLOT_13_15',
    SLOT_15_17: 'ui.audit.val.SLOT_15_17',
  },
};

/** Hộp thoại thêm/sửa mục danh mục — `item` chỉ có ở chế độ sửa. */
interface ItemModal {
  mode: 'add' | 'edit';
  item?: CatalogItem;
}

/** Hộp thoại thêm/sửa nhóm danh mục — `type` chỉ có ở chế độ sửa. */
interface TypeModal {
  mode: 'add' | 'edit';
  type?: CatalogType;
}

/**
 * F04 — Danh mục dùng chung.
 *
 * Bố cục 2 cột: trái là nhóm danh mục (đơn vị, cửa khẩu, loại phương tiện, cổng, làn, bãi...),
 * phải là các mục trong nhóm (phân trang + lọc từ khóa + lọc trạng thái).
 *
 * Quy tắc chốt của SRS (F04): danh mục đã phát sinh dữ liệu **chỉ được khóa** — nên với các mục/nhóm
 * đó chỉ có Khóa / Mở khóa. BUG-058 (đã được chủ dự án duyệt) mở **xóa cứng có rào**: chỉ mục do admin
 * tự thêm (nhóm KHÔNG mặc định) và còn ACTIVE mới xóa được; chỉ nhóm admin tự thêm và **rỗng** mới xóa
 * được. Nhóm mặc định, mục đã khóa/đã dùng, nhóm còn mục đều bị BE chặn (400) — FE chỉ ẩn nút cho gọn.
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    HasPermissionDirective,
    SgAlertComponent,
    SgButtonDirective,
    SgCardComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgPagerComponent,
    SgSearchInputComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="page-header">
      <div>
        <h1>{{ t('ui.catalog.title') }}</h1>
        <span>{{ t('ui.catalog.subtitle') }}</span>
      </div>
    </section>

    <div class="catalog-layout">
      <sg-card class="catalog-types" [title]="t('ui.catalog.typesTitle')" [flush]="true">
        <div class="type-search">
          <sg-search-input
            [placeholder]="t('ui.catalog.searchTypePlaceholder')"
            [(ngModel)]="typeKeyword"
            (valueChange)="typeKeyword = $event"
          />
        </div>
        <div class="type-list">
          @for (type of filteredTypes(); track type.id) {
            <div class="type-row" [class.type-row--active]="selectedType()?.id === type.id">
              <button type="button" class="type-item" (click)="selectType(type)">
                <span class="type-item__head">
                  <span class="type-item__name" [attr.title]="typeName(type)">{{ typeName(type) }}</span>
                  <span class="type-item__count" [attr.title]="t('ui.catalog.itemCountTitle', { count: type.itemCount })">{{ type.itemCount }}</span>
                </span>
                <span class="type-item__meta">
                  <span class="type-item__code">{{ type.code }}</span>
                </span>
                @if (type.description && type.description.trim() !== type.name.trim()) { <span class="type-item__desc">{{ typeDescription(type.description, type.code) }}</span> }
              </button>
              <button
                *hasPermission="'catalog.update'"
                type="button"
                class="type-edit"
                [title]="t('ui.catalog.editType')"
                [attr.aria-label]="t('ui.catalog.editType')"
                (click)="openEditType(type)"
              >
                <mat-icon fontSet="material-icons-round">edit</mat-icon>
              </button>
              <!-- Xóa nhóm (BUG-058): chỉ nhóm KHÔNG mặc định; BE chặn xóa nhóm còn mục (400). -->
              @if (!type.isSystem) {
                <button
                  *hasPermission="'catalog.delete'"
                  type="button"
                  class="type-edit type-edit--danger"
                  [title]="t('ui.catalog.deleteType')"
                  [attr.aria-label]="t('ui.catalog.deleteType')"
                  (click)="askDeleteType(type)"
                >
                  <mat-icon fontSet="material-icons-round">delete</mat-icon>
                </button>
              }
            </div>
          } @empty {
            <p class="type-empty">{{ types().length ? t('ui.catalog.typesEmpty') : t('ui.catalog.empty') }}</p>
          }
        </div>
      </sg-card>

      <sg-card class="catalog-items" [title]="t('ui.catalog.itemsTitle')" [subtitle]="selectedTypeSubtitle()" [flush]="true">
        @if (!selectedType()) {
          <p class="hint">{{ t('ui.catalog.selectTypeHint') }}</p>
        } @else {
          <div class="items-toolbar">
            <!-- BUG-072: lọc ngay khi gõ (debounce nhẹ) cho nhất quán với ô tìm nhóm; Enter vẫn lọc tức thì. -->
            <sg-search-input
              class="items-search"
              [placeholder]="t('ui.catalog.searchPlaceholder')"
              [value]="keyword"
              (valueChange)="onKeywordInput($event)"
              (search)="applyFilters()"
            />
            <sg-select
              class="items-status"
              [options]="statusOptions()"
              [placeholder]="t('ui.catalog.allStatuses')"
              [(ngModel)]="statusFilter"
              (valueChange)="applyFilters()"
            />
            <button
              *hasPermission="'catalog.create'"
              type="button"
              sgButton
              size="sm"
              (click)="openAdd()"
            >
              <mat-icon fontSet="material-icons-round">add</mat-icon>{{ t('ui.catalog.addItem') }}
            </button>
          </div>

          <div class="sg-scroll-x">
            <table class="grid">
              <thead>
                <tr>
                  <th>{{ t('ui.catalog.colCode') }}</th>
                  <th>{{ t('ui.catalog.colName') }}</th>
                  <th>{{ t('ui.catalog.colStatus') }}</th>
                  <th>{{ t('ui.catalog.colSort') }}</th>
                  <th>{{ t('ui.catalog.colUpdated') }}</th>
                  <th class="grid__actions">{{ t('ui.catalog.colActions') }}</th>
                </tr>
              </thead>
              <tbody>
                @if (loading()) {
                  <tr><td colspan="6" class="state">{{ t('ui.catalog.loading') }}</td></tr>
                } @else if (error()) {
                  <tr><td colspan="6" class="state">{{ error() }}</td></tr>
                } @else {
                  @for (item of items(); track item.id) {
                    <tr>
                      <td class="mono">{{ item.code }}</td>
                      <td>{{ itemName(item) }}</td>
                      <td><span class="chip" [attr.data-tone]="statusTone(item.status)">{{ statusLabel(item.status) }}</span></td>
                      <td>{{ item.sortOrder }}</td>
                      <td>{{ formatDate(item.updatedAt) }}</td>
                      <td class="grid__actions">
                        @if (selectedType()?.code === 'DOSSIER_TYPE') {
                          <button
                            *hasPermission="'catalog.update'"
                            type="button"
                            class="iconbtn config-ic"
                            [title]="t('ui.catalog.fieldConfig.btnConfig')"
                            [attr.aria-label]="t('ui.catalog.fieldConfig.btnConfig')"
                            (click)="openConfigDrawer(item)"
                          >
                            <mat-icon fontSet="material-icons-round">settings</mat-icon>
                          </button>
                        }
                        <button
                          *hasPermission="'catalog.update'"
                          type="button"
                          class="iconbtn"
                          [title]="t('ui.catalog.editItem')"
                          [attr.aria-label]="t('ui.catalog.editItem')"
                          (click)="openEdit(item)"
                        >
                          <mat-icon fontSet="material-icons-round">edit</mat-icon>
                        </button>
                        @if (item.status === 'ACTIVE') {
                          <!-- Nhóm mặc định (isSystem) không được khóa mục — BE cũng chặn, đây chỉ ẩn nút. -->
                          @if (!selectedType()?.isSystem) {
                            <button
                              *hasPermission="'catalog.update'"
                              type="button"
                              class="iconbtn"
                              [title]="t('ui.catalog.lock')"
                              [attr.aria-label]="t('ui.catalog.lock')"
                              (click)="askLock(item)"
                            >
                              <mat-icon fontSet="material-icons-round">lock</mat-icon>
                            </button>
                          }
                        } @else {
                          <button
                            *hasPermission="'catalog.update'"
                            type="button"
                            class="iconbtn iconbtn--approve"
                            [title]="t('ui.catalog.unlock')"
                            [attr.aria-label]="t('ui.catalog.unlock')"
                            (click)="unlock(item)"
                          >
                            <mat-icon fontSet="material-icons-round">lock_open</mat-icon>
                          </button>
                        }
                        <!-- Xóa mục (BUG-058): chỉ hiện cho mục ACTIVE của nhóm KHÔNG mặc định; BE vẫn
                             chặn xóa mục đã khóa/đã phát sinh dữ liệu (400). -->
                        @if (canDeleteItem(item)) {
                          <button
                            *hasPermission="'catalog.delete'"
                            type="button"
                            class="iconbtn iconbtn--danger"
                            [title]="t('ui.catalog.deleteItem')"
                            [attr.aria-label]="t('ui.catalog.deleteItem')"
                            (click)="askDeleteItem(item)"
                          >
                            <mat-icon fontSet="material-icons-round">delete</mat-icon>
                          </button>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <!-- BUG-073: phân biệt "danh mục rỗng thật" với "lọc không khớp". -->
                    <tr><td colspan="6" class="state">{{ hasItemFilters() ? t('ui.catalog.itemsNoMatch') : t('ui.catalog.empty') }}</td></tr>
                  }
                }
              </tbody>
            </table>
          </div>

          <div class="items-pager">
            <span>{{ summary() }}</span>
            <div class="items-pager__controls">
              <span class="items-pager__label">{{ t('ui.common.display') }}</span>
              <sg-select
                class="items-pager__size"
                [showEmptyOption]="false"
                [ariaLabel]="t('ui.common.pageSizeAria')"
                [options]="pageSizeOptions()"
                [value]="pageSizeValue()"
                (valueChange)="changePageSize($event)"
              />
            </div>
            <sg-pager [page]="page()" [pageSize]="pageSize()" [total]="total()" [disabled]="loading()" (pageChange)="goToPage($event)" />
          </div>
        }
      </sg-card>
    </div>

    @if (itemModal(); as modal) {
      <sg-modal
        [title]="modal.mode === 'add' ? t('ui.catalog.dialogAdd') : t('ui.catalog.dialogEdit')"
        (close)="closeItemModal()"
      >
        <div class="item-form">
          @if (formError()) {
            <sg-alert type="error" [message]="formError()" />
          }
          <sg-form-field [label]="t('ui.catalog.fieldCode')" [required]="true" [error]="formCodeError()">
            <input name="itemCode" [(ngModel)]="formCode" (ngModelChange)="formCodeError.set('')" [readonly]="modal.mode === 'edit'" maxlength="64" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.catalog.fieldName')" [required]="true" [error]="formNameError()">
            <input name="itemName" [(ngModel)]="formName" (ngModelChange)="formNameError.set('')" maxlength="200" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.catalog.fieldSort')" [required]="true" [error]="formSortError()">
            <input
              name="itemSort"
              type="text"
              inputmode="numeric"
              [(ngModel)]="formSort"
              (ngModelChange)="formSortError.set('')"
              (keydown)="onSortKeyDown($event)"
              (input)="onSortInput($event)"
            />
          </sg-form-field>
        </div>
        <button modal-footer type="button" sgButton="secondary" (click)="closeItemModal()">{{ t('ui.common.cancel') }}</button>
        <button modal-footer type="button" sgButton (click)="submitItem()">{{ t('ui.common.save') }}</button>
      </sg-modal>
    }

    @if (typeModal(); as modal) {
      <sg-modal
        [title]="modal.mode === 'add' ? t('ui.catalog.dialogAddType') : t('ui.catalog.dialogEditType')"
        (close)="closeTypeModal()"
      >
        <div class="item-form">
          @if (formTypeError()) {
            <sg-alert type="error" [message]="formTypeError()" />
          }
          <sg-form-field [label]="t('ui.catalog.fieldTypeCode')" [required]="true">
            <input name="typeCode" [(ngModel)]="formTypeCode" [readonly]="modal.mode === 'edit'" maxlength="64" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.catalog.fieldName')" [required]="true">
            <input [(ngModel)]="formTypeName" maxlength="160" />
          </sg-form-field>
          <sg-form-field [label]="t('ui.catalog.fieldDescription')">
            <textarea rows="3" [(ngModel)]="formTypeDesc" maxlength="2000" [placeholder]="t('ui.catalog.descriptionPlaceholder')"></textarea>
          </sg-form-field>
        </div>
        <button modal-footer type="button" sgButton="secondary" (click)="closeTypeModal()">{{ t('ui.common.cancel') }}</button>
        <button modal-footer type="button" sgButton (click)="submitType()">{{ t('ui.common.save') }}</button>
      </sg-modal>
    }

    @if (lockTarget(); as target) {
      <sg-modal size="sm" [title]="t('ui.catalog.confirmLockTitle')" (close)="cancelLock()">
        <p class="lock-msg">{{ t('ui.catalog.confirmLockMsg') }}</p>
        <p class="lock-target"><strong>{{ target.code }}</strong> — {{ target.name }}</p>
        <button modal-footer type="button" sgButton="secondary" (click)="cancelLock()">{{ t('ui.common.cancel') }}</button>
        <button modal-footer type="button" sgButton="danger" (click)="submitLock()">{{ t('ui.catalog.lock') }}</button>
      </sg-modal>
    }

    @if (deleteItemTarget(); as target) {
      <sg-modal size="sm" [title]="t('ui.catalog.confirmDeleteTitle')" (close)="cancelDeleteItem()">
        <p class="lock-msg">{{ t('ui.catalog.confirmDeleteMsg') }}</p>
        <p class="lock-target"><strong>{{ target.code }}</strong> — {{ target.name }}</p>
        <button modal-footer type="button" sgButton="secondary" (click)="cancelDeleteItem()">{{ t('ui.common.cancel') }}</button>
        <button modal-footer type="button" sgButton="danger" (click)="submitDeleteItem()">{{ t('ui.catalog.deleteItem') }}</button>
      </sg-modal>
    }

    @if (deleteTypeTarget(); as target) {
      <sg-modal size="sm" [title]="t('ui.catalog.confirmDeleteTypeTitle')" (close)="cancelDeleteType()">
        <p class="lock-msg">{{ t('ui.catalog.confirmDeleteTypeMsg') }}</p>
        <p class="lock-target"><strong>{{ target.code }}</strong> — {{ target.name }}</p>
        <button modal-footer type="button" sgButton="secondary" (click)="cancelDeleteType()">{{ t('ui.common.cancel') }}</button>
        <button modal-footer type="button" sgButton="danger" (click)="submitDeleteType()">{{ t('ui.catalog.deleteType') }}</button>
      </sg-modal>
    }

    <!-- DRAWER OVERLAY -->
    @if (configDrawerOpen()) {
      <div class="overlay show" role="button" tabindex="0" (click)="closeConfigDrawer()" (keydown.escape)="closeConfigDrawer()"></div>
      <div class="drawer show">
        <div class="drawer-head">
          <div>
            <h2>{{ t('ui.catalog.fieldConfig.title', { name: itemName(activeConfigItem()) }) }}</h2>
            <p>
              {{ t('ui.catalog.fieldConfig.desc') }}
              <strong>{{ itemName(activeConfigItem()) }}</strong> ({{ activeConfigItem()?.code }}).
            </p>
          </div>
          <button type="button" class="drawer-close" (click)="closeConfigDrawer()">✕</button>
        </div>

        <div class="drawer-body">
          <div class="scope-row">
            <span class="scope-label">{{ t('ui.catalog.fieldConfig.applyTo') }}</span>
            <span class="scope-value-badge">{{ activeConfigItem()?.code }} — {{ itemName(activeConfigItem()) }}</span>
            <span class="count-pill">{{ t('ui.catalog.fieldConfig.visibleCount', { count: visibleFieldCount() }) }}</span>
          </div>

          <div class="hint-box">
            <span [innerHTML]="t('ui.catalog.fieldConfig.hint')"></span>
          </div>

          @if (configLoading()) {
            <p class="state">{{ t('ui.catalog.fieldConfig.loading') }}</p>
          } @else {
            <div class="cfg-list">
              <div class="cfg-header">
                <div class="col-field">{{ t('ui.catalog.fieldConfig.colField') }}</div>
                <div class="col-chk">{{ t('ui.catalog.fieldConfig.colRequired') }}</div>
                <div class="col-chk">{{ t('ui.catalog.fieldConfig.colVisible') }}</div>
              </div>

              <!-- Group 1 -->
              <button type="button" class="grp-header" [class.collapsed]="isGroupCollapsed('g1')" (click)="toggleGroup('g1')">
                <span class="toggle"><span class="chev">▾</span> {{ t('ui.catalog.fieldConfig.grpAccount') }}</span>
              </button>
              @for (c of groupFields('g1'); track c.fieldKey) {
                <div class="field-item" [class.hidden-row]="isGroupCollapsed('g1')">
                  <div class="col-field">
                    <span class="field-name-text">{{ c.fieldName }}</span>
                    @if (c.isDefault) { <span class="field-locked">{{ t('ui.catalog.fieldConfig.default') }}</span> }
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="reqbox"
                      [checked]="c.isRequired"
                      [disabled]="c.isDefault || !c.isVisible"
                      (change)="onReqToggle(c, $any($event.target).checked)"
                    />
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="showbox"
                      [checked]="c.isVisible"
                      [disabled]="c.isDefault"
                      (change)="onShowToggle(c, $any($event.target).checked)"
                    />
                  </div>
                </div>
              }

              <!-- Group 2 -->
              <button type="button" class="grp-header" [class.collapsed]="isGroupCollapsed('g2')" (click)="toggleGroup('g2')">
                <span class="toggle"><span class="chev">▾</span> {{ t('ui.catalog.fieldConfig.grpVehicle') }}</span>
              </button>
              @for (c of groupFields('g2'); track c.fieldKey) {
                <div class="field-item" [class.hidden-row]="isGroupCollapsed('g2')">
                  <div class="col-field">
                    <span class="field-name-text">{{ c.fieldName }}</span>
                    @if (c.isDefault) { <span class="field-locked">{{ t('ui.catalog.fieldConfig.default') }}</span> }
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="reqbox"
                      [checked]="c.isRequired"
                      [disabled]="c.isDefault || !c.isVisible"
                      (change)="onReqToggle(c, $any($event.target).checked)"
                    />
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="showbox"
                      [checked]="c.isVisible"
                      [disabled]="c.isDefault"
                      (change)="onShowToggle(c, $any($event.target).checked)"
                    />
                  </div>
                </div>
              }

              <!-- Group 3 -->
              <button type="button" class="grp-header" [class.collapsed]="isGroupCollapsed('g3')" (click)="toggleGroup('g3')">
                <span class="toggle"><span class="chev">▾</span> {{ t('ui.catalog.fieldConfig.grpDriver') }}</span>
              </button>
              @for (c of groupFields('g3'); track c.fieldKey) {
                <div class="field-item" [class.hidden-row]="isGroupCollapsed('g3')">
                  <div class="col-field">
                    <span class="field-name-text">{{ c.fieldName }}</span>
                    @if (c.isDefault) { <span class="field-locked">{{ t('ui.catalog.fieldConfig.default') }}</span> }
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="reqbox"
                      [checked]="c.isRequired"
                      [disabled]="c.isDefault || !c.isVisible"
                      (change)="onReqToggle(c, $any($event.target).checked)"
                    />
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="showbox"
                      [checked]="c.isVisible"
                      [disabled]="c.isDefault"
                      (change)="onShowToggle(c, $any($event.target).checked)"
                    />
                  </div>
                </div>
              }

              <!-- Group 4 -->
              <button type="button" class="grp-header" [class.collapsed]="isGroupCollapsed('g4')" (click)="toggleGroup('g4')">
                <span class="toggle"><span class="chev">▾</span> {{ t('ui.catalog.fieldConfig.grpCargo') }}</span>
              </button>
              @for (c of groupFields('g4'); track c.fieldKey) {
                <div class="field-item" [class.hidden-row]="isGroupCollapsed('g4')">
                  <div class="col-field">
                    <span class="field-name-text">{{ c.fieldName }}</span>
                    @if (c.isDefault) { <span class="field-locked">{{ t('ui.catalog.fieldConfig.default') }}</span> }
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="reqbox"
                      [checked]="c.isRequired"
                      [disabled]="c.isDefault || !c.isVisible"
                      (change)="onReqToggle(c, $any($event.target).checked)"
                    />
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="showbox"
                      [checked]="c.isVisible"
                      [disabled]="c.isDefault"
                      (change)="onShowToggle(c, $any($event.target).checked)"
                    />
                  </div>
                </div>
              }

              <!-- Group 5 -->
              <button type="button" class="grp-header" [class.collapsed]="isGroupCollapsed('g5')" (click)="toggleGroup('g5')">
                <span class="toggle"><span class="chev">▾</span> {{ t('ui.catalog.fieldConfig.grpDocs') }} <span class="src-tag">{{ t('ui.catalog.fieldConfig.grpDocsSrc') }}</span></span>
              </button>
              <div class="src-hint" [class.hidden-row]="isGroupCollapsed('g5')">
                <span [innerHTML]="t('ui.catalog.fieldConfig.docsHint')"></span>
              </div>
              @for (c of groupFields('g5'); track c.fieldKey) {
                <div class="field-item" [class.hidden-row]="isGroupCollapsed('g5')">
                  <div class="col-field">
                    <span class="field-name-text">{{ c.fieldName }}</span>
                    @if (c.isDefault) { <span class="field-locked">{{ t('ui.catalog.fieldConfig.default') }}</span> }
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="reqbox"
                      [checked]="c.isRequired"
                      [disabled]="c.isDefault || !c.isVisible"
                      (change)="onReqToggle(c, $any($event.target).checked)"
                    />
                  </div>
                  <div class="col-chk">
                    <input
                      type="checkbox"
                      class="showbox"
                      [checked]="c.isVisible"
                      [disabled]="c.isDefault"
                      (change)="onShowToggle(c, $any($event.target).checked)"
                    />
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <div class="drawer-foot">
          <button type="button" class="btn btn-ghost" (click)="closeConfigDrawer()">{{ t('ui.common.cancelAction') }}</button>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-ghost" (click)="resetConfigsDefault()">{{ t('ui.catalog.fieldConfig.btnReset') }}</button>
            <button type="button" class="btn btn-primary" (click)="saveConfigs()">💾 {{ t('ui.catalog.fieldConfig.btnSave') }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sg-space-3); }
      .page-header button { flex: 0 0 auto; }
      .catalog-layout {
        display: grid;
        grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
        gap: var(--sg-space-4);
        align-items: stretch;
        min-height: calc(100vh - 240px);
      }
      .catalog-types {
        height: 0;
        min-height: 100%;
        display: flex;
        flex-direction: column;
      }
      .catalog-items {
        min-height: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .catalog-types ::ng-deep .card,
      .catalog-items ::ng-deep .card {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .catalog-types ::ng-deep .card__body {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .catalog-items ::ng-deep .card__body {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .type-search {
        flex: 0 0 auto;
        padding: var(--sg-space-3) var(--sg-space-3) var(--sg-space-2);
        border-bottom: 1px solid var(--sg-border);
      }

      /* Danh sách nhóm: mỗi dòng gồm nút chọn + nút sửa (không lồng button vào button). */
      .type-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--sg-space-2);
      }
      .type-list::-webkit-scrollbar {
        width: 6px;
      }
      .type-list::-webkit-scrollbar-track {
        background: transparent;
      }
      .type-list::-webkit-scrollbar-thumb {
        background: var(--sg-border-strong, #cbd5e1);
        border-radius: 3px;
      }
      .type-list::-webkit-scrollbar-thumb:hover {
        background: var(--sg-text-muted, #94a3b8);
      }
      .type-row { display: flex; align-items: stretch; gap: 2px; min-width: 0; border-radius: var(--sg-radius); }
      .type-row:hover { background: var(--sg-bg-subtle); }
      .type-row--active { background: var(--sg-primary-soft); }
      .type-item {
        flex: 1 1 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
        align-items: flex-start;
        text-align: left;
        min-width: 0;
        padding: var(--sg-space-2) var(--sg-space-3);
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text);
        cursor: pointer;
      }
      .type-item__head { display: flex; align-items: center; gap: var(--sg-space-2); width: 100%; min-width: 0; overflow: hidden; }
      .type-item__name { display: block; flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; font-weight: 700; font-size: var(--sg-small-size); }
      .type-row--active .type-item__name { color: var(--sg-primary); }
      .type-item__count {
        flex: 0 0 auto;
        min-width: 22px;
        padding: 0 6px;
        border-radius: var(--sg-radius-pill);
        background: var(--sg-bg-muted);
        color: var(--sg-text-muted);
        font-size: var(--sg-caption-size);
        font-weight: 700;
        text-align: center;
      }
      .type-row--active .type-item__count { background: var(--sg-primary); color: var(--sg-text-invert); }
      .type-item__meta { display: flex; align-items: center; gap: var(--sg-space-2); width: 100%; min-width: 0; }
      .type-item__code { font-family: var(--sg-font-mono, ui-monospace, monospace); font-size: var(--sg-caption-size); color: var(--sg-text-muted); overflow: hidden; white-space: nowrap; min-width: 0; }
      .type-item__badge {
        flex: 0 0 auto;
        padding: 1px var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-primary-soft);
        color: var(--sg-primary);
        font-size: var(--sg-caption-size);
        font-weight: 700;
      }
      .type-item__desc {
        width: 100%;
        color: var(--sg-text-muted);
        font-size: var(--sg-caption-size);
        line-height: 1.4;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .type-edit {
        flex: 0 0 auto;
        display: inline-grid;
        place-items: center;
        width: 30px;
        min-width: 30px;
        border: 0;
        border-radius: var(--sg-radius);
        background: transparent;
        color: var(--sg-text-muted);
        cursor: pointer;
        opacity: 0;
      }
      .type-row:hover .type-edit, .type-row--active .type-edit { opacity: 1; }
      .type-edit:hover { background: var(--sg-bg-muted); color: var(--sg-primary); }
      .type-edit--danger:hover { color: var(--sg-danger); }
      .type-edit mat-icon { width: 18px; height: 18px; font-size: 18px; }
      .type-empty, .hint { color: var(--sg-text-muted); margin: 0; padding: var(--sg-space-3); }

      .items-toolbar {
        flex: 0 0 auto;
        display: flex;
        gap: var(--sg-space-3);
        align-items: center;
        flex-wrap: wrap;
        padding: var(--sg-space-3) var(--sg-space-4);
        border-bottom: 1px solid var(--sg-border);
      }
      .items-search { flex: 1 1 260px; }
      .items-status { flex: 0 0 200px; }
      .items-toolbar button { flex: 0 0 auto; }
      .sg-scroll-x {
        flex: 1 1 auto;
        min-height: 0;
        overflow-x: auto;
      }
      .items-pager {
        flex: 0 0 auto;
        margin-top: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        border-top: 1px solid var(--sg-border);
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }
      .items-pager__controls { display: inline-flex; align-items: center; gap: 8px; }
      .items-pager__label { color: var(--sg-text-muted); font-size: var(--sg-small-size); white-space: nowrap; }
      .items-pager__size { width: 72px; }
      @media (max-width: 960px) {
        .catalog-layout { grid-template-columns: 1fr; min-height: auto; }
        .catalog-types { height: auto; min-height: auto; }
        .type-list { max-height: 360px; }
      }
      @media (max-width: 640px) {
        .items-pager { flex-wrap: wrap; justify-content: center; }
      }

      .grid { width: 100%; min-width: 640px; border-collapse: collapse; background: var(--sg-bg-surface); }
      .grid th, .grid td { padding: var(--sg-space-2) var(--sg-space-3); border-bottom: 1px solid var(--sg-border); text-align: left; vertical-align: middle; }
      .grid th { background: var(--sg-bg-subtle); font-size: var(--sg-small-size); text-transform: uppercase; letter-spacing: .02em; }
      .grid tbody tr:hover { background: var(--sg-bg-subtle); }
      .grid__actions { white-space: nowrap; text-align: right; }
      .mono { font-family: var(--sg-font-mono, ui-monospace, monospace); }
      .state { padding: var(--sg-space-8); text-align: center; color: var(--sg-text-muted); }

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
      .chip[data-tone='done'] { background: var(--sg-state-done-soft); color: var(--sg-state-done); }
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
      .iconbtn--approve:hover { color: var(--sg-success); }
      .iconbtn--danger:hover { color: var(--sg-danger); }

      .item-form { display: grid; gap: var(--sg-space-3); }
      .item-form textarea { resize: vertical; }
      .lock-msg { margin: 0 0 var(--sg-space-2); }
      .lock-target { margin: 0; color: var(--sg-text-muted); }

      /* Drawer & Overlay CSS */
      .config-ic { background: #eef2fd; border: 1px solid #cfdcfb; color: #2054c4; }
      .config-ic:hover { background: #e2eaff; border-color: #2f6fed; }

      .overlay { position: fixed; inset: 0; background: rgba(12,20,40,.45); z-index: 940; }
      .overlay.show { display: block; }
      .drawer { position: fixed; top: 0; right: 0; width: 750px; max-width: 95vw; height: 100vh; background: #fff; z-index: 950; box-shadow: -8px 0 30px rgba(0,0,0,.15); display: flex; flex-direction: column; }
      .drawer-head { padding: 20px 24px; border-bottom: 1px solid var(--sg-border); display: flex; justify-content: space-between; align-items: flex-start; }
      .drawer-head h2 { margin: 0 0 4px; font-size: 17px; font-weight: 700; color: var(--sg-text); }
      .drawer-head p { margin: 0; font-size: 12.5px; color: var(--sg-text-muted); }
      .drawer-close { border: none; background: #f4f6fa; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 16px; color: var(--sg-text-muted); }
      .drawer-body { padding: 18px 24px; overflow-y: auto; overflow-x: hidden; flex: 1; }
      .drawer-foot { padding: 16px 24px; border-top: 1px solid var(--sg-border); display: flex; justify-content: space-between; align-items: center; background: #fafbfd; }

      .scope-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; flex-wrap: nowrap; font-family: inherit; }
      .scope-label { font-size: 13px; color: #475569; font-weight: 600; white-space: nowrap; font-family: inherit; }
      .scope-value-badge { font-size: 13px; font-weight: 700; color: #1e40af; background: #dbeafe; padding: 4px 10px; border-radius: 6px; border: 1px solid #bfdbfe; white-space: nowrap; font-family: inherit; text-overflow: ellipsis; overflow: hidden; }
      .count-pill { background: #eff6ff; color: #1d4ed8; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 12px; border: 1px solid #bfdbfe; white-space: nowrap; flex-shrink: 0; font-family: inherit; }

      .hint-box { background: #f0f7ff; border: 1px solid #c7d2fe; color: #1e40af; font-size: 12px; padding: 8px 12px; border-radius: 6px; line-height: 1.45; margin-bottom: 14px; font-family: inherit; }

      .cfg-list { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-family: inherit; }
      .cfg-header { display: flex; align-items: center; width: 100%; background: #f1f5f9; padding: 10px 14px; border-bottom: 1px solid #cbd5e1; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #334155; letter-spacing: 0.03em; font-family: inherit; }
      .col-field { flex: 1 1 auto; min-width: 0; text-align: left; padding-right: 12px; }
      .col-chk { flex: 0 0 90px; width: 90px; text-align: center; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .grp-header { display: flex; align-items: center; width: 100%; background: linear-gradient(90deg, #2563eb, #3b82f6); color: #ffffff; font-weight: 700; font-size: 13px; padding: 10px 14px; cursor: pointer; user-select: none; border: none; font-family: inherit; text-align: left; }
      .grp-header .toggle { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; font-family: inherit; }
      .grp-header .toggle .chev { width: 18px; height: 18px; border-radius: 4px; background: rgba(255,255,255,.25); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; transition: transform .15s; flex-shrink: 0; }
      .grp-header.collapsed .toggle .chev { transform: rotate(-90deg); }

      .field-item { display: flex; align-items: center; width: 100%; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; background: #ffffff; transition: background-color .1s ease; font-family: inherit; }
      .field-item:hover { background: #f8fafc; }
      .field-item.hidden-row { display: none; }
      .field-name-text { font-size: 13px; font-weight: 400; color: #334155; word-break: break-word; font-family: inherit; }
      .field-locked { color: #64748b; font-style: italic; font-size: 11px; font-weight: 500; margin-left: 6px; font-family: inherit; }
      input[type=checkbox] { width: 18px; height: 18px; accent-color: #2563eb; cursor: pointer; }
      input[type=checkbox]:disabled { opacity: .45; cursor: not-allowed; }

      .src-tag { font-size: 10px; font-weight: 600; background: rgba(255,255,255,.25); padding: 1px 6px; border-radius: 10px; margin-left: 6px; white-space: normal; word-break: break-word; font-family: inherit; }
      .src-hint { background: #fefce8; color: #854d0e; font-size: 11.5px; line-height: 1.45; padding: 10px 14px; border-bottom: 1px solid #cbd5e1; text-align: left; font-family: inherit; }
      .src-hint.hidden-row { display: none; }
      .btn { border: none; border-radius: 8px; padding: 10px 16px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
      .btn-primary { background: #2f6fed; color: #fff; }
      .btn-primary:hover { background: #2054c4; }
      .btn-ghost { background: #fff; border: 1px solid var(--sg-border); color: var(--sg-text); }
      .btn-ghost:hover { border-color: #2f6fed; color: #2054c4; }
      @media (max-width: 900px) { .catalog-layout { grid-template-columns: 1fr; } }
    `,
  ],
})
export class CatalogAdminPageComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  private readonly api = inject(ApiService);
  private readonly appMessages = inject(AppMessageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Drawer trạng thái cấu hình hiển thị trường */
  protected readonly configDrawerOpen = signal<boolean>(false);
  protected readonly activeConfigItem = signal<CatalogItem | null>(null);
  protected readonly configLoading = signal<boolean>(false);
  protected readonly fieldConfigs = signal<import('../../../core/models/admin.model').DossierFieldConfig[]>([]);
  protected readonly collapsedGroups = signal<Record<string, boolean>>({});

  private resolveSectionKey(key: string): string {
    if (['type', 'estimatedTime', 'accountInfo', 'enterpriseTaxCode', 'enterpriseName', 'representative', 'phone', 'address'].includes(key)) return 'g1';
    if (['plateNumber', 'vehicleType', 'containerNumber', 'trailerNumber', 'transportLicense', 'payloadWeight'].includes(key)) return 'g2';
    if (['driverName', 'driverDocType', 'driverDocNo', 'driverLicenseNo', 'driverPhone', 'driverNationality'].includes(key)) return 'g3';
    if (['cargoType', 'cargoName', 'quantity', 'unit', 'cargoWeight'].includes(key)) return 'g4';
    return 'g5';
  }

  protected groupFields(sectionKey: string): import('../../../core/models/admin.model').DossierFieldConfig[] {
    return this.fieldConfigs().filter((c) => c.sectionKey === sectionKey);
  }

  protected openConfigDrawer(item: CatalogItem): void {
    this.activeConfigItem.set(item);
    this.configDrawerOpen.set(true);
    this.configLoading.set(true);
    this.api.getDossierFieldConfigs(item.code).subscribe({
      next: (configs) => {
        let hasAccountInfo = false;
        let legacyVisible = false;
        let legacyRequired = false;
        const filtered: import('../../../core/models/admin.model').DossierFieldConfig[] = [];

        (configs || []).forEach((c) => {
          if (c.fieldKey === 'accountInfo') {
            hasAccountInfo = true;
            filtered.push(c);
          } else if (['enterpriseTaxCode', 'enterpriseName', 'representative', 'phone', 'address'].includes(c.fieldKey)) {
            if (c.isVisible) legacyVisible = true;
            if (c.isRequired) legacyRequired = true;
          } else {
            filtered.push(c);
          }
        });

        if (!hasAccountInfo) {
          filtered.push({
            fieldKey: 'accountInfo',
            fieldName: this.t('ui.catalog.fieldConfig.accountInfo'),
            isVisible: legacyVisible,
            isRequired: legacyRequired,
            isDefault: false,
          });
        }

        const mapped = filtered.map((c) => ({
          ...c,
          sectionKey: this.resolveSectionKey(c.fieldKey),
        }));
        this.fieldConfigs.set(mapped);
        this.configLoading.set(false);
      },
      error: () => {
        this.configLoading.set(false);
        this.appMessages.showKey('ui.catalog.loadConfigFailed', 'error');
      },
    });
  }

  protected closeConfigDrawer(): void {
    this.configDrawerOpen.set(false);
    this.activeConfigItem.set(null);
  }

  protected toggleGroup(groupKey: string): void {
    this.collapsedGroups.update((map) => ({ ...map, [groupKey]: !map[groupKey] }));
  }

  protected isGroupCollapsed(groupKey: string): boolean {
    return !!this.collapsedGroups()[groupKey];
  }

  protected onShowToggle(config: import('../../../core/models/admin.model').DossierFieldConfig, checked: boolean): void {
    if (config.isDefault || config.isLocked) return;
    config.isVisible = checked;
    if (!checked) {
      config.isRequired = false;
    }
    this.fieldConfigs.set([...this.fieldConfigs()]);
  }

  protected onReqToggle(config: import('../../../core/models/admin.model').DossierFieldConfig, checked: boolean): void {
    if (config.isDefault || config.isLocked || !config.isVisible) return;
    config.isRequired = checked;
    this.fieldConfigs.set([...this.fieldConfigs()]);
  }

  protected resetConfigsDefault(): void {
    const list = this.fieldConfigs().map((c) => {
      if (c.isDefault || c.isLocked) return c;
      return {
        ...c,
        isVisible: true,
        isRequired: c.sectionKey === 'g1' || c.sectionKey === 'g3',
      };
    });
    this.fieldConfigs.set(list);
  }

  protected saveConfigs(): void {
    const item = this.activeConfigItem();
    if (!item) return;
    this.configLoading.set(true);
    const accountInfoCfg = this.fieldConfigs().find((c) => c.fieldKey === 'accountInfo');
    const itemsPayload = this.fieldConfigs().map((c) => ({
      fieldKey: c.fieldKey,
      isVisible: c.isVisible,
      isRequired: c.isRequired,
    }));

    if (accountInfoCfg) {
      ['enterpriseTaxCode', 'enterpriseName', 'representative', 'phone', 'address'].forEach((key) => {
        const existing = itemsPayload.find((p) => p.fieldKey === key);
        if (existing) {
          existing.isVisible = accountInfoCfg.isVisible;
          existing.isRequired = accountInfoCfg.isRequired;
        } else {
          itemsPayload.push({
            fieldKey: key,
            isVisible: accountInfoCfg.isVisible,
            isRequired: accountInfoCfg.isRequired,
          });
        }
      });
    }
    this.api.updateDossierFieldConfigs(item.code, itemsPayload).subscribe({
      next: (updated) => {
        const mapped = updated.map((c) => ({
          ...c,
          sectionKey: this.resolveSectionKey(c.fieldKey),
        }));
        this.fieldConfigs.set(mapped);
        this.configLoading.set(false);
        this.appMessages.showKey('ui.catalog.saveConfigOk', 'success');
        this.closeConfigDrawer();
      },
      error: () => {
        this.configLoading.set(false);
        this.appMessages.showKey('ui.catalog.saveConfigFailed', 'error');
      },
    });
  }

  protected visibleFieldCount(): number {
    return this.fieldConfigs().filter((c) => c.isVisible).length;
  }

  /** Hàm dịch cho template — đọc signal ngôn ngữ nên đổi ngôn ngữ là vẽ lại ngay. */
  protected readonly t = this.i18n.t;

  protected typeName(type: CatalogType | null): string {
    if (!type) return '';
    // Ở tiếng Việt: Luôn trả về tên từ DB để người quản trị sửa tên nhóm (updateCatalogType) thì hiển thị đúng tên đã sửa
    if (this.i18n.locale() !== 'en') {
      return type.name || type.code || '';
    }
    // Ở tiếng Anh: Tra theo bảng ánh xạ mã nhóm
    const code = (type.code || '').toUpperCase();
    if (CATALOG_TYPE_KEY_MAP[code]) {
      return this.t(CATALOG_TYPE_KEY_MAP[code]);
    }
    if (code.includes('DOSSIER') || code.includes('DECLARATION')) return this.t('ui.catalog.typeDossierType');
    if (code.includes('VEHICLE')) return this.t('ui.catalog.typeVehicleType');
    if (code.includes('CARGO')) return this.t('ui.catalog.typeCargoType');
    if (code.includes('DOCUMENT')) return this.t('ui.catalog.typeDocumentType');
    if (code.includes('LANE')) return this.t('ui.catalog.typeGateLane');
    if (code.includes('GATE')) return this.t('ui.catalog.typeBorderGate');
    if (code.includes('DENY') || code.includes('REJECTION') || code.includes('DENIED')) return this.t('ui.catalog.typeReasonDenyEntry');
    if (code.includes('FEE')) return this.t('ui.catalog.typeFeeRejection');
    if (code.includes('YARD') || code.includes('ZONE')) return this.t('ui.catalog.typeYardZone');
    if (code.includes('ORGANIZATION')) return this.t('ui.catalog.typeOrganizationType');
    if (code.includes('CHECKPOINT')) return this.t('ui.catalog.typeCheckpoint');

    return type.name || type.code || '';
  }

  protected typeDescription(desc: string | null | undefined, typeCode?: string): string {
    if (!desc) return '';
    // Ở tiếng Việt: Luôn trả về mô tả từ DB, giữ nguyên thông tin cấu hình và ghi chú chi tiết
    if (this.i18n.locale() !== 'en') {
      return desc;
    }
    // Ở tiếng Anh: Tra cứu theo mã nhóm danh mục chuẩn
    const code = (typeCode || this.selectedType()?.code || '').toUpperCase();
    if (CATALOG_DESC_KEY_MAP[code]) {
      const baseTranslation = this.t(CATALOG_DESC_KEY_MAP[code]);
      const metaIndex = desc.search(/\bmetadata\./i);
      if (metaIndex !== -1) {
        return `${baseTranslation} ${desc.slice(metaIndex).trim()}`;
      }
      return baseTranslation;
    }
    // Đối với nhóm tùy biến do người dùng tự tạo: giữ nguyên mô tả gốc
    return desc;
  }

  protected itemName(item: CatalogItem | null | undefined): string {
    if (!item) return '';
    // Ở tiếng Việt: Luôn trả về tên từ DB để người quản trị sửa tên mục thì hiển thị đúng tên đã sửa
    if (this.i18n.locale() !== 'en') {
      return item.name || item.code || '';
    }

    const code = (item.code || '').toUpperCase();
    const typeCode = (item.typeCode || this.selectedType()?.code || '').toUpperCase();

    // Tra cứu có phạm vi rõ ràng theo nhóm (CATALOG_ITEM_KEY_MAP)
    const typeItemMap = CATALOG_ITEM_KEY_MAP[typeCode];
    if (typeItemMap && typeItemMap[code]) {
      return this.t(typeItemMap[code]);
    }

    return item.name || item.code || '';
  }

  protected selectedTypeSubtitle(): string {
    const type = this.selectedType();
    if (!type) return '';
    const name = this.typeName(type);
    const desc = this.typeDescription(type.description, type.code);
    if (desc && desc.trim() !== type.name.trim() && desc.trim() !== name.trim()) {
      return `${name} — ${desc}`;
    }
    return name;
  }

  protected readonly types = signal<CatalogType[]>([]);
  protected readonly selectedType = signal<CatalogType | null>(null);
  protected readonly items = signal<CatalogItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly PAGE_SIZES = PAGE_SIZES;
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );
  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly summary = computed(() => {
    if (!this.total()) return this.t('ui.catalog.summaryEmpty');
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.total(), this.page() * this.pageSize());
    return this.t('ui.catalog.summary', { start, end, total: this.total() });
  });

  protected readonly loading = signal(false);
  /** Lỗi tải danh sách mục — hiện ngay trong bảng để không nhầm với trạng thái "trống". */
  protected readonly error = signal('');

  protected readonly itemModal = signal<ItemModal | null>(null);
  protected readonly typeModal = signal<TypeModal | null>(null);
  protected readonly lockTarget = signal<CatalogItem | null>(null);
  /** Mục/nhóm đang chờ xác nhận xóa (BUG-058). */
  protected readonly deleteItemTarget = signal<CatalogItem | null>(null);
  protected readonly deleteTypeTarget = signal<CatalogType | null>(null);
  protected readonly formError = signal('');
  protected readonly formCodeError = signal('');
  protected readonly formNameError = signal('');
  protected readonly formSortError = signal('');
  protected readonly formTypeError = signal('');

  /** Lọc — thuộc tính thường để gắn `[(ngModel)]`, khớp khuôn các trang chuẩn. */
  protected keyword = '';
  protected statusFilter = '';
  /** Lọc nhóm danh mục ở panel trái — lọc phía client trên danh sách nhóm đã nạp. */
  protected typeKeyword = '';
  /** Hẹn giờ debounce cho ô tìm mục (BUG-072) — gõ xong mới gọi API, tránh gọi mỗi phím. */
  private searchTimer?: ReturnType<typeof setTimeout>;

  /** Trường trong hộp thoại thêm/sửa mục. */
  protected formCode = '';
  protected formName = '';
  protected formSort: string | number = '';

  /** Trường trong hộp thoại thêm/sửa nhóm. */
  protected formTypeCode = '';
  protected formTypeName = '';
  protected formTypeDesc = '';

  ngOnInit(): void {
    this.loadTypes();
  }

  protected onSortKeyDown(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ];
    if (allowedKeys.includes(event.key)) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      return;
    }
    if (/^[0-9]$/.test(event.key)) {
      return;
    }
    event.preventDefault();
  }

  protected onSortInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      const sanitized = input.value.replace(/[^0-9]/g, '');
      if (input.value !== sanitized) {
        input.value = sanitized;
        this.formSort = sanitized;
      }
    }
  }

  /**
   * Tải danh sách nhóm; chọn nhóm theo mã (mặc định nhóm đầu) rồi nạp mục của nhóm đó.
   * `successMessage` hiện SAU khi chọn nhóm — vì `selectType` xóa thông báo cũ, phải báo sau nó.
   */
  private loadTypes(selectCode?: string, successMessage?: string): void {
    this.api.getCatalogTypes().subscribe({
      next: (types) => {
        this.types.set(types);
        const target = selectCode ? types.find((type) => type.code === selectCode) : types[0];
        if (target) this.selectType(target);
        else {
          this.selectedType.set(null);
          this.items.set([]);
        }
        if (successMessage) this.notify(successMessage, 'success');
      },
      error: (err) => this.notify(this.i18n.apiError(err, 'ui.catalog.loadFailed'), 'error'),
    });
  }

  /** Làm mới danh sách nhóm (cập nhật tên/mô tả/badge đếm) mà KHÔNG nạp lại bảng mục hiện tại. */
  private refreshTypes(): void {
    this.api.getCatalogTypes().subscribe({
      next: (types) => {
        this.types.set(types);
        const current = this.selectedType();
        if (current) {
          const synced = types.find((type) => type.code === current.code);
          if (synced) this.selectedType.set(synced);
        }
      },
      error: () => undefined,
    });
  }

  /** Lọc nhóm theo tên hoặc mã ngay tại client — không gọi API. */
  protected filteredTypes(): CatalogType[] {
    const keyword = this.typeKeyword.trim().toLowerCase();
    if (!keyword) return this.types();
    return this.types().filter(
      (type) =>
        type.name.toLowerCase().includes(keyword) ||
        this.typeName(type).toLowerCase().includes(keyword) ||
        type.code.toLowerCase().includes(keyword),
    );
  }

  protected selectType(type: CatalogType): void {
    clearTimeout(this.searchTimer);
    this.selectedType.set(type);
    this.keyword = '';
    this.statusFilter = '';
    this.page.set(1);
    this.loadItems();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * BUG-072: ô tìm mục lọc ngay khi gõ, có debounce nhẹ để không gọi API mỗi phím. Enter vẫn lọc
   * tức thì qua `applyFilters` (đã hủy hẹn giờ đang chờ để không gọi thừa).
   */
  protected onKeywordInput(value: string): void {
    this.keyword = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  /** BUG-073: có đang lọc mục không — phân biệt "danh mục rỗng thật" với "lọc không khớp". */
  protected hasItemFilters(): boolean {
    return !!this.keyword.trim() || !!this.statusFilter;
  }

  protected applyFilters(): void {
    clearTimeout(this.searchTimer);
    this.page.set(1);
    this.loadItems();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
    this.loadItems();
  }

  protected goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.page()) return;
    this.page.set(next);
    this.loadItems();
  }

  private loadItems(): void {
    const type = this.selectedType();
    if (!type) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .getCatalogItems(type.code, {
        keyword: this.keyword,
        status: this.statusFilter,
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: (err) => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.error.set(this.i18n.apiError(err, 'ui.catalog.loadFailed'));
          this.notify(this.i18n.apiError(err, 'ui.catalog.loadFailed'), 'error');
        },
      });
  }

  protected statusOptions(): SgSelectOption[] {
    return [
      { value: 'ACTIVE', label: this.t('ui.catalog.statusActive') },
      { value: 'LOCKED', label: this.t('ui.catalog.statusLocked') },
    ];
  }

  protected statusTone(status: CatalogItemStatus): string {
    return CATALOG_STATUS_TONES[status];
  }

  protected statusLabel(status: CatalogItemStatus): string {
    return this.t(CATALOG_STATUS_LABEL_KEYS[status]);
  }

  protected formatDate(value: string): string {
    return formatDateTime(value);
  }

  // --- Thêm / sửa nhóm ------------------------------------------------------
  protected openAddType(): void {
    this.formTypeCode = '';
    this.formTypeName = '';
    this.formTypeDesc = '';
    this.formTypeError.set('');
    this.typeModal.set({ mode: 'add' });
  }

  protected openEditType(type: CatalogType): void {
    this.formTypeCode = type.code;
    this.formTypeName = type.name;
    this.formTypeDesc = type.description ?? '';
    this.formTypeError.set('');
    this.typeModal.set({ mode: 'edit', type });
  }

  protected closeTypeModal(): void {
    this.formTypeCode = '';
    this.formTypeName = '';
    this.formTypeDesc = '';
    this.typeModal.set(null);
    this.formTypeError.set('');
  }

  protected submitType(): void {
    const modal = this.typeModal();
    if (!modal) return;

    const code = this.formTypeCode.trim();
    const name = this.formTypeName.trim();
    if (!code || !name) {
      this.formTypeError.set(this.t('ui.catalog.typeCodeRequired'));
      this.focusInvalid('input[name="typeCode"]');
      return;
    }
    const description = this.formTypeDesc.trim() || null;

    if (modal.mode === 'add') {
      this.api.createCatalogType({ code, name, description }).subscribe({
        next: (created) => {
          this.typeModal.set(null);
          this.formTypeError.set('');
          this.notify(this.t('ui.catalog.createTypeOk'), 'success');
          this.loadTypes(created.code);
        },
        error: (err) => this.formTypeError.set(this.i18n.apiError(err, 'ui.catalog.saveFailed')),
      });
      return;
    }
    if (!modal.type) return;
    this.api.updateCatalogType(modal.type.code, { name, description }).subscribe({
      next: () => {
        this.typeModal.set(null);
        this.formTypeError.set('');
        this.notify(this.t('ui.catalog.updateTypeOk'), 'success');
        this.refreshTypes();
      },
      error: (err) => this.formTypeError.set(this.i18n.apiError(err, 'ui.catalog.saveFailed')),
    });
  }

  // --- Thêm / sửa mục -------------------------------------------------------
  protected openAdd(): void {
    if (!this.selectedType()) return;
    this.formCode = '';
    this.formName = '';
    this.formSort = '';
    this.formError.set('');
    this.formCodeError.set('');
    this.formNameError.set('');
    this.formSortError.set('');
    this.itemModal.set({ mode: 'add' });
  }

  /** Mục đã khóa không cho sửa — phải mở khóa trước (giữ toàn vẹn dữ liệu lịch sử). */
  protected openEdit(item: CatalogItem): void {
    if (item.status === 'LOCKED') {
      this.notify(this.t('ui.catalog.lockedHint'), 'warning');
      return;
    }
    this.formCode = item.code;
    this.formName = item.name;
    this.formSort = item.sortOrder;
    this.formError.set('');
    this.formCodeError.set('');
    this.formNameError.set('');
    this.formSortError.set('');
    this.itemModal.set({ mode: 'edit', item });
  }

  protected closeItemModal(): void {
    this.itemModal.set(null);
    this.formError.set('');
    this.formCodeError.set('');
    this.formNameError.set('');
    this.formSortError.set('');
  }

  protected submitItem(): void {
    const modal = this.itemModal();
    const type = this.selectedType();
    if (!modal || !type) return;

    this.formError.set('');
    this.formCodeError.set('');
    this.formNameError.set('');
    this.formSortError.set('');

    const code = this.formCode.trim();
    const name = this.formName.trim();
    const rawSort = String(this.formSort ?? '').trim();

    let hasError = false;

    if (!code) {
      this.formCodeError.set(this.t('ui.catalog.codeRequired'));
      hasError = true;
    }
    if (!name) {
      this.formNameError.set(this.t('ui.catalog.codeRequired'));
      hasError = true;
    }

    if (!rawSort) {
      this.formSortError.set(this.t('ui.catalog.sortOrderRequired'));
      hasError = true;
    } else {
      const sortNum = Number(rawSort);
      if (!Number.isInteger(sortNum) || sortNum < 1) {
        this.formSortError.set(this.t('ui.catalog.sortOrderInvalid'));
        hasError = true;
      }
    }

    if (hasError) {
      if (!code) {
        this.focusInvalid('input[name="itemCode"]');
      } else if (!name) {
        this.focusInvalid('input[name="itemName"]');
      } else {
        this.focusInvalid('input[name="itemSort"]');
      }
      return;
    }

    const sortOrder = Number(rawSort);

    if (modal.mode === 'add') {
      this.api.createCatalogItem(type.code, { code, name, sortOrder }).subscribe({
        next: () => this.afterSave('ui.catalog.createOk', true),
        error: (err) => this.handleItemSaveError(err),
      });
      return;
    }
    if (!modal.item) return;
    this.api.updateCatalogItem(type.code, modal.item.id, { name, sortOrder }).subscribe({
      next: () => this.afterSave('ui.catalog.updateOk', false),
      error: (err) => this.handleItemSaveError(err),
    });
  }

  private handleItemSaveError(err: unknown): void {
    const key = extractErrorMessageKey(err);
    const fieldErrors = toFieldErrorMap(extractFieldErrors(err), (e) => this.i18n.fieldError(e));

    if (
      key === 'catalog.itemSortOrderDuplicated' ||
      key === 'catalog.itemSortOrderRequired' ||
      key === 'catalog.itemSortOrderInvalid' ||
      fieldErrors['sortOrder']
    ) {
      const fallbackKey = (key as MessageKey) || 'catalog.itemSortOrderDuplicated';
      const msg = fieldErrors['sortOrder'] || this.i18n.apiError(err, fallbackKey);
      this.formSortError.set(msg);
      this.focusInvalid('input[name="itemSort"]');
      return;
    }

    if (key === 'catalog.itemCodeDuplicated' || fieldErrors['code']) {
      const msg = fieldErrors['code'] || this.i18n.apiError(err, 'catalog.itemCodeDuplicated');
      this.formCodeError.set(msg);
      this.focusInvalid('input[name="itemCode"]');
      return;
    }

    if (key === 'catalog.itemNameDuplicated' || fieldErrors['name']) {
      const msg = fieldErrors['name'] || this.i18n.apiError(err, 'catalog.itemNameDuplicated');
      this.formNameError.set(msg);
      this.focusInvalid('input[name="itemName"]');
      return;
    }

    this.formError.set(this.i18n.apiError(err, 'ui.catalog.saveFailed'));
  }

  private afterSave(key: MessageKey, countChanged: boolean): void {
    this.itemModal.set(null);
    this.formError.set('');
    this.formCodeError.set('');
    this.formNameError.set('');
    this.formSortError.set('');
    this.notify(this.t(key), 'success');
    this.loadItems();
    // Thêm mục làm đổi số đếm của nhóm → làm mới badge; sửa mục thì không.
    if (countChanged) this.refreshTypes();
  }

  // --- Khóa / mở khóa -------------------------------------------------------
  protected askLock(item: CatalogItem): void {
    this.lockTarget.set(item);
  }

  protected cancelLock(): void {
    this.lockTarget.set(null);
  }

  protected submitLock(): void {
    const item = this.lockTarget();
    const type = this.selectedType();
    if (!item || !type) return;
    this.api.lockCatalogItem(type.code, item.id).subscribe({
      next: () => {
        this.lockTarget.set(null);
        this.notify(this.t('ui.catalog.lockOk'), 'success');
        this.loadItems();
      },
      error: (err) => {
        this.lockTarget.set(null);
        this.notify(this.i18n.apiError(err, 'ui.catalog.saveFailed'), 'error');
      },
    });
  }

  protected unlock(item: CatalogItem): void {
    const type = this.selectedType();
    if (!type) return;
    this.api.unlockCatalogItem(type.code, item.id).subscribe({
      next: () => {
        this.notify(this.t('ui.catalog.unlockOk'), 'success');
        this.loadItems();
      },
      error: (err) => this.notify(this.i18n.apiError(err, 'ui.catalog.saveFailed'), 'error'),
    });
  }

  // --- Xóa mục / nhóm (BUG-058) ---------------------------------------------
  /**
   * Chỉ cho hiện nút xóa mục khi: nhóm KHÔNG mặc định (admin tự thêm) và mục còn ACTIVE. Mục đã khóa
   * hoặc mục của nhóm mặc định chỉ được khóa — BE cũng chặn (400), đây chỉ ẩn nút cho gọn.
   */
  protected canDeleteItem(item: CatalogItem): boolean {
    return !this.selectedType()?.isSystem && item.status === 'ACTIVE';
  }

  protected askDeleteItem(item: CatalogItem): void {
    if (!this.canDeleteItem(item)) return;
    this.deleteItemTarget.set(item);
  }

  protected cancelDeleteItem(): void {
    this.deleteItemTarget.set(null);
  }

  protected submitDeleteItem(): void {
    const item = this.deleteItemTarget();
    const type = this.selectedType();
    if (!item || !type) return;
    this.api.deleteCatalogItem(type.code, item.id).subscribe({
      next: () => {
        this.deleteItemTarget.set(null);
        this.notify(this.t('ui.catalog.deleteOk'), 'success');
        this.loadItems();
        this.refreshTypes();
      },
      error: (err) => {
        this.deleteItemTarget.set(null);
        this.notify(this.i18n.apiError(err, 'ui.catalog.saveFailed'), 'error');
      },
    });
  }

  /**
   * Mở xác nhận xóa nhóm. Nhóm mặc định không có nút này; nhóm còn mục thì báo ngay (BE cũng chặn 400)
   * để người dùng biết phải xóa hết mục trước.
   */
  protected askDeleteType(type: CatalogType): void {
    if (type.isSystem) return;
    if (type.itemCount > 0) {
      this.notify(this.t('ui.catalog.deleteTypeNotEmpty'), 'warning');
      return;
    }
    this.deleteTypeTarget.set(type);
  }

  protected cancelDeleteType(): void {
    this.deleteTypeTarget.set(null);
  }

  protected submitDeleteType(): void {
    const type = this.deleteTypeTarget();
    if (!type) return;
    this.api.deleteCatalogType(type.code).subscribe({
      next: () => {
        this.deleteTypeTarget.set(null);
        // Giữ nhóm đang xem nếu nó không phải nhóm vừa xóa; ngược lại để loadTypes chọn nhóm đầu.
        const current = this.selectedType();
        const keepCode = current && current.id !== type.id ? current.code : undefined;
        this.loadTypes(keepCode, this.t('ui.catalog.deleteTypeOk'));
      },
      error: (err) => {
        this.deleteTypeTarget.set(null);
        this.notify(this.i18n.apiError(err, 'ui.catalog.saveFailed'), 'error');
      },
    });
  }

  private notify(text: string, type: AppMessageTone = 'info'): void {
    this.appMessages.show(text, type);
  }

  /** Cuộn tới + focus ô nhập lỗi trong hộp thoại (lỗi validate vẫn hiện ngay trong hộp thoại). */
  private focusInvalid(selector: string): void {
    setTimeout(() => {
      const input = this.host.nativeElement.querySelector<HTMLInputElement>(selector);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
    });
  }
}
