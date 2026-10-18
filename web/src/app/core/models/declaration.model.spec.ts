import {
  DOSSIER_STATUS_TONES,
  dossierStatusTone,
  formatEnterpriseIdentifierPrefix,
  resolveEnterpriseIdentifier,
  resolveEnterpriseNameLabelKey,
} from './declaration.model';

/**
 * BUG-044 — mỗi trạng thái phân biệt được bằng màu badge (SRS 8.1). Trọng tâm: nhóm "cần bổ sung/khai
 * lại" (cảnh báo, cam) KHÁC nhóm "từ chối/hủy" (đỏ) và KHÁC nhóm "chờ" (vàng), để không còn hai cặp
 * trạng thái trùng nền như trước.
 */
describe('DOSSIER_STATUS_TONES — tách màu trạng thái (BUG-044)', () => {
  it('cần bổ sung / khai lại dùng tone cảnh báo (warning), không phải rejected', () => {
    expect(dossierStatusTone('NEED_SUPPLEMENT')).toBe('warning');
    expect(dossierStatusTone('REVISION_REQUIRED')).toBe('warning');
  });

  it('từ chối / hủy dùng tone rejected (đỏ)', () => {
    expect(dossierStatusTone('REJECTED')).toBe('rejected');
    expect(dossierStatusTone('CANCELLED')).toBe('rejected');
  });

  it('cặp "Từ chối" và "Yêu cầu khai lại" nay KHÁC màu', () => {
    expect(dossierStatusTone('REJECTED')).not.toBe(dossierStatusTone('REVISION_REQUIRED'));
  });

  it('cặp "Yêu cầu bổ sung" và "Đã hủy" nay KHÁC màu', () => {
    expect(dossierStatusTone('NEED_SUPPLEMENT')).not.toBe(dossierStatusTone('CANCELLED'));
  });

  it('warning (cảnh báo) tách khỏi waiting (chờ) — cùng gốc "vàng" nhưng khác tone', () => {
    expect(dossierStatusTone('REVISION_REQUIRED')).not.toBe(dossierStatusTone('SUBMITTED'));
    expect(dossierStatusTone('SUBMITTED')).toBe('waiting');
  });

  it('trạng thái không rõ rơi về idle', () => {
    expect(dossierStatusTone('KHONG_TON_TAI')).toBe('idle');
  });

  it('bảng tone không còn xếp bổ sung/khai lại chung với từ chối/hủy', () => {
    const warnings = ['NEED_SUPPLEMENT', 'REVISION_REQUIRED'];
    const rejects = ['REJECTED', 'CANCELLED'];
    warnings.forEach((status) => expect(DOSSIER_STATUS_TONES[status]).toBe('warning'));
    rejects.forEach((status) => expect(DOSSIER_STATUS_TONES[status]).toBe('rejected'));
  });
});

describe('resolveEnterpriseIdentifier & formatEnterpriseIdentifierPrefix (SG-281)', () => {
  const fakeTranslate = ((key: string, params?: Record<string, any>) => {
    if (key === 'ui.dossier.taxCodePrefix') return `MST ${params?.['taxCode']}`;
    if (key === 'ui.form.idNumber') return 'Số CCCD / Hộ chiếu';
    if (key === 'ui.common.email') return 'Thư điện tử';
    if (key === 'ui.form.codeInternal') return 'Mã cán bộ / Đơn vị';
    if (key === 'ui.common.taxCode') return 'Mã số thuế';
    return key;
  }) as any;

  it('hồ sơ cũ chưa có accountType nhưng taxCode là 12 số CCCD: tự nhận diện là ID_NUMBER', () => {
    const res = resolveEnterpriseIdentifier({ taxCode: '038090001234' });
    expect(res.kind).toBe('ID_NUMBER');
    expect(res.labelKey).toBe('ui.form.idNumber');
    expect(res.value).toBe('038090001234');

    const formatted = formatEnterpriseIdentifierPrefix({ taxCode: '038090001234' }, fakeTranslate);
    expect(formatted).toBe('Số CCCD / Hộ chiếu: 038090001234');
  });

  it('hồ sơ cũ chưa có accountType nhưng taxCode là 9 số CMND: tự nhận diện là ID_NUMBER', () => {
    const res = resolveEnterpriseIdentifier({ taxCode: '123456789' });
    expect(res.kind).toBe('ID_NUMBER');
    expect(res.labelKey).toBe('ui.form.idNumber');
    expect(res.value).toBe('123456789');

    const formatted = formatEnterpriseIdentifierPrefix({ taxCode: '123456789' }, fakeTranslate);
    expect(formatted).toBe('Số CCCD / Hộ chiếu: 123456789');
  });

  it('tài khoản nội bộ (INTERNAL) tự khai có taxCode là mã nội bộ nhưng không có email: hiển thị mã nội bộ', () => {
    const res = resolveEnterpriseIdentifier({ accountType: 'INTERNAL', taxCode: 'HQ-OPS' });
    expect(res.kind).toBe('INTERNAL_CODE');
    expect(res.labelKey).toBe('ui.form.codeInternal');
    expect(res.value).toBe('HQ-OPS');

    const formatted = formatEnterpriseIdentifierPrefix({ accountType: 'INTERNAL', taxCode: 'HQ-OPS' }, fakeTranslate);
    expect(formatted).toBe('Mã cán bộ / Đơn vị: HQ-OPS');
  });

  it('tài khoản nội bộ (INTERNAL) có email: hiển thị email', () => {
    const res = resolveEnterpriseIdentifier({ accountType: 'INTERNAL', email: 'officer@smartgate.vn' });
    expect(res.kind).toBe('EMAIL');
    expect(res.labelKey).toBe('ui.common.email');
    expect(res.value).toBe('officer@smartgate.vn');

    const formatted = formatEnterpriseIdentifierPrefix({ accountType: 'INTERNAL', email: 'officer@smartgate.vn' }, fakeTranslate);
    expect(formatted).toBe('officer@smartgate.vn');
  });

  it('tài khoản doanh nghiệp (ENTERPRISE): hiển thị tiền tố MST', () => {
    const res = resolveEnterpriseIdentifier({ accountType: 'ENTERPRISE', taxCode: '0101234567' });
    expect(res.kind).toBe('TAX_CODE');
    expect(res.labelKey).toBe('ui.common.taxCode');
    expect(res.value).toBe('0101234567');

    const formatted = formatEnterpriseIdentifierPrefix({ accountType: 'ENTERPRISE', taxCode: '0101234567' }, fakeTranslate);
    expect(formatted).toBe('MST 0101234567');
  });

  it('tài khoản ENTERPRISE chưa có taxCode nhưng có idNumber: luôn ưu tiên accountType, không bị nhầm sang CCCD', () => {
    const res = resolveEnterpriseIdentifier({ accountType: 'ENTERPRISE', idNumber: '038090001234', taxCode: '' });
    expect(res.kind).toBe('TAX_CODE');
    expect(res.labelKey).toBe('ui.common.taxCode');
  });

  it('resolveEnterpriseNameLabelKey: phân nhánh đúng nhãn theo loại tài khoản', () => {
    expect(resolveEnterpriseNameLabelKey({ accountType: 'INDIVIDUAL' })).toBe('ui.form.fullNameIndividual');
    expect(resolveEnterpriseNameLabelKey({ accountType: 'INTERNAL' })).toBe('ui.form.nameInternal');
    expect(resolveEnterpriseNameLabelKey({ accountType: 'ENTERPRISE' })).toBe('ui.form.enterpriseName');
    // Hồ sơ cũ chưa có accountType nhưng taxCode là CCCD 12 số
    expect(resolveEnterpriseNameLabelKey({ taxCode: '038090001234' })).toBe('ui.form.fullNameIndividual');
  });
});
