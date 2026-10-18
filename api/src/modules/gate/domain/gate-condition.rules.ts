import { GateDirection } from '../../catalog/domain/border-facility.catalog';
import { GateStatusColor } from './gate-event.entity';

/**
 * Vi phạm **trình tự sự kiện cổng** khi ghi một quyết định CHO QUA (F38).
 *
 * Tập đóng mã ASCII — nơi gọi ánh xạ sang khóa i18n tương ứng, không dò chuỗi tiếng Việt.
 */
export type GatePassageViolation =
  | 'ALREADY_LEFT'
  | 'DUPLICATE_ENTRY'
  | 'DUPLICATE_EXIT'
  | 'EXIT_BEFORE_ENTRY'
  | 'ENTRY_AFTER_EXIT';

/** Ảnh chụp lịch sử qua cổng của một hồ sơ, đủ để kiểm trình tự lượt vào/ra. */
export interface GatePassageState {
  /** Hồ sơ đã rời cửa khẩu (EXITED/COMPLETED) — không ghi thêm lượt cho qua nào nữa. */
  alreadyLeft: boolean;
  /** Đã có lượt CHO QUA chiều VÀO trước đó. */
  hasAllowedEntry: boolean;
  /** Đã có lượt CHO QUA chiều RA trước đó. */
  hasAllowedExit: boolean;
}

/**
 * Kiểm trình tự cho một quyết định **CHO QUA** (ALLOW) tại cổng theo chiều `direction` (F38).
 *
 * Chỉ áp cho ALLOW — quyết định TỪ CHỐI (DENY) luôn ghi được để lưu vết vì sao chặn xe. Bốn tình
 * huống sai bị chặn: hồ sơ đã rời cửa khẩu còn ghi thêm; cho ra khi chưa từng cho vào; cho vào lại
 * sau khi đã ra; và ghi trùng một chiều đã cho qua. Trả mã vi phạm đầu tiên gặp, hoặc `null` nếu hợp lệ.
 */
export function checkGatePassage(direction: GateDirection, state: GatePassageState): GatePassageViolation | null {
  if (state.alreadyLeft) return 'ALREADY_LEFT';
  if (direction === GateDirection.EXIT) {
    if (state.hasAllowedExit) return 'DUPLICATE_EXIT';
    if (!state.hasAllowedEntry) return 'EXIT_BEFORE_ENTRY';
    return null;
  }
  if (state.hasAllowedExit) return 'ENTRY_AFTER_EXIT';
  if (state.hasAllowedEntry) return 'DUPLICATE_ENTRY';
  return null;
}

/**
 * Bốn tình huống cổng mà `WorkflowPolicyService.evaluateGate()` đã định nghĩa sẵn.
 * Khai lại ở đây dưới dạng kiểu chuỗi để tầng `domain/` của phân hệ cổng **không phải import
 * tầng `application/` của phân hệ hồ sơ**; hai kiểu trùng khít nên truyền thẳng được.
 */
export type GateRuleKey = 'B2_IN_EXPORT' | 'B1_EXPORT_EXIT' | 'B1_IMPORT_ENTRY' | 'B2_IMPORT_EXIT';

/** Kết quả `evaluateGate()` mà quy tắc cổng nhận vào — chỉ lấy phần cần dùng. */
export interface WorkflowGateEvaluation {
  canOpen: boolean;
  statusColor: GateStatusColor;
  blockingReasons: string[];
  requiredCompletedSteps: string[];
}

/** Một dòng checklist tại cổng: định nghĩa từ danh mục + trạng thái đã tích (F39). */
export interface GateChecklistItem {
  code: string;
  label: string;
  required: boolean;
  checked: boolean;
  note: string | null;
}

export interface GateConditionResult {
  canOpen: boolean;
  statusColor: GateStatusColor;
  /** Danh sách điều kiện **còn thiếu**, viết cho người dùng đọc. Rỗng nghĩa là đủ điều kiện. */
  blockingReasons: string[];
  requiredCompletedSteps: string[];
}

/**
 * Chọn quy tắc mở cổng theo **luồng hồ sơ × chiều đi của cổng** — bảng 2×2 đúng bằng 4 tình huống
 * mà `evaluateGate()` đã có:
 *
 * |            | Cổng ENTRY (vào)    | Cổng EXIT (ra)     |
 * |------------|---------------------|--------------------|
 * | Hồ sơ xuất | `B2_IN_EXPORT`      | `B1_EXPORT_EXIT`   |
 * | Hồ sơ nhập | `B1_IMPORT_ENTRY`   | `B2_IMPORT_EXIT`   |
 *
 * Cổng vào chỉ kiểm hồ sơ còn hiệu lực; cổng ra mới là nơi đòi đủ nghiệp vụ **và** nghĩa vụ tài
 * chính (F39). Toàn bộ nội dung điều kiện nằm ở `WorkflowPolicyService`, đây chỉ chọn nhánh.
 */
export function gateRuleKey(isExportLike: boolean, direction: GateDirection): GateRuleKey {
  if (isExportLike) return direction === GateDirection.EXIT ? 'B1_EXPORT_EXIT' : 'B2_IN_EXPORT';
  return direction === GateDirection.EXIT ? 'B2_IMPORT_EXIT' : 'B1_IMPORT_ENTRY';
}

/**
 * **Đây là chỗ chốt DoD của P4**: thiếu bất kỳ điều kiện nào thì `canOpen = false` và
 * `blockingReasons` liệt kê đủ những thứ còn thiếu.
 *
 * Hai nguồn điều kiện được **gộp lại**, không thay thế nhau:
 * 1. Điều kiện nghiệp vụ + tài chính do `evaluateGate()` tính (tái dùng nguyên vẹn, kể cả sửa
 *    lỗi **B2** — nghĩa vụ tài chính yêu cầu **cả hai** khoản phí).
 * 2. Các mục checklist **bắt buộc** tại cổng chưa được tích (F39).
 */
export function evaluateGateConditions(
  evaluation: WorkflowGateEvaluation,
  _checklist: GateChecklistItem[] = [],
): GateConditionResult {
  const blockingReasons = [...evaluation.blockingReasons];
  const canOpen = evaluation.canOpen;

  return {
    canOpen,
    // Hồ sơ bị từ chối/thu hồi đã là RED từ `evaluateGate()`; giữ nguyên mức nặng nhất.
    statusColor: evaluation.statusColor === 'RED' ? 'RED' : canOpen ? 'GREEN' : 'YELLOW',
    blockingReasons,
    requiredCompletedSteps: [...evaluation.requiredCompletedSteps],
  };
}
