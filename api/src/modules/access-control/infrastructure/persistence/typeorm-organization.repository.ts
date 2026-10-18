import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { OrganizationRepository } from '../../application/ports/organization.repository';
import { Organization } from '../../domain/access-control.entities';
import { OrganizationDefinition } from '../../domain/organization.catalog';
import { AccessControlMapper } from './access-control.mapper';
import { OrganizationOrmEntity } from './organization.orm-entity';

@Injectable()
export class TypeOrmOrganizationRepository implements OrganizationRepository {
  constructor(
    @InjectRepository(OrganizationOrmEntity)
    private readonly repository: Repository<OrganizationOrmEntity>,
  ) {}

  async findAll(): Promise<Organization[]> {
    const rows = await this.repository.find({ order: { code: 'ASC' } });
    return rows.map((row) => AccessControlMapper.toOrganization(row));
  }

  async findByCode(code: string): Promise<Organization | null> {
    const row = await this.repository.findOne({ where: { code } });
    return row ? AccessControlMapper.toOrganization(row) : null;
  }

  /**
   * Seed idempotent: chỉ thêm đơn vị còn thiếu, không đụng tới tên/trạng thái mà quản trị viên
   * đã chỉnh. Chạy 2 lượt vì `parent_id` phải trỏ tới bản ghi đã tồn tại.
   */
  async ensure(definitions: OrganizationDefinition[]): Promise<void> {
    const existing = await this.repository.find();
    const idByCode = new Map(existing.map((row) => [row.code, row.id]));

    for (const definition of definitions) {
      if (idByCode.has(definition.code)) continue;
      const row = new OrganizationOrmEntity();
      row.id = randomUUID();
      row.code = definition.code;
      row.name = definition.name;
      row.type = definition.type;
      row.parentId = null;
      row.isActive = true;
      await this.repository.save(row);
      idByCode.set(row.code, row.id);
    }

    for (const definition of definitions) {
      if (!definition.parentCode) continue;
      const id = idByCode.get(definition.code);
      const parentId = idByCode.get(definition.parentCode);
      if (!id || !parentId) continue;
      const row = await this.repository.findOne({ where: { id } });
      if (!row || row.parentId) continue;
      row.parentId = parentId;
      await this.repository.save(row);
    }
  }
}
