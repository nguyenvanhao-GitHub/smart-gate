export const DOSSIER_FIELD_CONFIG_REPOSITORY = Symbol('DOSSIER_FIELD_CONFIG_REPOSITORY');

export interface DossierFieldConfigSaved {
  id?: string;
  dossierTypeCode: string;
  fieldKey: string;
  isVisible: boolean;
  isRequired: boolean;
  isDefault: boolean;
}

export interface DossierFieldConfigRepository {
  findSavedConfigs(dossierTypeCode: string): Promise<DossierFieldConfigSaved[]>;
  listDocumentTypeItems(): Promise<Array<{ code: string; name: string }>>;
  saveConfig(dossierTypeCode: string, fieldKey: string, isVisible: boolean, isRequired: boolean, isDefault: boolean): Promise<void>;
}
