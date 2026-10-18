export interface CreateCatalogItemCommand {
  typeCode: string;
  code: string;
  name: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}
