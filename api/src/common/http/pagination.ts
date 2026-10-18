/**
 * Quy ước phân trang dùng chung cho mọi endpoint danh sách (kế hoạch MVP P1).
 * `page` bắt đầu từ 1, `pageSize` mặc định 20 và tối đa 100.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  stats?: Record<string, number>;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface NormalizedPaging {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function normalizePaging(page?: number, pageSize?: number): NormalizedPaging {
  const safePage = Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : 1;
  const requested = Number.isFinite(pageSize) && (pageSize as number) > 0 ? Math.floor(pageSize as number) : DEFAULT_PAGE_SIZE;
  const safePageSize = Math.min(requested, MAX_PAGE_SIZE);
  return { page: safePage, pageSize: safePageSize, skip: (safePage - 1) * safePageSize, take: safePageSize };
}

/** Đóng gói kết quả đã truy vấn theo đúng quy ước trả về. */
export function toPaginatedResult<T>(
  items: T[],
  total: number,
  paging: NormalizedPaging,
  stats?: Record<string, number>,
): PaginatedResult<T> {
  const result: PaginatedResult<T> = { items, total, page: paging.page, pageSize: paging.pageSize };
  if (stats) result.stats = stats;
  return result;
}

/** Phân trang trong bộ nhớ — dùng cho danh mục tĩnh chưa có bảng riêng. */
export function paginateInMemory<T>(source: T[], page?: number, pageSize?: number): PaginatedResult<T> {
  const paging = normalizePaging(page, pageSize);
  return toPaginatedResult(source.slice(paging.skip, paging.skip + paging.take), source.length, paging);
}
