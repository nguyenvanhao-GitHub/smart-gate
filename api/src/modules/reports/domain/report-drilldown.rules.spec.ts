import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../declarations/domain/declaration.enums';
import { dossierDrilldown, gateExitDrilldown, workflowQueueDrilldown, yardMapDrilldown } from './report-drilldown.rules';
import { describeFilter, formatDurationSeconds, toSheetName } from './report-format';

/**
 * Liên kết truy ngược là hợp đồng với API danh sách hồ sơ: gửi thừa một khóa lạ hoặc một giá trị
 * rỗng là bị `ValidationPipe` trả 400, và người dùng sẽ thấy "bấm vào KPI thì lỗi".
 */
describe('dossierDrilldown', () => {
  it('luôn trỏ về màn hình danh sách hồ sơ', () => {
    expect(dossierDrilldown({}).route).toBe('/declarations');
  });

  it('chỉ giữ các khóa mà API danh sách hồ sơ nhận', () => {
    const drilldown = dossierDrilldown({
      from: '2026-07-01',
      to: '2026-07-31',
      checkpoint: CheckpointCode.B1,
      type: DeclarationType.IMPORT,
      status: DeclarationStatus.PROCESSING,
      // `agencyCode` là bộ lọc của báo cáo liên ngành, danh sách hồ sơ không hiểu → phải bị loại.
      agencyCode: 'CUSTOMS',
    });

    expect(drilldown.queryParams).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      checkpoint: 'B1',
      type: 'IMPORT',
      status: 'PROCESSING',
    });
  });

  it('loại bỏ giá trị rỗng thay vì gửi tham số trống', () => {
    expect(dossierDrilldown({ from: '', to: undefined, status: '   ' }).queryParams).toEqual({});
  });

  it('override đè lên bộ lọc gốc — dùng cho từng thẻ KPI theo trạng thái', () => {
    const drilldown = dossierDrilldown(
      { status: DeclarationStatus.COMPLETED, checkpoint: CheckpointCode.B2 },
      { status: DeclarationStatus.REJECTED },
    );

    expect(drilldown.queryParams).toEqual({ status: 'REJECTED', checkpoint: 'B2' });
  });

  it('KPI "tổng hồ sơ" bỏ hẳn tham số trạng thái thay vì gửi rỗng', () => {
    expect(dossierDrilldown({ checkpoint: CheckpointCode.B1 }, { status: undefined }).queryParams).toEqual({
      checkpoint: 'B1',
    });
  });

  it('giữ được tham số NHÓM trạng thái (statusGroup) cho KPI "Đang xử lý"', () => {
    const drilldown = dossierDrilldown({ checkpoint: CheckpointCode.B1 }, { statusGroup: 'IN_PROGRESS' });

    expect(drilldown.queryParams).toEqual({ checkpoint: 'B1', statusGroup: 'IN_PROGRESS' });
  });
});

describe('gateExitDrilldown', () => {
  it('trỏ về màn Cổng vào/ra, không kèm bộ lọc nếu không truyền', () => {
    expect(gateExitDrilldown()).toEqual({ route: '/operations/vehicles-entered-gate', queryParams: {} });
  });

  it('giữ lại tham số from, to và ghi đè direction, decision khi có truyền vào', () => {
    expect(
      gateExitDrilldown({ from: '2026-08-01', to: '2026-08-20' }, { direction: 'ENTRY', decision: 'ALLOW' }),
    ).toEqual({
      route: '/operations/vehicles-entered-gate',
      queryParams: { from: '2026-08-01', to: '2026-08-20', direction: 'ENTRY', decision: 'ALLOW' },
    });
  });
});

describe('workflowQueueDrilldown (SG-195)', () => {
  it('trỏ về màn Hàng đợi Xử lý liên ngành', () => {
    expect(workflowQueueDrilldown()).toEqual({ route: '/workflow/queue', queryParams: {} });
  });
});

describe('yardMapDrilldown (SG-197)', () => {
  it('trỏ về màn Kho bãi >> Sơ đồ bãi', () => {
    expect(yardMapDrilldown()).toEqual({ route: '/operations/customs-b5', queryParams: {} });
  });
});

describe('định dạng cho tệp Excel', () => {
  it('đổi số giây sang chuỗi tiếng Việt đọc được', () => {
    expect(formatDurationSeconds(0)).toBe('—');
    expect(formatDurationSeconds(45)).toBe('45 giây');
    expect(formatDurationSeconds(600)).toBe('10 phút');
    expect(formatDurationSeconds(3600)).toBe('1 giờ');
    expect(formatDurationSeconds(8100)).toBe('2 giờ 15 phút');
  });

  it('không hiển thị số âm hay giá trị không xác định', () => {
    expect(formatDurationSeconds(-5)).toBe('—');
    expect(formatDurationSeconds(null)).toBe('—');
    expect(formatDurationSeconds(Number.NaN)).toBe('—');
  });

  it('mô tả bộ lọc để người nhận tệp kiểm chứng lại được con số', () => {
    expect(describeFilter({ from: '2026-07-01', status: '' }, { from: 'Từ ngày' })).toBe('Từ ngày: 2026-07-01');
    expect(describeFilter({}, {})).toBe('Không áp dụng bộ lọc');
  });

  it('tên sheet hợp lệ với Excel: bỏ ký tự cấm và cắt còn 31 ký tự', () => {
    expect(toSheetName('Báo cáo [thử]: A/B')).toBe('Báo cáo  thử   A B');
    expect(toSheetName('x'.repeat(50))).toHaveLength(31);
  });
});
