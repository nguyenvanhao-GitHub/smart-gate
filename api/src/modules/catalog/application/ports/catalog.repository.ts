import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItemStatus } from '../../domain/catalog-status.enum';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogTypeSeed } from '../../domain/catalog.seed';

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface CatalogItemSearchCriteria {
  typeCode: string;
  keyword?: string;
  status?: CatalogItemStatus;
  page?: number;
  pageSize?: number;
}

export interface CatalogRepository {
  listTypes(): Promise<CatalogType[]>;
  findTypeByCode(code: string): Promise<CatalogType | null>;
  findTypeByName(name: string): Promise<CatalogType | null>;
  saveType(type: CatalogType): Promise<CatalogType>;
  /** Xóa vật lý một nhóm danh mục (chỉ nhóm admin tự thêm & rỗng — kiểm rào ở use-case). */
  deleteType(id: string): Promise<void>;
  /** Số mục theo từng mã nhóm — phục vụ badge đếm ở giao diện quản trị. */
  countItemsByType(): Promise<Record<string, number>>;
  /** Số mục trong một nhóm — dùng làm rào chặn xóa nhóm còn dữ liệu. */
  countItemsOfType(typeCode: string): Promise<number>;
  findItems(criteria: CatalogItemSearchCriteria): Promise<PaginatedResult<CatalogItem>>;
  findItemById(id: string): Promise<CatalogItem | null>;
  findItemByCode(typeCode: string, code: string): Promise<CatalogItem | null>;
  findItemByName(typeCode: string, name: string): Promise<CatalogItem | null>;
  findItemBySortOrder(typeCode: string, sortOrder: number): Promise<CatalogItem | null>;
  saveItem(item: CatalogItem): Promise<CatalogItem>;
  /** Xóa vật lý một mục danh mục (chỉ mục admin tự thêm & chưa dùng — kiểm rào ở use-case). */
  deleteItem(id: string): Promise<void>;
  /** Seed idempotent danh mục nền: chỉ thêm loại/mục còn thiếu. */
  ensure(seeds: CatalogTypeSeed[]): Promise<void>;
}
