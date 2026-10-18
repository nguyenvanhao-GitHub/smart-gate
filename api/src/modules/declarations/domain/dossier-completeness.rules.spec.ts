import { AppointmentStatus, DeclarationStatus } from './declaration.enums';
import { validateDossierCompleteness } from './dossier-completeness.rules';
import { makeCompleteDraft } from '../testing/declaration.fixture';
import { DEFAULT_DOSSIER_FIELD_CONFIGS } from '../../catalog/domain/dossier-field-config.catalog';

/**
 * Điều kiện nghiệm thu P2: *"hồ sơ thiếu dữ liệu bị chặn gửi kèm danh sách lỗi"*.
 * Mỗi test dưới đây bỏ đúng **một** trường để chứng minh lỗi trả về chỉ đúng ô đang thiếu —
 * đây là căn cứ để giao diện tô đỏ đúng chỗ.
 */
describe('validateDossierCompleteness', () => {
  function fieldsOf(declaration: Parameters<typeof validateDossierCompleteness>[0]['declaration']): string[] {
    return validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] }).map((error) => error.field);
  }

  it('hồ sơ nháp khai đủ thì không có lỗi nào', () => {
    expect(validateDossierCompleteness({ declaration: makeCompleteDraft(), attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] })).toEqual([]);
  });

  describe('doanh nghiệp', () => {
    it('thiếu mã số thuế', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '', name: 'Công ty A' } });
      const errors = validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] });
      expect(errors).toEqual([
        {
          field: 'enterprise.taxCode',
          message: 'Chưa khai thông tin mã số thuế / số CCCD.',
          messageKey: 'dossier.missingEnterpriseTaxCode',
        },
      ]);
    });

    it('mã số thuế sai định dạng', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '123', name: 'Công ty A' } });
      expect(fieldsOf(declaration)).toEqual(['enterprise.taxCode']);
    });

    it('chấp nhận mã số thuế 13 chữ số của đơn vị phụ thuộc', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '5500123456-001', name: 'Chi nhánh A' } });
      expect(fieldsOf(declaration)).toEqual([]);
    });

    it('chấp nhận số CCCD 12 chữ số cho tài khoản cá nhân', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '012121212252', name: 'Nguyễn Văn A', phone: '0900000000' } });
      expect(fieldsOf(declaration)).toEqual([]);
    });

    it('tài khoản cá nhân (INDIVIDUAL) khai hộ (createForOther: true) chỉ khai idNumber hợp lệ → không bắt buộc name/phone khi gửi', () => {
      const declaration = makeCompleteDraft({
        enterprise: {
          taxCode: '',
          name: '',
          phone: '',
          idNumber: '038090001234',
          accountType: 'INDIVIDUAL',
          createForOther: true,
        },
      });
      expect(fieldsOf(declaration)).toEqual([]);
    });

    it('tài khoản cá nhân (INDIVIDUAL) thiếu idNumber → báo lỗi enterprise.idNumber với messageKey dossier.missingIdNumber', () => {
      const declaration = makeCompleteDraft({
        enterprise: { taxCode: '', accountType: 'INDIVIDUAL' },
      });
      const errors = validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] });
      expect(errors).toContainEqual(
        expect.objectContaining({
          field: 'enterprise.idNumber',
          messageKey: 'dossier.missingIdNumber',
        }),
      );
    });

    it('tài khoản cá nhân (INDIVIDUAL) idNumber sai định dạng → báo lỗi enterprise.idNumber với messageKey dossier.invalidIdNumber', () => {
      const declaration = makeCompleteDraft({
        enterprise: { idNumber: '123', accountType: 'INDIVIDUAL' },
      });
      const errors = validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] });
      expect(errors).toContainEqual(
        expect.objectContaining({
          field: 'enterprise.idNumber',
          messageKey: 'dossier.invalidIdNumber',
        }),
      );
    });

    it('tài khoản nội bộ (INTERNAL) khai hộ (createForOther: true) chỉ khai email hợp lệ → không bắt buộc name/phone khi gửi', () => {
      const declaration = makeCompleteDraft({
        enterprise: {
          taxCode: '',
          name: '',
          phone: '',
          email: 'staff@smartgate.vn',
          accountType: 'INTERNAL',
          createForOther: true,
        },
      });
      expect(fieldsOf(declaration)).toEqual([]);
    });

    it('tài khoản nội bộ (INTERNAL) khai hộ với DEFAULT_DOSSIER_FIELD_CONFIGS → gửi thành công không lỗi enterprise.phone', () => {
      const declaration = makeCompleteDraft({
        enterprise: {
          taxCode: '',
          name: 'Cán bộ kiểm dịch',
          phone: '',
          email: 'staff@smartgate.vn',
          accountType: 'INTERNAL',
          createForOther: true,
        },
        vehicles: [
          {
            plateNumber: '29A-123.45',
            vehicleType: 'TRUCK',
            driver: {
              fullName: 'Lái xe Nguyễn Văn B',
              idNumber: '001200001234',
              idType: 'CCCD',
              licenseNumber: 'GPLX12345',
              nationality: 'VN',
            },
          },
        ],
      });
      const errors = validateDossierCompleteness({
        declaration,
        fieldConfigs: DEFAULT_DOSSIER_FIELD_CONFIGS,
        attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'],
      });
      expect(errors).toEqual([]);
    });

    it('tài khoản nội bộ (INTERNAL) khai hộ (createForOther: true) thiếu email → báo lỗi enterprise.email', () => {
      const declaration = makeCompleteDraft({
        enterprise: { taxCode: '', accountType: 'INTERNAL', createForOther: true },
      });
      expect(fieldsOf(declaration)).toEqual(['enterprise.email']);
    });

    it('tài khoản nội bộ (INTERNAL) tự khai (createForOther: false hoặc không set) không có email → hợp lệ', () => {
      const declaration = makeCompleteDraft({
        enterprise: {
          taxCode: '',
          accountType: 'INTERNAL',
          name: 'Quản trị hệ thống',
          phone: '0900000000',
          createForOther: false,
        },
      });
      expect(fieldsOf(declaration)).toEqual([]);
    });

    it('khi accountInfo có isVisible = false: mã số thuế và SĐT rỗng KHÔNG bị báo lỗi', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '', name: '', phone: '' } });
      const errors = validateDossierCompleteness({
        declaration,
        fieldConfigs: [{ fieldKey: 'accountInfo', fieldName: 'Các thông tin cá nhân', isVisible: false, isRequired: false, isDefault: false }],
        attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'],
      });
      expect(errors.filter((e) => e.field.startsWith('enterprise.'))).toEqual([]);
    });

    it('thiếu tên doanh nghiệp', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '5500123456', name: '   ', phone: '0900000000' } });
      expect(fieldsOf(declaration)).toEqual(['enterprise.name']);
    });

    it('thiếu số điện thoại doanh nghiệp', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '5500123456', name: 'Công ty A', phone: '' } });
      expect(fieldsOf(declaration)).toEqual(['enterprise.phone']);
    });

    it('số điện thoại doanh nghiệp sai định dạng', () => {
      const declaration = makeCompleteDraft({ enterprise: { taxCode: '5500123456', name: 'Công ty A', phone: '123' } });
      expect(fieldsOf(declaration)).toEqual(['enterprise.phone']);
    });

    it('khai hộ (createForOther = true): cá nhân chỉ bắt buộc CCCD, doanh nghiệp chỉ bắt buộc MST, nội bộ chỉ bắt buộc Email', () => {
      const declIndividual = makeCompleteDraft({
        enterprise: {
          taxCode: '038090001234',
          name: '',
          phone: '',
          accountType: 'INDIVIDUAL',
          createForOther: true,
        },
      });
      expect(fieldsOf(declIndividual)).toEqual([]);

      const declInternal = makeCompleteDraft({
        enterprise: {
          taxCode: '',
          name: '',
          phone: '',
          email: 'officer@smartgate.vn',
          accountType: 'INTERNAL',
          createForOther: true,
        },
      });
      expect(fieldsOf(declInternal)).toEqual([]);

      const declEnterprise = makeCompleteDraft({
        enterprise: {
          taxCode: '5500123456',
          name: '',
          phone: '',
          accountType: 'ENTERPRISE',
          createForOther: true,
        },
      });
      expect(fieldsOf(declEnterprise)).toEqual([]);
    });

    it('tự khai (createForOther = false hoặc không set): bắt buộc tên và SĐT đối với cả cá nhân và nội bộ', () => {
      const declIndividual = makeCompleteDraft({
        enterprise: {
          taxCode: '038090001234',
          name: '',
          phone: '',
          accountType: 'INDIVIDUAL',
          createForOther: false,
        },
      });
      expect(fieldsOf(declIndividual)).toEqual(['enterprise.name', 'enterprise.phone']);

      const declInternal = makeCompleteDraft({
        enterprise: {
          taxCode: '',
          name: '',
          phone: '',
          email: 'officer@smartgate.vn',
          accountType: 'INTERNAL',
        },
      });
      expect(fieldsOf(declInternal)).toEqual(['enterprise.name', 'enterprise.phone']);
    });
  });

  describe('phương tiện', () => {
    it('thiếu biển kiểm soát', () => {
      const declaration = makeCompleteDraft({ vehicles: [{ plateNumber: '', vehicleType: 'TRUCK' }] });
      expect(fieldsOf(declaration)).toEqual(['vehicles[0].plateNumber']);
    });

    it('thiếu loại phương tiện', () => {
      const declaration = makeCompleteDraft({ vehicles: [{ plateNumber: '26C-123.45', vehicleType: '' }] });
      expect(fieldsOf(declaration)).toEqual(['vehicles[0].vehicleType']);
    });

    it('trọng lượng không dương', () => {
      const declaration = makeCompleteDraft({ vehicles: [{ plateNumber: '26C-123.45', vehicleType: 'TRUCK', weightKg: 0 }] });
      expect(fieldsOf(declaration)).toEqual(['vehicles[0].weightKg']);
    });

    it('hồ sơ không có phương tiện nào', () => {
      const declaration = makeCompleteDraft({ vehicles: [] });
      expect(fieldsOf(declaration)).toEqual(['vehicles']);
    });

    it('CR8 — biển kiểm soát sai định dạng bị chặn (một xe/hồ sơ)', () => {
      const declaration = makeCompleteDraft({ vehicles: [{ plateNumber: '29', vehicleType: 'TRUCK' }] });
      expect(fieldsOf(declaration)).toEqual(['vehicles[0].plateNumber']);
    });
  });

  describe('lái xe theo từng phương tiện (BUG-033)', () => {
    it('xe chưa khai lái xe', () => {
      const declaration = makeCompleteDraft({ driver: null });
      expect(validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] })).toEqual([
        { field: 'vehicles[0].driver.fullName', message: 'Chưa khai họ tên lái xe.', messageKey: 'dossier.missingDriverName', messageParams: { tag: '' } },
        { field: 'vehicles[0].driver.idNumber', message: 'Chưa khai số giấy tờ tùy thân của lái xe.', messageKey: 'dossier.missingDriverDocNo', messageParams: { tag: '' } },
        { field: 'vehicles[0].driver.licenseNumber', message: 'Chưa khai số GPLX của lái xe.', messageKey: 'dossier.missingDriverLicenseNo', messageParams: { tag: '' } },
        { field: 'vehicles[0].driver.nationality', message: 'Chưa chọn quốc tịch của lái xe.', messageKey: 'dossier.missingDriverNationality', messageParams: { tag: '' } },
      ]);
    });

    it('thiếu họ tên của lái xe một xe', () => {
      const declaration = makeCompleteDraft({
        vehicles: [
          {
            plateNumber: '29C-000.01',
            vehicleType: 'TRUCK',
            driver: { fullName: '', idNumber: '001', licenseNumber: 'GPLX-1', nationality: 'VN' },
          },
        ],
      });
      expect(fieldsOf(declaration)).toEqual(['vehicles[0].driver.fullName']);
    });

    it('thiếu số GPLX của lái xe', () => {
      const declaration = makeCompleteDraft({
        vehicles: [
          {
            plateNumber: '29C-000.01',
            vehicleType: 'TRUCK',
            driver: { fullName: 'Nguyễn Văn A', idNumber: '001', licenseNumber: '', nationality: 'VN' },
          },
        ],
      });
      expect(fieldsOf(declaration)).toEqual(['vehicles[0].driver.licenseNumber']);
    });

    it('thiếu quốc tịch của lái xe', () => {
      const declaration = makeCompleteDraft({
        vehicles: [
          {
            plateNumber: '29C-000.01',
            vehicleType: 'TRUCK',
            driver: { fullName: 'Nguyễn Văn A', idNumber: '001', licenseNumber: 'GPLX-1', nationality: '' },
          },
        ],
      });
      expect(fieldsOf(declaration)).toEqual(['vehicles[0].driver.nationality']);
    });

    it('mỗi xe soi lái xe riêng — xe sau thiếu lái xe vẫn báo đúng dòng', () => {
      const declaration = makeCompleteDraft({
        driver: null,
        vehicles: [
          {
            plateNumber: '29C-000.01',
            vehicleType: 'TRUCK',
            driver: { fullName: 'Nguyễn Văn A', idNumber: '001', licenseNumber: 'GPLX-1', nationality: 'VN' },
          },
          { plateNumber: '29C-000.02', vehicleType: 'TRUCK' },
        ],
      });
      expect(fieldsOf(declaration)).toEqual([
        'vehicles[1].driver.fullName',
        'vehicles[1].driver.idNumber',
        'vehicles[1].driver.licenseNumber',
        'vehicles[1].driver.nationality',
      ]);
    });
  });

  describe('hàng hóa', () => {
    it('không có dòng hàng nào', () => {
      const declaration = makeCompleteDraft({ cargo: { description: '' }, cargoItems: [] });
      expect(validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] })).toEqual([
        { field: 'cargoItems', message: 'Hồ sơ phải có ít nhất một dòng hàng hóa.', messageKey: 'dossier.missingCargoItems' },
      ]);
    });

    it('chỉ rõ số thứ tự dòng hàng bị thiếu mô tả', () => {
      const declaration = makeCompleteDraft({
        cargoItems: [{ description: 'Nông sản' }, { description: '  ' }],
      });
      expect(validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] })).toEqual([
        { field: 'cargoItems[1].description', message: 'Dòng hàng 2: Chưa khai tên hàng hóa.', messageKey: 'dossier.missingCargoName', messageParams: { tag: 'dossier.tagCargo', index: 2 } },
      ]);
    });

    it('số lượng và khối lượng phải lớn hơn 0', () => {
      const declaration = makeCompleteDraft({
        cargoItems: [{ description: 'Nông sản', quantity: 0, grossWeightKg: -1 }],
      });
      expect(fieldsOf(declaration)).toEqual(['cargoItems[0].quantity', 'cargoItems[0].grossWeightKg']);
    });
  });

  describe('trạng thái', () => {
    it('chặn gửi lại hồ sơ đã gửi', () => {
      const declaration = makeCompleteDraft({ status: DeclarationStatus.SUBMITTED });
      expect(fieldsOf(declaration)).toEqual(['status']);
    });

    it('chặn gửi hồ sơ đã hủy, nêu đúng lý do', () => {
      const declaration = makeCompleteDraft({ status: DeclarationStatus.CANCELLED });
      expect(validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'] })).toEqual([
        { field: 'status', message: 'Hồ sơ đã bị hủy nên không gửi được.', messageKey: 'dossier.statusCancelled' },
      ]);
    });

    it('cho phép gửi lại hồ sơ đang bị yêu cầu bổ sung', () => {
      const declaration = makeCompleteDraft({ status: DeclarationStatus.REVISION_REQUIRED });
      expect(fieldsOf(declaration)).toEqual([]);
    });
  });

  describe('lịch vào cửa khẩu quá khứ (F12 / BUG-016)', () => {
    const now = new Date('2026-08-02T02:00:00.000Z'); // 09:00 giờ VN

    function withAppointment(scheduledAt: Date) {
      return makeCompleteDraft({
        appointment: { scheduledAt, status: AppointmentStatus.SCHEDULED },
      });
    }

    it('CHẶN khi mốc hẹn ở quá khứ so với hiện tại', () => {
      const declaration = withAppointment(new Date('2020-01-01T01:00:00.000Z'));
      expect(validateDossierCompleteness({ declaration, now, attachedDocumentTypeCodes: ['DOC-1'] })).toEqual([
        {
          field: 'appointment.scheduledAt',
          message: 'Lịch vào cửa khẩu không được ở thời điểm quá khứ.',
          messageKey: 'dossier.appointmentInPast',
        },
      ]);
    });

    it('KHÔNG chặn khi mốc hẹn ở tương lai', () => {
      const declaration = withAppointment(new Date('2026-08-03T01:00:00.000Z'));
      expect(validateDossierCompleteness({ declaration, now, attachedDocumentTypeCodes: ['DOC-1'] })).toEqual([]);
    });

    it('CHẶN khi hồ sơ chưa đặt lịch (appointment rỗng)', () => {
      const declaration = makeCompleteDraft({ appointment: null });
      expect(validateDossierCompleteness({ declaration, now, attachedDocumentTypeCodes: ['DOC-1'] })).toEqual([
        { field: 'appointment.scheduledAt', message: 'Vui lòng chọn ngày đăng ký vào cửa khẩu.', messageKey: 'dossier.missingScheduledAt' },
      ]);
    });
  });

  describe('chứng từ bắt buộc (điểm D7 chưa chốt)', () => {
    it('không chặn khi chưa cấu hình chứng từ bắt buộc (requiredDocumentTypes rỗng)', () => {
      const declaration = makeCompleteDraft();
      expect(
        validateDossierCompleteness({ declaration, requiredDocumentTypes: [], attachedDocumentTypeCodes: [] }),
      ).toEqual([]);
    });

    it('chặn khi đã cấu hình mà hồ sơ chưa có chứng từ đó', () => {
      const declaration = makeCompleteDraft();
      expect(
        validateDossierCompleteness({
          declaration,
          requiredDocumentTypes: [{ code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan' }],
          attachedDocumentTypeCodes: ['PACKING_LIST'],
        }),
      ).toEqual([
        {
          field: 'attachments.CUSTOMS_DECLARATION',
          message: 'Thiếu chứng từ bắt buộc: Tờ khai hải quan.',
          // F13 + đa ngữ: lỗi thiếu chứng từ kèm khóa và tên chứng từ để FE dịch.
          messageKey: 'dossier.missingDocument',
          messageParams: { name: 'Tờ khai hải quan' },
        },
      ]);
    });

    it('không chặn khi chứng từ bắt buộc đã được đính kèm', () => {
      const declaration = makeCompleteDraft();
      expect(
        validateDossierCompleteness({
          declaration,
          requiredDocumentTypes: [{ code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan' }],
          attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'],
        }),
      ).toEqual([]);
    });
  });

  it('gom đủ mọi lỗi trong một lần gọi để giao diện tô đỏ hết các ô', () => {
    const declaration = makeCompleteDraft({
      enterprise: { taxCode: '', name: '' },
      vehicles: [{ plateNumber: '', vehicleType: '' }],
      driver: null,
      cargo: { description: '' },
      cargoItems: [],
      appointment: null,
    });
    expect(validateDossierCompleteness({ declaration, attachedDocumentTypeCodes: [] }).map((e) => e.field)).toEqual([
      'enterprise.taxCode',
      'enterprise.name',
      'vehicles[0].plateNumber',
      'vehicles[0].vehicleType',
      'vehicles[0].driver.fullName',
      'vehicles[0].driver.idNumber',
      'vehicles[0].driver.licenseNumber',
      'vehicles[0].driver.nationality',
      'cargoItems',
      'appointment.scheduledAt',
    ]);
  });

  describe('cấu hình động (fieldConfigs)', () => {
    it('chỉ bắt buộc trường có cờ isRequired = true trong fieldConfigs', () => {
      const declaration = makeCompleteDraft({
        enterprise: { taxCode: '5500123456', name: 'Công ty A', representativeName: '' },
      });
      const fieldConfigs: import('../../catalog/domain/dossier-field-config.catalog').DossierFieldConfigItem[] = [
        { fieldKey: 'enterpriseTaxCode', fieldName: 'Mã số thuế', isVisible: true, isRequired: true, isDefault: true },
        { fieldKey: 'enterpriseName', fieldName: 'Tên doanh nghiệp', isVisible: true, isRequired: true, isDefault: true },
        { fieldKey: 'representative', fieldName: 'Người đại diện', isVisible: true, isRequired: true, isDefault: false },
      ];
      const errors = validateDossierCompleteness({
        declaration,
        fieldConfigs,
        attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'],
      });
      expect(errors.map((e) => e.field)).toContain('enterprise.representativeName');
    });

    it('với DEFAULT_DOSSIER_FIELD_CONFIGS: người đại diện để trống KHÔNG bị báo lỗi (SG-263)', () => {
      const declaration = makeCompleteDraft({
        enterprise: { taxCode: '012121212252', name: 'Nguyễn Thị Thu Phương', phone: '0369852369', address: 'Hà Nội', representativeName: '' },
        driver: { fullName: 'Nguyễn Văn A', idNumber: '001199001234', idType: 'CCCD', licenseNumber: 'GPLX-123456', nationality: 'VN' },
      });
      const errors = validateDossierCompleteness({
        declaration,
        fieldConfigs: DEFAULT_DOSSIER_FIELD_CONFIGS,
        attachedDocumentTypeCodes: ['CUSTOMS_DECLARATION'],
      });
      expect(errors).toEqual([]);
    });
  });
});
