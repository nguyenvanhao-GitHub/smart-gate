import { LookupUserUseCase } from './lookup-user.use-case';
import { UserRepository } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';
import { UserAccount, AccountType } from '../../domain/user.entity';

describe('LookupUserUseCase', () => {
  let useCase: LookupUserUseCase;
  let userRepo: jest.Mocked<UserRepository>;
  let assembler: jest.Mocked<UserViewAssembler>;

  const mockUser = UserAccount.create({
    username: 'testuser',
    passwordHash: 'hash',
    displayName: 'Test User',
    title: 'Title',
    defaultRoute: '/dashboard',
    email: 'test@example.com',
    phone: '0912345678',
    accountType: AccountType.INDIVIDUAL,
    idNumber: '123456789012',
    address: 'Ha Noi',
  });

  beforeEach(() => {
    userRepo = {
      count: jest.fn(),
      findMany: jest.fn(),
      findById: jest.fn(),
      findByUsername: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByTaxCode: jest.fn(),
      findByIdNumber: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    assembler = {
      assemble: jest.fn().mockImplementation(async (u: UserAccount) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        title: u.title,
        email: u.email,
        phone: u.phone,
        defaultRoute: u.defaultRoute,
        accountType: u.accountType,
        taxCode: u.taxCode,
        idNumber: u.idNumber,
        address: u.address,
        representativeName: u.representativeName,
        avatarUrl: u.avatarUrl,
        isProtected: u.isProtected,
        organizationId: u.organizationId,
        organization: null,
        roles: [],
        status: u.status,
        lockReason: u.lockReason,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      assembleMany: jest.fn(),
    } as unknown as jest.Mocked<UserViewAssembler>;

    useCase = new LookupUserUseCase(userRepo, assembler);
  });

  it('should lookup user by idNumber for individual account', async () => {
    userRepo.findByIdNumber.mockResolvedValue(mockUser);

    const result = await useCase.execute({ idNumber: '123456789012' });

    expect(userRepo.findByIdNumber).toHaveBeenCalledWith('123456789012');
    expect(result?.displayName).toBe('Test User');
  });

  it('should lookup user by accountType = INDIVIDUAL using idNumber or taxCode', async () => {
    userRepo.findByIdNumber.mockResolvedValue(mockUser);

    const result = await useCase.execute({ accountType: 'INDIVIDUAL', taxCode: '123456789012' });

    expect(userRepo.findByIdNumber).toHaveBeenCalledWith('123456789012');
    expect(result?.displayName).toBe('Test User');
  });

  it('should lookup user by taxCode for enterprise account', async () => {
    userRepo.findByTaxCode.mockResolvedValue(mockUser);

    const result = await useCase.execute({ taxCode: '0101234567' });

    expect(userRepo.findByTaxCode).toHaveBeenCalledWith('0101234567');
    expect(result?.displayName).toBe('Test User');
  });

  it('should lookup user by accountType = ENTERPRISE using taxCode or idNumber fallback', async () => {
    userRepo.findByTaxCode.mockResolvedValue(mockUser);

    const result = await useCase.execute({ accountType: 'ENTERPRISE', idNumber: '0101234567' });

    expect(userRepo.findByTaxCode).toHaveBeenCalledWith('0101234567');
    expect(result?.displayName).toBe('Test User');
  });

  it('should lookup user by accountType = INTERNAL using email', async () => {
    userRepo.findByEmail.mockResolvedValue(mockUser);

    const result = await useCase.execute({ accountType: 'INTERNAL', email: 'officer@smartgate.vn' });

    expect(userRepo.findByEmail).toHaveBeenCalledWith('officer@smartgate.vn');
    expect(result?.displayName).toBe('Test User');
  });

  it('should return null when user is not found', async () => {
    userRepo.findByIdNumber.mockResolvedValue(null);

    const result = await useCase.execute({ idNumber: '999999999999' });

    expect(result).toBeNull();
  });

  it('SG-281: thu hẹp payload, không làm lộ các trường nhạy cảm (roles, status, lockReason, lastLoginAt)', async () => {
    userRepo.findByIdNumber.mockResolvedValue(mockUser);

    const result = await useCase.execute({ idNumber: '123456789012' });

    expect(result).toBeDefined();
    expect(result?.displayName).toBe('Test User');
    expect((result as any).roles).toBeUndefined();
    expect((result as any).status).toBeUndefined();
    expect((result as any).lockReason).toBeUndefined();
    expect((result as any).lastLoginAt).toBeUndefined();
    expect((result as any).passwordHash).toBeUndefined();
  });
});
