/**
 * Script seed dữ liệu Nhật ký hệ thống (Audit Logs) đầy đủ theo bảng quy chuẩn thiết kế SG-142 (PDF).
 *
 * Chạy bằng: node scripts/seed-audit-logs.js hoặc npm run seed:audit
 */

const { Client } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// Đọc file .env nếu có
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value.trim();
    }
  });
}

const client = new Client({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '12345678',
  database: process.env.DATABASE_NAME || 'smart_gate',
});

async function seedAuditLogs() {
  await client.connect();
  console.log('🔗 Đã kết nối PostgreSQL!');

  try {
    await client.query('BEGIN');

    // Lấy thông tin user có sẵn trong hệ thống để gán actor
    const userRes = await client.query('SELECT id, username FROM users');
    const userMap = {};
    userRes.rows.forEach(u => userMap[u.username] = u.id);

    const defaultUser = { id: userMap['admin'] || randomUUID(), username: 'admin', role: 'ADMIN' };
    const customsUser = { id: userMap['haiquan'] || randomUUID(), username: 'haiquan', role: 'HAI_QUAN_B1' };
    const bdbpUser = { id: userMap['bienphong'] || randomUUID(), username: 'bienphong', role: 'BIEN_PHONG' };
    const enterpriseUser = { id: userMap['doanhnghiep'] || randomUUID(), username: 'doanhnghiep', role: 'DOANH_NGHIEP' };

    // Lấy 1 dossier có sẵn nếu có
    const dossierRes = await client.query('SELECT id, code, "plateNumber" FROM declarations LIMIT 1');
    const sampleDossier = dossierRes.rows[0] || { id: randomUUID(), code: 'IMP-20260827-000001', plateNumber: '26C-123.45' };

    console.log('🧹 Đang làm sạch các bản ghi audit test cũ (nếu có)...');
    // Không xoá toàn bộ để giữ log thật, chỉ xoá log có correlation_id = 'SEED_SG_142'
    await client.query("DELETE FROM audit_logs WHERE correlation_id = 'SEED_SG_142'");

    console.log('🌱 Đang khởi tạo 36+ loại nhật ký theo chuẩn PDF (SG-142)...');

    const now = Date.now();
    let minuteOffset = 1;

    // Danh sách 36+ kịch bản Audit Log chuẩn theo PDF
    const auditCases = [
      // ==========================================
      // TRANG 1: QUẢN LÝ HỒ SƠ & ĐIỀU PHỐI
      // ==========================================
      {
        action: 'DECLARATION_CREATE',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: null,
        after: {
          dossierCode: sampleDossier.code,
          plateNumber: sampleDossier.plateNumber,
          declarationType: 'TRANSSHIPMENT_IMPORT',
          status: 'DRAFT',
        },
      },
      {
        action: 'DECLARATION_UPDATE',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: {
          plateNumber: '26C-123.45',
          cargo: { description: 'Sắn lát khô xuất khẩu', grossWeightKg: 25000 },
        },
        after: {
          plateNumber: '26C-888.99',
          cargo: { description: 'Ngô hạt tươi loại 1', grossWeightKg: 30000 },
        },
      },
      {
        action: 'DECLARATION_SUBMIT',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { status: 'DRAFT' },
        after: { status: 'WAITING_CALL' },
      },
      {
        action: 'DECLARATION_SUBMIT',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { status: 'REVISION_REQUIRED' },
        after: { status: 'PROCESSING' },
      },
      {
        action: 'DECLARATION_CANCEL',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { status: 'WAITING_CALL' },
        after: { status: 'CANCELLED' },
      },
      {
        action: 'DECLARATION_DELETE',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: {
          dossierCode: 'IMP-20260827-000099',
          plateNumber: '34C-666.66',
          status: 'DRAFT',
        },
        after: null,
      },
      {
        action: 'DECLARATION_ATTACH_DOCUMENTS',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: null,
        after: {
          fileName: 'to_khai_hai_quan_2026.pdf',
          documentTypeCode: 'CUSTOMS_DECLARATION',
        },
      },
      {
        action: 'DECLARATION_DETACH_DOCUMENT',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: {
          fileName: 'kiem_dich_thuc_vat_cu.pdf',
          documentTypeCode: 'PLANT_QUARANTINE',
        },
        after: null,
      },
      {
        action: 'VIEW_DOSSIER_DETAIL',
        actor: customsUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: null,
        after: null,
      },
      {
        action: 'TIME_SLOT_UPDATE',
        actor: enterpriseUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { scheduledAt: '2026-08-27T08:00:00.000Z' },
        after: { scheduledAt: '2026-08-27T14:30:00.000Z' },
      },
      {
        action: 'ATTACHMENT_UPLOAD',
        actor: enterpriseUser,
        targetType: 'ATTACHMENT',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: {
          fileName: '231-ndcp.signed.pdf',
          originalName: '231-ndcp.signed.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 863948,
          checksum: 'a1b2c3d4e5f67890abcdef1234567890',
          dossierId: sampleDossier.code,
          documentTypeCode: 'COMMERCIAL_INVOICE',
        },
      },
      {
        action: 'ATTACHMENT_DELETE',
        actor: enterpriseUser,
        targetType: 'ATTACHMENT',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: {
          fileName: 'hop_dong_thuong_mai_cu.pdf',
          originalName: 'hop_dong_thuong_mai_cu.pdf',
          sizeBytes: 524288,
          checksum: 'f9e8d7c6b5a43210fedcba0987654321',
        },
        after: null,
      },
      {
        action: 'WORKFLOW_DECIDE',
        actor: customsUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { step: 'KIEM_DICH', status: 'WAITING_QUARANTINE' },
        after: {
          step: 'KIEM_DICH',
          status: 'APPROVED',
          decision: 'APPROVED',
          note: 'Đạt tiêu chuẩn kiểm dịch thực vật xuất khẩu',
        },
      },
      {
        action: 'WORKFLOW_SET_PRIORITY',
        actor: customsUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { priority: 'NORMAL' },
        after: { priority: 'HIGH' },
      },
      {
        action: 'DISPATCH_ASSIGN',
        actor: customsUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: null,
        after: { yardZone: 'Bãi A - Vị trí 01', laneCode: 'LANE_01' },
      },
      {
        action: 'DISPATCH_MOVE',
        actor: customsUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { yardZone: 'Bãi A - Vị trí 01' },
        after: { yardZone: 'Bãi B - Vị trí 05' },
      },
      {
        action: 'DISPATCH_RELEASE',
        actor: customsUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { yardZone: 'Bãi B - Vị trí 05' },
        after: null,
      },

      // ==========================================
      // TRANG 2: CỔNG, THU PHÍ, ĐỐI SOÁT & TÀI KHOẢN
      // ==========================================
      {
        action: 'DISPATCH_INSPECTION_CHANGED',
        actor: customsUser,
        targetType: 'DOSSIER',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { inspectionType: 'Kiểm tra thực tế (Luồng đỏ)' },
        after: { inspectionType: 'Soi chiếu tự động (Luồng vàng)' },
      },
      {
        action: 'YARD_ZONE_UPDATE',
        actor: defaultUser,
        targetType: 'CATALOG',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { name: 'Bãi kiểm hóa A', capacity: 20 },
        after: { name: 'Bãi kiểm hóa A mở rộng', capacity: 35 },
      },


      {
        action: 'FEE_CALCULATE',
        actor: defaultUser,
        targetType: 'FEE',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: null,
        after: {
          totalFee: 500000,
          feeItems: 'Phí sử dụng bến bãi: 300.000 VNĐ, Phí kiểm tra hải quan: 200.000 VNĐ',
        },
      },
      {
        action: 'FEE_ADJUST',
        actor: defaultUser,
        targetType: 'FEE',
        targetId: sampleDossier.id,
        result: 'SUCCESS',
        before: { totalFee: 500000, reason: 'Tính toán ban đầu' },
        after: { totalFee: 400000, reason: 'Miễn giảm theo quy định xe nông sản ưu tiên' },
      },
      {
        action: 'FEE_RULE_CREATE',
        actor: defaultUser,
        targetType: 'FEE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: {
          name: 'Biểu phí xe tải trọng lớn 2026',
          declarationType: 'TRANSSHIPMENT_IMPORT',
          price: 500000,
          status: 'ACTIVE',
        },
      },
      {
        action: 'FEE_RULE_UPDATE',
        actor: defaultUser,
        targetType: 'FEE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { name: 'Biểu phí xe tải trọng lớn', price: 450000 },
        after: { name: 'Biểu phí xe tải trọng lớn 2026', price: 500000 },
      },
      {
        action: 'FEE_TRANSACTION_RECORD',
        actor: defaultUser,
        targetType: 'FEE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: {
          transactionCode: 'TX-20260827-8899',
          amount: 500000,
          paymentMethod: 'CHUYEN_KHOAN',
          status: 'PAID',
        },
      },
      {
        action: 'FEE_TRANSACTION_CONFIRM',
        actor: defaultUser,
        targetType: 'FEE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { paymentStatus: 'WAITING_FOR_FEE' },
        after: { paymentStatus: 'PAID' },
      },
      {
        action: 'FEE_WORKBENCH_ACTION',
        actor: defaultUser,
        targetType: 'FEE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { reconciliationStatus: 'PROCESSING' },
        after: {
          reconciliationStatus: 'COMPLETED',
          note: 'Đã khớp 150/150 giao dịch ngân hàng VietinBank',
        },
      },
      {
        action: 'REPORT_EXPORT',
        actor: defaultUser,
        targetType: 'REPORT',
        targetId: 'AUDIT_LOG',
        result: 'SUCCESS',
        before: null,
        after: {
          reportName: 'Nhật ký thao tác',
          filter: { module: 'DOSSIER', action: 'DECLARATION_CREATE' },
        },
      },
      {
        action: 'AUTH_LOGIN',
        actor: defaultUser,
        targetType: 'USER',
        targetId: defaultUser.id,
        result: 'SUCCESS',
        before: null,
        after: { username: defaultUser.username, fullName: 'Quản trị viên hệ thống' },
      },
      {
        action: 'USER_REGISTER',
        actor: enterpriseUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: {
          username: 'dn_hoangnam',
          fullName: 'Công ty TNHH Hoàng Nam',
          status: 'PENDING_APPROVAL',
        },
      },
      {
        action: 'USER_CREATE',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: {
          username: 'canbo_haiquan01',
          fullName: 'Nguyễn Văn Hải',
          role: 'HAI_QUAN_B1',
          status: 'ACTIVE',
        },
      },
      {
        action: 'USER_UPDATE',
        actor: defaultUser,
        targetType: 'USER',
        targetId: customsUser.id,
        result: 'SUCCESS',
        before: { fullName: 'Nguyễn Văn Hải', phone: '0912345678' },
        after: { fullName: 'Nguyễn Văn Hải (Cán bộ phụ trách)', phone: '0988776655' },
      },
      {
        action: 'USER_APPROVE',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { status: 'PENDING_APPROVAL' },
        after: { status: 'ACTIVE' },
      },
      {
        action: 'USER_DELETE',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { username: 'taikhoan_rac_01', fullName: 'Tài khoản thử nghiệm' },
        after: null,
      },

      // ==========================================
      // TRANG 3: BẢO MẬT, VAI TRÒ & DANH MỤC
      // ==========================================
      {
        action: 'USER_LOCK',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { status: 'ACTIVE' },
        after: {
          status: 'TEMPORARY_LOCKED',
          reason: 'Phát hiện đăng nhập bất thường nhiều lần từ IP lạ',
        },
      },
      {
        action: 'USER_UNLOCK',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { status: 'LOCKED' },
        after: { status: 'ACTIVE' },
      },
      {
        action: 'USER_RESET_PASSWORD',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { oldPassword: '●●●●●●●● (không lưu giá trị mật khẩu)' },
        after: { newPassword: '●●●●●●●● (mật khẩu mới được thiết lập)' },
      },
      {
        action: 'USER_UPDATE_ROLE',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { role: 'DOANH_NGHIEP' },
        after: { role: 'CAN_BO_DIEU_PHOI' },
      },
      {
        action: 'USER_UPDATE_ASSIGNMENT',
        actor: defaultUser,
        targetType: 'USER',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { assignment: 'Cửa khẩu phụ Lóng Sập - Cổng số 1' },
        after: { assignment: 'Cửa khẩu chính Chiềng Khương - Luồng đỏ số 2' },
      },
      {
        action: 'USER_UPDATE_PROFILE',
        actor: defaultUser,
        targetType: 'USER',
        targetId: defaultUser.id,
        result: 'SUCCESS',
        before: { email: 'canbo.cu@smartgate.gov.vn', phone: '0912000111' },
        after: { email: 'canbo.moi@smartgate.gov.vn', phone: '0912999888' },
      },
      {
        action: 'USER_CHANGE_PASSWORD',
        actor: defaultUser,
        targetType: 'USER',
        targetId: defaultUser.id,
        result: 'SUCCESS',
        before: { oldPassword: '●●●●●●●● (không lưu giá trị)' },
        after: { newPassword: '●●●●●●●● (không lưu giá trị)' },
      },
      {
        action: 'ROLE_CREATE',
        actor: defaultUser,
        targetType: 'ROLE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: {
          name: 'Cán bộ Kiểm dịch Nông sản',
          code: 'KIEM_DICH_NS',
          description: 'Xử lý kiểm dịch động thực vật tại cửa khẩu',
        },
      },
      {
        action: 'ROLE_UPDATE',
        actor: defaultUser,
        targetType: 'ROLE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { name: 'Cán bộ Kiểm dịch', description: 'Kiểm dịch thường' },
        after: {
          name: 'Cán bộ Kiểm dịch Nông sản Đặc biệt',
          description: 'Kiểm dịch hoa quả tươi xuất nhập khẩu liên vận',
        },
      },
      {
        action: 'ROLE_DELETE',
        actor: defaultUser,
        targetType: 'ROLE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { name: 'Vai trò thử nghiệm cũ', code: 'TEST_ROLE' },
        after: null,
      },
      {
        action: 'ROLE_LOCK',
        actor: defaultUser,
        targetType: 'ROLE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { status: 'ACTIVE' },
        after: { status: 'LOCKED' },
      },
      {
        action: 'ROLE_UNLOCK',
        actor: defaultUser,
        targetType: 'ROLE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { status: 'LOCKED' },
        after: { status: 'ACTIVE' },
      },
      {
        action: 'ROLE_UPDATE_PERMISSIONS',
        actor: defaultUser,
        targetType: 'ROLE',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { permissions: ['dossier.view', 'dossier.create'] },
        after: {
          permissions: ['dossier.view', 'dossier.create', 'dossier.approve', 'dossier.export'],
        },
      },
      {
        action: 'CATALOG_TYPE_CREATE',
        actor: defaultUser,
        targetType: 'CATALOG',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: {
          name: 'Loại hình kiểm dịch',
          code: 'QUARANTINE_TYPE',
          description: 'Danh mục các loại chứng nhận kiểm dịch',
        },
      },
      {
        action: 'CATALOG_TYPE_UPDATE',
        actor: defaultUser,
        targetType: 'CATALOG',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { name: 'Loại hình kiểm dịch cũ' },
        after: { name: 'Loại hình kiểm dịch quốc tế 2026' },
      },
      {
        action: 'CATALOG_ITEM_CREATE',
        actor: defaultUser,
        targetType: 'CATALOG',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: null,
        after: { name: 'Kiểm dịch thực vật tươi sống', code: 'KD_TV_01', sortOrder: 1 },
      },
      {
        action: 'CATALOG_ITEM_UPDATE',
        actor: defaultUser,
        targetType: 'CATALOG',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { name: 'Kiểm dịch thực vật tươi sống', sortOrder: 1 },
        after: { name: 'Kiểm dịch thực vật tươi sống (Ưu tiên)', sortOrder: 2 },
      },

      // ==========================================
      // TRANG 4: KHÓA DANH MỤC & CẤU HÌNH HỆ THỐNG
      // ==========================================
      {
        action: 'CATALOG_ITEM_LOCK',
        actor: defaultUser,
        targetType: 'CATALOG',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { status: 'ACTIVE' },
        after: { status: 'LOCKED' },
      },
      {
        action: 'CATALOG_ITEM_UNLOCK',
        actor: defaultUser,
        targetType: 'CATALOG',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { status: 'LOCKED' },
        after: { status: 'ACTIVE' },
      },
      {
        action: 'SYSTEM_CONFIG_UPDATE',
        actor: defaultUser,
        targetType: 'SYSTEM',
        targetId: randomUUID(),
        result: 'SUCCESS',
        before: { sessionTimeoutMinutes: 30, maxFileUploadMb: 20 },
        after: { sessionTimeoutMinutes: 60, maxFileUploadMb: 50 },
      },
    ];

    for (const item of auditCases) {
      const id = randomUUID();
      const time = new Date(now - minuteOffset * 3 * 60 * 1000); // lùi mỗi bản ghi 3 phút
      minuteOffset++;

      await client.query(
        `INSERT INTO audit_logs (id, occurred_at, actor_id, actor_username, actor_role, ip, correlation_id, action, target_type, target_id, result, value_before, value_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          time,
          item.actor.id,
          item.actor.username,
          item.actor.role || 'USER',
          '192.168.1.' + Math.floor(Math.random() * 200 + 10),
          'SEED_SG_142',
          item.action,
          item.targetType,
          item.targetId,
          item.result,
          item.before ? JSON.stringify(item.before) : null,
          item.after ? JSON.stringify(item.after) : null,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`🎉 ĐÃ SEED THÀNH CÔNG ${auditCases.length} BẢN GHI NHẬT KÝ HỆ THỐNG ĐẦY ĐỦ CÁC TRƯỜNG HỢP THEO FILE PDF!`);
    console.log('👉 Bây giờ anh/chị có thể vào màn hình Quản trị -> Nhật ký hệ thống (/admin/audit-logs) để kiểm tra toàn bộ 100% các case!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi seed audit logs:', err);
  } finally {
    await client.end();
  }
}

seedAuditLogs();
