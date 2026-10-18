import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { translate } from '../../../../common/i18n/translate';
import {
  NotificationPublisher,
  PublishNotificationInput,
} from '../../../../common/notifications/notification-publisher.port';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';

import { AppointmentStatus, DeclarationStatus } from '../../domain/declaration.enums';
import { parseDossierQrPayload } from '../../domain/dossier-qr';
import {
  FakeDossierAttachments,
  FakeRequiredDocumentCatalog,
  InMemoryDeclarationRepository,
  makeAccess,
  makeCompleteDraft,
} from '../../testing/declaration.fixture';
import { DossierScopeService } from '../services/dossier-scope.service';
import { SubmitDeclarationUseCase } from './submit-declaration.use-case';
import { ValidateDeclarationUseCase } from './validate-declaration.use-case';

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

class RecordingNotifications implements NotificationPublisher {
  readonly entries: PublishNotificationInput[] = [];

  async publish(input: PublishNotificationInput): Promise<void> {
    const title = input.titleKey ? translate(input.titleKey, input.titleParams, 'vi') : input.title;
    const content = input.contentKey ? translate(input.contentKey, input.contentParams, 'vi') : input.content;
    this.entries.push({ ...input, title, content });
  }
}

/** Điều kiện nghiệm thu P2: gửi được thì nhận mã + QR; thiếu dữ liệu thì bị chặn kèm danh sách lỗi. */
describe('SubmitDeclarationUseCase', () => {
  const actor = { actorId: 'user-dn-a', actorRole: 'ENTERPRISE' };

  function build(
    declaration = makeCompleteDraft({ createdById: 'user-dn-a' }),
    required = new FakeRequiredDocumentCatalog(),
    attachments = new FakeDossierAttachments(),
  ) {
    const declarations = new InMemoryDeclarationRepository([declaration]);
    const scope = new DossierScopeService(new DataScopeService());
    const validate = new ValidateDeclarationUseCase(declarations, attachments, required, scope);
    const audit = new RecordingAudit();
    const notifications = new RecordingNotifications();
    return {
      declaration,
      declarations,
      audit,
      notifications,
      useCase: new SubmitDeclarationUseCase(declarations, validate, scope, audit, notifications),
    };
  }

  it('gửi thành công thì trả mã hồ sơ, chuỗi QR và thời điểm gửi', async () => {
    const { useCase, declaration } = build();

    const result = await useCase.execute({
      declarationId: declaration.id,
      access: makeAccess({ userId: 'user-dn-a' }),
      ...actor,
    });

    expect(result.code).toBe(declaration.code);
    expect(result.submittedAt).toBeInstanceOf(Date);
    // Chuỗi QR phải giải mã ngược ra đúng mã hồ sơ để cổng tra cứu được.
    expect(parseDossierQrPayload(result.qrCode)?.code).toBe(declaration.code);
  });

  it('đổi trạng thái sang WAITING_GATE và ghi vết vào nhật ký hồ sơ', async () => {
    const { useCase, declaration } = build();

    await useCase.execute({ declarationId: declaration.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor });

    expect(declaration.status).toBe(DeclarationStatus.WAITING_GATE);
    expect(declaration.auditTrail.at(-1)).toMatchObject({
      action: 'SUBMIT',
      fromStatus: DeclarationStatus.DRAFT,
      toStatus: DeclarationStatus.WAITING_GATE,
    });
  });

  it('CHẶN hồ sơ thiếu dữ liệu, trả 400 kèm danh sách lỗi theo từng trường', async () => {
    const draft = makeCompleteDraft({ createdById: 'user-dn-a', driver: null, vehicles: [{ plateNumber: '', vehicleType: 'TRUCK' }] });
    const { useCase, declarations } = build(draft);

    await expect(
      useCase.execute({ declarationId: draft.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor }),
    ).rejects.toBeInstanceOf(BadRequestException);

    let response: { message: string; errors: unknown[] } | undefined;
    try {
      await useCase.execute({ declarationId: draft.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor });
    } catch (thrown) {
      response = (thrown as BadRequestException).getResponse() as { message: string; errors: unknown[] };
    }

    expect(response?.errors).toEqual([
      { field: 'vehicles[0].plateNumber', message: 'Chưa khai biển kiểm soát.', messageKey: 'dossier.missingPlateNumber', messageParams: { tag: '' } },
      { field: 'vehicles[0].driver.fullName', message: 'Chưa khai họ tên lái xe.', messageKey: 'dossier.missingDriverName', messageParams: { tag: '' } },
      { field: 'vehicles[0].driver.idNumber', message: 'Chưa khai số giấy tờ tùy thân của lái xe.', messageKey: 'dossier.missingDriverDocNo', messageParams: { tag: '' } },
      { field: 'vehicles[0].driver.licenseNumber', message: 'Chưa khai số GPLX của lái xe.', messageKey: 'dossier.missingDriverLicenseNo', messageParams: { tag: '' } },
      { field: 'vehicles[0].driver.nationality', message: 'Chưa chọn quốc tịch của lái xe.', messageKey: 'dossier.missingDriverNationality', messageParams: { tag: '' } },
    ]);
    // Hồ sơ bị chặn thì phải còn nguyên trạng thái nháp, không sinh QR.
    const stored = await declarations.findById(draft.id);
    expect(stored?.status).toBe(DeclarationStatus.DRAFT);
    expect(stored?.qrCode).toBeNull();
  });

  it('ghi lại nhật ký kiểm toán DECLARATION_SUBMIT_REJECTED kèm danh sách lỗi khi gửi hồ sơ thất bại (SG-117)', async () => {
    const draft = makeCompleteDraft({
      id: 'ho-so-loi-1',
      code: 'EXP-20260815-999999',
      createdById: 'user-dn-a',
      driver: null,
      vehicles: [{ plateNumber: '', vehicleType: 'TRUCK' }],
    });
    const { useCase, audit } = build(draft);

    await expect(
      useCase.execute({ declarationId: draft.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const log = audit.entries.find((e) => e.action === 'DECLARATION_SUBMIT_REJECTED');
    expect(log).toBeDefined();
    expect(log).toMatchObject({
      action: 'DECLARATION_SUBMIT_REJECTED',
      targetType: 'DECLARATION',
      targetId: 'ho-so-loi-1',
      actorId: 'user-dn-a',
      actorRole: 'ENTERPRISE',
      result: 'FAILURE',
      before: { code: 'EXP-20260815-999999' },
    });
    expect((log?.after as any)?.code).toBe('EXP-20260815-999999');
    expect((log?.after as any)?.errors).toBeDefined();
  });

  it('CHẶN gửi hồ sơ đặt lịch vào cửa khẩu ở quá khứ (F12 / BUG-016)', async () => {
    const draft = makeCompleteDraft({
      createdById: 'user-dn-a',
      appointment: { scheduledAt: new Date('2020-01-01T01:00:00.000Z'), status: AppointmentStatus.SCHEDULED },
    });
    const { useCase, declarations } = build(draft);

    await expect(
      useCase.execute({ declarationId: draft.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const stored = await declarations.findById(draft.id);
    expect(stored?.status).toBe(DeclarationStatus.DRAFT);
  });

  it('CHẶN khi thiếu chứng từ bắt buộc đã được cấu hình trong danh mục', async () => {
    const required = new FakeRequiredDocumentCatalog([{ code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan' }]);
    const { useCase, declaration } = build(makeCompleteDraft({ createdById: 'user-dn-a' }), required, new FakeDossierAttachments([]));

    await expect(
      useCase.execute({ declarationId: declaration.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor }),
    ).rejects.toThrow(BadRequestException);
  });

  it('nêu TÊN chứng từ còn thiếu và gắn khóa đa ngữ khi thiếu chứng từ bắt buộc (F13)', async () => {
    const required = new FakeRequiredDocumentCatalog([{ code: 'BILL_OF_LADING', name: 'Vận đơn' }]);
    const { useCase, declaration } = build(makeCompleteDraft({ createdById: 'user-dn-a' }), required);

    let response: { errors: unknown[] } | undefined;
    try {
      await useCase.execute({ declarationId: declaration.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor });
    } catch (thrown) {
      response = (thrown as BadRequestException).getResponse() as { errors: unknown[] };
    }

    expect(response?.errors).toContainEqual({
      field: 'attachments.BILL_OF_LADING',
      message: 'Thiếu chứng từ bắt buộc: Vận đơn.',
      messageKey: 'dossier.missingDocument',
      messageParams: { name: 'Vận đơn' },
    });
  });

  it('KHÔNG chặn vì chứng từ khi danh mục còn trống (điểm D7 chưa chốt)', async () => {
    const { useCase, declaration } = build();

    await expect(
      useCase.execute({ declarationId: declaration.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor }),
    ).resolves.toBeDefined();
  });

  it('CHẶN người dùng phạm vi OWN gửi hồ sơ của doanh nghiệp khác', async () => {
    const { useCase, declaration } = build();
    const access = makeAccess({
      userId: 'user-dn-khac',
      assignments: [{ type: AssignmentType.TAX_CODE, value: '5599999999' }],
    });

    await expect(
      useCase.execute({ declarationId: declaration.id, access, ...actor }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('trả 404 khi không có hồ sơ', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({ declarationId: 'khong-ton-tai', access: makeAccess({ userId: 'user-dn-a' }), ...actor }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ghi nhật ký kiểm toán và phát thông báo cho doanh nghiệp cùng tài khoản Biên phòng', async () => {
    const { useCase, declaration, audit, notifications } = build();

    await useCase.execute({ declarationId: declaration.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor });

    expect(audit.entries.map((entry) => entry.action)).toContain('DECLARATION_SUBMIT');
    expect(notifications.entries[0]).toMatchObject({
      dossierCode: declaration.code,
      enterpriseTaxCode: declaration.enterprise.taxCode,
    });
    expect(notifications.entries[1]).toMatchObject({
      dossierCode: declaration.code,
      content: `Hồ sơ ${declaration.code} đang chờ xác nhận vào cổng.`,
      recipientRoleCodes: ['BORDER_GUARD'],
    });
  });

  it('ghi nhật ký cả lần gửi bị chặn để truy được vì sao doanh nghiệp không gửi được', async () => {
    const draft = makeCompleteDraft({ createdById: 'user-dn-a', driver: null });
    const { useCase, audit } = build(draft);

    await useCase
      .execute({ declarationId: draft.id, access: makeAccess({ userId: 'user-dn-a' }), ...actor })
      .catch(() => undefined);

    expect(audit.entries.map((entry) => entry.action)).toContain('DECLARATION_SUBMIT_REJECTED');
  });

  // ---------------------------------------------------------------------------
  // SG-115 — Chặn trùng biển số và số CCCD lái xe thuộc hồ sơ chưa kết thúc
  // ---------------------------------------------------------------------------
  describe('chặn trùng biển số và số CCCD của lái xe thuộc hồ sơ chưa kết thúc (SG-115)', () => {
    const PLATE = '26C-999.99';
    const DRIVER_ID = '012345678901';

    function buildTwoDrafts() {
      const active = makeCompleteDraft({
        id: 'ho-so-1',
        code: 'EXP-20260814-000001',
        createdById: 'user-dn-a',
        status: DeclarationStatus.PROCESSING,
        vehicles: [
          {
            plateNumber: PLATE,
            vehicleType: 'TRUCK',
            driver: {
              fullName: 'Nguyễn Văn A',
              idNumber: DRIVER_ID,
              idType: 'CCCD',
              phone: '0901234567',
              licenseNumber: 'GPLX-12345',
              nationality: 'VNM',
            },
          },
        ],
      });
      const second = makeCompleteDraft({
        id: 'ho-so-2',
        code: 'EXP-20260814-000002',
        createdById: 'user-dn-a',
        status: DeclarationStatus.DRAFT,
        vehicles: [
          {
            plateNumber: PLATE,
            vehicleType: 'TRUCK',
            driver: {
              fullName: 'Nguyễn Văn B',
              idNumber: '999999999999',
              idType: 'CCCD',
              phone: '0909999999',
              licenseNumber: 'GPLX-99999',
              nationality: 'VNM',
            },
          },
        ],
      });
      const declarations = new InMemoryDeclarationRepository([active, second]);
      const scope = new DossierScopeService(new DataScopeService());
      const validate = new ValidateDeclarationUseCase(
        declarations,
        new FakeDossierAttachments(),
        new FakeRequiredDocumentCatalog(),
        scope,
      );
      const useCase = new SubmitDeclarationUseCase(
        declarations,
        validate,
        scope,
        new RecordingAudit(),
        new RecordingNotifications(),
      );
      const submit = (declarationId: string) =>
        useCase.execute({ declarationId, access: makeAccess({ userId: 'user-dn-a' }), ...actor });
      return { active, second, declarations, submit, validate };
    }

    it('chặn gửi hồ sơ nếu biển số xe đang nằm trong hồ sơ chưa kết thúc', async () => {
      const { submit } = buildTwoDrafts();

      await expect(submit('ho-so-2')).rejects.toThrow(BadRequestException);
    });

    it('chặn gửi hồ sơ nếu số CCCD lái xe đang nằm trong hồ sơ chưa kết thúc', async () => {
      const { declarations, submit } = buildTwoDrafts();
      const draft = makeCompleteDraft({
        id: 'ho-so-3',
        code: 'EXP-20260814-000003',
        createdById: 'user-dn-a',
        status: DeclarationStatus.DRAFT,
        vehicles: [
          {
            plateNumber: '30A-888.88',
            vehicleType: 'TRUCK',
            driver: {
              fullName: 'Nguyễn Văn A',
              idNumber: DRIVER_ID,
              idType: 'CCCD',
              phone: '0901234567',
              licenseNumber: 'GPLX-12345',
              nationality: 'VNM',
            },
          },
        ],
      });
      await declarations.save(draft);

      await expect(submit('ho-so-3')).rejects.toThrow(BadRequestException);
    });

    it('cho phép gửi hồ sơ nếu hồ sơ trước đó cùng biển số/CCCD đã kết thúc (COMPLETED)', async () => {
      const { active, submit } = buildTwoDrafts();
      active.status = DeclarationStatus.COMPLETED;

      const result = await submit('ho-so-2');
      expect(result.code).toBeDefined();
    });
  });
});
