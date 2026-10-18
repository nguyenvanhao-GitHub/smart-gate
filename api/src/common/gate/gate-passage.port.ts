/**
 * Cổng tra **thời điểm xe qua cổng vào/ra của một hồ sơ** (CR12 — thời gian nhập/xuất cảnh). Đặt ở
 * `common/` theo đúng nếp của `fee-settlement.port`: phân hệ hồ sơ (`declarations`) cần hiển thị mốc
 * nhập/xuất cảnh mà **không được** phụ thuộc ngược vào phân hệ cổng (`gate` → `declarations`, không
 * có chiều ngược). Không lưu cột riêng — nguồn sự thật là bảng `gate_events` (sự kiện CHO QUA).
 */
export const GATE_PASSAGE_TIMES = Symbol('GATE_PASSAGE_TIMES');

/** Mốc thời gian xe được **cho qua** cổng vào/ra của một hồ sơ; `null` khi chưa có lượt tương ứng. */
export interface GatePassageTimes {
  /** Thời điểm sự kiện CHO QUA cổng VÀO sớm nhất (nhập cảnh). */
  entryAt: Date | null;
  /** Thời điểm sự kiện CHO QUA cổng RA sớm nhất (xuất cảnh). */
  exitAt: Date | null;
}

export const NO_GATE_PASSAGE: GatePassageTimes = { entryAt: null, exitAt: null };

export interface GatePassageTimesQuery {
  /** Mốc nhập/xuất cảnh của hồ sơ, đọc từ các sự kiện CHO QUA trong `gate_events`. */
  timesOf(dossierId: string): Promise<GatePassageTimes>;
}
