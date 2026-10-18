import { QrCodeMatrix, encodeQrCode, qrMatrixToSvgPath } from './qr-code';

/**
 * Bộ sinh mã QR tự viết (không dùng thư viện ngoài) — kiểm phần cấu trúc bắt buộc của
 * chuẩn ISO/IEC 18004: kích thước theo phiên bản, 3 ô định vị, vạch định thời, module tối
 * cố định và thông tin định dạng phải qua được kiểm BCH.
 */
describe('qr-code — sinh ma trận mã QR', () => {
  /** Đọc 15 bit thông tin định dạng ở bản sao góc trên trái. */
  function docFormatBits(matrix: QrCodeMatrix): number {
    let bits = 0;
    for (let i = 0; i <= 5; i++) if (matrix.modules[i][8]) bits |= 1 << i;
    if (matrix.modules[7][8]) bits |= 1 << 6;
    if (matrix.modules[8][8]) bits |= 1 << 7;
    if (matrix.modules[8][7]) bits |= 1 << 8;
    for (let i = 9; i < 15; i++) if (matrix.modules[8][14 - i]) bits |= 1 << i;
    return bits;
  }

  function docFormatBitsBanSao2(matrix: QrCodeMatrix): number {
    const size = matrix.size;
    let bits = 0;
    for (let i = 0; i < 8; i++) if (matrix.modules[8][size - 1 - i]) bits |= 1 << i;
    for (let i = 8; i < 15; i++) if (matrix.modules[size - 15 + i][8]) bits |= 1 << i;
    return bits;
  }

  function laOhDinhVi(matrix: QrCodeMatrix, x: number, y: number): boolean {
    // Ô định vị 7×7: viền tối, vành sáng, lõi tối 3×3.
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const khoang = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        const toi = khoang !== 2;
        if (matrix.modules[y + dy][x + dx] !== toi) return false;
      }
    }
    return true;
  }

  it('chuỗi ngắn dùng phiên bản 1 với ma trận 21×21', () => {
    const matrix = encodeQrCode('HS-250519-0015');
    expect(matrix.version).toBe(1);
    expect(matrix.size).toBe(21);
    expect(matrix.modules.length).toBe(21);
    expect(matrix.modules[0].length).toBe(21);
  });

  it('sức chứa từng phiên bản khớp bảng chuẩn mức M (14 / 26 / 42 ký tự)', () => {
    // Bảng sức chứa chế độ byte, mức sửa lỗi M của ISO/IEC 18004 — dùng để kiểm
    // lại bảng codeword sửa lỗi trong bộ sinh.
    expect(encodeQrCode('A'.repeat(14)).version).toBe(1);
    expect(encodeQrCode('A'.repeat(15)).version).toBe(2);
    expect(encodeQrCode('A'.repeat(26)).version).toBe(2);
    expect(encodeQrCode('A'.repeat(27)).version).toBe(3);
    expect(encodeQrCode('A'.repeat(42)).version).toBe(3);
    expect(encodeQrCode('A'.repeat(43)).version).toBe(4);
  });

  it('kích thước ma trận luôn bằng 4 × phiên bản + 17', () => {
    const matrix = encodeQrCode('X'.repeat(200));
    expect(matrix.size).toBe(matrix.version * 4 + 17);
    expect(matrix.version).toBeGreaterThan(1);
  });

  it('vẽ đủ 3 ô định vị ở ba góc', () => {
    const matrix = encodeQrCode('SG|HS-250519-0015|2026-07-22');
    const size = matrix.size;
    expect(laOhDinhVi(matrix, 0, 0)).toBe(true);
    expect(laOhDinhVi(matrix, size - 7, 0)).toBe(true);
    expect(laOhDinhVi(matrix, 0, size - 7)).toBe(true);
  });

  it('vạch định thời hàng 6 và cột 6 xen kẽ tối/sáng', () => {
    const matrix = encodeQrCode('SG|HS-250519-0015');
    for (let i = 8; i < matrix.size - 8; i++) {
      expect(matrix.modules[6][i]).toBe(i % 2 === 0);
      expect(matrix.modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it('luôn có module tối cố định tại (8, size-8)', () => {
    const matrix = encodeQrCode('SG|HS-250519-0015');
    expect(matrix.modules[matrix.size - 8][8]).toBe(true);
  });

  it('thông tin định dạng qua được kiểm BCH, đúng mức sửa lỗi M và đúng mặt nạ đã chọn', () => {
    const matrix = encodeQrCode('SG|HS-250519-0015|token');
    const bits = docFormatBits(matrix) ^ 0x5412;
    const data = bits >>> 10;
    const ecc = bits & 0x3ff;

    let remainder = data;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);

    expect(remainder & 0x3ff).toBe(ecc);
    expect(data >>> 3).toBe(0); // mức sửa lỗi M
    expect(data & 0b111).toBe(matrix.mask);
    expect(matrix.mask).toBeGreaterThanOrEqual(0);
    expect(matrix.mask).toBeLessThanOrEqual(7);
  });

  it('hai bản sao thông tin định dạng giống nhau', () => {
    const matrix = encodeQrCode('SG|HS-250519-0015|token');
    expect(docFormatBitsBanSao2(matrix)).toBe(docFormatBits(matrix));
  });

  it('cùng đầu vào cho ra cùng ma trận, khác đầu vào thì khác ma trận', () => {
    const a = encodeQrCode('HS-250519-0015');
    const b = encodeQrCode('HS-250519-0015');
    const c = encodeQrCode('HS-250519-0016');

    expect(a.modules).toEqual(b.modules);
    expect(a.modules).not.toEqual(c.modules);
  });

  it('mã hóa được tiếng Việt có dấu (UTF-8 nhiều byte)', () => {
    const matrix = encodeQrCode('Cửa khẩu Chiềng Khương — HS-250519-0015');
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    expect(laOhDinhVi(matrix, 0, 0)).toBe(true);
  });

  it('chuỗi rỗng bị từ chối, chuỗi vượt sức chứa phiên bản 40 cũng vậy', () => {
    expect(() => encodeQrCode('')).toThrowError('Chuỗi mã QR rỗng.');
    expect(() => encodeQrCode('A'.repeat(5000))).toThrowError('Chuỗi mã QR quá dài, vượt sức chứa phiên bản 40.');
  });

  it('đường vẽ SVG có đúng số ô tối và đã chừa vùng lặng', () => {
    const matrix = encodeQrCode('HS-250519-0015');
    const path = qrMatrixToSvgPath(matrix, 4);
    const soOToi = matrix.modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

    expect(path.split('M').length - 1).toBe(soOToi);
    expect(path.startsWith('M')).toBe(true);
    // Vùng lặng 4 module: không có ô nào vẽ ở tọa độ nhỏ hơn 4.
    expect(/M[0-3] /.test(path)).toBe(false);
  });
});
