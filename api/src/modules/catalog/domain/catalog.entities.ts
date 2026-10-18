import { randomUUID } from 'crypto';
import { CatalogItemStatus } from './catalog-status.enum';

/** Nhóm danh mục dùng chung, ví dụ "Loại phương tiện", "Mã nguyên nhân từ chối". */
export class CatalogType {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public name: string,
    public description: string | null,
    /** Danh mục hệ thống thì không cho đổi mã, chỉ sửa nội dung bên trong. */
    public readonly isSystem: boolean,
    public sortOrder: number,
  ) {}

  static create(input: { code: string; name: string; description?: string | null; isSystem?: boolean; sortOrder?: number }): CatalogType {
    return new CatalogType(
      randomUUID(),
      input.code,
      input.name,
      input.description ?? null,
      input.isSystem ?? true,
      input.sortOrder ?? 0,
    );
  }

  /** Mã nhóm là khóa nghiệp vụ đã đi vào dữ liệu hồ sơ nên không cho sửa; chỉ đổi nội dung. */
  update(input: { name?: string; description?: string | null; sortOrder?: number }): void {
    if (input.name !== undefined) this.name = input.name;
    if (input.description !== undefined) this.description = input.description;
    if (input.sortOrder !== undefined) this.sortOrder = input.sortOrder;
  }
}

export class CatalogItem {
  constructor(
    public readonly id: string,
    public readonly typeCode: string,
    public readonly code: string,
    public name: string,
    public sortOrder: number,
    public status: CatalogItemStatus,
    public metadata: Record<string, unknown> | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  static create(input: {
    typeCode: string;
    code: string;
    name: string;
    sortOrder?: number;
    metadata?: Record<string, unknown> | null;
  }): CatalogItem {
    const now = new Date();
    return new CatalogItem(
      randomUUID(),
      input.typeCode,
      input.code,
      input.name,
      input.sortOrder ?? 0,
      CatalogItemStatus.ACTIVE,
      input.metadata ?? null,
      now,
      now,
    );
  }

  /** Mã danh mục là khóa nghiệp vụ đã đi vào dữ liệu hồ sơ nên không cho sửa. */
  update(input: { name?: string; sortOrder?: number; metadata?: Record<string, unknown> | null }): void {
    if (input.name !== undefined) this.name = input.name;
    if (input.sortOrder !== undefined) this.sortOrder = input.sortOrder;
    if (input.metadata !== undefined) this.metadata = input.metadata;
    this.updatedAt = new Date();
  }

  lock(): void {
    this.status = CatalogItemStatus.LOCKED;
    this.updatedAt = new Date();
  }

  unlock(): void {
    this.status = CatalogItemStatus.ACTIVE;
    this.updatedAt = new Date();
  }
}
