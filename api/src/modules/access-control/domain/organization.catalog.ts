/** Loại đơn vị trong bảng `organizations`. */
export enum OrganizationType {
  BORDER_GATE = 'BORDER_GATE',
  AGENCY = 'AGENCY',
  ENTERPRISE = 'ENTERPRISE',
}

export interface OrganizationDefinition {
  code: string;
  name: string;
  type: OrganizationType;
  parentCode?: string;
}

/** Cây đơn vị seed cho cửa khẩu Chiềng Khương. Số liệu thật chờ chốt điểm D8 của kế hoạch. */
export const ORGANIZATION_CATALOG: OrganizationDefinition[] = [
  { code: 'CK_CHIENG_KHUONG', name: 'Cửa khẩu Chiềng Khương', type: OrganizationType.BORDER_GATE },
  { code: 'DIEUHANH_CK', name: 'Trung tâm điều hành cửa khẩu', type: OrganizationType.AGENCY, parentCode: 'CK_CHIENG_KHUONG' },
  { code: 'BQL_CK', name: 'Ban quản lý khu kinh tế cửa khẩu', type: OrganizationType.AGENCY, parentCode: 'CK_CHIENG_KHUONG' },
  { code: 'HQ_CK', name: 'Chi cục Hải quan cửa khẩu Chiềng Khương', type: OrganizationType.AGENCY, parentCode: 'CK_CHIENG_KHUONG' },
  { code: 'BP_CK', name: 'Đồn Biên phòng cửa khẩu Chiềng Khương', type: OrganizationType.AGENCY, parentCode: 'CK_CHIENG_KHUONG' },
  { code: 'KD_CK', name: 'Đơn vị kiểm dịch cửa khẩu', type: OrganizationType.AGENCY, parentCode: 'CK_CHIENG_KHUONG' },
  { code: 'THUE_CK', name: 'Chi cục Thuế khu vực cửa khẩu', type: OrganizationType.AGENCY, parentCode: 'CK_CHIENG_KHUONG' },
  { code: 'DN_DEMO', name: 'Doanh nghiệp khai báo (demo)', type: OrganizationType.ENTERPRISE, parentCode: 'CK_CHIENG_KHUONG' },
];
