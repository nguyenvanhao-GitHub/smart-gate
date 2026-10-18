import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AccountType } from '../../domain/user.entity';

/** Vai trò RBAC gán cho tài khoản seed (mã trong `role.catalog.ts`). */
export interface SeedRoleGrant {
  code: string;
  dataScope: DataScopeLevel;
}

/** Phân công (assignment) gắn cho tài khoản seed. */
export interface SeedAssignment {
  type: AssignmentType;
  value: string;
  label: string;
}

export interface DefaultAccountSeed {
  username: string;
  displayName: string;
  title: string;
  defaultRoute: string;
  /** Đơn vị (mã trong `organization.catalog.ts`) — gán khi tài khoản chưa có đơn vị. */
  organizationCode: string;
  accountType?: AccountType | null;
  taxCode?: string | null;
  idNumber?: string | null;
  address?: string | null;
  representativeName?: string | null;
  phone?: string | null;
  isProtected?: boolean;
  /** Vai trò RBAC ghi thẳng vào `user_roles` khi seed (nguồn sự thật của phân quyền). */
  roles: SeedRoleGrant[];
  /** Phân công ghi thẳng vào `user_assignments` khi seed. */
  assignments: SeedAssignment[];
}

const CHECKPOINT = (value: string, label: string): SeedAssignment => ({
  type: AssignmentType.CHECKPOINT,
  value,
  label,
});

/**
 * Chốt chung của cửa khẩu: mọi hồ sơ đang khai báo đều nằm ở `SMART_GATE` cho tới khi được điều
 * phối về chốt cụ thể, nên lực lượng nào cũng phải nhìn thấy chốt này để phạm vi ASSIGNMENT không
 * làm mất dữ liệu đang có.
 */
const SMART_GATE = CHECKPOINT('SMART_GATE', 'Chốt cửa khẩu số');

/**
 * Tài khoản mặc định của Chiềng Khương kèm **hồ sơ RBAC đầy đủ** (vai trò + phân công + đơn vị).
 * Seed ghi thẳng `user_roles`/`user_assignments` từ dữ liệu này — không còn suy ngược từ cột
 * `users.role` qua bảng ánh xạ legacy. Bảng đối chiếu vai trò cũ ↔ RBAC: `docs/ROLE-MAPPING.md`.
 */
export const DEFAULT_ACCOUNT_SEEDS: DefaultAccountSeed[] = [
  {
    username: 'admin',
    displayName: 'Quản trị hệ thống',
    title: 'Quản trị hệ thống',
    defaultRoute: '/operations/dashboard',
    organizationCode: 'CK_CHIENG_KHUONG',
    isProtected: true,
    // `SYS_ADMIN` cấp đủ 60 mã quyền, NHƯNG cổng "vai trò của bước" (`workflow_step_roles` →
    // `route.allowsRole`) chỉ cho lực lượng được phân công thao tác, và không có cửa hậu cho
    // `SYS_ADMIN`. Vì vậy để tài khoản quản trị thao tác được MỌI bước liên ngành, gán thẳng các
    // vai trò lực lượng (nhiều vai trò/1 người) — đúng cơ chế RBAC động, không sửa mã. Mọi vai trò
    // để `dataScope: ALL` cho khớp tầm nhìn toàn hệ thống của quản trị (scope là hợp — cao nhất thắng).
    roles: [
      { code: 'SYS_ADMIN', dataScope: DataScopeLevel.ALL },
      { code: 'BORDER_GUARD', dataScope: DataScopeLevel.ALL },
      { code: 'CUSTOMS', dataScope: DataScopeLevel.ALL },
      { code: 'QUARANTINE', dataScope: DataScopeLevel.ALL },
      { code: 'FEE_COLLECTOR', dataScope: DataScopeLevel.ALL },
      { code: 'DISPATCHER', dataScope: DataScopeLevel.ALL },
      { code: 'YARD_MANAGER', dataScope: DataScopeLevel.ALL },
      { code: 'MANAGEMENT', dataScope: DataScopeLevel.ALL },
    ],
    assignments: [{ type: AssignmentType.BORDER_GATE, value: 'CK_CHIENG_KHUONG', label: 'Cửa khẩu Chiềng Khương' }],
  },
  {
    username: 'dieuphoi',
    displayName: 'Điều phối Chiềng Khương',
    title: 'Trung tâm điều hành',
    defaultRoute: '/operations/vehicle-confirmation',
    organizationCode: 'DIEUHANH_CK',
    roles: [ { code: 'DISPATCHER', dataScope: DataScopeLevel.ALL } ],
    assignments: [SMART_GATE],
  },
  {
    username: 'doanhnghiep',
    displayName: 'Công ty TNHH Vận tải Chiềng Khương',
    title: 'Doanh nghiệp khai báo',
    defaultRoute: '/declarations',
    organizationCode: 'DN_DEMO',
    accountType: AccountType.ENTERPRISE,
    taxCode: '0101234567',
    representativeName: 'Nguyễn Văn Doanh',
    address: 'Hà Nội',
    phone: '0912345678',
    roles: [{ code: 'ENTERPRISE', dataScope: DataScopeLevel.OWN }],
    assignments: [{ type: AssignmentType.TAX_CODE, value: '0101234567', label: 'Doanh nghiệp khai báo' }],
  },
  {
    username: 'taixe',
    displayName: 'Tài xế vận tải Chiềng Khương',
    title: 'Tài xế vận tải',
    defaultRoute: '/declarations/new',
    organizationCode: 'DN_DEMO',
    accountType: AccountType.ENTERPRISE,
    taxCode: '2601001234',
    representativeName: 'Nguyễn Văn Doanh',
    address: 'Xã Chiềng Khương, Huyện Sông Mã, Tỉnh Sơn La',
    phone: '0912345678',
    roles: [{ code: 'ENTERPRISE', dataScope: DataScopeLevel.OWN }],
    assignments: [],
  },
  {
    // Tài khoản người khai CÁ NHÂN để vai trò `INDIVIDUAL` không còn là vai trò "ma": cùng phạm vi
    // `OWN` như doanh nghiệp nên chỉ thấy/thao tác hồ sơ của chính mình. Đơn vị dùng chung `DN_DEMO`
    // (đơn vị người khai demo, giống `taixe`) — phạm vi OWN không phụ thuộc đơn vị nên đây chỉ là
    // nhãn đơn vị, không ảnh hưởng quyền.
    username: 'canhan',
    displayName: 'Cá nhân khai báo Chiềng Khương',
    title: 'Cá nhân khai báo',
    defaultRoute: '/declarations',
    organizationCode: 'DN_DEMO',
    accountType: AccountType.INDIVIDUAL,
    taxCode: null,
    idNumber: '001099012345',
    address: 'Sơn La',
    phone: '0987654321',
    roles: [{ code: 'INDIVIDUAL', dataScope: DataScopeLevel.OWN }],
    assignments: [],
  },
  {
    // Gộp 4 tài khoản Hải quan (hq_b1/hq_b2/hq_b5/hq_mobile) thành MỘT: một cán bộ Hải quan thao
    // tác được mọi bước CUSTOMS tại mọi chốt. Vai trò CUSTOMS + phạm vi ASSIGNMENT, gắn tất cả
    // checkpoint nên `WorkflowRoute.allowsRole` cho phép xử lý bước CUSTOMS ở bất kỳ chốt nào.
    username: 'haiquan',
    displayName: 'Hải quan cửa khẩu',
    title: 'Kiểm tra nghiệp vụ hải quan',
    defaultRoute: '/workflow/queue',
    organizationCode: 'HQ_CK',
    roles: [{ code: 'CUSTOMS', dataScope: DataScopeLevel.ORGANIZATION }],
    assignments: [
      CHECKPOINT('B1', 'Chốt B1'),
      CHECKPOINT('B2', 'Chốt B2'),
      CHECKPOINT('B5', 'Chốt B5'),
      CHECKPOINT('YARD', 'Bãi kiểm tra'),
      SMART_GATE,
    ],
  },
  {
    // Gộp 5 tài khoản Biên phòng (bp_b1/bp_b2_in/bp_b2_out/bp_b5/bp_complete) thành MỘT: một cán bộ
    // Biên phòng thao tác được mọi bước BORDER_GUARD tại mọi chốt và cả hai chiều xe vào/ra. Vai trò
    // BORDER_GUARD + phạm vi ORGANIZATION, gắn tất cả checkpoint + cả hai chiều IN/OUT.
    username: 'bienphong',
    displayName: 'Biên phòng cửa khẩu',
    title: 'Kiểm tra nghiệp vụ biên phòng',
    defaultRoute: '/workflow/queue',
    organizationCode: 'BP_CK',
    roles: [{ code: 'BORDER_GUARD', dataScope: DataScopeLevel.ORGANIZATION }],
    assignments: [
      CHECKPOINT('B1', 'Chốt B1'),
      CHECKPOINT('B2', 'Chốt B2'),
      CHECKPOINT('B5', 'Chốt B5'),
      SMART_GATE,
      { type: AssignmentType.DIRECTION, value: 'IN', label: 'Chiều xe vào' },
      { type: AssignmentType.DIRECTION, value: 'OUT', label: 'Chiều xe ra' },
    ],
  },
  {
    // Gộp 3 tài khoản kiểm dịch (y tế/thực vật/động vật) thành MỘT: một cán bộ kiểm dịch thao tác
    // được mọi loại. Vai trò QUARANTINE + phạm vi ORGANIZATION, gắn cả ba loại kiểm dịch nên workflow
    // step nào thuộc kiểm dịch cũng nằm trong tầm nhìn/quyền xử lý của tài khoản này.
    username: 'kiemdich',
    displayName: 'Kiểm dịch cửa khẩu',
    title: 'Xác nhận kiểm dịch (YT/TV/ĐV)',
    defaultRoute: '/workflow/queue',
    organizationCode: 'KD_CK',
    roles: [{ code: 'QUARANTINE', dataScope: DataScopeLevel.ORGANIZATION }],
    assignments: [
      { type: AssignmentType.QUARANTINE_TYPE, value: 'HEALTH', label: 'Kiểm dịch y tế' },
      { type: AssignmentType.QUARANTINE_TYPE, value: 'PLANT', label: 'Kiểm dịch thực vật' },
      { type: AssignmentType.QUARANTINE_TYPE, value: 'ANIMAL', label: 'Kiểm dịch động vật' },
      SMART_GATE,
    ],
  },
  {
    // Gộp 2 tài khoản thu phí (Thuế hạ tầng + BQL sang tải) thành MỘT: một cán bộ thu được mọi khoản
    // phí. Vai trò FEE_COLLECTOR gắn cả hai loại phí (INFRASTRUCTURE + TRANSSHIPMENT); `WorkflowRoute.
    // allowsRole` vẫn khóa FEE_COLLECTOR chỉ vào bước `*_FEE` nên không chạm bước của lực lượng khác.
    // Vai trò MANAGEMENT mà `banquanly` từng có được `dieuphoi` và `admin` (đều mang MANAGEMENT/ALL)
    // phủ đủ, nên không cấp lại ở đây để tài khoản thu phí đúng phạm vi nghiệp vụ.
    username: 'thuphi',
    displayName: 'Thu phí cửa khẩu',
    title: 'Thu phí hạ tầng & sang tải',
    defaultRoute: '/fees/tax',
    organizationCode: 'THUE_CK',
    roles: [{ code: 'FEE_COLLECTOR', dataScope: DataScopeLevel.ORGANIZATION }],
    assignments: [
      { type: AssignmentType.FEE_TYPE, value: 'INFRASTRUCTURE', label: 'Phí hạ tầng cửa khẩu' },
      { type: AssignmentType.FEE_TYPE, value: 'TRANSSHIPMENT', label: 'Phí sang tải' },
    ],
  },
  {
    username: 'quanlybai',
    displayName: 'Quản lý bãi',
    title: 'Quản lý kho bãi',
    defaultRoute: '/operations/customs-b5',
    organizationCode: 'DIEUHANH_CK',
    roles: [{ code: 'YARD_MANAGER', dataScope: DataScopeLevel.ORGANIZATION }],
    assignments: [SMART_GATE, CHECKPOINT('B5', 'Chốt B5')],
  },
];
