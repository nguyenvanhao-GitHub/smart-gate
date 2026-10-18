import {
  LegacyDeclarationRow,
  computeExpectation,
  extractCargoItem,
  extractEnterprise,
  extractQrCode,
  extractSubmittedAt,
  extractVehicle,
  mergeEnterprises,
} from './dossier-jsonb-backfill';
import { parseDossierQrPayload } from '../../../modules/declarations/domain/dossier-qr';

/**
 * Rủi ro **R2** của kế hoạch: di trú `jsonb` → bảng quan hệ làm hỏng hồ sơ đang có.
 * Bộ test này ép logic sao chép phải chịu được `jsonb` null, sai kiểu hoặc thiếu trường —
 * đúng những gì dữ liệu thật của môi trường demo hay có.
 */
describe('dossier-jsonb-backfill', () => {
  function makeRow(overrides: Partial<LegacyDeclarationRow> = {}): LegacyDeclarationRow {
    return {
      id: 'decl-1',
      code: 'IMP-20260722-000001',
      status: 'SUBMITTED',
      enterprise: { taxCode: '5500111111', name: 'Công ty A', representativeName: 'Nguyễn Văn A' },
      enterpriseTaxCode: '5500111111',
      vehicle: { plateNumber: '26C-123.45', containerNumber: 'CONT-1' },
      plateNumber: '26C-123.45',
      containerNumber: 'CONT-1',
      trailerNumber: null,
      cargo: { description: 'Nông sản', quantity: 12.5, quarantineTypes: ['PLANT'] },
      auditTrail: [{ action: 'SUBMIT', at: '2026-07-20T02:00:00.000Z' }],
      createdAt: new Date('2026-07-19T01:00:00.000Z'),
      ...overrides,
    };
  }

  describe('doanh nghiệp', () => {
    it('lấy đủ trường từ jsonb', () => {
      expect(extractEnterprise(makeRow())).toEqual({
        taxCode: '5500111111',
        name: 'Công ty A',
        representativeName: 'Nguyễn Văn A',
        address: null,
        phone: null,
      });
    });

    it('jsonb null thì lùi về cột enterpriseTaxCode, tên để trống chứ không bịa', () => {
      expect(extractEnterprise(makeRow({ enterprise: null }))).toEqual({
        taxCode: '5500111111',
        name: '',
        representativeName: null,
        address: null,
        phone: null,
      });
    });

    it('jsonb không phải object (chuỗi/mảng) cũng không làm vỡ', () => {
      expect(extractEnterprise(makeRow({ enterprise: 'hỏng' }))?.taxCode).toBe('5500111111');
      expect(extractEnterprise(makeRow({ enterprise: [] }))?.taxCode).toBe('5500111111');
    });

    it('không có mã số thuế ở cả hai nguồn thì KHÔNG tạo doanh nghiệp', () => {
      expect(extractEnterprise(makeRow({ enterprise: {}, enterpriseTaxCode: '   ' }))).toBeNull();
    });

    it('gộp nhiều hồ sơ cùng mã số thuế thành một bản ghi, lấp trường còn trống', () => {
      const merged = mergeEnterprises([
        makeRow({ id: 'd1', enterprise: { taxCode: '5500111111', name: '' } }),
        makeRow({ id: 'd2', enterprise: { taxCode: '5500111111', name: 'Công ty A', phone: '0212345678' } }),
        makeRow({ id: 'd3', enterprise: { taxCode: '5500222222', name: 'Công ty B' } }),
      ]);

      expect(merged.size).toBe(2);
      expect(merged.get('5500111111')).toMatchObject({ name: 'Công ty A', phone: '0212345678' });
    });
  });

  describe('phương tiện', () => {
    it('ưu tiên jsonb, thiếu thì lùi về các cột phẳng', () => {
      const row = makeRow({ vehicle: null, trailerNumber: 'TRAILER-9' });
      expect(extractVehicle(row)).toEqual({
        dossierId: 'decl-1',
        plateNumber: '26C-123.45',
        containerNumber: 'CONT-1',
        trailerNumber: 'TRAILER-9',
        transportLicenseNumber: null,
      });
    });

    it('mọi hồ sơ đều sinh đúng một dòng phương tiện, kể cả khi thiếu biển số', () => {
      const row = makeRow({ vehicle: {}, plateNumber: null });
      expect(extractVehicle(row).plateNumber).toBe('');
    });
  });

  describe('hàng hóa', () => {
    it('mỗi hồ sơ sinh 1 dòng hàng từ khối cargo cũ', () => {
      expect(extractCargoItem(makeRow())).toEqual({
        dossierId: 'decl-1',
        lineNo: 1,
        description: 'Nông sản',
        hsCode: null,
        quantity: 12.5,
        grossWeightKg: null,
        quarantineTypes: ['PLANT'],
      });
    });

    it('cargo null hoặc thiếu mô tả thì KHÔNG tạo dòng hàng rỗng', () => {
      expect(extractCargoItem(makeRow({ cargo: null }))).toBeNull();
      expect(extractCargoItem(makeRow({ cargo: {} }))).toBeNull();
      expect(extractCargoItem(makeRow({ cargo: { description: '   ' } }))).toBeNull();
    });

    it('số lượng dạng chuỗi được đổi sang số, giá trị rác thành null', () => {
      expect(extractCargoItem(makeRow({ cargo: { description: 'X', quantity: '12.5' } }))?.quantity).toBe(12.5);
      expect(extractCargoItem(makeRow({ cargo: { description: 'X', quantity: 'nhiều' } }))?.quantity).toBeNull();
    });

    it('quarantineTypes sai kiểu thì bỏ qua thay vì ghi dữ liệu hỏng', () => {
      expect(extractCargoItem(makeRow({ cargo: { description: 'X', quarantineTypes: 'PLANT' } }))?.quarantineTypes).toBeNull();
      expect(extractCargoItem(makeRow({ cargo: { description: 'X', quarantineTypes: [1, null] } }))?.quarantineTypes).toBeNull();
    });
  });

  describe('thời điểm gửi và mã QR', () => {
    it('lấy mốc SUBMIT sớm nhất trong auditTrail', () => {
      const row = makeRow({
        auditTrail: [
          { action: 'SUBMIT', at: '2026-07-21T03:00:00.000Z' },
          { action: 'CUSTOMS_CONFIRM', at: '2026-07-21T04:00:00.000Z' },
          { action: 'SUBMIT', at: '2026-07-20T02:00:00.000Z' },
        ],
      });
      expect(extractSubmittedAt(row)?.toISOString()).toBe('2026-07-20T02:00:00.000Z');
    });

    it('không có mốc SUBMIT thì lùi về createdAt với hồ sơ đã rời trạng thái nháp', () => {
      const row = makeRow({ auditTrail: null, status: 'PROCESSING' });
      expect(extractSubmittedAt(row)?.toISOString()).toBe('2026-07-19T01:00:00.000Z');
    });

    it('hồ sơ nháp thì không có thời điểm gửi và không sinh QR', () => {
      const row = makeRow({ auditTrail: [], status: 'DRAFT' });
      expect(extractSubmittedAt(row)).toBeNull();
      expect(extractQrCode(row)).toBeNull();
    });

    it('QR sinh lại đúng công thức domain nên giải mã ngược ra mã hồ sơ', () => {
      const payload = extractQrCode(makeRow());
      expect(parseDossierQrPayload(payload as string)?.code).toBe('IMP-20260722-000001');
    });
  });

  describe('số liệu đối chiếu', () => {
    it('đếm đúng nguồn ↔ đích và nêu rõ phần không di trú được', () => {
      const rows = [
        makeRow({ id: 'd1' }),
        makeRow({ id: 'd2', enterprise: { taxCode: '5500111111', name: 'Công ty A' } }),
        makeRow({ id: 'd3', enterprise: { taxCode: '5500222222', name: 'Công ty B' }, enterpriseTaxCode: '5500222222', cargo: null }),
        makeRow({ id: 'd4', enterprise: {}, enterpriseTaxCode: null, status: 'DRAFT', auditTrail: [] }),
      ];

      expect(computeExpectation(rows)).toEqual({
        declarations: 4,
        enterprises: 2,
        vehicles: 4,
        cargoItems: 3,
        declarationsWithoutTaxCode: 1,
        declarationsWithoutCargo: 1,
        submitted: 3,
      });
    });

    it('bảng rỗng thì mọi số liệu bằng 0', () => {
      expect(computeExpectation([])).toEqual({
        declarations: 0,
        enterprises: 0,
        vehicles: 0,
        cargoItems: 0,
        declarationsWithoutTaxCode: 0,
        declarationsWithoutCargo: 0,
        submitted: 0,
      });
    });
  });
});
