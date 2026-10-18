/**
 * Kiểm chứng kho lưu trữ tệp đính kèm (MinIO/S3) **thật**.
 *
 * Vì sao cần: toàn bộ module `files` mới chỉ được kiểm bằng kho lưu trữ giả lập. Những thứ chỉ
 * lộ ra khi có máy chủ thật — sai tên biến môi trường, sai `forcePathStyle`, thiếu quyền trên
 * bucket, chứng chỉ TLS, endpoint sai giao thức — đều để unit test xanh.
 *
 * Cách chạy:  npm run build  &&  npm run storage:check
 *
 * An toàn:
 * - Dùng adapter **thật** của ứng dụng (không viết lại lệnh S3) nên kiểm đúng đường chạy production.
 * - Chỉ ghi vào tiền tố `smartgate-storage-check/`, và **xoá sạch** những gì đã tạo.
 * - **Không bao giờ in access key / secret key.**
 */
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { S3StorageAdapter } = require(path.join(
  __dirname, '..', 'dist', 'modules', 'files', 'infrastructure', 'storage', 's3-storage.adapter.js',
));

/** ConfigService tối giản — adapter chỉ dùng `get()`. */
const config = { get: (key) => process.env[key] };

const PREFIX = 'smartgate-storage-check/';

async function docStream(stream) {
  const phan = [];
  for await (const mieng of stream) phan.push(Buffer.from(mieng));
  return Buffer.concat(phan);
}

(async () => {
  let hong = false;
  const daTao = [];
  const adapter = new S3StorageAdapter(config);

  try {
    console.log('=== 1. CẤU HÌNH ===');
    if (!adapter.isConfigured()) {
      console.log('  ✗ Chưa cấu hình đủ. Cần STORAGE_S3_BUCKET, STORAGE_S3_ACCESS_KEY, STORAGE_S3_SECRET_KEY');
      console.log('    (Lưu ý: tên biến là STORAGE_S3_*, KHÔNG phải MINIO_*.)');
      process.exit(1);
    }
    console.log(`  ✓ bucket "${process.env.STORAGE_S3_BUCKET}" tại ${process.env.STORAGE_S3_ENDPOINT || 'AWS S3'}`);

    // Nội dung PDF hợp lệ tối thiểu — module `files` kiểm magic bytes nên đừng dùng chuỗi bừa.
    const noiDung = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      crypto.randomBytes(2048),
      Buffer.from('\n%%EOF\n'),
    ]);
    const checksum = crypto.createHash('sha256').update(noiDung).digest('hex');
    const key = `${PREFIX}${crypto.randomUUID()}.pdf`;

    console.log('\n=== 2. GHI LÊN (put) ===');
    await adapter.put({ key, content: noiDung, contentType: 'application/pdf', checksum });
    daTao.push(key);
    console.log(`  ✓ đã ghi ${noiDung.length} byte`);

    console.log('\n=== 3. KIỂM TỒN TẠI (exists) ===');
    const co = await adapter.exists(key);
    if (!co) { hong = true; console.log('  ✗ vừa ghi xong mà exists() trả false'); }
    else console.log('  ✓ exists() = true');

    console.log('\n=== 4. ĐỌC VỀ (get) + ĐỐI CHIẾU TOÀN VẸN ===');
    const doiTuong = await adapter.get(key);
    const daDoc = await docStream(doiTuong.stream);
    const checksumDoc = crypto.createHash('sha256').update(daDoc).digest('hex');
    if (checksumDoc !== checksum) {
      hong = true;
      console.log(`  ✗ SAI LỆCH DỮ LIỆU: ghi ${checksum.slice(0, 16)}… đọc ${checksumDoc.slice(0, 16)}…`);
    } else {
      console.log(`  ✓ ${daDoc.length} byte, SHA-256 khớp chính xác`);
      console.log(`    contentType trả về: ${doiTuong.contentType || '(trống)'}`);
    }

    console.log('\n=== 5. KHOÁ KHÔNG TỒN TẠI ===');
    const ma = await adapter.exists(`${PREFIX}khong-he-ton-tai-${crypto.randomUUID()}`);
    if (ma) { hong = true; console.log('  ✗ exists() trả true cho khoá không có thật'); }
    else console.log('  ✓ exists() = false, không ném lỗi');

    console.log('\n=== 6. XOÁ (remove) ===');
    await adapter.remove(key);
    daTao.pop();
    const conNua = await adapter.exists(key);
    if (conNua) { hong = true; console.log('  ✗ xoá xong mà vẫn còn'); }
    else console.log('  ✓ đã xoá, exists() = false');

    console.log('\n>>> ' + (hong ? 'CÓ VẤN ĐỀ — xem dấu ✗' : 'TẤT CẢ ĐỀU ĐẠT'));
  } catch (e) {
    hong = true;
    // Thông điệp lỗi của AWS SDK không chứa khoá bí mật, nhưng vẫn cắt ngắn cho chắc.
    console.log('\n>>> HỎNG:', String(e.message).slice(0, 300));
    if (e.name) console.log('    loại lỗi:', e.name);
    if (e.$metadata && e.$metadata.httpStatusCode) console.log('    mã HTTP:', e.$metadata.httpStatusCode);
  } finally {
    for (const key of daTao) {
      await adapter.remove(key).catch(() => console.log(`  ! chưa dọn được: ${key}`));
    }
    if (daTao.length) console.log('Đã dọn các đối tượng tạm còn sót.');
    process.exit(hong ? 1 : 0);
  }
})();
