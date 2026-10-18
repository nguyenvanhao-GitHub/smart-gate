import { UsersController } from './users.controller';

describe('UsersController — GET /users/lookup authorization (SG-281)', () => {
  let controller: UsersController;
  let lookupUserUseCase: { execute: jest.Mock };

  beforeEach(() => {
    lookupUserUseCase = { execute: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Test User' }) };
    controller = new UsersController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      lookupUserUseCase as any,
    );
  });

  it('từ chối (403) khi tài khoản không thuộc PRIVILEGED_ROLES (ví dụ DECLARANT thông thường)', async () => {
    await expect(
      controller.lookup('0101234567', undefined, undefined, 'ENTERPRISE', {
        sub: 'user-normal',
        username: 'declarant1',
        roles: ['DECLARANT'],
      } as any),
    ).rejects.toThrow();
    expect(lookupUserUseCase.execute).not.toHaveBeenCalled();
  });

  it('cho phép tra cứu khi tài khoản là CUSTOMS', async () => {
    const res = await controller.lookup('0101234567', undefined, undefined, 'ENTERPRISE', {
      sub: 'officer-1',
      username: 'customs_officer',
      roles: ['CUSTOMS'],
    } as any);

    expect(lookupUserUseCase.execute).toHaveBeenCalledWith({
      taxCode: '0101234567',
      idNumber: undefined,
      email: undefined,
      accountType: 'ENTERPRISE',
    });
    expect(res).toEqual({ id: 'user-1', displayName: 'Test User' });
  });

  it('cho phép tra cứu khi tài khoản là SYS_ADMIN', async () => {
    await controller.lookup(undefined, '038090001234', undefined, 'INDIVIDUAL', {
      sub: 'admin-1',
      username: 'admin',
      roles: ['SYS_ADMIN'],
    } as any);

    expect(lookupUserUseCase.execute).toHaveBeenCalledWith({
      taxCode: undefined,
      idNumber: '038090001234',
      email: undefined,
      accountType: 'INDIVIDUAL',
    });
  });
});
