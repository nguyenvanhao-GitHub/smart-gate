import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { exportAndLogFile } from "../../../shared/utils/file-download.util";
import { Subscription } from "rxjs";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { I18nService } from "../../../core/i18n/i18n.service";
import { MessageKey } from "../../../core/i18n/message-catalog";
import {
  AUDIT_ACTION_CODES,
  AUDIT_MODULE_CODES,
  AUDIT_MODULE_LABEL_KEYS,
  AUDIT_RESULT_LABEL_KEYS,
  AUDIT_RESULT_TONES,
  AuditLogFilters,
  AuditLogRow,
  AuditModuleCode,
  auditModuleOf,
} from "../../../core/models/admin.model";
import { formatDateTime } from "../../../core/models/workflow.model";
import { actorRoleLabel } from "../../../core/auth/access-control.model";
import { ApiService } from "../../../core/services/api.service";
import { AppMessageService } from "../../../core/services/app-message.service";
import { SgButtonDirective } from "../../../shared/ui/sg-button.directive";
import { SgCardComponent } from "../../../shared/ui/sg-card.component";
import {
  SgComboboxComponent,
  SgComboboxSubmitEvent,
} from "../../../shared/ui/sg-combobox.component";
import { SgDatePickerComponent } from "../../../shared/ui/sg-date-picker.component";
import { SgFormFieldComponent } from "../../../shared/ui/sg-form-field.component";
import { SgModalComponent } from "../../../shared/ui/sg-modal.component";
import { SgPagerComponent } from "../../../shared/ui/sg-pager.component";
import {
  SgSelectComponent,
  SgSelectOption,
} from "../../../shared/ui/sg-select.component";

/** Khóa dịch của loại đối tượng */
const TARGET_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  DECLARATION: "ui.audit.target.DECLARATION",
  DOSSIER: "ui.audit.target.DOSSIER",
  USER: "ui.audit.target.USER",
  ROLE: "ui.audit.target.ROLE",
  PERMISSION: "ui.audit.target.PERMISSION",
  LANE: "ui.audit.target.LANE",
  YARD: "ui.audit.target.YARD",
  SLOT: "ui.audit.target.SLOT",
  FEE: "ui.audit.target.FEE",
  FEE_RULE: "ui.audit.target.FEE_RULE",
  FEE_TRANSACTION: "ui.audit.target.FEE_TRANSACTION",
  DISPATCH: "ui.audit.target.DISPATCH",
  DISPATCH_ASSIGNMENT: "ui.audit.target.DISPATCH",
  FEE_WORKBENCH: "ui.audit.target.FEE",
  WORKFLOW: "ui.audit.target.WORKFLOW",
  REPORT: "ui.audit.target.REPORT",
  AUTH: "ui.audit.target.AUTH",
  CATALOG: "ui.audit.target.CATALOG",
  CATALOG_TYPE: "ui.audit.target.CATALOG_TYPE",
  CATALOG_ITEM: "ui.audit.target.CATALOG_ITEM",
  ATTACHMENT: "ui.audit.target.ATTACHMENT",
  FILE: "ui.audit.target.FILE",
  CONFIG: "ui.audit.target.CONFIG",
  SYSTEM_CONFIG: "ui.audit.target.SYSTEM_CONFIG",
  SYSTEM_SETTINGS: "ui.audit.target.SYSTEM_SETTINGS",
  SYSTEM_SETTING: "ui.audit.target.SYSTEM_SETTING",
  AUDIT_LOG: "ui.audit.target.AUDIT_LOG",
};

/** Khóa dịch các trường trong bảng Diff */
const FIELD_LABEL_KEYS: Record<string, MessageKey> = {
  status: "ui.dossier.status",
  dossierCode: "ui.audit.field.dossierCode",
  code: "ui.dossier.colCode",
  type: "ui.dossier.colType",
  dossierType: "ui.dossier.type",
  plateNumber: "ui.audit.field.plateNumber",
  vehicle: "ui.dossier.colVehicle",
  vehicles: "ui.form.vehicleListTitle",
  driver: "ui.dossier.colDriver",
  cargo: "ui.audit.field.cargo",
  cargoItems: "ui.audit.field.cargoItems",
  decision: "ui.audit.field.decision",
  step: "ui.audit.field.step",
  stepCode: "ui.audit.field.stepCode",
  agencyCode: "ui.audit.field.agencyCode",
  note: "ui.audit.field.note",
  reason: "ui.audit.field.reason",
  reasonCode: "ui.audit.field.reasonCode",
  reasonNote: "ui.audit.field.reasonNote",
  lockReason: "ui.audit.field.lockReason",
  cancelReason: "ui.audit.field.cancelReason",
  rejectionReason: "ui.audit.field.rejectionReason",
  denyReason: "ui.audit.field.denyReason",
  laneCode: "ui.audit.field.laneCode",
  direction: "ui.audit.field.direction",
  canOpen: "ui.audit.field.canOpen",
  statusColor: "ui.audit.field.statusColor",
  blockingReasons: "ui.audit.field.blockingReasons",
  appointment: "ui.audit.field.appointment",
  scheduledAt: "ui.audit.field.scheduledAt",
  priority: "ui.audit.field.priority",
  epidemicFlag: "ui.audit.field.epidemicFlag",
  slot: "ui.audit.field.slot",
  bay: "ui.audit.field.bay",
  yard: "ui.audit.field.yard",
  yardZone: "ui.audit.field.yardZone",
  inspectionType: "ui.audit.field.inspectionType",
  fee: "ui.audit.field.fee",
  totalFee: "ui.audit.field.totalFee",
  amount: "ui.audit.field.amount",
  exempt: "ui.audit.field.exempt",
  rule: "ui.audit.field.rule",
  transactionCode: "ui.audit.field.transactionCode",
  paymentMethod: "ui.audit.field.paymentMethod",
  paymentStatus: "ui.audit.field.paymentStatus",
  reconciliationStatus: "ui.audit.field.reconciliationStatus",
  username: "ui.audit.field.username",
  displayName: "ui.audit.field.displayName",
  fullName: "ui.audit.field.fullName",
  email: "ui.audit.field.email",
  phone: "ui.audit.field.phone",
  roles: "ui.audit.field.roles",
  roleCodes: "ui.audit.field.roleCodes",
  permissions: "ui.audit.field.permissions",
  assignments: "ui.audit.field.assignments",
  isActive: "ui.audit.field.isActive",
  active: "ui.audit.field.active",
  name: "ui.audit.field.name",
  description: "ui.audit.field.description",
  value: "ui.audit.field.value",
  key: "ui.audit.field.key",
  fileName: "ui.audit.field.fileName",
  originalName: "ui.audit.field.originalName",
  fileSize: "ui.audit.field.fileSize",
  mimeType: "ui.audit.field.mimeType",
  errors: "ui.audit.field.errors",
  taxCode: "ui.audit.field.taxCode",
  representativeName: "ui.audit.field.representativeName",
  idNumber: "ui.audit.field.idNumber",
  address: "ui.audit.field.address",
  sortOrder: "ui.audit.field.sortOrder",
  category: "ui.audit.field.category",
  updatedAt: "ui.audit.field.updatedAt",
  createdAt: "ui.audit.field.createdAt",
  submittedAt: "ui.audit.field.submittedAt",
  actorId: "ui.audit.field.actorId",
  actorUsername: "ui.audit.field.actorUsername",
  actorRole: "ui.audit.field.actorRole",
  targetId: "ui.audit.field.targetId",
  targetType: "ui.audit.field.targetType",
  action: "ui.audit.colAction",
  result: "ui.audit.colResult",
  correlationId: "ui.audit.field.correlationId",
  ip: "ui.audit.field.ip",
  avatarUrl: "ui.audit.field.avatarUrl",
  avatar: "ui.audit.field.avatar",
  photo: "ui.audit.field.avatar",
  photoUrl: "ui.audit.field.avatar",
  image: "ui.audit.field.image",
  imageUrl: "ui.audit.field.imageUrl",
  organizationId: "ui.audit.field.organizationId",
  organization: "ui.audit.field.organization",
  organizationCode: "ui.audit.field.organizationCode",
  organizationName: "ui.audit.field.organizationName",
  title: "ui.audit.field.title",
  department: "ui.audit.field.department",
  weight: "ui.audit.field.weight",
  grossWeightKg: "ui.audit.field.grossWeightKg",
  netWeightKg: "ui.audit.field.netWeightKg",
  vehicleType: "ui.audit.field.vehicleType",
  trailerPlateNumber: "ui.audit.field.trailerPlateNumber",
  originCountry: "ui.audit.field.originCountry",
  destinationCountry: "ui.audit.field.destinationCountry",
  documentType: "ui.audit.field.documentType",
  documentTypeCode: "ui.audit.field.documentTypeName", // Changed from documentTypeCode to show "Tên loại chứng từ" instead of "Mã loại chứng từ"
  documentTypeName: "ui.audit.field.documentTypeName",
  idType: "ui.audit.field.idType",
  lastLoginAt: "ui.audit.field.lastLoginAt",
  expiresAt: "ui.audit.field.expiresAt",
  password: "ui.audit.field.password",
  oldPassword: "ui.audit.field.oldPassword",
  newPassword: "ui.audit.field.newPassword",
  sourceId: "ui.audit.field.sourceId",
  sourceCode: "ui.audit.field.sourceCode",
  copiedId: "ui.audit.field.copiedId",
  copiedCode: "ui.audit.field.copiedCode",
  newDossierCode: "ui.audit.field.copiedCode",
  checksum: "ui.audit.field.checksum",
  dossierId: "ui.audit.field.dossierId",
  sizeBytes: "ui.audit.field.sizeBytes",
  filter: "ui.audit.field.filter",
  reportName: "ui.audit.field.reportName",
  metadata: "ui.audit.field.metadata",
  declarationType: "ui.audit.field.declarationType",
  module: "ui.audit.colModule",
  assignment: "ui.audit.field.assignment",
  capacity: "ui.audit.field.capacity",
  feeItems: "ui.audit.field.feeItems",
  sessionTimeoutMinutes: "ui.audit.field.sessionTimeoutMinutes",
  maxFileUploadMb: "ui.audit.field.maxFileUploadMb",
  ticketCode: "ui.audit.field.ticketCode",
  ticketNumber: "ui.audit.field.ticketNumber",
  appliedAt: "ui.audit.field.appliedAt",
  slotCount: "ui.audit.field.slotCount",
  slotPrefix: "ui.audit.field.slotPrefix",
  feeItemCode: "ui.feeRule.fieldCode",
  feeItemName: "ui.feeRule.fieldName",
  quantity: "ui.fee.colQuantity",
  unitAmount: "ui.audit.field.price",
  subtotal: "ui.fee.subtotal",
  vatAmount: "ui.fee.vat",
  adjusted: "ui.audit.field.adjusted",
  ruleCode: "ui.audit.field.ruleCode",
  closedVersions: "ui.audit.field.closedVersions",
  effectiveFrom: "ui.audit.field.effectiveFrom",
  unit: "ui.audit.field.unit",
  passwordChangedAt: "ui.audit.field.passwordChangedAt",
  typeCode: "ui.audit.field.typeCode",
  inspectionStatus: "ui.audit.field.inspectionStatus",
  attachmentIds: "ui.audit.field.attachmentIds",
  attachmentId: "ui.audit.field.attachmentId",
  deletedAt: "ui.audit.field.deletedAt",
  deletedById: "ui.audit.field.deletedById",
  lines: "ui.audit.field.lines",
  total: "ui.audit.field.total",
  lane: "ui.audit.field.lane",
  price: "ui.audit.field.price",
  enterprise: "ui.audit.field.enterprise",
  feeDeclarationCode: "ui.audit.field.feeDeclarationCode",
  accountType: "ui.audit.field.accountType",
  defaultRoute: "ui.audit.field.defaultRoute",
  grantedRole: "ui.audit.field.grantedRole",
  matchedTotal: "ui.audit.field.matchedTotal",
  rowCount: "ui.audit.field.rowCount",
  truncated: "ui.audit.field.truncated",
  transshipmentVehicles: "ui.audit.field.transshipmentVehicles",
  roleCode: "ui.audit.field.roleCode",
  roleName: "ui.audit.field.roleName",
  dataScope: "ui.audit.field.dataScope",
  role: "ui.audit.field.role",
  elapsedSeconds: "ui.audit.field.elapsedSeconds",
  instanceStatus: "ui.audit.field.instanceStatus",
  method: "ui.audit.field.method",
  outstanding: "ui.audit.field.outstanding",
  settled: "ui.audit.field.settled",
  transactionId: "ui.audit.field.transactionId",
  referenceCode: "ui.audit.field.referenceCode",
  feeAction: "ui.audit.field.feeAction",
  slug: "ui.audit.field.slug",
  feeCode: "ui.audit.field.feeCode",
  feeType: "ui.fee.filterFeeType",
  checkpoint: "ui.form.checkpointLabel",
  checkpointCode: "ui.form.checkpointLabel",
  containerNumber: "ui.form.containerNumber",
  trailerNumber: "ui.form.trailerNumber",
  transportLicense: "ui.form.transportLicense",
  goodsDescription: "ui.audit.field.cargo",
  hsCode: "ui.form.hsCode",
  unitCode: "ui.form.unitCode",
  packageCount: "ui.audit.field.packageCount",
  appliesTo: "ui.catalog.fieldConfig.applyTo",
  currency: "ui.audit.field.currency",
  effectiveTo: "ui.audit.field.effectiveTo",
  isSystem: "ui.audit.field.isSystem",
};

/** Khóa dịch các giá trị thân thiện */
const VALUE_LABEL_KEYS: Record<string, MessageKey> = {
  // Trạng thái hồ sơ
  DRAFT: "ui.audit.val.DRAFT",
  SUBMITTED: "ui.audit.val.SUBMITTED",
  WAITING_GATE: "ui.dossierStatus.WAITING_GATE",
  WAITING_CALL: "ui.audit.val.WAITING_CALL",
  PROCESSING: "ui.audit.val.PROCESSING",
  IN_PROGRESS: "ui.audit.val.IN_PROGRESS",
  BUSINESS_PROCESSING: "ui.audit.val.BUSINESS_PROCESSING",
  WAITING_BORDER_GUARD: "ui.audit.val.WAITING_BORDER_GUARD",
  WAITING_CUSTOMS: "ui.audit.val.WAITING_CUSTOMS",
  WAITING_QUARANTINE: "ui.audit.val.WAITING_QUARANTINE",
  WAITING_FOR_FEE: "ui.audit.val.WAITING_FOR_FEE",
  NEED_SUPPLEMENT: "ui.audit.val.NEED_SUPPLEMENT",
  REVISION_REQUIRED: "ui.audit.val.REVISION_REQUIRED",
  APPROVED: "ui.audit.val.APPROVED",
  REJECTED: "ui.audit.val.REJECTED",
  DENIED: "ui.audit.val.DENIED",
  PAID: "ui.audit.val.PAID",
  WORKFLOW_DONE: "ui.audit.val.WORKFLOW_DONE",
  READY_FOR_EXIT: "ui.audit.val.READY_FOR_EXIT",
  EXITED: "ui.audit.val.EXITED",
  COMPLETED: "ui.audit.val.COMPLETED",
  CANCELLED: "ui.audit.val.CANCELLED",
  CLOSED: "ui.audit.val.CLOSED",
  CONFIRMED: "ui.audit.val.CONFIRMED",
  REOPENED: "ui.dossierStatus.REOPENED",
  // Trạng thái lực lượng
  NOT_APPLICABLE: "ui.forceStatus.NOT_APPLICABLE",
  FAILED: "ui.forceStatus.FAILED",
  PASSED: "ui.forceStatus.PASSED",
  // Loại giấy tờ
  CCCD: "ui.idType.CCCD",
  PASSPORT: "ui.idType.PASSPORT",
  BORDER_PASS: "ui.idType.BORDER_PASS",
  // Đơn vị tính
  KG: "ui.audit.val.KG",
  TON: "ui.audit.val.TON",
  PIECE: "ui.audit.val.PIECE",
  // Phạm vi dữ liệu
  ALL: "ui.scope.ALL",
  ORGANIZATION: "ui.scope.ORGANIZATION",
  OWN: "ui.scope.OWN",
  ASSIGNMENT: "ui.scope.ASSIGNMENT",
  // Vai trò
  DOANH_NGHIEP: "ui.role.ENTERPRISE",
  CAN_BO_DIEU_PHOI: "ui.role.DISPATCHER",
  BIEN_PHONG: "ui.role.BORDER_GUARD",
  HAI_QUAN_B1: "ui.role.CUSTOMS",
  ADMIN: "ui.role.SYS_ADMIN",
  // Quyết định xử lý
  APPROVE: "ui.audit.val.APPROVE",
  REQUEST_SUPPLEMENT: "ui.audit.val.REQUEST_SUPPLEMENT",
  REJECT: "ui.audit.val.REJECT",
  DENY: "ui.audit.val.DENY",
  ALLOW: "ui.audit.val.ALLOW",
  // Hướng di chuyển
  ENTRY: "ui.audit.val.ENTRY",
  EXIT: "ui.audit.val.EXIT",
  IN: "ui.audit.val.IN",
  OUT: "ui.audit.val.OUT",
  // Trạng thái tài khoản / vai trò / danh mục
  ACTIVE: "ui.audit.val.ACTIVE",
  INACTIVE: "ui.audit.val.INACTIVE",
  LOCKED: "ui.audit.val.LOCKED",
  PENDING: "ui.audit.val.PENDING",
  PENDING_APPROVAL: "ui.audit.val.PENDING_APPROVAL",
  DELETED: "ui.audit.val.DELETED",
  UNLOCKED: "ui.audit.val.UNLOCKED",
  TEMPORARY_LOCKED: "ui.audit.val.TEMPORARY_LOCKED",
  TEMP_LOCKED: "ui.audit.val.TEMP_LOCKED",
  // Mức ưu tiên
  LOW: "ui.audit.val.LOW",
  NORMAL: "ui.audit.val.NORMAL",
  HIGH: "ui.audit.val.HIGH",
  URGENT: "ui.audit.val.URGENT",
  // Hình thức kiểm tra
  PHYSICAL: "ui.audit.val.PHYSICAL",
  DOCUMENT: "ui.audit.val.DOCUMENT",
  SCAN: "ui.audit.val.SCAN",
  NONE: "ui.audit.val.NONE",
  // Thanh toán & đối soát
  CASH: "ui.audit.val.CASH",
  TRANSFER: "ui.audit.val.TRANSFER",
  BANK_TRANSFER: "ui.audit.val.BANK_TRANSFER",
  E_WALLET: "ui.audit.val.E_WALLET",
  QR: "ui.audit.val.QR",
  UNPAID: "ui.audit.val.UNPAID",
  MATCHED: "ui.audit.val.MATCHED",
  DISCREPANCY: "ui.audit.val.DISCREPANCY",
  UNRECONCILED: "ui.audit.val.UNRECONCILED",
  // Bước xử lý / Lực lượng
  BORDER_GUARD: "ui.audit.val.BORDER_GUARD",
  CUSTOMS: "ui.audit.val.CUSTOMS",
  QUARANTINE: "ui.audit.val.QUARANTINE",
  FEE: "ui.audit.val.FEE",
  DISPATCH: "ui.audit.val.DISPATCH",
  YARD: "ui.audit.val.YARD",
  // Vai trò
  SYS_ADMIN: "ui.audit.val.SYS_ADMIN",
  ENTERPRISE: "ui.audit.val.ENTERPRISE",
  DISPATCHER: "ui.audit.val.DISPATCHER",
  YARD_MANAGER: "ui.audit.val.YARD_MANAGER",
  FEE_COLLECTOR: "ui.audit.val.FEE_COLLECTOR",
  MANAGEMENT: "ui.audit.val.MANAGEMENT",
  INDIVIDUAL: "ui.audit.val.INDIVIDUAL",
  // Loại hồ sơ & Bước xử lý & Loại chứng từ
  IMPORT: "ui.audit.val.IMPORT",
  EXPORT: "ui.audit.val.EXPORT",
  TRANSIT: "ui.audit.val.TRANSIT",
  BORDER_TRANSPORT: "ui.audit.val.BORDER_TRANSPORT",
  IMPORT_DECLARATION: "ui.audit.val.IMPORT_DECLARATION",
  IMPORT_B1_ENTRY: "ui.audit.val.IMPORT_B1_ENTRY",
  IMPORT_BORDER: "ui.audit.val.IMPORT_BORDER",
  IMPORT_QUARANTINE: "ui.audit.val.IMPORT_QUARANTINE",
  IMPORT_CUSTOMS: "ui.audit.val.IMPORT_CUSTOMS",
  IMPORT_FEE: "ui.audit.val.IMPORT_FEE",
  IMPORT_B2_EXIT: "ui.audit.val.IMPORT_B2_EXIT",
  EXPORT_DECLARATION: "ui.audit.val.EXPORT_DECLARATION",
  EXPORT_B2_ENTRY: "ui.audit.val.EXPORT_B2_ENTRY",
  EXPORT_QUARANTINE: "ui.audit.val.EXPORT_QUARANTINE",
  EXPORT_BORDER: "ui.audit.val.EXPORT_BORDER",
  EXPORT_CUSTOMS: "ui.audit.val.EXPORT_CUSTOMS",
  EXPORT_FEE: "ui.audit.val.EXPORT_FEE",
  EXPORT_B1_EXIT: "ui.audit.val.EXPORT_B1_EXIT",
  CUSTOMS_DECLARATION: "ui.audit.val.CUSTOMS_DECLARATION",
  BILL_OF_LADING: "ui.audit.val.BILL_OF_LADING",
  CERTIFICATE_OF_ORIGIN: "ui.audit.val.CERTIFICATE_OF_ORIGIN",
  COMMERCIAL_INVOICE: "ui.audit.val.COMMERCIAL_INVOICE",
  PACKING_LIST: "ui.audit.val.PACKING_LIST",
  QUARANTINE_CERTIFICATE: "ui.audit.val.QUARANTINE_CERTIFICATE",
  VEHICLE_REGISTRATION: "ui.audit.val.VEHICLE_REGISTRATION",
  DRIVER_LICENSE: "ui.audit.val.DRIVER_LICENSE",
  PAYMENT_RECEIPT: "ui.audit.val.PAYMENT_RECEIPT",
  // Đèn tín hiệu cổng
  GREEN: "ui.audit.val.GREEN",
  RED: "ui.audit.val.RED",
  YELLOW: "ui.audit.val.YELLOW",
  // Thu phí & Đối soát
  SUPPLEMENT_PAYMENT: "ui.audit.val.SUPPLEMENT_PAYMENT",
  CANCEL_PAYMENT: "ui.audit.val.CANCEL_PAYMENT",
  MERGE_PAYMENT: "ui.audit.val.MERGE_PAYMENT",
  MERGE_INVOICE: "ui.audit.val.MERGE_INVOICE",
  TAX: "ui.audit.val.TAX",
  "ECONOMIC-ZONE": "ui.audit.val.ECONOMIC_ZONE",
  ECONOMIC_ZONE: "ui.audit.val.ECONOMIC_ZONE",
  INFRASTRUCTURE: "ui.audit.val.INFRASTRUCTURE",
  PARKING: "ui.audit.val.PARKING",
  SERVICE: "ui.audit.val.SERVICE",
  VEHICLE: "ui.audit.val.VEHICLE",
  CONTAINER: "ui.audit.val.CONTAINER_UNIT",
};

/** Khóa dịch thân thiện cho mã quyền hệ thống (SG-142) */
const PERMISSION_LABEL_KEYS: Record<string, { vi: string; en: string }> = {
  "dossier.view": { vi: "Xem hồ sơ", en: "View dossier" },
  "dossier.create": { vi: "Tạo hồ sơ", en: "Create dossier" },
  "dossier.update": { vi: "Cập nhật hồ sơ", en: "Update dossier" },
  "dossier.delete": { vi: "Xóa hồ sơ", en: "Delete dossier" },
  "dossier.approve": { vi: "Duyệt hồ sơ", en: "Approve dossier" },
  "dossier.export": { vi: "Xuất hồ sơ", en: "Export dossier" },
  "workflow.view": { vi: "Xem xử lý liên ngành", en: "View inter-agency" },
  "workflow.create": { vi: "Tạo xử lý liên ngành", en: "Create inter-agency" },
  "workflow.update": {
    vi: "Cập nhật xử lý liên ngành",
    en: "Update inter-agency",
  },
  "workflow.approve": {
    vi: "Duyệt xử lý liên ngành",
    en: "Approve inter-agency",
  },
  "queue.view": { vi: "Xem hàng đợi", en: "View queue" },
  "queue.create": { vi: "Thêm hàng đợi", en: "Add to queue" },
  "dispatch.view": { vi: "Xem điều phối", en: "View dispatch" },
  "dispatch.create": { vi: "Gán điều phối", en: "Assign dispatch" },
  "dispatch.update": { vi: "Cập nhật điều phối", en: "Update dispatch" },
  "dispatch.delete": { vi: "Hủy điều phối", en: "Remove dispatch" },
  "yard.view": { vi: "Xem quản lý bãi", en: "View yard" },
  "yard.create": { vi: "Tạo bãi", en: "Create yard" },
  "yard.update": { vi: "Cập nhật bãi", en: "Update yard" },
  "yard.delete": { vi: "Xóa bãi", en: "Delete yard" },
  "yard.approve": { vi: "Duyệt bãi", en: "Approve yard" },
  "yard.export": { vi: "Xuất dữ liệu bãi", en: "Export yard" },
  "dispatch.export": { vi: "Xuất dữ liệu điều phối", en: "Export dispatch" },
  "queue.update": { vi: "Cập nhật hàng đợi", en: "Update queue" },
  "queue.delete": { vi: "Hủy hàng đợi", en: "Delete queue" },
  "queue.export": { vi: "Xuất dữ liệu hàng đợi", en: "Export queue" },
  "workflow.delete": { vi: "Hủy xử lý liên ngành", en: "Delete inter-agency" },
  "workflow.export": {
    vi: "Xuất dữ liệu liên ngành",
    en: "Export inter-agency",
  },
  "fee.view": { vi: "Xem thu phí", en: "View fee" },
  "fee.create": { vi: "Tạo biểu phí", en: "Create fee" },
  "fee.update": { vi: "Cập nhật biểu phí", en: "Update fee" },
  "fee.approve": { vi: "Xác nhận thu phí", en: "Approve fee" },
  "fee.export": { vi: "Xuất dữ liệu phí", en: "Export fee" },
  "catalog.view": { vi: "Xem danh mục", en: "View catalog" },
  "catalog.create": { vi: "Tạo danh mục", en: "Create catalog" },
  "catalog.update": { vi: "Cập nhật danh mục", en: "Update catalog" },
  "catalog.delete": { vi: "Xóa danh mục", en: "Delete catalog" },
  "catalog.export": { vi: "Xuất dữ liệu danh mục", en: "Export catalog" },
  "report.view": { vi: "Xem báo cáo", en: "View report" },
  "report.create": { vi: "Tạo báo cáo", en: "Create report" },
  "report.update": { vi: "Cập nhật báo cáo", en: "Update report" },
  "report.delete": { vi: "Xóa báo cáo", en: "Delete report" },
  "report.approve": { vi: "Duyệt báo cáo", en: "Approve report" },
  "report.export": { vi: "Xuất báo cáo", en: "Export report" },
  "gate.view": { vi: "Xem cổng", en: "View gate" },
  "gate.create": { vi: "Thêm cổng", en: "Create gate" },
  "gate.update": { vi: "Cập nhật cổng", en: "Update gate" },
  "gate.delete": { vi: "Xóa cổng", en: "Delete gate" },
  "gate.export": { vi: "Xuất dữ liệu cổng", en: "Export gate" },
  "gate.approve": { vi: "Duyệt cổng", en: "Approve gate" },
  "dispatch.approve": { vi: "Duyệt điều phối", en: "Approve dispatch" },
  "queue.approve": { vi: "Duyệt hàng đợi", en: "Approve queue" },
  "fee.delete": { vi: "Xóa phí", en: "Delete fee" },
  "system.view": { vi: "Xem quản trị hệ thống", en: "View system" },
  "system.create": { vi: "Tạo tài khoản / vai trò", en: "Create user/role" },
  "system.update": { vi: "Cập nhật hệ thống", en: "Update system" },
  "system.delete": { vi: "Xóa dữ liệu hệ thống", en: "Delete system" },
  "user.view": { vi: "Xem quản lý người dùng", en: "View users" },
  "user.create": { vi: "Tạo người dùng", en: "Create user" },
  "user.update": { vi: "Cập nhật người dùng", en: "Update user" },
  "user.delete": { vi: "Xóa người dùng", en: "Delete user" },
  "role.view": { vi: "Xem phân quyền vai trò", en: "View roles" },
  "role.create": { vi: "Tạo vai trò", en: "Create role" },
  "role.update": { vi: "Cập nhật vai trò", en: "Update role" },
  "role.delete": { vi: "Xóa vai trò", en: "Delete role" },
};

function toSafeString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}

/** Trạng thái bộ lọc do người dùng gõ trước khi bấm "Lọc". Tách khỏi tham số đã áp dụng. */
interface FilterForm {
  actor: string;
  action: string;
  actions?: string[];
  actionQuery?: string;
  /** Mã phân hệ (rỗng = mọi phân hệ) — lọc ở tầng máy chủ (BUG-051). */
  module: string;
  target: string;
  from: string;
  to: string;
}

const EMPTY_FILTER: FilterForm = {
  actor: "",
  action: "",
  actions: [],
  actionQuery: "",
  module: "",
  target: "",
  from: "",
  to: "",
};
const PAGE_SIZES = [10, 20, 50, 100];

/** Nhóm màu pill theo mã hành động (ASCII, tập đóng, khớp mã BE thật) — mã lạ rơi về 'update'. */
const ACTION_TONES: Record<string, string> = {
  // Tạo mới / gửi / gán / tải lên
  DECLARATION_CREATE: "create",
  DECLARATION_COPY: "create",
  DECLARATION_SUBMIT: "create",
  DECLARATION_ATTACH_DOCUMENTS: "create",
  ATTACHMENT_UPLOAD: "create",
  DISPATCH_ASSIGN: "create",
  DISPATCH_CALL_NEXT: "create",
  DISPATCH_CALL: "create",
  DISPATCH_CALL_VEHICLE: "create",
  CALL_VEHICLE: "create",
  FEE_RULE_CREATE: "create",
  FEE_TRANSACTION_RECORD: "create",
  FEE_TRANSACTION_COLLECT: "create",
  USER_REGISTER: "create",
  USER_CREATE: "create",
  USER_APPROVE: "create",
  CREATE_USER: "create",
  UNLOCK_USER: "create",
  LOCK_USER: "create",
  UPDATE_USER: "update",
  ROLE_CREATE: "create",
  CATALOG_TYPE_CREATE: "create",
  CATALOG_ITEM_CREATE: "create",
  GATE_EVENT_ALLOW: "create",
  // Hủy / xóa / gỡ / khóa / bỏ vị trí / từ chối
  DECLARATION_SUBMIT_REJECTED: "delete",
  DECLARATION_CANCEL: "delete",
  DECLARATION_DELETE: "delete",
  DECLARATION_DETACH_DOCUMENT: "delete",
  ATTACHMENT_DELETE: "delete",
  DISPATCH_RELEASE: "delete",
  GATE_EVENT_DENY: "delete",
  USER_DELETE: "delete",
  USER_LOCK: "delete",
  ROLE_DELETE: "delete",
  ROLE_LOCK: "delete",
  CATALOG_TYPE_DELETE: "delete",
  CATALOG_ITEM_DELETE: "delete",
  CATALOG_ITEM_LOCK: "delete",
  AUTH_LOGIN: "login",
  AUTH_LOGOUT: "login",
  AUTH_REFRESH: "login",
  REPORT_EXPORT: "export",
  VIEW_DOSSIER_DETAIL: "export",
  ATTACHMENT_DOWNLOAD: "export",
};

const SYSTEM_SETTING_LABELS: Record<string, MessageKey> = {
  "yard.maxStorageHours": "ui.systemConfig.fieldYardHours",
  "fee.paymentDeadlineHours": "ui.systemConfig.fieldFeeHours",
  "fee.enabled": "ui.systemConfig.fieldFeeEnabled",
};

export function resolveRouteMenuKey(rawRoute: string): MessageKey | null {
  if (!rawRoute) return null;
  const route = rawRoute.toLowerCase().trim();

  if (route.includes("dashboard") || route.includes("overview")) return "ui.menu.dashboard";
  if (route.includes("declaration") || route.includes("dossier")) return "ui.menu.declarations";
  if (route.includes("workflow") || route.includes("inter-agency")) return "ui.menu.interAgency";
  if (route.includes("dispatch") || route.includes("vehicle-confirmation")) return "ui.menu.dispatch";
  if (route.includes("gate") || route.includes("vehicles-entered-gate")) return "ui.menu.gate";
  if (route.includes("yard/config")) return "ui.menu.yardConfig";
  if (route.includes("customs-b5") || route.includes("yard-map")) return "ui.menu.yardMap";
  if (route.includes("yard")) return "ui.menu.yard";
  if (route.includes("fees/rules") || route.includes("fee-rules")) return "ui.menu.feeRules";
  if (route.includes("fees/tax") || route.includes("fee-collect")) return "ui.menu.feeCollect";
  if (route.includes("fee")) return "ui.menu.fee";
  if (route.includes("report")) return "ui.menu.reports";
  if (route.includes("catalog")) return "ui.menu.catalogs";
  if (route.includes("users") || route.includes("user")) return "ui.menu.users";
  if (route.includes("roles") || route.includes("role")) return "ui.menu.roles";
  if (route.includes("audit")) return "ui.menu.auditLog";
  if (route.includes("system-config") || route.includes("settings")) return "ui.menu.settings";
  if (route.includes("system") || route.includes("admin")) return "ui.menu.system";

  return null;
}

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    SgButtonDirective,
    SgCardComponent,
    SgComboboxComponent,
    SgDatePickerComponent,
    SgFormFieldComponent,
    SgModalComponent,
    SgPagerComponent,
    SgSelectComponent,
  ],
  template: `
    <section class="head">
      <div>
        <h1>{{ t("ui.audit.title") }}</h1>
        <p>{{ t("ui.audit.subtitle") }}</p>
      </div>
      <button
        type="button"
        sgButton="secondary"
        [disabled]="exporting()"
        (click)="exportLog()"
      >
        <mat-icon fontSet="material-icons-round">download</mat-icon
        >{{ t("ui.audit.exportLog") }}
      </button>
    </section>

    <div class="stats" [attr.title]="t('ui.audit.statNote')">
      <div class="stat">
        <div class="stat__ico" data-tone="idle">
          <mat-icon fontSet="material-icons-round">history</mat-icon>
        </div>
        <div>
          <div class="stat__num">{{ rows().length }}</div>
          <div class="stat__label">{{ t("ui.audit.statTotal") }}</div>
        </div>
      </div>
      <div class="stat">
        <div class="stat__ico" data-tone="done">
          <mat-icon fontSet="material-icons-round">check_circle</mat-icon>
        </div>
        <div>
          <div class="stat__num">{{ successCount() }}</div>
          <div class="stat__label">
            {{ t("ui.audit.statSuccess") }} ({{ successRate() }}%)
          </div>
        </div>
      </div>
      <div class="stat">
        <div class="stat__ico" data-tone="rejected">
          <mat-icon fontSet="material-icons-round">cancel</mat-icon>
        </div>
        <div>
          <div class="stat__num">{{ failureCount() }}</div>
          <div class="stat__label">{{ t("ui.audit.statFailure") }}</div>
        </div>
      </div>
    </div>

    <sg-card
      class="filter-card"
      [title]="t('ui.common.filter')"
      [overflowVisible]="true"
    >
      <div class="filters">
        <sg-form-field [label]="t('ui.audit.filterActor')">
          <input
            type="text"
            name="actor"
            [attr.aria-label]="t('ui.audit.filterActor')"
            [(ngModel)]="form.actor"
            (keyup.enter)="applyFilters()"
          />
        </sg-form-field>
        <sg-form-field [label]="t('ui.audit.filterAction')">
          <sg-combobox
            [ariaLabel]="t('ui.audit.filterAction')"
            [placeholder]="t('ui.audit.actionAll')"
            [searchPlaceholder]="t('ui.audit.searchActionPlaceholder')"
            [options]="actionOptions()"
            [(ngModel)]="form.action"
            (querySubmit)="onActionQuerySubmit($event)"
            (valueChange)="onActionChange($event)"
          />
        </sg-form-field>
        <sg-form-field [label]="t('ui.audit.filterModule')">
          <sg-select
            [ariaLabel]="t('ui.audit.filterModule')"
            [placeholder]="t('ui.audit.moduleAll')"
            [options]="moduleOptions()"
            [(ngModel)]="form.module"
            (valueChange)="applyFilters()"
          />
        </sg-form-field>
        <sg-form-field [label]="t('ui.audit.filterTarget')">
          <input
            type="text"
            name="target"
            [attr.aria-label]="t('ui.audit.filterTarget')"
            [(ngModel)]="form.target"
            (keyup.enter)="applyFilters()"
          />
        </sg-form-field>
        <sg-form-field [label]="t('ui.audit.filterFrom')">
          <sg-date-picker
            [value]="form.from"
            [(ngModel)]="form.from"
            (ngModelChange)="applyFilters()"
            (valueChange)="applyFilters()"
            [ariaLabel]="t('ui.audit.filterFrom')"
          />
        </sg-form-field>
        <sg-form-field [label]="t('ui.audit.filterTo')">
          <sg-date-picker
            [value]="form.to"
            [(ngModel)]="form.to"
            (ngModelChange)="applyFilters()"
            (valueChange)="applyFilters()"
            [ariaLabel]="t('ui.audit.filterTo')"
          />
        </sg-form-field>
      </div>
      <div class="filters__actions">
        <button
          type="button"
          sgButton
          [disabled]="loading()"
          (click)="applyFilters()"
        >
          <mat-icon fontSet="material-icons-round">search</mat-icon
          >{{ t("ui.common.search") }}
        </button>
        <button
          type="button"
          sgButton="tertiary"
          [disabled]="loading()"
          (click)="resetFilters()"
        >
          {{ t("ui.common.reset") }}
        </button>
      </div>
    </sg-card>

    <sg-card [flush]="true">
      <div class="sg-scroll-x">
        <table class="grid">
          <thead>
            <tr>
              <th>{{ t("ui.audit.colTime") }}</th>
              <th>{{ t("ui.audit.colActor") }}</th>
              <th>{{ t("ui.audit.colAction") }}</th>
              <th>{{ t("ui.audit.colResult") }}</th>
              <th>{{ t("ui.audit.colTarget") }}</th>
              <th>{{ t("ui.audit.colIp") }}</th>
              <th aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr>
                <td colspan="7" class="state">
                  <mat-icon fontSet="material-icons-round"
                    >hourglass_top</mat-icon
                  >{{ t("ui.audit.loading") }}
                </td>
              </tr>
            } @else if (!rows().length) {
              <tr>
                <td colspan="7" class="state">{{ t("ui.audit.empty") }}</td>
              </tr>
            } @else {
              @for (row of rows(); track row.id) {
                <tr>
                  <td>{{ formatAt(row.at) }}</td>
                  <td>
                    <div class="actor">
                      <span class="actor__ava">{{ actorInitials(row) }}</span>
                      <span class="actor__id">
                        <span class="actor__name">{{ actorLabel(row) }}</span>
                        <span class="actor__role">{{
                          roleLabel(row.actorRole)
                        }}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      class="pill"
                      [attr.data-tone]="actionTone(row.action)"
                      >{{ actionLabel(row.action) }}</span
                    >
                  </td>
                  <td>
                    <span class="chip" [attr.data-tone]="resultTone(row)">{{
                      resultLabel(row)
                    }}</span>
                  </td>
                  <td>
                    <div class="target">
                      @if (targetRouteInfo(row); as linkInfo) {
                        <a
                          class="target-link"
                          [routerLink]="linkInfo.commands"
                          [queryParams]="linkInfo.queryParams"
                          >{{ friendlyTarget(row) }}</a
                        >
                      } @else {
                        {{ friendlyTarget(row) }}
                      }
                    </div>
                    <div class="target__module">
                      {{ moduleLabel(moduleOf(row)) }}
                    </div>
                  </td>
                  <td class="ip">{{ row.ip || "—" }}</td>
                  <td class="detail-col">
                    <button
                      type="button"
                      sgButton="tertiary"
                      size="sm"
                      iconOnly
                      [attr.aria-label]="t('ui.audit.viewDetail')"
                      [attr.title]="t('ui.audit.viewDetail')"
                      (click)="openDetail(row)"
                    >
                      <mat-icon fontSet="material-icons-round"
                        >visibility</mat-icon
                      >
                    </button>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </sg-card>

    @if (rows().length) {
      <div class="pager">
        <span class="pager__summary">{{ summary() }}</span>
        <div class="pager__controls">
          <span class="pager__label">{{ t("ui.common.display") }}</span>
          <sg-select
            class="pager__size"
            [showEmptyOption]="false"
            [ariaLabel]="t('ui.common.pageSizeAria')"
            [options]="pageSizeOptions()"
            [value]="pageSizeValue()"
            (valueChange)="changePageSize($event)"
          />
        </div>
        <sg-pager
          [page]="page()"
          [pageSize]="pageSize()"
          [total]="total()"
          [disabled]="loading()"
          (pageChange)="goToPage($event)"
        />
      </div>
    }

    @if (detail(); as row) {
      <sg-modal
        [title]="t('ui.audit.detailTitle')"
        size="xl"
        [footer]="false"
        (close)="closeDetail()"
      >
        <section class="facts-panel">
          <div class="facts-grid">
            <div class="fact-item">
              <span class="fact-item__label">{{ t("ui.audit.colTime") }}</span
              ><span class="fact-item__val">{{ formatAt(row.at) }}</span>
            </div>
            <div class="fact-item">
              <span class="fact-item__label">{{ t("ui.audit.colActor") }}</span>
              <div class="fact-item__val actor-fact">
                <span class="actor__ava actor__ava--sm">{{
                  actorInitials(row)
                }}</span>
                <div>
                  <div class="actor__name">{{ actorLabel(row) }}</div>
                  <div class="actor__role">{{ roleLabel(row.actorRole) }}</div>
                </div>
              </div>
            </div>
            <div class="fact-item">
              <span class="fact-item__label">{{ t("ui.audit.colIp") }}</span
              ><span class="fact-item__val ip">{{ row.ip || "—" }}</span>
            </div>
            <div class="fact-item">
              <span class="fact-item__label">{{ t("ui.audit.colResult") }}</span
              ><span class="fact-item__val"
                ><span class="chip" [attr.data-tone]="resultTone(row)">{{
                  resultLabel(row)
                }}</span></span
              >
            </div>
            <div class="fact-item">
              <span class="fact-item__label">{{ t("ui.audit.colAction") }}</span
              ><span class="fact-item__val"
                ><span class="pill" [attr.data-tone]="actionTone(row.action)">{{
                  actionLabel(row.action)
                }}</span></span
              >
            </div>
            <div class="fact-item">
              <span class="fact-item__label">{{ t("ui.audit.colModule") }}</span
              ><span class="fact-item__val"
                ><span class="module-badge">{{
                  moduleLabel(moduleOf(row))
                }}</span></span
              >
            </div>
            <div class="fact-item fact-item--wide">
              <span class="fact-item__label">{{
                t("ui.audit.colTarget")
              }}</span>
              <span class="fact-item__val target-code">
                @if (targetRouteInfo(row); as linkInfo) {
                  <a
                    class="target-link"
                    [routerLink]="linkInfo.commands"
                    [queryParams]="linkInfo.queryParams"
                    >{{ friendlyTarget(row) }}</a
                  >
                } @else {
                  {{ friendlyTarget(row) }}
                }
              </span>
            </div>
          </div>
        </section>

        @if (!diffRows(row).length) {
          <div class="nochange-box">
            <mat-icon fontSet="material-icons-round">info</mat-icon>
            <p class="nochange">{{ t("ui.audit.noChange") }}</p>
          </div>
        } @else {
          <div class="diffbox">
            <div class="diffbox__header">
              <div class="diffbox__titles">
                <span class="diffbox__title">{{
                  t("ui.audit.diffTitle")
                }}</span>
                @if (changedCount(row) > 0) {
                  <span class="diffbox__badge"
                    >{{ changedCount(row) }}
                    {{ t("ui.audit.diffTypeUpdated").toLowerCase() }}</span
                  >
                }
              </div>
              <div class="diffbox__filters">
                <button
                  type="button"
                  class="diff-filter-btn"
                  [class.diff-filter-btn--active]="!filterOnlyChanged()"
                  (click)="filterOnlyChanged.set(false)"
                >
                  {{
                    t("ui.audit.diffFilterAll", { count: diffRows(row).length })
                  }}
                </button>
                <button
                  type="button"
                  class="diff-filter-btn"
                  [class.diff-filter-btn--active]="filterOnlyChanged()"
                  (click)="filterOnlyChanged.set(true)"
                >
                  {{
                    t("ui.audit.diffFilterChanged", {
                      count: changedCount(row),
                    })
                  }}
                </button>
              </div>
            </div>

            <div class="diff-scroll">
              <table class="diff">
                <thead>
                  <tr>
                    <th class="diff__th-field">
                      {{ t("ui.audit.diffField") }}
                    </th>
                    <th class="diff__th-status"></th>
                    <th class="diff__th-val">{{ t("ui.audit.diffOld") }}</th>
                    <th class="diff__th-arrow" aria-hidden="true"></th>
                    <th class="diff__th-val">{{ t("ui.audit.diffNew") }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (
                    change of displayedDiffRows(row);
                    track change.rawField
                  ) {
                    <tr
                      [class.diff__row--changed]="change.changed"
                      [class.diff__row--unchanged]="!change.changed"
                    >
                      <td class="diff__field">
                        <strong>{{ change.field }}</strong>
                      </td>
                      <td class="diff__type">
                        <span
                          class="diff-badge"
                          [attr.data-type]="diffType(change)"
                          >{{ diffTypeLabel(change) }}</span
                        >
                      </td>
                      <td
                        class="diff__old"
                        [class.diff__old--changed]="change.changed"
                      >
                        <div
                          class="diff__cell-val"
                          [class.diff__cell-val--json]="isJson(change.before)"
                        >
                          @if (change.oldLink) {
                            <a
                              class="target-link"
                              [routerLink]="change.oldLink"
                              >{{ change.before }}</a
                            >
                          } @else {
                            {{ change.before }}
                          }
                        </div>
                      </td>
                      <td class="diff__arrow" aria-hidden="true">
                        <mat-icon fontSet="material-icons-round">east</mat-icon>
                      </td>
                      <td
                        class="diff__new"
                        [class.diff__new--changed]="change.changed"
                      >
                        <div
                          class="diff__cell-val"
                          [class.diff__cell-val--json]="isJson(change.after)"
                        >
                          @if (change.link) {
                            <a class="target-link" [routerLink]="change.link">{{
                              change.after
                            }}</a>
                          } @else {
                            {{ change.after }}
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </sg-modal>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --blue-600: #2f6fed;
        --blue-50: #eef3fe;
        --green-600: #1a9c6b;
        --green-50: #e9f8f1;
        --red-500: #e5484d;
        --red-50: #fdeced;
        --ink-900: #152040;
      }
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--sg-space-3);
        margin-bottom: var(--sg-space-3);
      }
      .head h1 {
        margin: 0;
        color: var(--ink-900);
      }
      .head p {
        margin: var(--sg-space-1) 0 0;
        color: var(--sg-text-muted);
      }
      .head button {
        flex: 0 0 auto;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--sg-space-3);
        margin: var(--sg-space-3) 0;
      }
      .stat {
        display: flex;
        align-items: center;
        gap: var(--sg-space-3);
        padding: var(--sg-space-3) var(--sg-space-4);
        background: var(--sg-bg-surface);
        border: 1px solid var(--sg-border);
        border-radius: 14px;
        box-shadow: var(--sg-shadow-card);
      }
      .stat__ico {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 11px;
        flex-shrink: 0;
        background: var(--blue-50);
        color: var(--blue-600);
      }
      .stat__ico[data-tone="done"] {
        background: var(--green-50);
        color: var(--green-600);
      }
      .stat__ico[data-tone="rejected"] {
        background: var(--red-50);
        color: var(--red-500);
      }
      .stat__ico mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
      .stat__num {
        font-size: var(--sg-h3-size);
        font-weight: 700;
        line-height: 1.2;
        color: var(--ink-900);
      }
      .stat__label {
        font-size: var(--sg-small-size);
        color: var(--sg-text-muted);
      }
      @media (max-width: 700px) {
        .stats {
          grid-template-columns: 1fr;
        }
      }

      .filter-card {
        position: relative;
        z-index: 10;
      }
      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--sg-space-3);
        position: relative;
        z-index: 10;
      }
      .filters__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sg-space-2);
        margin-top: var(--sg-space-3);
      }

      .grid {
        width: 100%;
        min-width: 900px;
        border-collapse: collapse;
        background: var(--sg-bg-surface);
      }
      .grid th,
      .grid td {
        padding: var(--sg-space-2) var(--sg-space-3);
        border-bottom: 1px solid var(--sg-border);
        text-align: left;
        vertical-align: middle;
      }
      .grid th {
        background: var(--sg-bg-subtle);
        font-size: var(--sg-small-size);
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

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
        white-space: nowrap;
      }
      .chip[data-tone="done"] {
        background: var(--sg-state-done-soft);
        color: var(--sg-state-done);
      }
      .chip[data-tone="rejected"] {
        background: var(--sg-state-rejected-soft);
        color: var(--sg-state-rejected);
      }

      .actor {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
      }
      .actor__ava {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--sg-primary);
        color: var(--sg-text-invert);
        font-size: var(--sg-caption-size);
        font-weight: 700;
      }
      .actor__id {
        display: grid;
      }
      .actor__name {
        font-weight: 600;
      }
      .actor__role {
        font-size: var(--sg-caption-size);
        color: var(--sg-text-muted);
      }
      .ip {
        font-family: var(--sg-font-mono, monospace);
        color: var(--sg-text-muted);
      }
      .detail-col {
        width: 60px;
        text-align: center;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-state-idle-soft);
        color: var(--sg-state-idle);
        font-size: var(--sg-small-size);
        font-weight: 700;
        white-space: nowrap;
      }
      .pill[data-tone="create"] {
        background: var(--sg-primary-soft);
        color: var(--sg-primary-900);
      }
      .pill[data-tone="update"] {
        background: var(--sg-warning-soft);
        color: var(--sg-warning-ink);
      }
      .pill[data-tone="delete"] {
        background: var(--sg-state-rejected-soft);
        color: var(--sg-state-rejected);
      }
      .pill[data-tone="login"] {
        background: var(--sg-state-done-soft);
        color: var(--sg-state-done);
      }
      .pill[data-tone="export"] {
        background: var(--sg-info-soft);
        color: var(--sg-info-ink);
      }

      .target {
        font-weight: 600;
      }
      .target__module {
        margin-top: 2px;
        color: var(--sg-text-muted);
        font-size: var(--sg-caption-size);
      }
      .target-link {
        color: var(--sg-primary);
        font-weight: 600;
        text-decoration: none;
      }
      .target-link:hover {
        text-decoration: underline;
      }

      .state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--sg-space-2);
        padding: var(--sg-space-8);
        color: var(--sg-text-muted);
      }

      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-3);
        margin-top: var(--sg-space-3);
      }
      .pager__summary {
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }
      .pager__controls {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .pager__label {
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
        white-space: nowrap;
      }
      .pager__size {
        width: 72px;
      }

      .facts-panel {
        background: var(--sg-bg-subtle);
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius);
        padding: var(--sg-space-3);
        margin-bottom: var(--sg-space-4);
      }
      .facts-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--sg-space-3);
      }
      .fact-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .fact-item--wide {
        grid-column: span 2;
      }
      .fact-item__label {
        font-size: var(--sg-caption-size);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        color: var(--sg-text-muted);
      }
      .fact-item__val {
        font-size: var(--sg-small-size);
        font-weight: 500;
        color: var(--ink-900);
        overflow-wrap: anywhere;
      }
      .actor-fact {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
      }
      .actor__ava--sm {
        width: 26px;
        height: 26px;
        font-size: 11px;
      }
      .target-code {
        font-family: var(--sg-font-mono, monospace);
        font-weight: 600;
      }
      .module-badge {
        display: inline-flex;
        align-items: center;
        height: 22px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--blue-50);
        color: var(--blue-600);
        font-size: var(--sg-caption-size);
        font-weight: 600;
        white-space: nowrap;
      }
      .note-val {
        white-space: pre-line;
        word-break: break-word;
        color: var(--ink-900);
      }

      .nochange-box {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
        padding: var(--sg-space-4);
        background: var(--sg-bg-subtle);
        border-radius: var(--sg-radius);
        border: 1px dashed var(--sg-border);
        color: var(--sg-text-muted);
      }
      .nochange-box mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .nochange {
        margin: 0;
        color: var(--sg-text-muted);
        font-size: var(--sg-small-size);
      }

      .diffbox {
        border: 1px solid var(--sg-border);
        border-radius: var(--sg-radius);
        background: var(--sg-bg-surface);
        overflow: hidden;
        box-shadow: var(--sg-shadow-card);
      }
      .diffbox__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sg-space-2);
        padding: var(--sg-space-2) var(--sg-space-3);
        background: var(--sg-bg-subtle);
        border-bottom: 1px solid var(--sg-border);
        flex-wrap: wrap;
      }
      .diffbox__titles {
        display: flex;
        align-items: center;
        gap: var(--sg-space-2);
      }
      .diffbox__title {
        margin: 0;
        font-size: var(--sg-caption-size);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--ink-900);
      }
      .diffbox__badge {
        display: inline-flex;
        align-items: center;
        height: 20px;
        padding: 0 var(--sg-space-2);
        border-radius: var(--sg-radius-pill);
        background: var(--sg-warning-soft);
        color: var(--sg-warning-ink);
        font-size: var(--sg-caption-size);
        font-weight: 600;
        white-space: nowrap;
      }
      .diffbox__filters {
        display: inline-flex;
        gap: 4px;
      }
      .diff-filter-btn {
        border: 1px solid var(--sg-border);
        background: var(--sg-bg-surface);
        color: var(--sg-text-muted);
        border-radius: var(--sg-radius-sm);
        padding: 2px var(--sg-space-2);
        font-size: var(--sg-caption-size);
        cursor: pointer;
      }
      .diff-filter-btn--active {
        background: var(--sg-primary-soft);
        color: var(--sg-primary-900);
        border-color: var(--sg-primary);
        font-weight: 600;
      }

      .diff-scroll {
        overflow-x: auto;
        max-height: 420px;
      }
      .diff {
        width: 100%;
        min-width: 620px;
        border-collapse: collapse;
        font-size: var(--sg-small-size);
      }
      .diff th,
      .diff td {
        padding: var(--sg-space-2) var(--sg-space-3);
        border-bottom: 1px solid var(--sg-border);
        text-align: left;
        vertical-align: top;
      }
      .diff th {
        background: var(--sg-bg-subtle);
        font-size: var(--sg-caption-size);
        text-transform: uppercase;
        letter-spacing: 0.02em;
        color: var(--sg-text-muted);
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .diff__th-field {
        width: 25%;
      }
      .diff__th-status {
        width: 110px;
        min-width: 100px;
        white-space: nowrap;
      }
      .diff__th-val {
        width: 33%;
      }
      .diff__th-arrow {
        width: 32px;
        text-align: center;
      }

      .diff__field strong {
        color: var(--ink-900);
      }
      .diff__type {
        white-space: nowrap;
        vertical-align: middle;
      }
      .diff-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        height: 22px;
        padding: 0 var(--sg-space-2, 8px);
        border-radius: var(--sg-radius-pill);
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        text-align: center;
        flex-shrink: 0;
      }
      .diff-badge[data-type="added"] {
        background: var(--green-50);
        color: var(--green-600);
      }
      .diff-badge[data-type="removed"] {
        background: var(--red-50);
        color: var(--red-500);
      }
      .diff-badge[data-type="updated"] {
        background: var(--sg-warning-soft);
        color: var(--sg-warning-ink);
      }
      .diff-badge[data-type="unchanged"] {
        background: var(--sg-bg-subtle);
        color: var(--sg-text-muted);
      }

      .diff__cell-val {
        font-size: var(--sg-small-size);
        line-height: 1.4;
        color: var(--ink-900);
        overflow-wrap: anywhere;
        white-space: pre-line;
      }
      .diff__cell-val--json {
        font-family: var(--sg-font-mono, monospace);
        font-size: var(--sg-caption-size);
        white-space: pre-wrap;
        background: var(--sg-bg-subtle);
        padding: 4px 6px;
        border-radius: 4px;
      }
      .diff__arrow {
        text-align: center;
        color: var(--sg-text-muted);
        vertical-align: middle;
      }
      .diff__arrow mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        vertical-align: middle;
      }
      .diff__row--changed {
        background: rgba(47, 111, 237, 0.02);
      }
      .diff__old--changed .diff__cell-val {
        color: var(--red-500);
      }
      .diff__new--changed .diff__cell-val {
        color: var(--green-600);
        font-weight: 500;
      }
    `,
  ],
})
export class AuditLogPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly appMessages = inject(AppMessageService);
  private readonly i18n = inject(I18nService);

  private loadSub?: Subscription;

  protected readonly t = this.i18n.t;

  protected readonly rows = signal<AuditLogRow[]>([]);
  protected readonly total = signal<number>(0);
  protected readonly page = signal<number>(1);
  protected readonly pageSize = signal<number>(10);
  protected readonly loading = signal<boolean>(false);
  protected readonly exporting = signal<boolean>(false);
  protected readonly detail = signal<AuditLogRow | null>(null);
  protected readonly filterOnlyChanged = signal(false);

  protected form: FilterForm = { ...EMPTY_FILTER };
  private applied: FilterForm = { ...EMPTY_FILTER };

  protected readonly successCount = computed(
    () => this.rows().filter((r) => r.result === "SUCCESS").length,
  );
  protected readonly failureCount = computed(
    () => this.rows().filter((r) => r.result !== "SUCCESS").length,
  );
  protected readonly successRate = computed(() => {
    const list = this.rows();
    if (!list.length) return 0;
    return Math.round((this.successCount() / list.length) * 100);
  });

  protected readonly pageSizeValue = computed(() => String(this.pageSize()));
  protected readonly pageSizeOptions = computed<SgSelectOption[]>(() =>
    PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) })),
  );

  protected readonly actionOptions = computed<SgSelectOption[]>(() => {
    const _locale = this.i18n.locale();
    const seen = new Set<string>();
    const options: SgSelectOption[] = [];
    for (const code of AUDIT_ACTION_CODES) {
      const label = this.actionLabel(code);
      if (!seen.has(code) && !seen.has(label)) {
        seen.add(code);
        seen.add(label);
        options.push({ value: code, label });
      }
    }
    return options;
  });

  protected readonly moduleOptions = computed<SgSelectOption[]>(() =>
    AUDIT_MODULE_CODES.map((code) => ({
      value: code,
      label: this.t(AUDIT_MODULE_LABEL_KEYS[code]),
    })),
  );

  protected readonly summary = computed(() => {
    const total = this.total();
    if (!total) return this.t("ui.audit.summaryEmpty");
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.page() * this.pageSize(), total);
    return this.t("ui.audit.summary", { start, end, total });
  });

  ngOnInit(): void {
    this.load();
  }

  protected onActionChange(code: string): void {
    this.form.action = code;
    this.form.actions = [];
    this.form.actionQuery = "";
    this.applyFilters();
  }

  protected onActionQuerySubmit(event: SgComboboxSubmitEvent): void {
    if (event.matchedValues.length === 1) {
      this.form.action = event.matchedValues[0];
      this.form.actions = [];
      this.form.actionQuery = "";
    } else if (event.matchedValues.length > 1) {
      this.form.action = "";
      this.form.actions = event.matchedValues;
      this.form.actionQuery = event.query;
    } else if (event.query) {
      this.form.action = event.query;
      this.form.actions = [];
      this.form.actionQuery = event.query;
    } else {
      this.form.action = "";
      this.form.actions = [];
      this.form.actionQuery = "";
    }
    this.applyFilters();
  }

  protected exportLog(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    const filters: AuditLogFilters = {
      actor: this.applied.actor.trim() || undefined,
      action: this.applied.action.trim() || undefined,
      actions: this.applied.actions?.length ? this.applied.actions : undefined,
      module: (this.applied.module as AuditModuleCode) || undefined,
      target: this.applied.target.trim() || undefined,
      from: this.applied.from || undefined,
      to: this.applied.to || undefined,
    };

    void exportAndLogFile(
      this.api.exportAuditLogs(filters),
      this.exportFileName(),
      this.api,
      {
        action: "REPORT_EXPORT",
        targetType: "AUDIT_LOG",
        targetId: "audit-logs",
        reportName: this.t("ui.report.titleAuditLogs"),
        filter: filters as Record<string, unknown>,
      },
      () => this.appMessages.showKey("ui.audit.exportCancelled", "info"),
    )
      .then((res) => {
        if (res === "SUCCESS") {
          this.appMessages.showKey("ui.audit.exported", "success");
        } else if (res === "FAILED") {
          this.appMessages.showKey("ui.audit.exportFailed", "error");
        }
      })
      .catch((err: unknown) => {
        this.appMessages.showApiError(err, "ui.audit.exportFailed");
      })
      .finally(() => {
        this.exporting.set(false);
      });
  }

  private exportFileName(): string {
    const now = new Date();
    const pad = (v: number) => String(v).padStart(2, "0");
    return `nhat-ky-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
  }

  protected applyFilters(): void {
    if (this.form.from && this.form.to && this.form.from > this.form.to) {
      this.appMessages.showKey("ui.audit.invalidDateRange", "error");
      return;
    }
    this.applied = {
      ...this.form,
      actions: this.form.actions ? [...this.form.actions] : [],
    };
    this.page.set(1);
    this.load();
  }

  protected resetFilters(): void {
    this.form = { ...EMPTY_FILTER };
    this.applied = { ...EMPTY_FILTER };
    this.page.set(1);
    this.load();
  }

  protected goToPage(next: number): void {
    if (next === this.page()) return;
    this.page.set(next);
    this.load();
  }

  protected changePageSize(v: string): void {
    const next = Number(v) || 10;
    if (next === this.pageSize()) return;
    this.pageSize.set(next);
    this.page.set(1);
    this.load();
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }

  private load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.loadSub = this.api.getAuditLogs(this.buildFilters()).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.rows.set(res?.items ?? []);
        this.total.set(res?.total ?? 0);
      },
      error: (err) => {
        this.loading.set(false);
        this.rows.set([]);
        this.total.set(0);
        this.appMessages.showApiError(err, "ui.audit.loadFailed");
      },
    });
  }

  private buildFilters(): AuditLogFilters {
    return {
      actor: this.applied.actor.trim() || undefined,
      action: this.applied.action.trim() || undefined,
      actions: this.applied.actions?.length ? this.applied.actions : undefined,
      module: (this.applied.module as AuditModuleCode) || undefined,
      target: this.applied.target.trim() || undefined,
      from: this.applied.from || undefined,
      to: this.applied.to || undefined,
      page: this.page(),
      pageSize: this.pageSize(),
    };
  }

  protected openDetail(row: AuditLogRow): void {
    this.filterOnlyChanged.set(false);
    this.detail.set(row);
  }

  protected closeDetail(): void {
    this.detail.set(null);
  }

  protected changedCount(row: AuditLogRow): number {
    return this.diffRows(row).filter((item) => item.changed).length;
  }

  protected displayedDiffRows(
    row: AuditLogRow,
  ): {
    field: string;
    rawField: string;
    before: string;
    after: string;
    changed: boolean;
    link?: string[];
    oldLink?: string[];
  }[] {
    const all = this.diffRows(row);
    const sorted = [...all].sort((a, b) => {
      if (a.changed !== b.changed) return a.changed ? -1 : 1;
      return a.field.localeCompare(b.field);
    });
    return this.filterOnlyChanged() ? sorted.filter((i) => i.changed) : sorted;
  }

  protected formatAt(at: string): string {
    return formatDateTime(at);
  }

  protected actorLabel(row: AuditLogRow): string {
    return row.actorUsername || this.t("ui.audit.anonymous");
  }

  protected roleLabel(role?: string | null): string {
    return actorRoleLabel(role, this.t) || "—";
  }

  protected actorInitials(row: AuditLogRow): string {
    return (row.actorUsername || "").trim().slice(0, 2).toUpperCase() || "?";
  }

  protected actionTone(action: string): string {
    return ACTION_TONES[action] ?? "update";
  }

  protected actionLabel(action: string): string {
    if (!action) return "—";
    const key = `ui.audit.${action}`;
    if (this.i18n.has(key)) {
      return this.i18n.t(key as MessageKey);
    }
    const upper = action.toUpperCase();
    const fallbackKey = `ui.audit.${upper}`;
    if (this.i18n.has(fallbackKey)) {
      return this.i18n.t(fallbackKey as MessageKey);
    }
    return action;
  }

  protected friendlyTarget(row: AuditLogRow): string {
    if (!row) return "—";
    const type = (row.targetType || "").toUpperCase();
    const after = row.after || {};
    const before = row.before || {};

    const isUuid = (val?: string | null): boolean =>
      Boolean(
        val &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          val.trim(),
        ),
      );

    // Trích xuất tên hiển thị nghiệp vụ từ payload after / before / targetId
    const extractName = (): string | undefined => {
      // Đối với hành động sao chép hồ sơ (DECLARATION_COPY), đối tượng hiển thị là hồ sơ gốc được chọn để sao chép (SG-233)
      if (row.action === "DECLARATION_COPY") {
        if (
          typeof after["sourceCode"] === "string" &&
          after["sourceCode"].trim() &&
          !isUuid(after["sourceCode"])
        ) {
          return after["sourceCode"].trim();
        }
      }

      // Đối với Hồ sơ (DECLARATION / DOSSIER), ưu tiên mã hồ sơ (dossierCode / code) trước
      const candidateFields =
        type === "DECLARATION" || type === "DOSSIER"
          ? ["dossierCode", "code", "plateNumber"]
          : [
              "originalName",
              "fileName",
              "reportName",
              "displayName",
              "fullName",
              "username",
              "name",
              "title",
              "ruleName",
              "dossierCode",
              "code",
              "laneCode",
              "yardCode",
              "key",
            ];

      for (const field of candidateFields) {
        if (
          typeof after[field] === "string" &&
          after[field].trim() &&
          !isUuid(after[field])
        ) {
          let val = after[field].trim();
          if (
            field === "originalName" ||
            field === "fileName" ||
            field === "name"
          )
            val = val.replace(/;.*$/, "").trim();
          return val;
        }
        if (
          typeof before[field] === "string" &&
          before[field].trim() &&
          !isUuid(before[field])
        ) {
          let val = before[field].trim();
          if (
            field === "originalName" ||
            field === "fileName" ||
            field === "name"
          )
            val = val.replace(/;.*$/, "").trim();
          return val;
        }
      }

      if (row.targetId && !isUuid(row.targetId)) {
        let val = row.targetId.trim();
        val = val.replace(/;.*$/, "").trim();
        return val;
      }

      return undefined;
    };

    const businessName = extractName();
    const typeKey = TARGET_TYPE_LABEL_KEYS[type];
    const typeLabel = typeKey
      ? this.t(typeKey)
      : type || this.t("ui.audit.moduleOther");

    // 1. Đối tượng Nhật ký kiểm toán / thao tác
    if (type === "AUDIT_LOG") {
      return typeLabel;
    }

    // 2. Đối tượng Hồ sơ
    if (type === "DECLARATION" || type === "DOSSIER") {
      if (businessName) {
        return `${this.t("ui.audit.dossierPrefix")} ${businessName}`;
      }
      if (row.targetId) {
        return isUuid(row.targetId)
          ? `${this.t("ui.audit.dossierPrefix")} #${row.targetId.slice(0, 8)}`
          : `${this.t("ui.audit.dossierPrefix")} ${row.targetId}`;
      }
      return this.t("ui.audit.dossierPrefix");
    }

    // 3. Đối tượng Tài khoản
    if (type === "USER") {
      if (businessName) {
        return `${this.t("ui.audit.userPrefix")} ${businessName}`;
      }
      if (row.actorUsername && !isUuid(row.actorUsername)) {
        return `${this.t("ui.audit.userPrefix")} ${row.actorUsername}`;
      }
      return this.t("ui.audit.userPrefix");
    }

    // 4. Đối tượng Cấu hình hệ thống (tra nhãn tham số tiếng Việt thay vì in mã thô)
    if (
      type === "SYSTEM_SETTING" ||
      type === "SYSTEM_SETTINGS" ||
      type === "SYSTEM_CONFIG" ||
      type === "CONFIG"
    ) {
      const settingKey = businessName || row.targetId;
      if (settingKey && SYSTEM_SETTING_LABELS[settingKey]) {
        return `${typeLabel} · ${this.t(SYSTEM_SETTING_LABELS[settingKey])}`;
      }
      if (businessName) {
        return `${typeLabel} · ${businessName}`;
      }
      return typeLabel;
    }

    // 5. Đối tượng Báo cáo (tra tên báo cáo thân thiện)
    const REPORT_NAME_LABELS: Record<string, string> = {
      "dossier-throughput": this.t("ui.report.titleDossierThroughput"),
      "agency-processing-time": this.t("ui.report.titleAgencyTime"),
      "agency-decision": this.t("ui.report.titleAgencyDecision"),
      "yard-occupancy": this.t("ui.report.titleYardOccupancy"),
      "audit-logs": this.t("ui.report.titleAuditLogs"),
    };
    if (type === "REPORT") {
      const reportKey = businessName || row.targetId;
      if (reportKey && REPORT_NAME_LABELS[reportKey]) {
        return `${typeLabel} · ${REPORT_NAME_LABELS[reportKey]}`;
      }
      if (businessName) {
        return `${typeLabel} · ${businessName}`;
      }
      return typeLabel;
    }

    if (businessName) {
      return `${typeLabel} · ${businessName}`;
    }

    return typeLabel;
  }

  protected targetRouteInfo(row: AuditLogRow): {
    commands: string[];
    queryParams?: Record<string, string>;
  } | null {
    if (!row) return null;
    const type = (row.targetType || "").toUpperCase();
    const action = (row.action || "").toUpperCase();

    // 1. Hồ sơ / Tờ khai
    if (type === "DECLARATION" || type === "DOSSIER") {
      if (action.includes("DELETE")) return null;
      const id =
        row.targetId ||
        (typeof row.after?.["id"] === "string" ? row.after["id"] : undefined);
      if (id) return { commands: ["/declarations", id] };
    }

    // 2. Tài khoản người dùng (USER)
    if (type === "USER") {
      // Bỏ qua đăng nhập hoặc hành động xóa tài khoản
      if (action === "AUTH_LOGIN" || action.endsWith("_DELETE") || action.includes("DELETE")) {
        return null;
      }
      // Khi tạo mới tài khoản (USER_CREATE, USER_REGISTER) hoặc cập nhật/khóa/mở khóa:
      const username =
        (typeof row.after?.["username"] === "string" && row.after["username"]) ||
        (typeof row.before?.["username"] === "string" && row.before["username"]) ||
        (typeof row.after?.["taxCode"] === "string" && row.after["taxCode"]) ||
        (typeof row.before?.["taxCode"] === "string" && row.before["taxCode"]) ||
        (typeof row.after?.["idNumber"] === "string" && row.after["idNumber"]) ||
        (typeof row.before?.["idNumber"] === "string" && row.before["idNumber"]);
      if (username) {
        return {
          commands: ["/admin/users"],
          queryParams: { keyword: username },
        };
      }
      return { commands: ["/admin/users"] };
    }

    return null;
  }

  protected targetLink(row: AuditLogRow): string[] | null {
    const info = this.targetRouteInfo(row);
    return info ? info.commands : null;
  }

  protected getNote(row: AuditLogRow): string {
    if (!row) return "-";
    const after = row.after || {};
    const before = row.before || {};
    const rawNote =
      after["note"] ??
      after["reasonNote"] ??
      after["reason"] ??
      after["denyReason"] ??
      after["cancelReason"] ??
      after["lockReason"] ??
      after["rejectionReason"] ??
      after["blockingReasons"] ??
      before["note"] ??
      before["reasonNote"] ??
      before["reason"] ??
      before["denyReason"] ??
      before["cancelReason"] ??
      before["lockReason"] ??
      before["rejectionReason"];
    if (typeof rawNote === "string" && rawNote.trim()) return rawNote.trim();
    if (Array.isArray(rawNote) && rawNote.length) {
      return rawNote
        .map((item) =>
          typeof item === "string"
            ? VALUE_LABEL_KEYS[item.toUpperCase()]
              ? this.t(VALUE_LABEL_KEYS[item.toUpperCase()])
              : item
            : JSON.stringify(item),
        )
        .join(", ");
    }
    return "-";
  }

  protected resultLabel(row: AuditLogRow): string {
    const key =
      (row?.result && AUDIT_RESULT_LABEL_KEYS[row.result]) ||
      "ui.audit.resultFailure";
    return this.t(key);
  }

  protected resultTone(row: AuditLogRow): string {
    return (
      (row?.result && AUDIT_RESULT_TONES[row.result]) ??
      (row?.result === "SUCCESS" ? "done" : "rejected")
    );
  }

  protected moduleOf(row: AuditLogRow): AuditModuleCode {
    return auditModuleOf(row);
  }

  protected moduleLabel(code: AuditModuleCode): string {
    return this.t(AUDIT_MODULE_LABEL_KEYS[code]);
  }

  protected diffType(change: {
    changed: boolean;
    before: string;
    after: string;
  }): string {
    if (!change.changed) return "unchanged";
    if (change.before === "—") return "added";
    if (change.after === "—") return "removed";
    return "updated";
  }

  protected diffTypeLabel(change: {
    changed: boolean;
    before: string;
    after: string;
  }): string {
    const type = this.diffType(change);
    return this.t(
      `ui.audit.diffType${type.charAt(0).toUpperCase() + type.slice(1)}` as MessageKey,
    );
  }

  protected isJson(val: string): boolean {
    return val.startsWith("{") || val.startsWith("[");
  }

  protected diffRows(
    row: AuditLogRow,
  ): {
    field: string;
    rawField: string;
    before: string;
    after: string;
    changed: boolean;
    link?: string[];
    oldLink?: string[];
  }[] {
    const before: Record<string, unknown> = row.before ?? {};
    const after: Record<string, unknown> = row.after ?? {};
    let rawFields = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)]),
    ).sort();

    // Loại bỏ các trường liên quan đến cổng (gate) và chốt (checkpoint) theo luồng nghiệp vụ mới
    rawFields = rawFields.filter(
      (f) =>
        ![
          "gate",
          "gateCode",
          "checkpoint",
          "deletedById",
          "deletedAt",
          "updatedById",
          "updatedAt",
          "createdById",
          "createdAt",
          "dossierId",
          "transactionId",
          "checksum",
          "id",
          "uuid",
          "targetId",
          "yardZoneId",
          "yardId",
          "zoneId",
          "yard",
          "yardZone",
          "zone",
          "organizationId",
          "organization",
          "isProtected",
        ].includes(f),
    );

    // Khi xóa tài khoản (USER), ẩn dòng đường dẫn mặc định trong diff
    if (row.targetType === "USER" && (row.action.endsWith("_DELETE") || row.action.includes("DELETE"))) {
      rawFields = rawFields.filter((f) => f !== "defaultRoute");
    }

    if (row.action === "DECLARATION_COPY") {
      rawFields = rawFields.filter(
        (f) =>
          f !== "sourceId" &&
          f !== "copiedId" &&
          f !== "code" &&
          f !== "attachments" &&
          !f.toLowerCase().endsWith("id"),
      );
    }

    const isDeleteAction = row.action.includes("DELETE");

    const items = rawFields.map((rawField) => {
      const fieldKey = FIELD_LABEL_KEYS[rawField];
      let fieldLabel = fieldKey ? this.t(fieldKey) : rawField;
      if (
        rawField === "code" &&
        row.targetType !== "DOSSIER" &&
        row.targetType !== "DECLARATION"
      ) {
        fieldLabel = this.t("ui.audit.field.genericCode");
      }
      let oldValue = this.formatFieldValue(rawField, before[rawField], false);
      let newValue = this.formatFieldValue(rawField, after[rawField], true);

      // Chuyển đổi mã ID của người thao tác (Tài khoản xóa/tạo/cập nhật) thành tên đăng nhập (nếu trùng với người đang thao tác log này)
      if (
        ["deletedById", "createdById", "updatedById", "actorId"].includes(
          rawField,
        ) &&
        row.actorId
      ) {
        if (before[rawField] === row.actorId)
          oldValue = row.actorUsername || oldValue;
        if (after[rawField] === row.actorId)
          newValue = row.actorUsername || newValue;
      }
      const av = after[rawField];
      const link =
        rawField === "defaultRoute" && typeof av === "string" && av !== ""
          ? [av.startsWith("/") ? av : "/" + av]
          : (rawField === "dossierCode" || rawField === "code") &&
              (row.targetType === "DECLARATION" || row.targetType === "DOSSIER") &&
              !isDeleteAction
            ? (this.targetLink(row) ?? undefined)
            : undefined;

      const bv = before[rawField];
      const oldLink =
        rawField === "defaultRoute" && typeof bv === "string" && bv !== ""
          ? [bv.startsWith("/") ? bv : "/" + bv]
          : undefined;

      return {
        field: fieldLabel,
        rawField,
        before: oldValue,
        after: newValue,
        changed: oldValue !== newValue,
        link,
        oldLink,
      };
    });

    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.field}::${item.before}::${item.after}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private formatFieldValue(
    rawField: string,
    value: unknown,
    isAfter = false,
  ): string {
    if (value === undefined || value === null || value === "") return "—";
    if (
      rawField.toLowerCase().includes("password") ||
      rawField.toLowerCase().includes("secret") ||
      rawField.toLowerCase().includes("token")
    ) {
      return isAfter
        ? this.t("ui.audit.passwordConfiguredNew")
        : this.t("ui.audit.passwordConfiguredOld");
    }
    const lowerField = rawField.toLowerCase();
    if (
      lowerField.includes("avatar") ||
      lowerField.includes("photo") ||
      lowerField.includes("image")
    ) {
      if (
        typeof value === "string" &&
        (value.startsWith("data:image") ||
          value.startsWith("http") ||
          value.length > 50)
      ) {
        return isAfter
          ? this.t("ui.audit.imageUpdatedNew")
          : this.t("ui.audit.imageUpdatedOld");
      }
    }
    if (typeof value === "boolean") {
      if (rawField === "canOpen")
        return value
          ? this.t("ui.audit.barrierAllowed")
          : this.t("ui.audit.barrierNotAllowed");
      if (rawField === "isActive" || rawField === "active")
        return value
          ? this.t("ui.common.active")
          : this.t("ui.common.inactive");
      if (rawField === "settled")
        return value
          ? this.t("ui.audit.val.SETTLED")
          : this.t("ui.audit.val.UNSETTLED");
      if (rawField === "adjusted")
        return value
          ? this.t("ui.audit.val.ADJUSTED")
          : this.t("ui.audit.val.UNADJUSTED");
      if (
        rawField === "value" ||
        rawField === "enabled" ||
        rawField === "fee.enabled"
      )
        return value ? this.t("ui.common.enable") : this.t("ui.common.disable");
      return value ? this.t("ui.common.yes") : this.t("ui.common.no");
    }
    if (typeof value === "number") {
      if (rawField === "sizeBytes") {
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / (1024 * 1024)).toFixed(2)} MB`;
      }
      const formattedNumber = new Intl.NumberFormat(
        this.i18n.locale() === "vi" ? "vi-VN" : "en-US",
      ).format(value);
      if (
        [
          "total",
          "totalFee",
          "price",
          "amount",
          "fee",
          "subtotal",
          "vatAmount",
          "unitAmount",
          "outstanding",
        ].includes(rawField)
      ) {
        return `${formattedNumber} VNĐ`;
      }
      return formattedNumber;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "—";

      const lowerTrimmed = trimmed.toLowerCase();
      if (lowerTrimmed === "true" || lowerTrimmed === "false") {
        return this.formatFieldValue(
          rawField,
          lowerTrimmed === "true",
          isAfter,
        );
      }

      // 0. Xử lý các trường tiền tệ bị gửi dưới dạng chuỗi
      if (
        [
          "total",
          "totalFee",
          "price",
          "amount",
          "fee",
          "subtotal",
          "vatAmount",
          "unitAmount",
          "outstanding",
        ].includes(rawField) &&
        !isNaN(Number(trimmed))
      ) {
        const num = Number(trimmed);
        return `${new Intl.NumberFormat(this.i18n.locale() === "vi" ? "vi-VN" : "en-US").format(num)} VNĐ`;
      }
      if (rawField === "sizeBytes" && !isNaN(Number(trimmed))) {
        const num = Number(trimmed);
        if (num < 1024) return `${num} B`;
        if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
        return `${(num / (1024 * 1024)).toFixed(2)} MB`;
      }

      // 0. Làm sạch tên file bị dính header
      if (
        rawField === "originalName" ||
        rawField === "fileName" ||
        rawField === "name"
      ) {
        return trimmed.replace(/;.*$/, "").trim();
      }

      // 0. Xử lý mimeType thành định dạng thân thiện
      if (rawField === "mimeType") {
        const mimeMap: Record<string, string> = {
          "application/pdf": "PDF (.pdf)",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "Excel (.xlsx)",
          "application/vnd.ms-excel": "Excel (.xls)",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            "Word (.docx)",
          "application/msword": "Word (.doc)",
          "image/png": "PNG (.png)",
          "image/jpeg": "JPEG (.jpg)",
          "image/webp": "WEBP (.webp)",
        };
        return mimeMap[trimmed] || trimmed;
      }

      if (rawField === "documentTypeCode") {
        if (trimmed === "" || trimmed === "-") return "—";
        const key = VALUE_LABEL_KEYS[trimmed.toUpperCase()];
        if (key) return this.t(key);
        // Fallback or leave it
        return trimmed;
      }

      if (rawField === "attachmentIds" || rawField === "attachmentId") {
        return "1 tệp đính kèm";
      }

      // 0. Base64 data URL detection (Image 3)
      if (
        trimmed.startsWith("data:image/") ||
        trimmed.startsWith("data:application/")
      ) {
        return isAfter
          ? this.t("ui.audit.imageUpdatedNew")
          : this.t("ui.audit.imageUpdatedOld");
      }
      // 1. Kiểm tra mã quyền (permissions) hoặc danh sách mã quyền phân cách bằng dấu phẩy
      const lang = this.i18n.locale() === "vi" ? "vi" : "en";
      if (trimmed.includes(",")) {
        const parts = trimmed.split(",").map((part) => {
          const item = part.trim();
          if (PERMISSION_LABEL_KEYS[item])
            return PERMISSION_LABEL_KEYS[item][lang];
          const key = VALUE_LABEL_KEYS[item.toUpperCase()];
          if (key) return this.t(key);
          return item;
        });
        return parts.join(", ");
      }
      if (PERMISSION_LABEL_KEYS[trimmed]) {
        return PERMISSION_LABEL_KEYS[trimmed][lang];
      }
      // 1.5. Xử lý đường dẫn mặc định thành tên phân hệ/màn hình thân thiện đa ngôn ngữ (không chứa dấu /)
      if (rawField === "defaultRoute") {
        const routeKey = resolveRouteMenuKey(trimmed);
        if (routeKey) return this.t(routeKey);
        return trimmed.replace(/^\/+/, "");
      }

      // 2. Tra từ điển giá trị đóng (trạng thái, quyết định, vai trò, v.v.)
      if (rawField === "key" && SYSTEM_SETTING_LABELS[trimmed]) {
        return this.t(SYSTEM_SETTING_LABELS[trimmed]);
      }

      const key = VALUE_LABEL_KEYS[trimmed.toUpperCase()];
      if (key) return this.t(key);

      const valKey = `ui.audit.val.${trimmed.toUpperCase()}`;
      if (this.i18n.has(valKey)) return this.i18n.t(valKey as MessageKey);

      const forceKey = `ui.forceStatus.${trimmed.toUpperCase()}`;
      if (this.i18n.has(forceKey)) return this.i18n.t(forceKey as MessageKey);

      const actionKey = `ui.audit.${trimmed.toUpperCase()}`;
      if (this.i18n.has(actionKey)) return this.i18n.t(actionKey as MessageKey);

      const moduleKey =
        AUDIT_MODULE_LABEL_KEYS[
          trimmed.toUpperCase() as keyof typeof AUDIT_MODULE_LABEL_KEYS
        ];
      if (moduleKey) return this.t(moduleKey);

      const dossierTypeKey = `ui.dossierType.${trimmed.toUpperCase()}`;
      if (this.i18n.has(dossierTypeKey))
        return this.i18n.t(dossierTypeKey as MessageKey);

      if (/^LANE_(\d+)$/i.test(trimmed)) {
        const num = trimmed.match(/^LANE_(\d+)$/i)![1];
        return `${this.t("ui.audit.field.lane")} ${Number(num)}`;
      }

      // 3. Chuỗi thời gian ISO
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
        return formatDateTime(trimmed);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [y, m, d] = trimmed.split("-");
        return `${d}/${m}/${y}`;
      }

      return trimmed;
    }
    if (Array.isArray(value)) {
      if (rawField === "attachmentIds") {
        return value.length > 0 ? `${value.length} tệp đính kèm` : "—";
      }
      if (value.length === 0) {
        if (rawField === "blockingReasons" || rawField === "errors")
          return this.t("ui.audit.noBlockingConditions");
        return "—";
      }
      return value
        .map((i) => this.formatFieldValue(rawField, i, isAfter))
        .join(", ");
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      // Đối tượng thông báo lỗi / Validation error
      if (
        "message" in obj &&
        typeof obj["message"] === "string" &&
        obj["message"].trim()
      ) {
        return obj["message"].trim();
      }
      if (
        "messageKey" in obj &&
        typeof obj["messageKey"] === "string" &&
        obj["messageKey"].trim()
      ) {
        const key = obj["messageKey"].trim();
        const upper = key.toUpperCase();
        if (VALUE_LABEL_KEYS[upper]) return this.t(VALUE_LABEL_KEYS[upper]);
        if (this.i18n.has(key)) return this.i18n.t(key as MessageKey);
        return key;
      }
      // Lái xe
      if ("fullName" in obj || "idNumber" in obj) {
        const parts: string[] = [];
        if (obj["fullName"])
          parts.push(
            `${this.t("ui.audit.field.fullName")}: ${toSafeString(obj["fullName"])}`,
          );
        if (obj["idNumber"])
          parts.push(
            `${this.t("ui.audit.field.idNumber")}: ${toSafeString(obj["idNumber"])}`,
          );
        if (obj["phone"])
          parts.push(
            `${this.t("ui.audit.field.phone")}: ${toSafeString(obj["phone"])}`,
          );
        if (parts.length === 0 && obj["id"])
          parts.push(`ID: ${toSafeString(obj["id"])}`);
        return parts.length ? parts.join(", ") : JSON.stringify(obj);
      }
      // Phương tiện
      if ("plateNumber" in obj || "vehicleType" in obj || "driver" in obj) {
        const parts: string[] = [];
        if (obj["plateNumber"])
          parts.push(
            `${this.t("ui.audit.field.plateNumber")}: ${toSafeString(obj["plateNumber"])}`,
          );
        if (obj["vehicleType"])
          parts.push(
            `${this.t("ui.form.vehicleType")}: ${this.formatFieldValue("vehicleType", obj["vehicleType"], isAfter)}`,
          );
        if (obj["driver"])
          parts.push(
            `${this.t("ui.common.driver")}: ${this.formatFieldValue("driver", obj["driver"], isAfter)}`,
          );
        if (parts.length === 0 && obj["id"])
          parts.push(`ID: ${toSafeString(obj["id"])}`);
        return parts.length ? parts.join(", ") : JSON.stringify(obj);
      }
      // Hàng hóa
      if ("description" in obj || "grossWeightKg" in obj || "unitCode" in obj) {
        const parts: string[] = [];
        if (obj["description"])
          parts.push(
            `${this.t("ui.audit.field.cargo")}: ${toSafeString(obj["description"])}`,
          );
        if (obj["grossWeightKg"])
          parts.push(
            `${this.t("ui.form.grossWeight")}: ${this.formatFieldValue("grossWeightKg", obj["grossWeightKg"], isAfter)}`,
          );
        if (obj["unitCode"])
          parts.push(
            `${this.t("ui.form.unitCode")}: ${this.formatFieldValue("unitCode", obj["unitCode"], isAfter)}`,
          );
        if (parts.length === 0 && obj["id"])
          parts.push(`ID: ${toSafeString(obj["id"])}`);
        return parts.length ? parts.join(", ") : JSON.stringify(obj);
      }
      // Tệp đính kèm
      if ("fileName" in obj || "originalName" in obj) {
        const name = toSafeString(obj["fileName"] || obj["originalName"])
          .replace(/;.*$/, "")
          .trim();
        const typeName = toSafeString(
          obj["documentTypeName"] || obj["documentTypeCode"],
        );
        return typeName ? `${name} (${typeName})` : name;
      }
      // Doanh nghiệp
      if ("taxCode" in obj || "name" in obj) {
        const parts: string[] = [];
        if (obj["name"])
          parts.push(
            `${this.t("ui.form.enterpriseName")}: ${toSafeString(obj["name"])}`,
          );
        if (obj["taxCode"])
          parts.push(
            `${this.t("ui.audit.field.taxCode")}: ${toSafeString(obj["taxCode"])}`,
          );
        if (parts.length === 0 && obj["id"])
          parts.push(`ID: ${toSafeString(obj["id"])}`);
        return parts.length ? parts.join(", ") : JSON.stringify(obj);
      }
      // Khung hẹn
      if ("scheduledAt" in obj) {
        const parts: string[] = [];
        if (obj["scheduledAt"])
          parts.push(
            `${this.t("ui.audit.field.scheduledAt")}: ${formatDateTime(toSafeString(obj["scheduledAt"]))}`,
          );
        if (obj["laneCode"])
          parts.push(
            `${this.t("ui.audit.field.laneCode")}: ${toSafeString(obj["laneCode"])}`,
          );
        return parts.length ? parts.join(", ") : JSON.stringify(obj);
      }

      // Generic object
      const entries = Object.entries(obj).filter(
        ([_, v]) => v !== undefined && v !== null && v !== "",
      );
      if (!entries.length) return "—";
      const formattedEntries = entries.map(([k, v]) => {
        const fieldKey = FIELD_LABEL_KEYS[k];
        const fieldName = fieldKey ? this.t(fieldKey) : k;
        return `${fieldName}: ${this.formatFieldValue(k, v, isAfter)}`;
      });
      return formattedEntries.join(", ");
    }
    return JSON.stringify(value);
  }
}
