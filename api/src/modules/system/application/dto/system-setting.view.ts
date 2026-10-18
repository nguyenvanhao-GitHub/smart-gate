/** Một tham số cấu hình trả về cho web — trả **mã** nhóm/kiểu, nhãn do web tra qua i18n theo khóa. */
export interface SystemSettingView {
  key: string;
  value: string;
  valueType: string;
  group: string;
  min: number;
  max: number;
  defaultValue: string;
  /** Thời điểm cập nhật gần nhất (ISO) — `null` khi tham số chưa từng được lưu (đang dùng mặc định). */
  updatedAt: string | null;
  updatedById: string | null;
}
