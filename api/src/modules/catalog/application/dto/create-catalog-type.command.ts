export interface CreateCatalogTypeCommand {
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}
