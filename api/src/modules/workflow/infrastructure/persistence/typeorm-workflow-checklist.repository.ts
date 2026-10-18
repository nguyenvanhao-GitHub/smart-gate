import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { ChecklistState, WorkflowChecklistRepository } from '../../application/ports/workflow-checklist.port';
import { WorkflowChecklistStateOrmEntity } from './workflow-checklist-state.orm-entity';

@Injectable()
export class TypeOrmWorkflowChecklistRepository implements WorkflowChecklistRepository {
  constructor(
    @InjectRepository(WorkflowChecklistStateOrmEntity)
    private readonly states: Repository<WorkflowChecklistStateOrmEntity>,
  ) {}

  async listStates(dossierId: string): Promise<ChecklistState[]> {
    const rows = await this.states.find({ where: { dossierId } });
    return rows.map((row) => ({ code: row.code, checked: row.checked, note: row.note }));
  }

  /** Ghi đè theo cặp (hồ sơ, mã mục): mục chưa có thì thêm, đã có thì cập nhật. */
  async upsertStates(dossierId: string, actorId: string, states: ChecklistState[]): Promise<void> {
    if (states.length === 0) return;
    const codes = states.map((state) => state.code);
    const existing = await this.states.find({ where: { dossierId, code: In(codes) } });
    const byCode = new Map(existing.map((row) => [row.code, row]));

    const rows = states.map((state) => {
      const row = byCode.get(state.code) ?? new WorkflowChecklistStateOrmEntity();
      row.id = row.id || randomUUID();
      row.dossierId = dossierId;
      row.code = state.code;
      row.checked = state.checked;
      row.note = state.note ?? null;
      row.updatedById = actorId;
      return row;
    });
    await this.states.save(rows);
  }
}
