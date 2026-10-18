import {
  AppointmentInfo,
  CargoItemInfo,
  EnterpriseInfo,
  TransshipmentVehicleInfo,
  VehicleInfo,
} from '../../domain/declaration.entity';
import { CheckpointCode, DeclarationType } from '../../domain/declaration.enums';

/**
 * Tạo hồ sơ **nháp**. Doanh nghiệp được lưu nháp với dữ liệu còn thiếu; việc kiểm tra đầy đủ chỉ
 * diễn ra khi gửi hồ sơ (`SubmitDeclarationUseCase`).
 */
export interface CreateDeclarationCommand {
  type: DeclarationType;
  /** Chốt làm thủ tục. Bỏ trống thì hồ sơ vào luồng cửa khẩu số (`SMART_GATE`). */
  checkpoint?: CheckpointCode;
  enterprise: EnterpriseInfo;
  /** Phương tiện vận chuyển — **một xe/hồ sơ** (CR8), kèm lái xe. Cho trùng biển giữa các hồ sơ. */
  vehicles: VehicleInfo[];
  cargoItems?: CargoItemInfo[];
  /** Phương tiện nhận sang tải (CR9) — chỉ dùng cho hồ sơ Sang tải. */
  transshipmentVehicles?: TransshipmentVehicleInfo[];
  appointment?: AppointmentInfo;
  feeDeclarationCode?: string;
  /** Tài khoản khai báo, lấy từ token — dùng cho phạm vi dữ liệu OWN và để gửi thông báo. */
  actorId: string;
  /** Danh sách vai trò RBAC của người khai (nối bằng `+`) — chỉ để ghi vào lịch sử hồ sơ. */
  actorRole: string;
  /** SG-115: Bỏ qua kiểm tra trùng lặp biển số/CCCD khi sao chép (copy) hồ sơ thành bản nháp mới */
  skipConflictCheck?: boolean;
  /** Bỏ qua ghi nhật ký thao tác `DECLARATION_CREATE` khi tạo bản ghi nháp từ luồng sao chép */
  skipAudit?: boolean;
}
