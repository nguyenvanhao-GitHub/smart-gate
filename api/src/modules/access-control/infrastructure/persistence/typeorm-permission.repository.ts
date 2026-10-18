import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { PermissionRepository } from '../../application/ports/permission.repository';
import { Permission } from '../../domain/access-control.entities';
import { PermissionDefinition } from '../../domain/permission.catalog';
import { AccessControlMapper } from './access-control.mapper';
import { PermissionOrmEntity } from './permission.orm-entity';

@Injectable()
export class TypeOrmPermissionRepository implements PermissionRepository {
  constructor(
    @InjectRepository(PermissionOrmEntity)
    private readonly repository: Repository<PermissionOrmEntity>,
  ) {}

  async findAll(): Promise<Permission[]> {
    const rows = await this.repository.find({ order: { sortOrder: 'ASC' } });
    return rows.map((row) => AccessControlMapper.toPermission(row));
  }

  /**
   * Danh mục 60 mã quyền là hằng số của hệ thống nên được đồng bộ cả nhãn — quản trị viên
   * không sửa được bảng này trên giao diện, chỉ tick ma trận `role_permissions`.
   */
  async ensure(definitions: PermissionDefinition[]): Promise<void> {
    const existing = await this.repository.find();
    const byCode = new Map(existing.map((row) => [row.code, row]));
    const pending: PermissionOrmEntity[] = [];

    for (const definition of definitions) {
      const row = byCode.get(definition.code) ?? new PermissionOrmEntity();
      const isNew = !byCode.has(definition.code);
      if (isNew) {
        row.id = randomUUID();
        row.code = definition.code;
      } else if (
        row.module === definition.module &&
        row.moduleLabel === definition.moduleLabel &&
        row.action === definition.action &&
        row.actionLabel === definition.actionLabel &&
        row.name === definition.name &&
        row.sortOrder === definition.sortOrder
      ) {
        continue;
      }

      row.module = definition.module;
      row.moduleLabel = definition.moduleLabel;
      row.action = definition.action;
      row.actionLabel = definition.actionLabel;
      row.name = definition.name;
      row.sortOrder = definition.sortOrder;
      pending.push(row);
    }

    if (pending.length > 0) await this.repository.save(pending);
  }
}
