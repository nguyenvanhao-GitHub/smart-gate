export interface UpdateCatalogItemCommand {
  typeCode: string;
  itemId: string;
  name?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}
