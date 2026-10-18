export interface UpdateCatalogTypeCommand {
  typeCode: string;
  name?: string;
  description?: string | null;
  sortOrder?: number;
}
