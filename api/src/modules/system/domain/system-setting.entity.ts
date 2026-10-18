/** Một tham số cấu hình hệ thống dạng khóa–giá trị (BA-092). Giá trị luôn lưu dạng chuỗi. */
export class SystemSetting {
  constructor(
    public readonly key: string,
    public value: string,
    public updatedAt: Date,
    public updatedById: string | null,
  ) {}

  static createDefault(key: string, value: string): SystemSetting {
    return new SystemSetting(key, value, new Date(), null);
  }

  update(value: string, byId: string | null, at: Date = new Date()): void {
    this.value = value;
    this.updatedById = byId;
    this.updatedAt = at;
  }
}
