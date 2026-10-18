/** Phạm vi dữ liệu gắn trên từng vai trò của người dùng (kế hoạch MVP mục 3.1). */
export enum DataScopeLevel {
  /** Toàn hệ thống — quản trị, lãnh đạo. */
  ALL = 'ALL',
  /** Trong đơn vị và đơn vị con. */
  ORGANIZATION = 'ORGANIZATION',
  /** Chỉ hồ sơ do mình/doanh nghiệp mình tạo. */
  OWN = 'OWN',
  /** Chỉ hồ sơ đang ở chốt/cổng/bãi được phân công. */
  ASSIGNMENT = 'ASSIGNMENT',
}

/** Thứ tự từ rộng đến hẹp; người dùng nhiều vai trò lấy phạm vi rộng nhất. */
export const DATA_SCOPE_WIDTH: Record<DataScopeLevel, number> = {
  [DataScopeLevel.ALL]: 4,
  [DataScopeLevel.ORGANIZATION]: 3,
  [DataScopeLevel.ASSIGNMENT]: 2,
  [DataScopeLevel.OWN]: 1,
};

export const DATA_SCOPE_LABELS: Record<DataScopeLevel, string> = {
  [DataScopeLevel.ALL]: 'Toàn hệ thống',
  [DataScopeLevel.ORGANIZATION]: 'Trong đơn vị',
  [DataScopeLevel.OWN]: 'Hồ sơ của mình',
  [DataScopeLevel.ASSIGNMENT]: 'Theo phân công',
};
