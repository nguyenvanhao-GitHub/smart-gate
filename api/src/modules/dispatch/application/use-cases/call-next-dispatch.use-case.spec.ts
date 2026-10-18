import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { makeAccess, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { CallNextDispatchUseCase } from './call-next-dispatch.use-case';

describe('CallNextDispatchUseCase (SG-60 · Gọi số tiếp theo)', () => {
  let useCase: CallNextDispatchUseCase;
  let assignmentsRepo: any;
  let declarationsRepo: any;
  let dataSource: any;
  let scopeService: any;
  let auditLogger: any;
  let notificationsPublisher: any;

  const access = makeAccess({
    userId: 'u-1',
    permissions: ['dispatch.create', 'dispatch.update'],
  });

  beforeEach(() => {
    assignmentsRepo = {
      findBoard: jest.fn(),
    };
    declarationsRepo = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    scopeService = {
      toCriteria: jest.fn().mockReturnValue({ unrestricted: true }),
      assertAccessible: jest.fn(),
    };
    auditLogger = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    notificationsPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new CallNextDispatchUseCase(
      assignmentsRepo,
      declarationsRepo,
      dataSource,
      scopeService,
      auditLogger,
      notificationsPublisher,
    );
  });

  it('gọi số tiếp theo thành công theo thứ tự FIFO (số thứ tự nhỏ nhất)', async () => {
    assignmentsRepo.findBoard.mockResolvedValue([
      {
        dossierId: 'd-2',
        dossierCode: 'HS-002',
        plateNumber: '29C-22222',
        enterpriseName: 'Cty B',
        dossierStatus: DeclarationStatus.WAITING_CALL,
        ticketNumber: 5,
        ticketIssuedDate: '2026-08-14',
        waitingSince: new Date('2026-08-14T08:10:00Z'),
        activeStepCodes: ['EXPORT_B2_ENTRY'],
      },
      {
        dossierId: 'd-1',
        dossierCode: 'HS-001',
        plateNumber: '29C-11111',
        enterpriseName: 'Cty A',
        dossierStatus: DeclarationStatus.WAITING_CALL,
        ticketNumber: 2,
        ticketIssuedDate: '2026-08-14',
        waitingSince: new Date('2026-08-14T08:00:00Z'),
        activeStepCodes: ['EXPORT_B2_ENTRY'],
      },
    ]);

    const d1 = makeDeclaration({ id: 'd-1', code: 'HS-001', status: DeclarationStatus.WAITING_CALL });
    declarationsRepo.findById.mockResolvedValue(d1);

    const result = await useCase.execute({
      actorId: 'u-1',
      access,
    });

    expect(result.called).toBe(true);
    expect(result.dossierId).toBe('d-1');
    expect(result.ticketNumber).toBe(2);
    expect(d1.status).toBe(DeclarationStatus.BUSINESS_PROCESSING);
    expect(declarationsRepo.save).toHaveBeenCalledWith(d1);
    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPATCH_CALL_NEXT',
        targetId: 'd-1',
      }),
    );
    expect(notificationsPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        titleKey: 'notification.vehicleInspectionTitle',
        recipientRoleCodes: ['SYS_ADMIN', 'ADMIN', 'BORDER_GUARD', 'CUSTOMS', 'QUARANTINE'],
      }),
    );
  });

  it('chỉ gửi thông báo cho Kiểm dịch khi gọi xe hồ sơ dịch tễ', async () => {
    const d1 = makeDeclaration({
      id: 'd-1',
      code: 'HS-001',
      status: DeclarationStatus.WAITING_CALL,
      epidemicFlag: true,
    });
    assignmentsRepo.findBoard.mockResolvedValue([
      {
        dossierId: 'd-1',
        dossierCode: 'HS-001',
        plateNumber: '29C-11111',
        enterpriseName: 'Cty A',
        dossierStatus: DeclarationStatus.WAITING_CALL,
        ticketNumber: 1,
        ticketIssuedDate: '2026-08-14',
        waitingSince: new Date('2026-08-14T08:00:00Z'),
        activeStepCodes: ['IMPORT_B2_ENTRY'],
      },
    ]);
    declarationsRepo.findById.mockResolvedValue(d1);

    await useCase.execute({
      actorId: 'u-1',
      access,
    });

    expect(notificationsPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        titleKey: 'notification.vehicleInspectionTitle',
        recipientRoleCodes: ['SYS_ADMIN', 'ADMIN', 'QUARANTINE'],
      }),
    );
  });

  it('trả về called: false khi không có xe nào đang chờ gọi', async () => {
    assignmentsRepo.findBoard.mockResolvedValue([
      {
        dossierId: 'd-3',
        dossierCode: 'HS-003',
        plateNumber: '29C-33333',
        dossierStatus: DeclarationStatus.BUSINESS_PROCESSING,
        activeStepCodes: ['EXPORT_B3_CUSTOMS'],
      },
    ]);

    const result = await useCase.execute({
      actorId: 'u-1',
      access,
    });

    expect(result.called).toBe(false);
    expect(result.message).toBe('dispatch.noWaitingVehicles');
    expect(declarationsRepo.save).not.toHaveBeenCalled();
  });

  it('gọi đích danh dossierId khi truyền tham số dossierId', async () => {
    const d2 = makeDeclaration({ id: 'd-2', code: 'HS-002', status: DeclarationStatus.WAITING_CALL });
    assignmentsRepo.findBoard.mockResolvedValue([]);
    declarationsRepo.findById.mockResolvedValue(d2);

    const result = await useCase.execute({
      dossierId: 'd-2',
      actorId: 'u-1',
      access,
    });

    expect(result.called).toBe(true);
    expect(result.dossierId).toBe('d-2');
    expect(d2.status).toBe(DeclarationStatus.BUSINESS_PROCESSING);
  });

  it('chỉ gọi xe trong khoảng ngày đang lọc trên bảng Điều phối (SG-144)', async () => {
    assignmentsRepo.findBoard.mockResolvedValue([]);
    const from = new Date('2026-08-01T00:00:00.000+07:00');
    const to = new Date('2026-08-19T23:59:59.999+07:00');

    await useCase.execute({ actorId: 'u-1', access, from, to });

    expect(assignmentsRepo.findBoard).toHaveBeenCalledWith(
      expect.objectContaining({ from, to }),
    );
  });

  it('cập nhật enteredAt của các bước kiểm tra chuyên ngành khi điều phối gọi xe', async () => {
    const d1 = makeDeclaration({ id: 'd-1', code: 'HS-001', status: DeclarationStatus.WAITING_CALL });
    assignmentsRepo.findBoard.mockResolvedValue([]);
    declarationsRepo.findById.mockResolvedValue(d1);

    await useCase.execute({
      dossierId: 'd-1',
      actorId: 'u-1',
      access,
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "workflow_instance_steps"'),
      expect.arrayContaining([expect.any(Date), 'd-1', expect.any(Array)]),
    );
  });
});
