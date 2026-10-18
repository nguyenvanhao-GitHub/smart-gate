import { Declaration } from './declaration.entity';
import { DeclarationStatus } from './declaration.enums';
import { MessageKey, MessageParams } from '../../../common/i18n/message-catalog';
import { translate } from '../../../common/i18n/translate';
import { DossierFieldConfigItem } from '../../catalog/domain/dossier-field-config.catalog';

export interface DossierValidationError {
  field: string;
  message: string;
  messageKey?: MessageKey;
  messageParams?: MessageParams;
}

export interface RequiredDocumentType {
  code: string;
  name: string;
}

export interface DossierCompletenessInput {
  declaration: Declaration;
  fieldConfigs?: DossierFieldConfigItem[];
  requiredDocumentTypes?: RequiredDocumentType[];
  attachedDocumentTypeCodes?: string[];
  now?: Date;
}

const TAX_CODE_PATTERN = /^\d{10}(-\d{3})?$|^\d{12}$|^[A-Za-z][A-Za-z0-9.\-\s]{4,29}$/;
const PLATE_PATTERN = /^[A-Za-z0-9.\-\s]{6,32}$/;
const PHONE_PATTERN = /^[0-9+\s.-]{8,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_NUMBER_PATTERN = /^[0-9A-Za-z]{6,32}$/;

function isBlank(value?: string | null): boolean {
  return !value || value.trim().length === 0;
}

function checkOptionalPhone(phone: string | undefined | null, fieldName: string, errors: DossierValidationError[]): void {
  if (phone && !isBlank(phone) && !PHONE_PATTERN.test(phone.trim())) {
    errors.push({
      field: fieldName,
      message: translate('dossier.invalidPhone'),
      messageKey: 'dossier.invalidPhone',
    });
  }
}

function checkCommonEnterpriseFields(
  declaration: Declaration,
  isReq: (key: string, def: boolean) => boolean,
  isVis: (key: string) => boolean,
  errors: DossierValidationError[],
  defaults: { name: boolean; phone: boolean; representative: boolean },
): void {
  const enterprise = declaration.enterprise;

  if (defaults.name && isReq('enterpriseName', true) && isBlank(enterprise?.name)) {
    errors.push({
      field: 'enterprise.name',
      message: translate('dossier.missingEnterpriseName'),
      messageKey: 'dossier.missingEnterpriseName',
    });
  }

  if (defaults.representative && isReq('representative', false) && isBlank(enterprise?.representativeName)) {
    errors.push({
      field: 'enterprise.representativeName',
      message: translate('dossier.missingRepresentative'),
      messageKey: 'dossier.missingRepresentative',
    });
  }

  if (defaults.phone && isReq('phone', true) && isBlank(enterprise?.phone)) {
    errors.push({
      field: 'enterprise.phone',
      message: translate('dossier.missingPhone'),
      messageKey: 'dossier.missingPhone',
    });
  }
  if (isVis('phone')) {
    checkOptionalPhone(enterprise?.phone, 'enterprise.phone', errors);
  }

  if (defaults.name && isReq('address', false) && isBlank(enterprise?.address)) {
    errors.push({
      field: 'enterprise.address',
      message: translate('dossier.missingAddress'),
      messageKey: 'dossier.missingAddress',
    });
  }
}

function checkEnterprise(
  declaration: Declaration,
  isReq: (key: string, def: boolean) => boolean,
  isVis: (key: string) => boolean,
  errors: DossierValidationError[],
): void {
  const enterprise = declaration.enterprise;
  const accountType = (enterprise?.accountType || '').trim().toUpperCase();
  const isCreateForOther = enterprise?.createForOther === true;

  // 1. Tài khoản cá nhân: Bắt buộc CCCD; khi khai hộ được miễn tên/SĐT, khi tự khai vẫn bắt buộc
  if (accountType === 'INDIVIDUAL') {
    if (isReq('enterpriseIdNumber', true)) {
      const idVal = enterprise?.idNumber?.trim() || enterprise?.taxCode?.trim() || '';
      if (isBlank(idVal)) {
        errors.push({
          field: 'enterprise.idNumber',
          message: translate('dossier.missingIdNumber'),
          messageKey: 'dossier.missingIdNumber',
        });
      } else if (!ID_NUMBER_PATTERN.test(idVal)) {
        errors.push({
          field: 'enterprise.idNumber',
          message: translate('dossier.invalidIdNumber'),
          messageKey: 'dossier.invalidIdNumber',
        });
      }
    }

    checkCommonEnterpriseFields(declaration, isReq, isVis, errors, {
      name: !isCreateForOther,
      phone: !isCreateForOther,
      representative: false,
    });
    return;
  }

  // 2. Tài khoản nội bộ: Bắt buộc Email khi khai hộ (createForOther); khi tự khai chỉ kiểm tra định dạng nếu có nhập
  if (accountType === 'INTERNAL') {
    const email = enterprise?.email?.trim() || '';
    const emailRequired = isCreateForOther ? isReq('enterpriseEmail', true) : isReq('enterpriseEmail', false);

    if (emailRequired && isBlank(email)) {
      errors.push({
        field: 'enterprise.email',
        message: translate('dossier.missingEmail'),
        messageKey: 'dossier.missingEmail',
      });
    } else if (!isBlank(email) && !EMAIL_PATTERN.test(email)) {
      errors.push({
        field: 'enterprise.email',
        message: translate('dossier.invalidEmail'),
        messageKey: 'dossier.invalidEmail',
      });
    }

    checkCommonEnterpriseFields(declaration, isReq, isVis, errors, {
      name: !isCreateForOther,
      phone: !isCreateForOther,
      representative: false,
    });
    return;
  }

  // 3. Tài khoản Doanh nghiệp hoặc mặc định: Khi khai hộ chỉ bắt buộc MST; khi tự khai bắt buộc đầy đủ
  const taxCode = enterprise?.taxCode?.trim() || '';
  if (isReq('enterpriseTaxCode', true)) {
    if (isBlank(taxCode)) {
      errors.push({
        field: 'enterprise.taxCode',
        message: translate('dossier.missingEnterpriseTaxCode'),
        messageKey: 'dossier.missingEnterpriseTaxCode',
      });
    } else if (!TAX_CODE_PATTERN.test(taxCode)) {
      errors.push({
        field: 'enterprise.taxCode',
        message: translate('dossier.invalidEnterpriseTaxCode'),
        messageKey: 'dossier.invalidEnterpriseTaxCode',
      });
    }
  }

  checkCommonEnterpriseFields(declaration, isReq, isVis, errors, {
    name: !isCreateForOther,
    phone: !isCreateForOther,
    representative: !isCreateForOther,
  });
}

function checkVehicle(declaration: Declaration, isReq: (key: string, def: boolean) => boolean, errors: DossierValidationError[]): void {
  const vehicles = declaration.vehicles ?? [];
  if (vehicles.length === 0) {
    errors.push({
      field: 'vehicles',
      message: translate('dossier.missingVehicles'),
      messageKey: 'dossier.missingVehicles',
    });
    return;
  }
    vehicles.forEach((vehicle, index) => {
      const prefix = `vehicles[${index}]`;
      const messageParams: MessageParams = vehicles.length > 1
        ? { tag: 'dossier.tagVehicle', index: index + 1 }
        : { tag: '' };
    if (isReq('plateNumber', true)) {
      if (isBlank(vehicle?.plateNumber)) {
        errors.push({
          field: `${prefix}.plateNumber`,
          message: translate('dossier.missingPlateNumber', messageParams),
          messageKey: 'dossier.missingPlateNumber',
          messageParams,
        });
      } else if (!PLATE_PATTERN.test(vehicle.plateNumber.trim())) {
        errors.push({
          field: `${prefix}.plateNumber`,
          message: translate('dossier.invalidPlateNumber', messageParams),
          messageKey: 'dossier.invalidPlateNumber',
          messageParams,
        });
      }
    }
    if (isReq('vehicleType', true) && isBlank(vehicle?.vehicleType)) {
      errors.push({
        field: `${prefix}.vehicleType`,
        message: translate('dossier.missingVehicleType', messageParams),
        messageKey: 'dossier.missingVehicleType',
        messageParams,
      });
    }
    if (isReq('containerNumber', false) && isBlank(vehicle?.containerNumber)) {
      errors.push({
        field: `${prefix}.containerNumber`,
        message: translate('dossier.missingContainerNumber', messageParams),
        messageKey: 'dossier.missingContainerNumber',
        messageParams,
      });
    }
    if (isReq('trailerNumber', false) && isBlank(vehicle?.trailerNumber)) {
      errors.push({
        field: `${prefix}.trailerNumber`,
        message: translate('dossier.missingTrailerNumber', messageParams),
        messageKey: 'dossier.missingTrailerNumber',
        messageParams,
      });
    }
    if (isReq('transportLicense', false) && isBlank(vehicle?.transportLicenseNumber)) {
      errors.push({
        field: `${prefix}.transportLicenseNumber`,
        message: translate('dossier.missingTransportLicense', messageParams),
        messageKey: 'dossier.missingTransportLicense',
        messageParams,
      });
    }
    if (isReq('payloadWeight', false) && (vehicle?.weightKg === undefined || vehicle?.weightKg === null)) {
      errors.push({
        field: `${prefix}.weightKg`,
        message: translate('dossier.missingPayloadWeight', messageParams),
        messageKey: 'dossier.missingPayloadWeight',
        messageParams,
      });
    } else if (vehicle?.weightKg !== undefined && vehicle.weightKg !== null && vehicle.weightKg <= 0) {
      errors.push({
        field: `${prefix}.weightKg`,
        message: translate('dossier.invalidPayloadWeight', messageParams),
        messageKey: 'dossier.invalidPayloadWeight',
        messageParams,
      });
    }
  });
}

function checkDriver(declaration: Declaration, isReq: (key: string, def: boolean) => boolean, errors: DossierValidationError[]): void {
  const vehicles = declaration.vehicles ?? [];
  vehicles.forEach((vehicle, index) => {
    const prefix = `vehicles[${index}].driver`;
    const driver = vehicle.driver;
    const messageParams: MessageParams = vehicles.length > 1
      ? { tag: 'dossier.tagVehicle', index: index + 1 }
      : { tag: '' };

    if (isReq('driverName', true) && isBlank(driver?.fullName)) {
      errors.push({
        field: `${prefix}.fullName`,
        message: translate('dossier.missingDriverName', messageParams),
        messageKey: 'dossier.missingDriverName',
        messageParams,
      });
    }
    if (isReq('driverDocType', false) && isBlank(driver?.idType)) {
      errors.push({
        field: `${prefix}.idType`,
        message: translate('dossier.missingDriverDocType', messageParams),
        messageKey: 'dossier.missingDriverDocType',
        messageParams,
      });
    }
    if (isReq('driverDocNo', true) && isBlank(driver?.idNumber)) {
      errors.push({
        field: `${prefix}.idNumber`,
        message: translate('dossier.missingDriverDocNo', messageParams),
        messageKey: 'dossier.missingDriverDocNo',
        messageParams,
      });
    }
    if (isReq('driverLicenseNo', true) && isBlank(driver?.licenseNumber)) {
      errors.push({
        field: `${prefix}.licenseNumber`,
        message: translate('dossier.missingDriverLicenseNo', messageParams),
        messageKey: 'dossier.missingDriverLicenseNo',
        messageParams,
      });
    }
    if (isReq('driverPhone', false) && isBlank(driver?.phone)) {
      errors.push({
        field: `${prefix}.phone`,
        message: translate('dossier.missingDriverPhone', messageParams),
        messageKey: 'dossier.missingDriverPhone',
        messageParams,
      });
    }
    if (isReq('driverNationality', true) && isBlank(driver?.nationality)) {
      errors.push({
        field: `${prefix}.nationality`,
        message: translate('dossier.missingDriverNationality', messageParams),
        messageKey: 'dossier.missingDriverNationality',
        messageParams,
      });
    }
  });
}

function checkCargo(declaration: Declaration, isReq: (key: string, def: boolean) => boolean, errors: DossierValidationError[]): void {
  const items = declaration.cargoItems ?? [];
  if (items.length === 0) {
    errors.push({
      field: 'cargoItems',
      message: translate('dossier.missingCargoItems'),
      messageKey: 'dossier.missingCargoItems',
    });
    return;
  }
  items.forEach((item, index) => {
    const prefix = `cargoItems[${index}]`;
    const messageParams: MessageParams = items.length > 1
      ? { tag: 'dossier.tagCargo', index: index + 1 }
      : { tag: '' };
    if (isReq('cargoType', false) && isBlank(item.cargoTypeCode)) {
      errors.push({
        field: `${prefix}.cargoTypeCode`,
        message: translate('dossier.missingCargoType', messageParams),
        messageKey: 'dossier.missingCargoType',
        messageParams,
      });
    }
    if (isReq('cargoName', true) && isBlank(item.description)) {
      errors.push({
        field: `${prefix}.description`,
        message: translate('dossier.missingCargoName', messageParams),
        messageKey: 'dossier.missingCargoName',
        messageParams,
      });
    }
    if (isReq('quantity', false) && (item.quantity === undefined || item.quantity === null)) {
      errors.push({
        field: `${prefix}.quantity`,
        message: translate('dossier.missingQuantity', messageParams),
        messageKey: 'dossier.missingQuantity',
        messageParams,
      });
    } else if (item.quantity !== undefined && item.quantity !== null && item.quantity <= 0) {
      errors.push({
        field: `${prefix}.quantity`,
        message: translate('dossier.invalidQuantity', messageParams),
        messageKey: 'dossier.invalidQuantity',
        messageParams,
      });
    }
    if (isReq('unit', false) && isBlank(item.unitCode)) {
      errors.push({
        field: `${prefix}.unitCode`,
        message: translate('dossier.missingUnit', messageParams),
        messageKey: 'dossier.missingUnit',
        messageParams,
      });
    }
    if (isReq('cargoWeight', false) && (item.grossWeightKg === undefined || item.grossWeightKg === null)) {
      errors.push({
        field: `${prefix}.grossWeightKg`,
        message: translate('dossier.missingCargoWeight', messageParams),
        messageKey: 'dossier.missingCargoWeight',
        messageParams,
      });
    } else if (item.grossWeightKg !== undefined && item.grossWeightKg !== null && item.grossWeightKg <= 0) {
      errors.push({
        field: `${prefix}.grossWeightKg`,
        message: translate('dossier.invalidCargoWeight', messageParams),
        messageKey: 'dossier.invalidCargoWeight',
        messageParams,
      });
    }
  });
}

function checkDocuments(input: DossierCompletenessInput, errors: DossierValidationError[]): void {
  const required = input.requiredDocumentTypes ?? [];
  const attachedList = input.attachedDocumentTypeCodes ?? [];
  if (required.length === 0) {
    return;
  }

  const attached = new Set(attachedList);
  required
    .filter((document) => !attached.has(document.code))
    .forEach((document) => {
      const messageParams: MessageParams = { name: document.name };
      errors.push({
        field: `attachments.${document.code}`,
        message: translate('dossier.missingDocument', messageParams),
        messageKey: 'dossier.missingDocument',
        messageParams,
      });
    });
}

function checkAppointment(declaration: Declaration, isReq: (key: string, def: boolean) => boolean, now: Date, errors: DossierValidationError[]): void {
  if (isReq('estimatedTime', true)) {
    const appointment = declaration.appointment;
    const scheduledAt = appointment?.scheduledAt;
    if (!scheduledAt || !(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
      errors.push({
        field: 'appointment.scheduledAt',
        message: translate('dossier.missingScheduledAt'),
        messageKey: 'dossier.missingScheduledAt',
      });
      return;
    }
    if (scheduledAt.getTime() < now.getTime()) {
      errors.push({
        field: 'appointment.scheduledAt',
        message: translate('dossier.appointmentInPast'),
        messageKey: 'dossier.appointmentInPast',
      });
    }
  }
}

function checkStatus(declaration: Declaration, errors: DossierValidationError[]): void {
  if (declaration.isEditable) return;
  const isCancelled = declaration.status === DeclarationStatus.CANCELLED;
  const messageKey: MessageKey = isCancelled ? 'dossier.statusCancelled' : 'dossier.lockedForEdit';
  errors.push({
    field: 'status',
    message: translate(messageKey),
    messageKey,
  });
}

export function validateDossierCompleteness(input: DossierCompletenessInput): DossierValidationError[] {
  const now = input.now ?? new Date();
  const errors: DossierValidationError[] = [];

  const configMap = new Map<string, DossierFieldConfigItem>();
  if (input.fieldConfigs) {
    input.fieldConfigs.forEach((c) => configMap.set(c.fieldKey, c));
  }

  const accountKeys = ['enterpriseTaxCode', 'enterpriseName', 'phone', 'address', 'enterpriseEmail', 'enterpriseIdNumber', 'representative', 'jobTitle', 'department'];

  const isReq = (key: string, defaultVal: boolean): boolean => {
    if (!input.fieldConfigs || input.fieldConfigs.length === 0) {
      return defaultVal;
    }
    const directCfg = configMap.get(key);
    if (directCfg) {
      if (!directCfg.isVisible) return false;
      if (directCfg.isDefault) return true;
      return directCfg.isRequired;
    }
    const groupCfg = accountKeys.includes(key) ? configMap.get('accountInfo') : undefined;
    if (groupCfg) {
      if (!groupCfg.isVisible) return false;
      return defaultVal && (groupCfg.isDefault || groupCfg.isRequired);
    }
    return defaultVal;
  };

  const isVis = (key: string): boolean => {
    if (!input.fieldConfigs || input.fieldConfigs.length === 0) {
      return true;
    }
    const directCfg = configMap.get(key);
    if (directCfg) {
      return directCfg.isVisible;
    }
    const groupCfg = accountKeys.includes(key) ? configMap.get('accountInfo') : undefined;
    return groupCfg ? groupCfg.isVisible : true;
  };

  checkStatus(input.declaration, errors);
  checkEnterprise(input.declaration, isReq, isVis, errors);
  checkVehicle(input.declaration, isReq, errors);
  checkDriver(input.declaration, isReq, errors);
  checkCargo(input.declaration, isReq, errors);
  checkAppointment(input.declaration, isReq, now, errors);
  checkDocuments(input, errors);

  return errors;
}
