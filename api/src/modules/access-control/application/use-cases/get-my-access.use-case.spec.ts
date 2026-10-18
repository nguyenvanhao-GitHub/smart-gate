import { GetMyAccessUseCase } from './get-my-access.use-case';
import { DirectoryUser, UserDirectory } from '../ports/user-directory.repository';
import { UserAccessRepository } from '../ports/user-access.repository';
import { OrganizationRepository } from '../ports/organization.repository';
import { UserAccessSnapshot, Organization } from '../../domain/access-control.entities';

describe('GetMyAccessUseCase', () => {
  it('trả về đầy đủ thông tin user bao gồm idNumber và taxCode', async () => {
    const fakeDirectoryUser: DirectoryUser = {
      id: 'user-1',
      username: 'huytesting',
      displayName: 'Huy Testing',
      title: 'Cán bộ',
      email: 'huytesting@gmail.com',
      phone: '0987536241',
      address: 'Hà Nội',
      status: 'ACTIVE',
      organizationId: null,
      accountType: 'INDIVIDUAL',
      taxCode: null,
      idNumber: '001200012345',
      representativeName: null,
      avatarUrl: null,
    };

    const fakeUserDirectory: UserDirectory = {
      findById: jest.fn().mockResolvedValue(fakeDirectoryUser),
      findAll: jest.fn().mockResolvedValue([fakeDirectoryUser]),
      setOrganization: jest.fn().mockResolvedValue(undefined),
      findIdsByTaxCode: jest.fn().mockResolvedValue([]),
      findIdsByRoleCode: jest.fn().mockResolvedValue([]),
      findIdsByRoleCodes: jest.fn().mockResolvedValue([]),
      findIdsByStepCode: jest.fn().mockResolvedValue([]),
    };

    const fakeSnapshot: UserAccessSnapshot = {
      userId: 'user-1',
      roles: [],
      permissions: [],
      assignments: [],
    };

    const fakeUserAccessRepo: UserAccessRepository = {
      loadSnapshot: jest.fn().mockResolvedValue(fakeSnapshot),
      listRoles: jest.fn().mockResolvedValue([]),
      listRolesForUsers: jest.fn().mockResolvedValue({}),
      listAssignments: jest.fn().mockResolvedValue([]),
      replaceRoles: jest.fn().mockResolvedValue([]),
      replaceAssignments: jest.fn().mockResolvedValue([]),
      countRoles: jest.fn().mockResolvedValue(0),
    };

    const fakeOrgRepo: OrganizationRepository = {
      findAll: jest.fn().mockResolvedValue([] as Organization[]),
      findByCode: jest.fn().mockResolvedValue(null),
      ensure: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new GetMyAccessUseCase(fakeUserDirectory, fakeUserAccessRepo, fakeOrgRepo);

    const result = await useCase.execute('user-1');

    expect(result.user.idNumber).toBe('001200012345');
    expect(result.user.accountType).toBe('INDIVIDUAL');
    expect(result.user.email).toBe('huytesting@gmail.com');
    expect(result.user.phone).toBe('0987536241');
    expect(result.user.address).toBe('Hà Nội');
  });
});
