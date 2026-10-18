import { REPORT_AGENCY_CODES, aggregateAgencyWorkload } from './agency-workload.rules';

/**
 * Bảng "trạng thái theo lực lượng" trên dashboard. Quy tắc gộp phải ổn định vì đây là con số
 * lãnh đạo nhìn hằng ngày; đếm nhầm một ô là đọc sai tải của cả một lực lượng.
 */
describe('aggregateAgencyWorkload', () => {
  it('luôn trả đủ 5 lực lượng, kể cả khi chưa có hồ sơ nào', () => {
    const rows = aggregateAgencyWorkload([]);

    expect(rows.map((row) => row.agencyCode)).toEqual(REPORT_AGENCY_CODES);
    rows.forEach((row) => expect(row).toMatchObject({ waiting: 0, processing: 0, completed: 0 }));
  });

  it('gộp nhiều bước của cùng một lực lượng vào một dòng', () => {
    const rows = aggregateAgencyWorkload([
      { stepCode: 'IMPORT_BORDER', status: 'IN_PROGRESS', count: 2 },
      { stepCode: 'IMPORT_B1_ENTRY', status: 'IN_PROGRESS', count: 3 },
    ]);

    expect(rows.find((row) => row.agencyCode === 'BORDER_GUARD')).toMatchObject({
      agencyName: 'Biên phòng',
      processing: 5,
    });
  });

  it('bước chưa tới lượt và bước chờ bổ sung đều tính là đang chờ', () => {
    const rows = aggregateAgencyWorkload([
      { stepCode: 'IMPORT_CUSTOMS', status: 'PENDING', count: 4 },
      { stepCode: 'IMPORT_CUSTOMS', status: 'WAITING_SUPPLEMENT', count: 1 },
    ]);

    expect(rows.find((row) => row.agencyCode === 'CUSTOMS')?.waiting).toBe(5);
  });

  it('bước bị từ chối KHÔNG được gộp vào "hoàn thành"', () => {
    const rows = aggregateAgencyWorkload([
      { stepCode: 'IMPORT_CUSTOMS', status: 'COMPLETED', count: 2 },
      { stepCode: 'IMPORT_CUSTOMS', status: 'REJECTED', count: 7 },
    ]);
    const customs = rows.find((row) => row.agencyCode === 'CUSTOMS');

    expect(customs).toMatchObject({ waiting: 0, processing: 0, completed: 2 });
  });

  it('bỏ qua bước khai báo của doanh nghiệp và mã bước lạ', () => {
    const rows = aggregateAgencyWorkload([
      { stepCode: 'IMPORT_DECLARED', status: 'COMPLETED', count: 9 },
      { stepCode: 'BUOC_KHONG_TON_TAI', status: 'COMPLETED', count: 9 },
    ]);

    rows.forEach((row) => expect(row.completed).toBe(0));
  });
});
