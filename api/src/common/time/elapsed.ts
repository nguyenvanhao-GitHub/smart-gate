/**
 * Số giây giữa hai mốc, không bao giờ âm (đồng hồ máy chủ có thể bị chỉnh lùi).
 *
 * TypeScript thuần, không phụ thuộc framework — dùng được cả ở tầng `domain/`.
 */
export function elapsedSeconds(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}
