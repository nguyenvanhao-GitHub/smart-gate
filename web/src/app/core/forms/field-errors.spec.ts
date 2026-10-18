import {
  extractErrorMessage,
  extractFieldErrors,
  fieldRoot,
  fieldRowIndex,
  normalizeFieldName,
  toFieldErrorMap,
  unmappedErrors,
  processApiErrors,
  fallbackDuplicateFieldError,
} from './field-errors';

/**
 * Ánh xạ lỗi API vào ô nhập (F13). Sai ở đây thì người dùng chỉ thấy toast chung chung
 * và không biết trường nào thiếu — đúng thứ SRS yêu cầu phải tránh.
 */describe('field-errors — ánh xạ lỗi API vào biểu mẫu', () => {
  describe('normalizeFieldName', () => {
    it('giữ nguyên tên trường phẳng và lồng', () => {
      expect(normalizeFieldName('type')).toBe('type');
      expect(normalizeFieldName('enterprise.taxCode')).toBe('enterprise.taxCode');
    });

    it('bỏ tiền tố body/payload/dto do API thêm vào', () => {
      expect(normalizeFieldName('body.enterprise.taxCode')).toBe('enterprise.taxCode');
      expect(normalizeFieldName('payload.driver.idNumber')).toBe('driver.idNumber');
      expect(normalizeFieldName('dto.type')).toBe('type');
    });

    it('đưa chỉ số dòng về dạng ngoặc vuông', () => {
      expect(normalizeFieldName('cargoItems.0.description')).toBe('cargoItems[0].description');
      expect(normalizeFieldName('cargoItems.12.hsCode')).toBe('cargoItems[12].hsCode');
      expect(normalizeFieldName('cargoItems[1].hsCode')).toBe('cargoItems[1].hsCode');
      expect(normalizeFieldName('cargoItems.2')).toBe('cargoItems[2]');
    });

    it('chuỗi rỗng hoặc chỉ khoảng trắng trả về rỗng', () => {
      expect(normalizeFieldName('')).toBe('');
      expect(normalizeFieldName('   ')).toBe('');
    });
  });

  describe('toFieldErrorMap', () => {
    it('gom lỗi theo tên trường đã chuẩn hóa', () => {
      const map = toFieldErrorMap([
        { field: 'body.enterprise.taxCode', message: 'Mã số thuế là bắt buộc.' },
        { field: 'cargoItems.0.description', message: 'Tên hàng hóa là bắt buộc.' },
      ]);

      expect(map['enterprise.taxCode']).toBe('Mã số thuế là bắt buộc.');
      expect(map['cargoItems[0].description']).toBe('Tên hàng hóa là bắt buộc.');
    });

    it('một trường có nhiều lỗi thì giữ thông báo đầu tiên', () => {
      const map = toFieldErrorMap([
        { field: 'driver.idNumber', message: 'Số CCCD là bắt buộc.' },
        { field: 'driver.idNumber', message: 'Số CCCD phải có 12 chữ số.' },
      ]);

      expect(map['driver.idNumber']).toBe('Số CCCD là bắt buộc.');
    });

    it('bỏ qua lỗi thiếu tên trường hoặc thiếu nội dung', () => {
      const map = toFieldErrorMap([
        { field: '', message: 'Hồ sơ không hợp lệ.' },
        { field: 'vehicle.plateNumber', message: '' },
      ]);

      expect(Object.keys(map)).toEqual([]);
    });

    it('danh sách rỗng hoặc null trả về bản đồ rỗng', () => {
      expect(toFieldErrorMap([])).toEqual({});
      expect(toFieldErrorMap(null)).toEqual({});
      expect(toFieldErrorMap(undefined)).toEqual({});
    });
  });

  describe('extractFieldErrors', () => {
    it('đọc được lỗi từ HttpErrorResponse 400 của API', () => {
      const loi = {
        status: 400,
        error: {
          message: 'Hồ sơ thiếu dữ liệu bắt buộc',
          errors: [
            { field: 'enterprise.taxCode', message: 'Mã số thuế là bắt buộc.' },
            { field: 'driver.fullName', message: 'Tên lái xe là bắt buộc.' },
          ],
        },
      };

      expect(extractFieldErrors(loi)).toEqual([
        { field: 'enterprise.taxCode', message: 'Mã số thuế là bắt buộc.' },
        { field: 'driver.fullName', message: 'Tên lái xe là bắt buộc.' },
      ]);
      expect(extractErrorMessage(loi)).toBe('Hồ sơ thiếu dữ liệu bắt buộc');
    });

    it('đọc được lỗi từ thân phản hồi thuần (kết quả /validate)', () => {
      const ketQua = { valid: false, errors: [{ field: 'cargoItems', message: 'Cần ít nhất một dòng hàng.' }] };
      expect(extractFieldErrors(ketQua)).toEqual([{ field: 'cargoItems', message: 'Cần ít nhất một dòng hàng.' }]);
    });

    it('chấp nhận dạng ValidationPipe mặc định của NestJS (message là mảng chuỗi)', () => {
      const loi = { error: { statusCode: 400, message: ['taxCode should not be empty', 'plateNumber must be a string'] } };
      expect(extractFieldErrors(loi)).toEqual([
        { field: '', message: 'taxCode should not be empty' },
        { field: '', message: 'plateNumber must be a string' },
      ]);
    });

    it('bóc tách đúng field và messageKey khi ValidationPipe trả về lỗi lồng nhau', () => {
      const loi = { error: { statusCode: 400, message: ['enterprise.dossier.missingEmail'] } };
      expect(extractFieldErrors(loi)).toEqual([
        { field: 'enterprise.email', message: 'enterprise.dossier.missingEmail', messageKey: 'dossier.missingEmail' },
      ]);
    });

    it('ánh xạ đúng các khóa lồng khác nhau từ dictionary DOSSIER_MESSAGE_KEY_FIELD_MAP', () => {
      const loi = {
        error: {
          statusCode: 400,
          message: [
            'enterprise.dossier.missingPhone',
            'enterprise.dossier.missingAddress',
            'enterprise.dossier.missingRepresentative',
          ],
        },
      };
      expect(extractFieldErrors(loi)).toEqual([
        { field: 'enterprise.phone', message: 'enterprise.dossier.missingPhone', messageKey: 'dossier.missingPhone' },
        { field: 'enterprise.address', message: 'enterprise.dossier.missingAddress', messageKey: 'dossier.missingAddress' },
        { field: 'enterprise.representativeName', message: 'enterprise.dossier.missingRepresentative', messageKey: 'dossier.missingRepresentative' },
      ]);
    });

    it('ánh xạ đúng các khóa không có prefix', () => {
      const loi = {
        error: {
          statusCode: 400,
          message: [
            'dossier.missingPlateNumber',
            'dossier.missingPhone',
          ],
        },
      };
      expect(extractFieldErrors(loi)).toEqual([
        { field: 'vehicles[0].plateNumber', message: 'dossier.missingPlateNumber', messageKey: 'dossier.missingPlateNumber' },
        { field: 'enterprise.phone', message: 'dossier.missingPhone', messageKey: 'dossier.missingPhone' },
      ]);
    });

    it('giữ đúng chỉ số dòng khi khóa lồng có kèm số thứ tự', () => {
      const loi = {
        error: {
          statusCode: 400,
          message: ['cargoItems.1.dossier.missingCargoName'],
        },
      };
      expect(extractFieldErrors(loi)).toEqual([
        { field: 'cargoItems[1].description', message: 'cargoItems.1.dossier.missingCargoName', messageKey: 'dossier.missingCargoName' },
      ]);
    });

    it('bảo vệ an toàn chống prototype pollution khi messageKey là __proto__', () => {
      const loiString = {
        error: {
          statusCode: 400,
          message: ['dossier.__proto__'],
        },
      };
      expect(extractFieldErrors(loiString)).toEqual([
        { field: '', message: 'dossier.__proto__', messageKey: 'dossier.__proto__' },
      ]);

      const loiObject = {
        error: {
          statusCode: 400,
          errors: [
            { field: 'enterprise', message: 'Lỗi', messageKey: '__proto__' },
          ],
        },
      };
      expect(extractFieldErrors(loiObject)).toEqual([
        { field: 'enterprise', message: 'Lỗi', messageKey: '__proto__' },
      ]);
    });

    it('ánh xạ đúng trường khi API trả về mảng object có messageKey', () => {
      const loi = {
        error: {
          statusCode: 400,
          errors: [
            { field: 'enterprise', message: 'Chưa khai SĐT', messageKey: 'dossier.missingPhone' },
          ],
        },
      };
      expect(extractFieldErrors(loi)).toEqual([
        { field: 'enterprise.phone', message: 'Chưa khai SĐT', messageKey: 'dossier.missingPhone' },
      ]);
    });

    it('lỗi mạng hoặc phản hồi không có danh sách lỗi thì trả mảng rỗng', () => {
      expect(extractFieldErrors(null)).toEqual([]);
      expect(extractFieldErrors('loi')).toEqual([]);
      expect(extractFieldErrors({ status: 500, error: { message: 'Internal error' } })).toEqual([]);
      expect(extractErrorMessage({ status: 500, error: { message: 'Internal error' } })).toBe('Internal error');
    });
  });

  describe('Gốc và chỉ số dòng', () => {
    it('lấy đúng gốc của tên trường', () => {
      expect(fieldRoot('enterprise.taxCode')).toBe('enterprise');
      expect(fieldRoot('cargoItems[3].hsCode')).toBe('cargoItems');
      expect(fieldRoot('cargoItems.3.hsCode')).toBe('cargoItems');
      expect(fieldRoot('type')).toBe('type');
      expect(fieldRoot('')).toBe('');
    });

    it('lấy chỉ số dòng hàng hóa', () => {
      expect(fieldRowIndex('cargoItems[2].description')).toBe(2);
      expect(fieldRowIndex('cargoItems.0.hsCode')).toBe(0);
      expect(fieldRowIndex('enterprise.taxCode')).toBeNull();
    });
  });

  it('unmappedErrors trả về các lỗi không gắn được vào ô nào', () => {
    const errors = [
      { field: 'enterprise.taxCode', message: 'Mã số thuế là bắt buộc.' },
      { field: '', message: 'Hồ sơ chưa có chứng từ bắt buộc.' },
      { field: 'khongTonTai', message: 'Trường lạ.' },
    ];

    expect(unmappedErrors(errors, ['enterprise.taxCode'])).toEqual([
      'Hồ sơ chưa có chứng từ bắt buộc.',
      'Trường lạ.',
    ]);
  });

  describe('fallbackDuplicateFieldError', () => {
    it('trả về lỗi cho username khi messageKey khớp', () => {
      expect(fallbackDuplicateFieldError({ status: 409, error: { messageKey: 'auth.registerDuplicateUsername' } }, 'Lỗi')).toEqual({ field: 'username', message: 'Lỗi' });
    });

    it('trả về lỗi dò bằng tiếng Việt khi không có messageKey', () => {
      expect(fallbackDuplicateFieldError({ status: 400, error: { message: 'Tên đăng nhập này đã có người dùng' } }, 'Lỗi')).toEqual({ field: 'username', message: 'Lỗi' });
      expect(fallbackDuplicateFieldError({ status: 409, error: { message: 'Mã số thuế trùng lắp' } }, 'Lỗi')).toEqual({ field: 'taxCode', message: 'Lỗi' });
    });

    it('trả về null nếu status khác 400/409 hoặc không khớp', () => {
      expect(fallbackDuplicateFieldError({ status: 500, error: { messageKey: 'auth.registerDuplicateUsername' } }, 'Lỗi')).toBeNull();
      expect(fallbackDuplicateFieldError({ status: 409, error: { message: 'Lỗi hệ thống' } }, 'Lỗi')).toBeNull();
    });
  });

  describe('processApiErrors', () => {
    it('ánh xạ đúng lỗi trả về', () => {
      const err = {
        status: 409,
        error: {
          errors: [
            { field: 'email', message: 'Email đã tồn tại' },
            { field: 'unknown', message: 'Lỗi không xác định' }
          ]
        }
      };
      
      const result = processApiErrors(err, 'Lỗi chung', ['email', 'phone'], (e) => e.message || '');
      expect(result.hasKnownField).toBe(true);
      expect(result.fieldErrors['email']).toBe('Email đã tồn tại');
      expect(result.unmappedMessages).toEqual(['Lỗi không xác định']);
    });
  });
});