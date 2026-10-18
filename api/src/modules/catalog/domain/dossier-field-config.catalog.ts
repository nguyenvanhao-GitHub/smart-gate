export interface DossierFieldConfigItem {
  id?: string;
  dossierTypeCode?: string;
  fieldKey: string;
  fieldName: string;
  isVisible: boolean;
  isRequired: boolean;
  isDefault: boolean;
}

export const DEFAULT_DOSSIER_FIELD_CONFIGS: Omit<DossierFieldConfigItem, 'dossierTypeCode'>[] = [
  // Group 1: Thông tin tài khoản
  { fieldKey: 'type', fieldName: 'Loại hồ sơ', isVisible: true, isRequired: true, isDefault: true },
  { fieldKey: 'estimatedTime', fieldName: 'Thời gian dự kiến', isVisible: true, isRequired: true, isDefault: true },
  { fieldKey: 'accountInfo', fieldName: 'Các thông tin cá nhân', isVisible: true, isRequired: true, isDefault: false },

  // Group 2: Thông tin phương tiện vận chuyển
  { fieldKey: 'plateNumber', fieldName: 'Biển số xe', isVisible: true, isRequired: true, isDefault: true },
  { fieldKey: 'vehicleType', fieldName: 'Loại phương tiện', isVisible: true, isRequired: true, isDefault: true },
  { fieldKey: 'containerNumber', fieldName: 'Số container', isVisible: true, isRequired: false, isDefault: false },
  { fieldKey: 'trailerNumber', fieldName: 'Số moóc', isVisible: true, isRequired: false, isDefault: false },
  { fieldKey: 'transportLicense', fieldName: 'Giấy phép vận tải quốc tế', isVisible: true, isRequired: false, isDefault: false },
  { fieldKey: 'payloadWeight', fieldName: 'Trọng tải (kg)', isVisible: true, isRequired: false, isDefault: false },

  // Group 3: Thông tin lái xe
  { fieldKey: 'driverName', fieldName: 'Họ và tên lái xe', isVisible: true, isRequired: true, isDefault: true },
  { fieldKey: 'driverDocType', fieldName: 'Loại giấy tờ', isVisible: true, isRequired: true, isDefault: false },
  { fieldKey: 'driverDocNo', fieldName: 'Số CCCD / Hộ chiếu', isVisible: true, isRequired: true, isDefault: false },
  { fieldKey: 'driverLicenseNo', fieldName: 'Số giấy phép lái xe (GPLX)', isVisible: true, isRequired: true, isDefault: false },
  { fieldKey: 'driverPhone', fieldName: 'Số điện thoại lái xe', isVisible: true, isRequired: false, isDefault: false },
  { fieldKey: 'driverNationality', fieldName: 'Quốc tịch', isVisible: true, isRequired: true, isDefault: false },

  // Group 4: Thông tin hàng hóa
  { fieldKey: 'cargoType', fieldName: 'Loại hàng hóa', isVisible: true, isRequired: false, isDefault: false },
  { fieldKey: 'cargoName', fieldName: 'Tên hàng hóa', isVisible: true, isRequired: true, isDefault: true },
  { fieldKey: 'quantity', fieldName: 'Số lượng hàng hóa', isVisible: true, isRequired: false, isDefault: false },
  { fieldKey: 'unit', fieldName: 'Đơn vị tính', isVisible: true, isRequired: false, isDefault: false },
  { fieldKey: 'cargoWeight', fieldName: 'Trọng lượng hàng hóa (kg)', isVisible: true, isRequired: false, isDefault: false },
];
