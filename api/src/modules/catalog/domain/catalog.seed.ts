/**
 * Danh mục nền tối thiểu cho MVP (F04).
 *
 * Nhóm mã nguyên nhân bám điểm **D9** của kế hoạch: SRS bắt buộc có mã/lý do cho 3 tình huống
 * (yêu cầu bổ sung · từ chối · điều chỉnh phí) nhưng không liệt kê danh mục, nên bộ mã dưới đây là
 * **đề xuất chờ BA chốt** — sửa được bằng màn hình quản trị, không cần deploy.
 */
import { YARD_ZONE_TYPE_CODE } from './border-facility.catalog';

export interface CatalogItemSeed {
  code: string;
  name: string;
  metadata?: Record<string, unknown>;
}

export interface CatalogTypeSeed {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  items: CatalogItemSeed[];
}

export const CATALOG_SEED: CatalogTypeSeed[] = [
  {
    code: 'DOSSIER_TYPE',
    name: 'Loại hình hồ sơ',
    description: 'Loại hình khai báo theo SRS 7.2 — cấu hình được, không cố định trong mã nguồn.',
    sortOrder: 1,
    items: [
      { code: 'EXPORT', name: 'Xuất khẩu', metadata: { declarationType: 'EXPORT' } },
      { code: 'IMPORT', name: 'Nhập khẩu', metadata: { declarationType: 'IMPORT' } },
      { code: 'TRANSSHIPMENT_EXPORT', name: 'Sang tải đầu xuất', metadata: { declarationType: 'TRANSSHIPMENT_EXPORT' } },
      { code: 'SELF_PROPELLED', name: 'Xe tự hành', metadata: { declarationType: 'SELF_PROPELLED' } },
      { code: 'TRANSSHIPMENT_IMPORT', name: 'Sang tải đầu nhập', metadata: { declarationType: 'TRANSSHIPMENT_IMPORT' } },
    ],
  },
  {
    code: 'VEHICLE_TYPE',
    name: 'Loại phương tiện',
    description: 'Phân loại phương tiện qua cửa khẩu.',
    sortOrder: 2,
    items: [
      { code: 'TRUCK', name: 'Xe tải' },
      { code: 'CONTAINER', name: 'Xe container' },
      { code: 'TRACTOR', name: 'Xe đầu kéo' },
      { code: 'TANKER', name: 'Xe bồn' },
      { code: 'EMPTY', name: 'Xe không hàng' },
    ],
  },
  {
    code: 'CARGO_TYPE',
    name: 'Loại hàng hóa',
    description: 'Nhóm hàng hóa phục vụ phân luồng kiểm tra và thống kê.',
    sortOrder: 3,
    items: [
      { code: 'AGRICULTURAL', name: 'Nông sản' },
      { code: 'FROZEN', name: 'Hàng đông lạnh' },
      { code: 'CONSUMER', name: 'Hàng tiêu dùng' },
      { code: 'MACHINERY', name: 'Máy móc, thiết bị' },
      { code: 'MINERAL', name: 'Khoáng sản' },
      { code: 'OTHER', name: 'Hàng hóa khác' },
    ],
  },
  {
    code: 'DOCUMENT_TYPE',
    name: 'Loại chứng từ',
    description: 'Chứng từ đính kèm hồ sơ. Danh sách chứng từ bắt buộc theo loại hồ sơ chờ chốt điểm D7.',
    sortOrder: 4,
    items: [
      { code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan' },
      { code: 'COMMERCIAL_INVOICE', name: 'Hóa đơn thương mại' },
      { code: 'PACKING_LIST', name: 'Phiếu đóng gói' },
      { code: 'BILL_OF_LADING', name: 'Vận đơn' },
      { code: 'CERTIFICATE_OF_ORIGIN', name: 'Giấy chứng nhận xuất xứ (C/O)' },
      { code: 'QUARANTINE_CERTIFICATE', name: 'Giấy chứng nhận kiểm dịch' },
      { code: 'TRANSPORT_LICENSE', name: 'Giấy phép vận tải' },
      { code: 'VEHICLE_REGISTRATION', name: 'Giấy đăng ký phương tiện' },
      { code: 'DRIVER_LICENSE', name: 'Giấy phép lái xe' },
      { code: 'INSURANCE_CERTIFICATE', name: 'Giấy chứng nhận bảo hiểm' },
      { code: 'PAYMENT_RECEIPT', name: 'Biên lai / Chứng từ thanh toán' },
    ],
  },
  {
    code: 'REQUIRED_DOCUMENT',
    name: 'Chứng từ bắt buộc theo loại hồ sơ',
    description:
      'Khai chứng từ bắt buộc để chặn gửi hồ sơ (F13). Mã mục = mã loại chứng từ trong danh mục DOCUMENT_TYPE; metadata.dossierTypes liệt kê loại hồ sơ áp dụng, bỏ trống là áp dụng mọi loại. DANH SÁCH TẠM — SRS chưa ban hành, chờ D7 chính thức; sửa/thêm/khóa qua màn hình danh mục, không cần deploy.',
    sortOrder: 5,
    items: [
      // Mọi loại hồ sơ đều phải có tờ khai hải quan.
      { code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan', metadata: { dossierTypes: ['EXPORT', 'IMPORT', 'TRANSSHIPMENT_EXPORT', 'TRANSSHIPMENT_IMPORT', 'SELF_PROPELLED', 'TRANSSHIPMENT'], provisional: true } },
      { code: 'COMMERCIAL_INVOICE', name: 'Hóa đơn thương mại', metadata: { dossierTypes: ['EXPORT', 'IMPORT'], provisional: true } },
      { code: 'PACKING_LIST', name: 'Phiếu đóng gói', metadata: { dossierTypes: ['EXPORT'], provisional: true } },
      // Nhập khẩu: thêm vận đơn và giấy chứng nhận xuất xứ.
      { code: 'BILL_OF_LADING', name: 'Vận đơn', metadata: { dossierTypes: ['IMPORT'], provisional: true } },
      { code: 'CERTIFICATE_OF_ORIGIN', name: 'Giấy chứng nhận xuất xứ (C/O)', metadata: { dossierTypes: ['IMPORT'], provisional: true } },
      // Sang tải / xe tự hành: nhẹ hơn — tờ khai + giấy tờ phương tiện.
      { code: 'VEHICLE_REGISTRATION', name: 'Giấy đăng ký phương tiện', metadata: { dossierTypes: ['TRANSSHIPMENT_EXPORT', 'TRANSSHIPMENT_IMPORT', 'SELF_PROPELLED', 'TRANSSHIPMENT'], provisional: true } },
    ],
  },
  {
    code: 'COUNTRY',
    name: 'Quốc gia',
    description: 'Quốc gia xuất xứ/đích của hàng hóa và phương tiện.',
    sortOrder: 5,
    items: [
      { code: 'VN', name: 'Việt Nam', metadata: { iso3: 'VNM' } },
      { code: 'LA', name: 'Lào', metadata: { iso3: 'LAO' } },
      { code: 'CN', name: 'Trung Quốc', metadata: { iso3: 'CHN' } },
      { code: 'TH', name: 'Thái Lan', metadata: { iso3: 'THA' } },
      { code: 'KH', name: 'Campuchia', metadata: { iso3: 'KHM' } },
    ],
  },
  {
    code: 'UNIT',
    name: 'Đơn vị tính',
    description: 'Đơn vị tính khối lượng/số lượng hàng hóa.',
    sortOrder: 6,
    items: [
      { code: 'KG', name: 'Kilôgam' },
      { code: 'TON', name: 'Tấn' },
      { code: 'PIECE', name: 'Chiếc' },
      { code: 'BOX', name: 'Thùng' },
      { code: 'PALLET', name: 'Pallet' },
      { code: 'M3', name: 'Mét khối' },
      { code: 'LITER', name: 'Lít' },
    ],
  },
  {
    code: 'REASON_SUPPLEMENT',
    name: 'Mã nguyên nhân - yêu cầu bổ sung',
    description:
      'Bắt buộc chọn khi yêu cầu doanh nghiệp bổ sung hồ sơ (F23). BỘ MÃ TẠM — SRS chưa ban hành danh mục chính thức (điểm D9); sửa/thêm/khóa qua màn hình danh mục, không cần deploy.',
    sortOrder: 7,
    items: [
      { code: 'BS01', name: 'Thiếu chứng từ bắt buộc' },
      { code: 'BS02', name: 'Chứng từ mờ, không đọc được hoặc hết hiệu lực' },
      { code: 'BS03', name: 'Sai lệch thông tin phương tiện' },
      { code: 'BS04', name: 'Sai lệch thông tin hàng hóa' },
      { code: 'BS05', name: 'Thiếu thông tin doanh nghiệp hoặc lái xe' },
    ],
  },
  {
    code: 'REASON_REJECT',
    name: 'Mã nguyên nhân - từ chối',
    description:
      'Bắt buộc chọn khi từ chối hồ sơ (F24). BỘ MÃ TẠM — SRS chưa ban hành danh mục chính thức (điểm D9).',
    sortOrder: 8,
    items: [
      { code: 'TC01', name: 'Hồ sơ không đủ điều kiện thông quan' },
      { code: 'TC02', name: 'Hàng hóa thuộc diện cấm hoặc hạn chế' },
      { code: 'TC03', name: 'Không đạt yêu cầu kiểm dịch' },
      { code: 'TC04', name: 'Vi phạm quy định an ninh cửa khẩu' },
      { code: 'TC05', name: 'Quá hạn xử lý, không bổ sung theo yêu cầu' },
    ],
  },
  {
    code: 'REASON_FEE_ADJUST',
    name: 'Mã nguyên nhân - điều chỉnh phí',
    description:
      'Bắt buộc chọn khi điều chỉnh khoản phí đã tính (F47). BỘ MÃ TẠM — SRS chưa ban hành danh mục chính thức (điểm D9).',
    sortOrder: 9,
    items: [
      { code: 'DC01', name: 'Sai khối lượng hoặc số lượng hàng' },
      { code: 'DC02', name: 'Áp sai biểu phí' },
      { code: 'DC03', name: 'Doanh nghiệp thuộc diện miễn, giảm' },
      { code: 'DC04', name: 'Điều chỉnh theo biên bản đối soát' },
    ],
  },
  {
    code: 'WORKFLOW_CHECKLIST',
    name: 'Checklist xử lý liên ngành',
    description:
      'Mục kiểm tra hiển thị theo 3 cột Biên phòng/Hải quan/Kiểm dịch của màn hình xử lý nghiệp vụ (UI-07). metadata.agencyCode = mã lực lượng, metadata.required = bắt buộc tích trước khi duyệt. DANH SÁCH TẠM — SRS chưa ban hành biểu mẫu kiểm tra chính thức; sửa qua màn hình danh mục.',
    sortOrder: 11,
    items: [
      { code: 'BP_GIAY_TO_NGUOI', name: 'Giấy tờ tùy thân của lái xe hợp lệ', metadata: { agencyCode: 'BORDER_GUARD', required: true } },
      { code: 'BP_PHUONG_TIEN', name: 'Biển số và giấy tờ phương tiện khớp hồ sơ', metadata: { agencyCode: 'BORDER_GUARD', required: true } },
      { code: 'BP_AN_NINH', name: 'Không có dấu hiệu vi phạm an ninh', metadata: { agencyCode: 'BORDER_GUARD', required: false } },
      { code: 'HQ_TO_KHAI', name: 'Tờ khai hải quan đầy đủ, còn hiệu lực', metadata: { agencyCode: 'CUSTOMS', required: true } },
      { code: 'HQ_CHUNG_TU', name: 'Hóa đơn, phiếu đóng gói khớp hàng hóa', metadata: { agencyCode: 'CUSTOMS', required: true } },
      { code: 'HQ_KIEM_HOA', name: 'Kết quả kiểm hóa (nếu thuộc diện kiểm tra)', metadata: { agencyCode: 'CUSTOMS', required: false } },
      { code: 'KD_GIAY_CN', name: 'Giấy chứng nhận kiểm dịch hợp lệ', metadata: { agencyCode: 'QUARANTINE', required: true } },
      { code: 'KD_THUC_TE', name: 'Kiểm tra thực tế lô hàng đạt yêu cầu', metadata: { agencyCode: 'QUARANTINE', required: true } },
    ],
  },
  {
    code: YARD_ZONE_TYPE_CODE,
    name: 'Khu bãi đỗ',
    description:
      'Khu bãi và số ô đỗ (F42). metadata.capacity = sức chứa, metadata.slotPrefix + metadata.slotCount sinh mã ô A01…A24. Bảng "yards"/"parking_slots" được dựng lại từ đây lúc khởi động, chỉ THÊM ô còn thiếu chứ không xoá. SỐ LIỆU TẠM theo mockup (4 khu / 89 vị trí) — điểm D8 chưa có sơ đồ thật.',
    sortOrder: 15,
    items: [
      { code: 'A', name: 'Kho ngoại quan', metadata: { capacity: 24, slotPrefix: 'A', slotCount: 24 } },
      { code: 'B', name: 'Bãi container', metadata: { capacity: 32, slotPrefix: 'B', slotCount: 32 } },
      { code: 'C', name: 'Kho nông sản', metadata: { capacity: 18, slotPrefix: 'C', slotCount: 18 } },
      { code: 'D', name: 'Bãi xe chờ', metadata: { capacity: 15, slotPrefix: 'D', slotCount: 15 } },
    ],
  },
];
