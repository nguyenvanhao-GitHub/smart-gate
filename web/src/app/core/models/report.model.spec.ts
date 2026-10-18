import {
  ReportDefinition,
  categoryColumn,
  cleanFilterValues,
  exportFileName,
  formatReportCell,
  groupReports,
  pickReportForRoute,
  seriesColumns,
  toSlug,
} from './report.model';

/**
 * Tiện ích của UI-12. Tách khỏi component để kiểm được phần dễ sai nhất:
 * chọn báo cáo theo đường dẫn, làm sạch bộ lọc trước khi gửi API, và định dạng ô dữ liệu.
 */

function baoCao(mau: Partial<ReportDefinition> = {}): ReportDefinition {
  return {
    code: 'traffic-by-hour',
    name: 'Lưu lượng theo giờ',
    group: 'Báo cáo, thống kê',
    description: '',
    filters: [],
    ...mau,
  };
}

describe('report.model — tiện ích báo cáo', () => {
  describe('toSlug', () => {
    it('bỏ dấu tiếng Việt và ghép bằng dấu gạch ngang', () => {
      expect(toSlug('Báo cáo, thống kê')).toBe('bao-cao-thong-ke');
      expect(toSlug('Hải quan')).toBe('hai-quan');
      expect(toSlug('Kiểm dịch động vật')).toBe('kiem-dich-dong-vat');
    });

    it('chuỗi rỗng hoặc chỉ ký tự lạ thì trả rỗng', () => {
      expect(toSlug('')).toBe('');
      expect(toSlug('---')).toBe('');
    });
  });

  describe('groupReports', () => {
    it('gom theo nhóm và giữ nguyên thứ tự API trả', () => {
      const groups = groupReports([
        baoCao({ code: 'a', group: 'Hải quan' }),
        baoCao({ code: 'b', group: 'Biên phòng' }),
        baoCao({ code: 'c', group: 'Hải quan' }),
      ]);

      expect(groups.map((item) => item.group)).toEqual(['Hải quan', 'Biên phòng']);
      expect(groups[0].reports.map((item) => item.code)).toEqual(['a', 'c']);
    });
  });

  describe('pickReportForRoute', () => {
    const danhMuc = [baoCao(), baoCao({ code: 'processing-time', name: 'Thời gian xử lý', group: 'Hải quan' })];

    it('khớp theo mã báo cáo trước tiên', () => {
      expect(pickReportForRoute(danhMuc, 'processing-time')?.code).toBe('processing-time');
    });

    it('không khớp mã thì khớp theo slug của nhóm', () => {
      expect(pickReportForRoute(danhMuc, 'hai-quan')?.code).toBe('processing-time');
    });

    it('không khớp gì thì lấy báo cáo đầu tiên — mục menu /reports/general vẫn mở được', () => {
      expect(pickReportForRoute(danhMuc, 'general')?.code).toBe('traffic-by-hour');
    });

    it('danh mục rỗng thì trả null', () => {
      expect(pickReportForRoute([], 'general')).toBeNull();
    });
  });

  describe('cleanFilterValues', () => {
    it('bỏ ô rỗng và cắt khoảng trắng thừa', () => {
      expect(cleanFilterValues({ from: '2026-07-01', to: '', keyword: '  nong san  ' })).toEqual({
        from: '2026-07-01',
        keyword: 'nong san',
      });
    });
  });

  describe('formatReportCell', () => {
    it('số dùng định dạng Việt Nam', () => {
      expect(formatReportCell(1234567, 'number')).toBe('1.234.567');
    });

    it('thời lượng tính bằng giây, không phải mốc thời gian', () => {
      expect(formatReportCell(4530, 'duration')).toBe('1 giờ 15 phút');
      expect(formatReportCell(90, 'duration')).toBe('1 phút');
      expect(formatReportCell(273720, 'duration')).toBe('3 ngày 4 giờ 2 phút');
      expect(formatReportCell(273600, 'duration')).toBe('3 ngày 4 giờ');
    });

    it('ô trống hiện dấu gạch, không hiện null', () => {
      expect(formatReportCell(null, 'text')).toBe('—');
      expect(formatReportCell(undefined, 'number')).toBe('—');
      expect(formatReportCell('', 'date')).toBe('—');
    });

    it('ngày sai định dạng thì giữ nguyên chuỗi gốc thay vì "Invalid Date"', () => {
      expect(formatReportCell('khong-phai-ngay', 'date')).toBe('khong-phai-ngay');
    });
  });

  describe('cột dùng cho biểu đồ', () => {
    const cot = [
      { key: 'hour', label: 'Khung giờ', type: 'text' as const },
      { key: 'submitted', label: 'Hồ sơ', type: 'number' as const },
      { key: 'avg', label: 'Thời gian', type: 'duration' as const },
    ];

    it('cột phân loại là cột text/date đầu tiên', () => {
      expect(categoryColumn(cot)?.key).toBe('hour');
    });

    it('chuỗi số liệu gồm cột number và duration', () => {
      expect(seriesColumns(cot).map((item) => item.key)).toEqual(['submitted', 'avg']);
    });

    it('không có cột số thì không có chuỗi nào để vẽ', () => {
      expect(seriesColumns([cot[0]])).toEqual([]);
    });
  });

  describe('exportFileName', () => {
    it('có tiền tố bao-cao-, mã báo cáo tiếng Việt, mốc ngày giờ và đuôi .xlsx (SG-179)', () => {
      expect(exportFileName('gate-event', new Date(2026, 6, 23, 9, 5))).toBe('bao-cao-nhat-ky-qua-cong-2026-07-23_09h05.xlsx');
      expect(exportFileName('agency-decision', new Date(2026, 7, 20, 16, 15))).toBe('bao-cao-quyet-dinh-theo-luc-luong-2026-08-20_16h15.xlsx');
    });
  });
});
