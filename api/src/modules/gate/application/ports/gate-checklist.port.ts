export const GATE_CHECKLIST_CATALOG = Symbol('GATE_CHECKLIST_CATALOG');

/** Một mục kiểm tra tại cổng, đọc từ danh mục `GATE_CHECKLIST` (F39). */
export interface GateChecklistDefinition {
  code: string;
  label: string;
  /** Bắt buộc tích thì mới xác nhận cho qua cổng được. */
  required: boolean;
}

export interface GateChecklistCatalog {
  listDefinitions(): Promise<GateChecklistDefinition[]>;
}
