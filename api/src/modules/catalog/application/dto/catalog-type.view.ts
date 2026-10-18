/** Nhóm danh mục kèm số mục bên trong — dạng đọc cho màn quản trị (badge đếm). */
export interface CatalogTypeView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
  itemCount: number;
}
