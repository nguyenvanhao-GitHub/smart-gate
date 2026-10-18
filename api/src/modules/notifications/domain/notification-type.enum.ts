/** Loại thông báo trong hệ thống (F06 — mức Rút gọn: chỉ in-app). */
export enum NotificationType {
  /** Hồ sơ bị yêu cầu bổ sung/khai lại. */
  DOSSIER_SUPPLEMENT_REQUESTED = 'DOSSIER_SUPPLEMENT_REQUESTED',
  /** Hồ sơ bị từ chối. */
  DOSSIER_REJECTED = 'DOSSIER_REJECTED',
  /** Hồ sơ đổi trạng thái. */
  DOSSIER_STATUS_CHANGED = 'DOSSIER_STATUS_CHANGED',
  /** Một bước liên ngành vừa được xác nhận. */
  DOSSIER_STEP_CONFIRMED = 'DOSSIER_STEP_CONFIRMED',
  /** Hồ sơ đến lượt xử lý tại bước nghiệp vụ (SG-110). */
  DOSSIER_TURN_PROCESSING = 'DOSSIER_TURN_PROCESSING',
  /** Thông báo hệ thống chung. */
  SYSTEM = 'SYSTEM',
  /** Người dùng đăng ký. */
  USER_REGISTERED = 'USER_REGISTERED',
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NotificationType.DOSSIER_SUPPLEMENT_REQUESTED]: 'Yêu cầu bổ sung hồ sơ',
  [NotificationType.DOSSIER_REJECTED]: 'Hồ sơ bị từ chối',
  [NotificationType.DOSSIER_STATUS_CHANGED]: 'Hồ sơ đổi trạng thái',
  [NotificationType.DOSSIER_STEP_CONFIRMED]: 'Bước nghiệp vụ được xác nhận',
  [NotificationType.DOSSIER_TURN_PROCESSING]: 'Hồ sơ đến lượt xử lý',
  [NotificationType.SYSTEM]: 'Thông báo hệ thống',
  [NotificationType.USER_REGISTERED]: 'Người dùng đăng ký',
};
