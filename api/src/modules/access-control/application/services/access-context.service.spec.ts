import { AccessContextService } from './access-context.service';
import { UserAccessRepository } from '../ports/user-access.repository';
import { UserAccessSnapshot } from '../../domain/access-control.entities';
import { DirectoryUser, UserDirectory } from '../ports/user-directory.repository';
import { AssignmentType } from '../../domain/assignment-type.enum';
import { DataScopeLevel } from '../../domain/data-scope.enum';
import { UserStatus } from '../../../identity/domain/user.entity';

class FakeUserDirectory implements Partial<UserDirectory> {
  private users = new Map<string, DirectoryUser>();

  addUser(user: DirectoryUser) {
    this.users.set(user.id, user);
  }

  findById(userId: string): Promise<DirectoryUser | null> {
    return Promise.resolve(this.users.get(userId) ?? null);
  }
}

class FakeUserAccessRepository implements Partial<UserAccessRepository> {
  private snapshots = new Map<string, UserAccessSnapshot>();

  setSnapshot(userId: string, snapshot: UserAccessSnapshot) {
    this.snapshots.set(userId, snapshot);
  }

  loadSnapshot(userId: string): Promise<UserAccessSnapshot> {
    return Promise.resolve(
      this.snapshots.get(userId) ?? {
        userId,
        roles: [],
        permissions: [],
        assignments: [],
      },
    );
  }
}

describe('AccessContextService', () => {
  let service: AccessContextService;
  let userDirectory: FakeUserDirectory;
  let userAccessRepo: FakeUserAccessRepository;

  beforeEach(() => {
    userDirectory = new FakeUserDirectory();
    userAccessRepo = new FakeUserAccessRepository();
    service = new AccessContextService(
      userAccessRepo as unknown as UserAccessRepository,
      userDirectory as unknown as UserDirectory,
    );
  });

  it('SG-269: tự động thêm assignment TAX_CODE từ user.taxCode nếu chưa có', async () => {
    const user: DirectoryUser = {
      id: 'dn-user-1',
      username: 'doanhnghiep',
      displayName: 'Công ty ABC',
      title: 'Doanh nghiệp',
      status: UserStatus.ACTIVE,
      email: null,
      phone: null,
      address: null,
      organizationId: null,
      accountType: null,
      taxCode: '0101234567',
      idNumber: null,
      representativeName: null,
      avatarUrl: null,
    };
    userDirectory.addUser(user);

    userAccessRepo.setSnapshot('dn-user-1', {
      userId: 'dn-user-1',
      roles: [{ roleCode: 'ENTERPRISE', roleName: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN, organizationId: null, organizationCode: null }],
      permissions: ['dossiers.read'],
      assignments: [],
    });

    const context = await service.loadForUser('dn-user-1');
    expect(context.userId).toBe('dn-user-1');
    const taxAssignment = context.assignments.find((a) => a.type === AssignmentType.TAX_CODE);
    expect(taxAssignment).toBeDefined();
    expect(taxAssignment?.value).toBe('0101234567');
    expect(taxAssignment?.label).toBe('Công ty ABC');
  });

  it('SG-269: không nhân bản assignment TAX_CODE nếu user đã có assignment', async () => {
    const user: DirectoryUser = {
      id: 'dn-user-2',
      username: 'doanhnghiep2',
      displayName: 'Công ty XYZ',
      title: 'Doanh nghiệp',
      status: UserStatus.ACTIVE,
      email: null,
      phone: null,
      address: null,
      organizationId: null,
      accountType: null,
      taxCode: '0101234567',
      idNumber: null,
      representativeName: null,
      avatarUrl: null,
    };
    userDirectory.addUser(user);

    userAccessRepo.setSnapshot('dn-user-2', {
      userId: 'dn-user-2',
      roles: [],
      permissions: [],
      assignments: [{ type: AssignmentType.TAX_CODE, value: '0101234567', label: 'Custom Label', organizationId: null }],
    });

    const context = await service.loadForUser('dn-user-2');
    const taxAssignments = context.assignments.filter((a) => a.type === AssignmentType.TAX_CODE);
    expect(taxAssignments).toHaveLength(1);
    expect(taxAssignments[0].label).toBe('Custom Label');
  });
});
