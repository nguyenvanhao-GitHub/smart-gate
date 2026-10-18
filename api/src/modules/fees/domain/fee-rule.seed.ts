import { FeeType, FeeUnit } from './fee.enums';

/**
 * **BIỂU PHÍ TẠM** cho phân hệ thu phí (F46).
 *
 * ⚠️ Điểm **D6** của kế hoạch chưa có biểu phí chính thức. Bộ dưới đây lấy đúng các khoản mà
 * mockup UI-11 liệt kê và **chỉ để hệ thống chạy được đầu-cuối**; con số **không phải căn cứ pháp
 * lý**. Cách xử lý giống D7/D8/D9: seed bộ tạm, đánh dấu rõ trong mô tả, rồi để quản trị sửa qua
 * giao diện danh mục phí mà **không cần deploy lại**.
 *
 * Ba điều cần biết khi thay bằng biểu phí thật:
 * - Sửa mức phí **không phải** sửa bản đang có: đóng bản cũ bằng `effectiveTo` rồi thêm bản mới
 *   có `effectiveFrom` — lịch sử phải giữ được (F46).
 * - Seed chỉ **thêm bản còn thiếu theo cặp (mã, ngày hiệu lực từ)**, không bao giờ ghi đè số tiền
 *   đã có trong database. Sửa tay xong khởi động lại app không bị trả về số cũ.
 * - `appliesTo` rỗng nghĩa là áp dụng cho mọi loại hồ sơ.
 */

export interface FeeRuleSeed {
  code: string;
  name: string;
  feeType: FeeType;
  unit: FeeUnit;
  amount: number;
  appliesTo: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  sortOrder: number;
  description: string;
}

/** Câu đánh dấu bắt buộc có trong mô tả mọi khoản seed — để nhìn là biết chưa phải số chính thức. */
export const PROVISIONAL_FEE_NOTE = 'BIỂU PHÍ TẠM — chưa có biểu phí chính thức, chờ chốt D6.';

export const FEE_RULE_SEED: FeeRuleSeed[] = [
  {
    code: 'INFRA_GATE',
    name: 'Phí hạ tầng cửa khẩu',
    feeType: FeeType.INFRASTRUCTURE,
    unit: FeeUnit.TRIP,
    amount: 1_000_000,
    appliesTo: [],
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    sortOrder: 10,
    description: `${PROVISIONAL_FEE_NOTE} Số lấy theo mockup UI-11 (1 lượt × 1.000.000).`,
  },
  {
    code: 'YARD_PARKING',
    name: 'Phí lưu bãi',
    feeType: FeeType.PARKING,
    unit: FeeUnit.DAY,
    amount: 650_000,
    appliesTo: [],
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    sortOrder: 20,
    description: `${PROVISIONAL_FEE_NOTE} Mockup UI-11 ghi "2 ngày × 1.300.000" nên suy ra 650.000/ngày.`,
  },
  {
    code: 'PROC_SERVICE',
    name: 'Phí dịch vụ làm thủ tục',
    feeType: FeeType.SERVICE,
    unit: FeeUnit.TRIP,
    amount: 200_000,
    appliesTo: [],
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    sortOrder: 30,
    description: `${PROVISIONAL_FEE_NOTE} Mockup UI-11 không ghi số nên tạm đặt 200.000/lượt.`,
  },
  {
    code: 'VAT',
    name: 'Thuế giá trị gia tăng',
    feeType: FeeType.TAX,
    unit: FeeUnit.PERCENT,
    amount: 10,
    appliesTo: [],
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    sortOrder: 90,
    description: `${PROVISIONAL_FEE_NOTE} Mockup UI-11 ghi VAT 10% trên tổng các khoản trước đó.`,
  },
];
