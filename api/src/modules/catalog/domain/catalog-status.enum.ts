/**
 * Trạng thái mục danh mục. F04 quy định danh mục đã phát sinh dữ liệu **chỉ được khóa**,
 * vì vậy không có trạng thái "đã xóa" và cũng không có API xóa vật lý.
 */
export enum CatalogItemStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}

export const CATALOG_ITEM_STATUS_LABELS: Record<CatalogItemStatus, string> = {
  [CatalogItemStatus.ACTIVE]: 'Đang dùng',
  [CatalogItemStatus.LOCKED]: 'Đã khóa',
};
