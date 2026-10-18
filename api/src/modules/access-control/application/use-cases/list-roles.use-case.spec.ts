import { Role } from '../../domain/access-control.entities';
import { CreateRoleInput, RoleRepository, UpdateRoleInput } from '../ports/role.repository';
import { ListRolesUseCase } from './list-roles.use-case';

/**
 * F03 — Danh sách vai trò cho màn quản trị. Khóa: mỗi RoleSummary mang đủ trường, đặc biệt
 * `isActive` (mới thêm ở đợt khóa/mở khóa vai trò) để FE hiện badge "Đã khóa", và `userCount`
 * lấy đúng theo id vai trò (rỗng → 0).
 */

class FakeRoleRepository implements RoleRepository {
  constructor(
    private readonly rows: Role[],
    private readonly counts: Record<string, number>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.rows;
  }
  async countUsersByRole(): Promise<Record<string, number>> {
    return this.counts;
  }

  findById(): Promise<Role | null> {
    throw new Error('không mong đợi findById');
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
  setActive(): Promise<Role> {
    throw new Error('không mong đợi setActive');
  }
  delete(): Promise<void> {
    throw new Error('không mong đợi delete');
  }
}

function taoVaiTro(mau: Partial<Role> & Pick<Role, 'id' | 'code'>): Role {
  return { name: mau.code, description: null, isSystem: false, isActive: true, permissions: [], ...mau };
}

describe('ListRolesUseCase — danh sách vai trò (F03)', () => {
  it('ánh xạ đủ trường gồm isActive và userCount đúng theo id', async () => {
    const rows = [
      taoVaiTro({ id: 'r-1', code: 'SYS_ADMIN', name: 'Quản trị', isSystem: true, isActive: true }),
      taoVaiTro({ id: 'r-2', code: 'FEE_COLLECTOR', name: 'Cán bộ thu phí', isActive: false }),
    ];
    const useCase = new ListRolesUseCase(new FakeRoleRepository(rows, { 'r-1': 3 }));

    const list = await useCase.execute();

    expect(list).toEqual([
      { id: 'r-1', code: 'SYS_ADMIN', name: 'Quản trị', description: null, isSystem: true, isActive: true, userCount: 3 },
      { id: 'r-2', code: 'FEE_COLLECTOR', name: 'Cán bộ thu phí', description: null, isSystem: false, isActive: false, userCount: 0 },
    ]);
  });

  it('mọi vai trò đều lộ trường isActive kể cả khi bảng đếm rỗng', async () => {
    const rows = [taoVaiTro({ id: 'r-9', code: 'GATE_OFFICER', isActive: false })];
    const useCase = new ListRolesUseCase(new FakeRoleRepository(rows, {}));

    const [summary] = await useCase.execute();

    expect(summary).toEqual(expect.objectContaining({ isActive: false, userCount: 0 }));
    expect('isActive' in summary).toBe(true);
  });
});
