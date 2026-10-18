import { Inject, Injectable } from '@nestjs/common';
import { OrganizationNodeDto } from '../dto/access-view.dto';
import { ORGANIZATION_REPOSITORY, OrganizationRepository } from '../ports/organization.repository';

/**
 * Trả danh sách phẳng kèm `parentId` — web tự dựng cây. Cách này giữ nguyên thứ tự mã đơn vị và
 * không cần đệ quy ở tầng API.
 */
@Injectable()
export class ListOrganizationsUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  async execute(): Promise<OrganizationNodeDto[]> {
    const rows = await this.organizations.findAll();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      parentId: row.parentId,
      status: row.isActive ? 'ACTIVE' : 'INACTIVE',
    }));
  }
}
