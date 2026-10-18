import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { Role } from '../../domain/access-control.entities';
import { CreateRoleInput, RoleRepository, UpdateRoleInput } from '../ports/role.repository';
import { SetRoleActiveUseCase } from './set-role-active.use-case';

/**
 * F03 — Khóa / mở khóa vai trò. Khóa đặt `roles.is_active = false`; bộ giải quyết quyền runtime bỏ
 * vai trò bị khóa nên quyền của mọi người giữ vai trò đó treo ngay. Ba nhánh cần khóa chặt:
 * (1) KHÔNG cho khóa vai trò hệ thống — tránh tự khóa admin; (2) vai trò không tồn tại → 404;
 * (3) khóa/mở khóa hợp lệ → gọi đúng `setActive(id, active)` và ghi kiểm toán đúng chiều.
 */

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

/** Kho vai trò trong bộ nhớ — chỉ hiện thực các method use-case chạm tới, còn lại ném để lộ gọi nhầm. */
class FakeRoleRepository implements RoleRepository {
  readonly setActiveCalls: Array<{ id: string; active: boolean }> = [];
  private readonly rows: Role[];

  constructor(rows: Role[]) {
    this.rows = rows;
  }

  async findById(id: string): Promise<Role | null> {
    const found = this.rows.find((role) => role.id === id);
    // Trả BẢN SAO như repository thật (mỗi truy vấn dựng object mới) — tránh việc `setActive`
    // mutate cùng tham chiếu làm `before` của use-case bị đổi theo.
    return found ? { ...found } : null;
  }

  async setActive(id: string, active: boolean): Promise<Role> {
    this.setActiveCalls.push({ id, active });
    const current = this.rows.find((role) => role.id === id);
    if (!current) throw new Error('setActive gọi trên vai trò không tồn tại');
    current.isActive = active;
    return { ...current };
  }

  async countUsersByRole(): Promise<Record<string, number>> {
    return {};
  }

  // --- Không dùng trong use-case này; gọi tới nghĩa là hiện thực sai luồng. ---
  findAll(): Promise<Role[]> {
    throw new Error('không mong đợi findAll');
  }
  findByCode(): Promise<Role | null> {
    throw new Error('không mong đợi findByCode');
  }
  ensure(): Promise<void> {
    throw new Error('không mong đợi ensure');
  }
  replacePermissions(): Promise<Role> {
    throw new Error('không mong đợi replacePermissions');
  }
  create(_input: CreateRoleInput): Promise<Role> {
    throw new Error('không mong đợi create');
  }
  update(_id: string, _input: UpdateRoleInput): Promise<Role> {
    throw new Error('không mong đợi update');
  }
  delete(): Promise<void> {
    throw new Error('không mong đợi delete');
  }
}

function taoVaiTro(mau: Partial<Role> & Pick<Role, 'id' | 'code'>): Role {
  return {
    name: mau.code,
    description: null,
    isSystem: false,
    isActive: true,
    permissions: [],
    ...mau,
  };
}

describe('SetRoleActiveUseCase — khóa / mở khóa vai trò (F03)', () => {
  function dung(rows: Role[]) {
    const roles = new FakeRoleRepository(rows);
    const audit = new RecordingAudit();
    return { roles, audit, useCase: new SetRoleActiveUseCase(roles, audit) };
  }

  it('khóa vai trò hệ thống thì bị chặn (400 role.systemCannotLock), không gọi setActive', async () => {
    const heThong = taoVaiTro({ id: 'r-sys', code: 'SYS_ADMIN', isSystem: true });
    const { useCase, roles } = dung([heThong]);

    await expect(useCase.execute('r-sys', false)).rejects.toBeInstanceOf(BadRequestException);
    expect(roles.setActiveCalls).toHaveLength(0);

    try {
      await useCase.execute('r-sys', false);
    } catch (thrown) {
      expect((thrown as BadRequestException).getResponse()).toMatchObject({ messageKey: 'role.systemCannotLock' });
    }
  });

  it('vai trò không tồn tại thì ném 404 role.notFound', async () => {
    const { useCase, roles } = dung([]);

    await expect(useCase.execute('khong-co', false)).rejects.toBeInstanceOf(NotFoundException);
    expect(roles.setActiveCalls).toHaveLength(0);

    try {
      await useCase.execute('khong-co', false);
    } catch (thrown) {
      expect((thrown as NotFoundException).getResponse()).toMatchObject({ messageKey: 'role.notFound' });
    }
  });

  it('khóa vai trò thường thì gọi setActive(id, false) và ghi kiểm toán ROLE_LOCK', async () => {
    const thuong = taoVaiTro({ id: 'r-1', code: 'FEE_COLLECTOR', isActive: true });
    const { useCase, roles, audit } = dung([thuong]);

    const view = await useCase.execute('r-1', false);

    expect(roles.setActiveCalls).toEqual([{ id: 'r-1', active: false }]);
    expect(view.isActive).toBe(false);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'ROLE_LOCK',
      targetType: 'ROLE',
      targetId: 'r-1',
      before: { isActive: true },
      after: { isActive: false },
    });
  });

  it('mở khóa vai trò đang khóa thì gọi setActive(id, true) và ghi kiểm toán ROLE_UNLOCK', async () => {
    const daKhoa = taoVaiTro({ id: 'r-2', code: 'QUARANTINE', isActive: false });
    const { useCase, roles, audit } = dung([daKhoa]);

    const view = await useCase.execute('r-2', true);

    expect(roles.setActiveCalls).toEqual([{ id: 'r-2', active: true }]);
    expect(view.isActive).toBe(true);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'ROLE_UNLOCK',
      targetType: 'ROLE',
      targetId: 'r-2',
      before: { isActive: false },
      after: { isActive: true },
    });
  });

  it('mở khóa vai trò hệ thống VẪN được phép (chỉ khóa mới bị chặn)', async () => {
    const heThong = taoVaiTro({ id: 'r-sys', code: 'SYS_ADMIN', isSystem: true, isActive: false });
    const { useCase, roles } = dung([heThong]);

    const view = await useCase.execute('r-sys', true);

    expect(roles.setActiveCalls).toEqual([{ id: 'r-sys', active: true }]);
    expect(view.isActive).toBe(true);
  });

  it('RoleSummary trả về mang đủ trường gồm isActive để FE hiện badge khóa', async () => {
    const thuong = taoVaiTro({ id: 'r-3', code: 'GATE_OFFICER', name: 'Cán bộ cổng', isActive: true });
    const { useCase } = dung([thuong]);

    const view = await useCase.execute('r-3', false);

    expect(view.id).toBe('r-3');
    expect(view.code).toBe('GATE_OFFICER');
    expect(view.name).toBe('Cán bộ cổng');
    expect(view.isSystem).toBe(false);
    expect(view.isActive).toBe(false);
    expect(view.userCount).toBe(0);
  });
});
