import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { WorkflowStepRoleRepository } from '../../application/ports/workflow-step-role.repository';
import { WorkflowStepRole } from '../../domain/access-control.entities';
import { WorkflowStepRoleDefinition } from '../../domain/workflow-step-role.catalog';
import { RoleOrmEntity } from './role.orm-entity';
import { WorkflowStepRoleOrmEntity } from './workflow-step-role.orm-entity';

@Injectable()
export class TypeOrmWorkflowStepRoleRepository implements WorkflowStepRoleRepository {
  constructor(
    @InjectRepository(WorkflowStepRoleOrmEntity)
    private readonly repository: Repository<WorkflowStepRoleOrmEntity>,
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
  ) {}

  async findAll(): Promise<WorkflowStepRole[]> {
    const rows = await this.repository.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    const roleCodeById = await this.roleCodeById();
    return rows.map((row) => ({
      stepCode: row.stepCode,
      force: row.force,
      roleCode: roleCodeById.get(row.roleId) || '',
      sortOrder: row.sortOrder,
    }));
  }

  /** Seed idempotent theo cặp (bước, vai trò); bỏ qua bản ghi đã có để không ghi đè cấu hình. */
  async ensure(definitions: WorkflowStepRoleDefinition[]): Promise<void> {
    const roleIdByCode = new Map([...(await this.roleCodeById())].map(([id, code]) => [code, id]));
    const existing = await this.repository.find();
    const seen = new Set(existing.map((row) => `${row.stepCode}::${row.roleId}`));
    const pending: WorkflowStepRoleOrmEntity[] = [];

    for (const definition of definitions) {
      const roleId = roleIdByCode.get(definition.roleCode);
      if (!roleId) continue;
      const key = `${definition.stepCode}::${roleId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const row = new WorkflowStepRoleOrmEntity();
      row.id = randomUUID();
      row.stepCode = definition.stepCode;
      row.force = definition.force;
      row.roleId = roleId;
      row.sortOrder = definition.sortOrder;
      row.isActive = true;
      pending.push(row);
    }

    if (pending.length > 0) await this.repository.save(pending);
  }

  private async roleCodeById(): Promise<Map<string, string>> {
    const rows = await this.roles.find();
    return new Map(rows.map((row) => [row.id, row.code]));
  }
}
