/** Loại phạm vi làm việc được phân công cho người dùng (bảng `user_assignments`). */
export enum AssignmentType {
  /** Cửa khẩu phụ trách. */
  BORDER_GATE = 'BORDER_GATE',
  /** Chốt nghiệp vụ: B1 / B2 / B5 / YARD / SMART_GATE. */
  CHECKPOINT = 'CHECKPOINT',
  /** Chiều di chuyển của phương tiện: IN / OUT. */
  DIRECTION = 'DIRECTION',
  /** Loại kiểm dịch: HEALTH / PLANT / ANIMAL. */
  QUARANTINE_TYPE = 'QUARANTINE_TYPE',
  /** Khoản phí phụ trách: INFRASTRUCTURE / TRANSSHIPMENT. */
  FEE_TYPE = 'FEE_TYPE',
  /** Bãi/ô đỗ phụ trách. */
  YARD = 'YARD',
  /** Mã số thuế doanh nghiệp mà tài khoản được xem hồ sơ. */
  TAX_CODE = 'TAX_CODE',
  /** CCCD / Số giấy tờ tùy thân của cá nhân. */
  ID_NUMBER = 'ID_NUMBER',
}

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  [AssignmentType.BORDER_GATE]: 'Cửa khẩu',
  [AssignmentType.CHECKPOINT]: 'Chốt nghiệp vụ',
  [AssignmentType.DIRECTION]: 'Chiều phương tiện',
  [AssignmentType.QUARANTINE_TYPE]: 'Loại kiểm dịch',
  [AssignmentType.FEE_TYPE]: 'Khoản phí',
  [AssignmentType.YARD]: 'Bãi',
  [AssignmentType.TAX_CODE]: 'Mã số thuế',
  [AssignmentType.ID_NUMBER]: 'CCCD / Số giấy tờ',
};
