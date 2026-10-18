export const WORKFLOW_CHECKLIST_CATALOG = Symbol('WORKFLOW_CHECKLIST_CATALOG');
export const WORKFLOW_CHECKLIST_REPOSITORY = Symbol('WORKFLOW_CHECKLIST_REPOSITORY');

/** Mục kiểm tra khai trong danh mục `WORKFLOW_CHECKLIST` — cấu hình được, không cố định trong mã. */
export interface ChecklistDefinition {
  code: string;
  label: string;
  agencyCode: string;
  required: boolean;
}

/** Trạng thái tích của một mục trên một hồ sơ cụ thể. */
export interface ChecklistState {
  code: string;
  checked: boolean;
  note: string | null;
}

export interface WorkflowChecklistCatalog {
  listDefinitions(): Promise<ChecklistDefinition[]>;
}

export interface WorkflowChecklistRepository {
  listStates(dossierId: string): Promise<ChecklistState[]>;
  upsertStates(dossierId: string, actorId: string, states: ChecklistState[]): Promise<void>;
}
