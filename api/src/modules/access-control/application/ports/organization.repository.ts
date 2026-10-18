import { Organization } from '../../domain/access-control.entities';
import { OrganizationDefinition } from '../../domain/organization.catalog';

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');

export interface OrganizationRepository {
  findAll(): Promise<Organization[]>;
  findByCode(code: string): Promise<Organization | null>;
  /** Seed idempotent: thêm mới nếu chưa có, giữ nguyên bản ghi đã bị quản trị viên sửa. */
  ensure(definitions: OrganizationDefinition[]): Promise<void>;
}
