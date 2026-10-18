/**
 * Script seed 30 dữ liệu hồ sơ thực tế + phân bổ đều vào 3 cột Điều phối (SG-257) vào PostgreSQL local.
 *
 * Chạy bằng: node scripts/seed-30-dossiers.js hoặc npm run seed
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

const ENTERPRISES = [
  { id: '11111111-1111-4111-8111-111111111111', taxCode: '5501234567', name: 'Công ty TNHH Dịch vụ Giải pháp ABC', representative: 'Nguyễn Văn Nam', phone: '0912345678', address: 'TP. Sơn La, Tỉnh Sơn La' },
  { id: '22222222-2222-4222-8222-222222222222', taxCode: '5501234568', name: 'Công ty CP Nông sản Tây Bắc', representative: 'Trần Thị Mai', phone: '0923456789', address: 'Huyện Mộc Châu, Tỉnh Sơn La' },
  { id: '33333333-3333-4333-8333-333333333333', taxCode: '5501234569', name: 'Công ty TNHH Thương mại Sơn La', representative: 'Lê Hoàng Long', phone: '0934567890', address: 'Huyện Sông Mã, Tỉnh Sơn La' },
  { id: '44444444-4444-4444-8444-444444444444', taxCode: '5501234570', name: 'Công ty CP Nông sản Mộc Châu', representative: 'Phạm Thanh Hà', phone: '0945678901', address: 'Huyện Mộc Châu, Tỉnh Sơn La' },
  { id: '55555555-5555-4555-8555-555555555555', taxCode: '5501234571', name: 'Công ty TNHH Xuất Nhập Khẩu Chiềng Khương', representative: 'Vũ Đức Thành', phone: '0956789012', address: 'Xã Chiềng Khương, Huyện Sông Mã, Sơn La' },
];

const PLATES = [
  '456C451', '456C452', '456C456', '29-X5 9999', '30C300', '26C-123.45', '26C-678.90',
  '15C-888.88', '98C-123.99', '88C-555.55', '34C-666.66', '29C-111.22', '36C-333.44',
  '99C-777.88', '14C-444.55', '89C-222.33', '19C-999.00', '20C-555.11', '22C-333.22', '24C-777.44',
  '29C-999.88', '30E-888.77', '26A-111.33', '98B-222.44', '15B-333.55', '88A-444.66', '34B-555.77',
  '36B-666.88', '14B-777.99', '99B-888.00'
];

const CARGO_ITEMS = [
  { name: 'Ngô hạt tươi', unit: 'KG', weight: 25000 },
  { name: 'Sắn lát khô', unit: 'KG', weight: 30000 },
  { name: 'Nhãn sông Mã', unit: 'KG', weight: 15000 },
  { name: 'Xoài Sơn La', unit: 'KG', weight: 18000 },
  { name: 'Thạch đen khô', unit: 'KG', weight: 12000 },
  { name: 'Gỗ bóc keo', unit: 'M3', weight: 22000 },
  { name: 'Xi măng bao', unit: 'KG', weight: 40000 },
  { name: 'Phân bón NPK', unit: 'KG', weight: 28000 }
];

const SAMPLE_DOCS = [
  { code: 'CUSTOMS_DECLARATION', name: 'To_khai_hai_quan_2026.pdf', mime: 'application/pdf', size: 479100 },
  { code: 'COMMERCIAL_INVOICE', name: 'Hoa_don_thuong_mai.pdf', mime: 'application/pdf', size: 120500 },
  { code: 'CERTIFICATE_OF_ORIGIN', name: 'Giay_chung_nhan_xuat_xu_CO.pdf', mime: 'application/pdf', size: 310200 },
  { code: 'BILL_OF_LADING', name: 'Van_don_hang_hoa.pdf', mime: 'application/pdf', size: 154000 },
];

async function seed() {
  console.log('🔌 Đang kết nối tới PostgreSQL...');
  await client.connect();
  console.log('✅ Đã kết nối thành công!');

  try {
    await client.query('BEGIN');

    // 1. Seed Doanh nghiệp
    console.log('🏢 Đang seed danh sách Doanh nghiệp...');
    for (const ent of ENTERPRISES) {
      await client.query(
        `INSERT INTO enterprises (id, tax_code, name, representative_name, address, phone, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (tax_code) DO UPDATE
         SET name = EXCLUDED.name, representative_name = EXCLUDED.representative_name, address = EXCLUDED.address, phone = EXCLUDED.phone`,
        [ent.id, ent.taxCode, ent.name, ent.representative, ent.address, ent.phone]
      );
    }

    // 2. Lấy danh sách ID người dùng (user)
    const userRows = await client.query(`SELECT id, username FROM users WHERE username IN ('dieuphoi', 'admin', 'bienphong', 'haiquan', 'doanhnghiep')`);
    const userMap = {};
    userRows.rows.forEach(u => userMap[u.username] = u.id);
    const uploaderId = userMap['doanhnghiep'] || userMap['admin'] || '00000000-0000-0000-0000-000000000000';

    // 3. Chuẩn bị 30 hồ sơ
    console.log('📦 Đang khởi tạo 30 hồ sơ mẫu cho cả 3 cột Điều phối (SG-257)...');

    // Clean existing test dossiers
    const existing = await client.query(`SELECT id::text FROM declarations WHERE code LIKE 'IMP-202608%' OR code LIKE 'EXP-202608%' LIMIT 100`);
    if (existing.rows.length > 0) {
      const ids = existing.rows.map(r => r.id);
      await client.query(`DELETE FROM audit_logs WHERE target_id = ANY($1::text[]) OR target_id IN (SELECT id::text FROM attachments WHERE dossier_id = ANY($1::uuid[]))`, [ids]);
      await client.query(`DELETE FROM attachments WHERE dossier_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM dispatch_assignments WHERE dossier_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM notifications WHERE dossier_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM queue_tickets WHERE dossier_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM workflow_instance_steps WHERE instance_id IN (SELECT id FROM workflow_instances WHERE dossier_id = ANY($1::uuid[]))`, [ids]);
      await client.query(`DELETE FROM workflow_instances WHERE dossier_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM vehicles WHERE dossier_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM cargo_items WHERE dossier_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM declarations WHERE id = ANY($1::uuid[])`, [ids]);
    }

    const types = ['IMPORT', 'EXPORT', 'TRANSSHIPMENT_IMPORT', 'TRANSSHIPMENT_EXPORT'];
    const todayStr = new Date().toISOString().split('T')[0];

    const seededDossiers = [];
    const seededAttachments = [];

    for (let i = 0; i < 30; i++) {
      const dossierId = randomUUID();
      const instanceId = randomUUID();
      const type = types[i % types.length];
      const prefix = type.startsWith('EXP') ? 'EXP' : 'IMP';
      const seqStr = String(i + 1).padStart(6, '0');
      const code = `${prefix}-20260826-${seqStr}`;
      const ent = ENTERPRISES[i % ENTERPRISES.length];
      const plate = PLATES[i % PLATES.length];
      const isEpidemic = i % 5 === 0;

      // Phân bổ 30 hồ sơ:
      // i = 0..7 (8 xe) -> Cột 1: Chờ điều phối (WAITING_CALL / ENTRY_GATE)
      // i = 8..17 (10 xe) -> Cột 2: Đang trong giai đoạn kiểm tra (BUSINESS_PROCESSING / INSPECTION)
      // i = 18..25 (8 xe) -> Cột 3: Đã kiểm tra xong (BUSINESS_PROCESSING / FEE, EXIT_GATE)
      // i = 26..29 (4 xe) -> Hoàn thành / Ra cổng (COMPLETED)
      let status = 'BUSINESS_PROCESSING';
      let instanceStatus = 'IN_PROGRESS';

      if (i < 8) {
        status = 'WAITING_CALL';
        instanceStatus = 'IN_PROGRESS';
      } else if (i >= 8 && i < 18) {
        status = 'BUSINESS_PROCESSING';
        instanceStatus = 'IN_PROGRESS';
      } else if (i >= 18 && i < 26) {
        status = 'BUSINESS_PROCESSING';
        instanceStatus = 'IN_PROGRESS';
      } else {
        status = 'COMPLETED';
        instanceStatus = 'COMPLETED';
      }

      const submittedAt = new Date(Date.now() - (30 - i) * 3600 * 1000);

      // Insert declaration
      await client.query(
        `INSERT INTO declarations (id, code, type, status, "enterpriseTaxCode", enterprise_id, "plateNumber", checkpoint, epidemic_flag, submitted_at, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10)`,
        [dossierId, code, type, status, ent.taxCode, ent.id, plate, 'SMART_GATE', isEpidemic, submittedAt]
      );

      // Insert vehicle
      const vehicleId = randomUUID();
      await client.query(
        `INSERT INTO vehicles (id, dossier_id, plate_number, vehicle_type, weight_kg, driver_full_name, driver_id_number, driver_phone, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [vehicleId, dossierId, plate, 'TRUCK', 25000, `Lái xe ${i + 1}`, `02609000${String(i + 1).padStart(4, '0')}`, '0987654321']
      );

      // Insert cargo item
      const cargoId = randomUUID();
      const cargo = CARGO_ITEMS[i % CARGO_ITEMS.length];
      await client.query(
        `INSERT INTO cargo_items (id, dossier_id, line_no, description, unit_code, gross_weight_kg, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [cargoId, dossierId, 1, cargo.name, cargo.unit, cargo.weight]
      );

      // Insert attachments
      const docCount = (i % 3) + 2;
      for (let d = 0; d < docCount; d++) {
        const doc = SAMPLE_DOCS[d % SAMPLE_DOCS.length];
        const attId = randomUUID();
        const storageKey = `attachments/2026/08/${attId}.pdf`;
        const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

        await client.query(
          `INSERT INTO attachments (id, dossier_id, original_name, mime_type, size_bytes, storage_key, checksum, document_type_code, uploaded_by_id, uploaded_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')`,
          [attId, dossierId, doc.name, doc.mime, doc.size, storageKey, checksum, doc.code, uploaderId, submittedAt]
        );

        seededAttachments.push({ id: attId, name: doc.name, dossierId, code, docCode: doc.code, size: doc.size });
      }

      // Workflow definition
      const isImport = type.includes('IMPORT');
      const stepDefs = isImport
        ? [
            { code: 'IMPORT_B1_ENTRY', order: 1, isGate: true },
            { code: 'IMPORT_BORDER', order: 2 },
            { code: 'IMPORT_QUARANTINE', order: 3 },
            { code: 'IMPORT_CUSTOMS', order: 4 },
            { code: 'IMPORT_FEE', order: 5 },
            { code: 'IMPORT_B2_EXIT', order: 6, isGate: true },
          ]
        : [
            { code: 'EXPORT_B2_ENTRY', order: 1, isGate: true },
            { code: 'EXPORT_BORDER', order: 2 },
            { code: 'EXPORT_QUARANTINE', order: 3 },
            { code: 'EXPORT_CUSTOMS', order: 4 },
            { code: 'EXPORT_FEE', order: 5 },
            { code: 'EXPORT_B1_EXIT', order: 6, isGate: true },
          ];

      let currentStepCode = isImport ? 'IMPORT_B1_ENTRY' : 'EXPORT_B2_ENTRY';
      if (i >= 8 && i < 18) {
        currentStepCode = isImport ? 'IMPORT_BORDER' : 'EXPORT_BORDER';
      } else if (i >= 18 && i < 26) {
        currentStepCode = isImport ? 'IMPORT_FEE' : 'EXPORT_FEE';
      } else if (i >= 26) {
        currentStepCode = isImport ? 'IMPORT_B2_EXIT' : 'EXPORT_B1_EXIT';
      }

      // Insert workflow instance
      await client.query(
        `INSERT INTO workflow_instances (id, dossier_id, dossier_type, current_step_code, status, started_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [instanceId, dossierId, type, currentStepCode, instanceStatus, submittedAt]
      );

      // Insert steps
      for (const stepDef of stepDefs) {
        let stepStatus = 'PENDING';
        let decision = null;
        let reasonCode = null;

        if (i < 8) {
          // Cột 1: Chờ điều phối (bước 1 mở)
          if (stepDef.order === 1) stepStatus = 'IN_PROGRESS';
        } else if (i >= 8 && i < 18) {
          // Cột 2: Đang kiểm tra (bước 1 xong, bước 2, 3, 4 mở)
          if (stepDef.order === 1) {
            stepStatus = 'COMPLETED';
            decision = 'APPROVE';
          } else if (stepDef.order === 2 || stepDef.order === 3 || stepDef.order === 4) {
            stepStatus = 'IN_PROGRESS';
          }
        } else if (i >= 18 && i < 26) {
          // Cột 3: Đã kiểm tra xong (bước 1,2,3,4 xong, bước 5 mở)
          if (stepDef.order <= 4) {
            stepStatus = 'COMPLETED';
            decision = 'APPROVE';
          } else if (stepDef.order === 5) {
            stepStatus = 'IN_PROGRESS';
          }
        } else {
          // Hoàn tất
          stepStatus = 'COMPLETED';
          decision = 'APPROVE';
        }

        await client.query(
          `INSERT INTO workflow_instance_steps (id, instance_id, step_code, step_order, status, entered_at, decision, reason_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), instanceId, stepDef.code, stepDef.order, stepStatus, submittedAt, decision, reasonCode]
        );
      }

      // Insert queue ticket
      const flowName = type.startsWith('EXP') ? 'EXPORT' : 'IMPORT';
      const ticketId = randomUUID();
      await client.query(
        `INSERT INTO queue_tickets (id, dossier_id, ticket_number, flow, issued_date, issued_at, checkpoint)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ticketId, dossierId, i + 1, flowName, todayStr, submittedAt, 'SMART_GATE']
      );

      seededDossiers.push({ id: dossierId, code, plate, status, type, submittedAt });
    }

    // 4. Seed thông báo điều phối (Notifications)
    console.log('🔔 Đang khởi tạo thông báo Chờ điều phối (SG-227)...');
    const recipients = [userMap['dieuphoi'], userMap['admin']].filter(Boolean);
    const dispatchDossiers = seededDossiers.slice(0, 8);

    for (const recipientId of recipients) {
      for (let j = 0; j < dispatchDossiers.length; j++) {
        const item = dispatchDossiers[j];
        const notifId = randomUUID();
        const notifTime = new Date(Date.now() - (j + 1) * 15 * 60 * 1000);

        await client.query(
          `INSERT INTO notifications (id, recipient_id, type, title, content, dossier_id, dossier_code, route, read_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)`,
          [
            notifId,
            recipientId,
            'DOSSIER_STATUS_CHANGED',
            `Xe ${item.plate} đang chờ điều phối`,
            `Hồ sơ ${item.code} đã qua cổng Barrie 1, phương tiện ${item.plate} đang chờ điều phối đỗ và xử lý.`,
            item.id,
            item.code,
            '/operations/vehicle-confirmation',
            notifTime
          ]
        );
      }
    }

    // 5. Seed Vị trí & Lịch sử điều phối (dispatch_assignments & audit_logs)
    console.log('📜 Đang khởi tạo Lịch sử điều phối & vị trí đỗ...');
    const actorId = userMap['dieuphoi'] || userMap['admin'] || null;
    const adminId = userMap['admin'] || null;

    const slots = ['A-01', 'A-02', 'A-03', 'B-01', 'B-02', 'C-01', 'C-02', 'D-01'];
    const actions = ['DISPATCH_ASSIGN', 'DISPATCH_MOVE', 'DISPATCH_RELEASE'];

    for (let k = 0; k < 20; k++) {
      const item = seededDossiers[k];
      const slot = slots[k % slots.length];
      const action = actions[k % actions.length];
      const assignId = randomUUID();
      const auditId = randomUUID();
      const time = new Date(Date.now() - (k + 1) * 20 * 60 * 1000);

      const before = action === 'DISPATCH_ASSIGN'
        ? { gate: null, lane: null, yard: null, slot: null }
        : { gate: 'B1', lane: 'L1', yard: 'Khu A', slot: 'A-01' };

      const after = action === 'DISPATCH_RELEASE'
        ? { gate: null, lane: null, yard: null, slot: null }
        : { gate: 'B1', lane: 'L1', yard: 'Khu bãi kiểm hóa A', slot: slot };

      // Insert assignment
      await client.query(
        `INSERT INTO dispatch_assignments (id, dossier_id, gate_code, lane_code, slot_code, status, assigned_at, released_at, assigned_by_id, updated_at, inspection_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $7, $10)`,
        [
          assignId,
          item.id,
          'B1',
          'L1',
          slot,
          action === 'DISPATCH_RELEASE' ? 'RELEASED' : 'ACTIVE',
          time,
          action === 'DISPATCH_RELEASE' ? new Date() : null,
          actorId,
          'COMPLETED'
        ]
      );

      // Insert audit log cho điều phối
      await client.query(
        `INSERT INTO audit_logs (id, occurred_at, actor_id, actor_username, actor_role, action, target_type, target_id, result, value_before, value_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          auditId,
          time,
          actorId,
          'dieuphoi',
          'DISPATCHER',
          action,
          'DOSSIER',
          item.id,
          'SUCCESS',
          JSON.stringify(before),
          JSON.stringify(after)
        ]
      );
    }

    // 6. Seed Nhật ký tải file (SG-254) trong audit_logs
    console.log('📑 Đang khởi tạo mẫu Nhật ký tải file (SG-254) vào audit_logs...');
    for (let m = 0; m < 5; m++) {
      const att = seededAttachments[m];
      const downloadAuditId = randomUUID();
      const downloadTime = new Date(Date.now() - (m + 1) * 10 * 60 * 1000);
      const isSuccess = m !== 4;

      await client.query(
        `INSERT INTO audit_logs (id, occurred_at, actor_id, actor_username, actor_role, action, target_type, target_id, result, value_before, value_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10)`,
        [
          downloadAuditId,
          downloadTime,
          adminId,
          'admin',
          'SYS_ADMIN',
          'ATTACHMENT_DOWNLOAD',
          'ATTACHMENT',
          att.id,
          isSuccess ? 'SUCCESS' : 'FAILURE',
          JSON.stringify({
            originalName: att.name,
            sizeBytes: att.size,
            mimeType: 'application/pdf',
            documentTypeCode: att.docCode,
            dossierId: att.dossierId,
            reason: isSuccess ? undefined : 'Người dùng hủy/thoát thao tác tải file'
          })
        ]
      );
    }

    await client.query('COMMIT');
    console.log('🎉 ĐÃ SEED THÀNH CÔNG DỮ LIỆU ĐIỀU PHỐI ĐỀU CHO 3 CỘT (SG-257)!');
    console.log('📊 Thống kê trên Bảng điều phối (/operations/vehicle-confirmation):');
    console.log('   - Cột 1 [Chờ điều phối]: 8 thẻ xe (> 5 thẻ -> có thanh cuộn riêng)');
    console.log('   - Cột 2 [Đang kiểm tra]: 10 thẻ xe (> 5 thẻ -> có thanh cuộn riêng)');
    console.log('   - Cột 3 [Đã kiểm tra xong]: 8 thẻ xe (> 5 thẻ -> có thanh cuộn riêng)');
    console.log('   - Tổng cộng: 26 xe trên bảng điều phối, 30 hồ sơ toàn hệ thống!');
    console.log('👉 Anh/chị vào màn "Điều phối" để kiểm tra giao diện 3 cột cân đối và thanh cuộn nhé!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi seed dữ liệu:', err);
  } finally {
    await client.end();
  }
}

seed();
