import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnterprisePartRequest } from './dossier-parts.request';

describe('EnterprisePartRequest — DTO phân nhánh định danh theo accountType (SG-281)', () => {
  it('ENTERPRISE (mặc định) có taxCode hợp lệ → hợp lệ', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      taxCode: '5500123456',
      name: 'Công ty Tân Thanh',
      accountType: 'ENTERPRISE',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('ENTERPRISE thiếu taxCode → báo lỗi validation', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      name: 'Công ty Tân Thanh',
      accountType: 'ENTERPRISE',
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'taxCode')).toBe(true);
  });

  it('Không truyền accountType (mặc định ENTERPRISE) thiếu taxCode → báo lỗi validation', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      name: 'Doanh nghiệp X',
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'taxCode')).toBe(true);
  });

  it('INDIVIDUAL có idNumber hợp lệ (không cần taxCode) → hợp lệ', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      idNumber: '038090001234',
      name: 'Nguyễn Văn A',
      accountType: 'INDIVIDUAL',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('INDIVIDUAL thiếu idNumber → báo lỗi validation', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      name: 'Nguyễn Văn A',
      accountType: 'INDIVIDUAL',
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'idNumber')).toBe(true);
  });

  it('INTERNAL có email hợp lệ (không cần taxCode) → hợp lệ', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      email: 'staff@smartgate.vn',
      name: 'Cán bộ B',
      accountType: 'INTERNAL',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('INTERNAL khai hộ (createForOther: true) thiếu email → báo lỗi validation', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      name: 'Cán bộ B',
      accountType: 'INTERNAL',
      createForOther: true,
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('INTERNAL tự khai (createForOther: false hoặc không truyền) thiếu email → hợp lệ', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      name: 'Cán bộ B',
      accountType: 'INTERNAL',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('chặn chuỗi rỗng: ENTERPRISE gửi taxCode = "" → báo lỗi validation', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      taxCode: '',
      accountType: 'ENTERPRISE',
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'taxCode')).toBe(true);
  });

  it('chặn chuỗi rỗng: INDIVIDUAL gửi idNumber = "" → báo lỗi validation', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      idNumber: '',
      accountType: 'INDIVIDUAL',
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'idNumber')).toBe(true);
  });

  it('chặn chuỗi rỗng: INTERNAL khai hộ gửi email = "" → báo lỗi validation', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      email: '',
      accountType: 'INTERNAL',
      createForOther: true,
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('INDIVIDUAL gửi taxCode = "" hoặc undefined thì bỏ qua validate taxCode', () => {
    const dto = plainToInstance(EnterprisePartRequest, {
      idNumber: '038090001234',
      taxCode: '',
      accountType: 'INDIVIDUAL',
    });
    expect(validateSync(dto)).toEqual([]);
  });
});
