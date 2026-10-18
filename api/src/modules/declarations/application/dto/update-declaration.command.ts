import { UserAccessContext } from '../../../../common/auth/access-context';
import {
  AppointmentInfo,
  CargoItemInfo,
  EnterpriseInfo,
  TransshipmentVehicleInfo,
  VehicleInfo,
} from '../../domain/declaration.entity';
import { CheckpointCode, DeclarationType } from '../../domain/declaration.enums';

/**
 * Cập nhật hồ sơ nháp. `cargoItems`, `appointment` nhận `null` để **xoá hẳn** phần đó; bỏ trống
 * (undefined) nghĩa là giữ nguyên. `vehicles` gửi lên là **thay toàn bộ** danh sách phương tiện,
 * lái xe nhúng theo từng xe (BUG-033).
 */
export interface UpdateDeclarationCommand {
  declarationId: string;
  type?: DeclarationType;
  checkpoint?: CheckpointCode;
  enterprise?: Partial<EnterpriseInfo>;
  vehicles?: VehicleInfo[];
  cargoItems?: CargoItemInfo[];
  /** Phương tiện nhận sang tải (CR9) — thay toàn bộ danh sách; chỉ dùng cho hồ sơ Sang tải. */
  transshipmentVehicles?: TransshipmentVehicleInfo[];
  appointment?: AppointmentInfo | null;
  feeDeclarationCode?: string;
  /** Quyền hiệu lực của người gọi — dùng để chặn sửa hồ sơ ngoài phạm vi dữ liệu. */
  access: UserAccessContext;
}
