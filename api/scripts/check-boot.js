/**
 * Khởi động THẬT ứng dụng trên một database tạm, rồi tắt.
 *
 * Vì sao cần: build chỉ kiểm kiểu, unit test không nạp DI graph và không chạm PostgreSQL.
 * Những lỗi làm ứng dụng chết ngay khi khởi động — thiếu provider, chuỗi seed dài hơn cột,
 * migration chưa khớp entity — đều lọt qua toàn bộ test mà vẫn xanh.
 * (Đã từng bắt được: `value too long for type character varying(255)` ở `CatalogSeedService`.)
 *
 * Cách chạy:  npm run build  &&  npm run boot:check
 *
 * An toàn: dùng database TẠM riêng, xóa sau khi xong. KHÔNG đụng database dev/production.
 */
const path = require('path');
const { spawn } = require('child_process');
const { DataSource } = require('typeorm');
const { Client } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TEMP_DB = process.env.BOOT_CHECK_DB || 'smart_gate_boot_check';
const PORT = Number(process.env.BOOT_CHECK_PORT || 3999);
const API = path.join(__dirname, '..');
const DIST = path.join(API, 'dist');

const base = {
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
};

const admin = async (sql) => {
  const c = new Client({ ...base, database: 'postgres' });
  await c.connect();
  await c.query(sql);
  await c.end();
};

const doi = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!base.host || !base.user) throw new Error('Thiếu DATABASE_HOST / DATABASE_USER trong .env');
  if (process.env.DATABASE_NAME === TEMP_DB) {
    throw new Error(`DỪNG: database tạm trùng DATABASE_NAME đang dùng. Đặt BOOT_CHECK_DB khác.`);
  }

  let ok = false;
  let app;
  try {
    await admin(`DROP DATABASE IF EXISTS ${TEMP_DB} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${TEMP_DB}`);

    const ds = new DataSource({
      type: 'postgres',
      host: base.host,
      port: base.port,
      username: base.user, // TypeORM dùng `username`, driver `pg` dùng `user`
      password: base.password,
      database: TEMP_DB,
      entities: [path.join(DIST, '**', '*.orm-entity.js')],
      migrations: [path.join(DIST, 'database', 'migrations', '*.js')],
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    const m = await ds.runMigrations({ transaction: 'each' });
    await ds.destroy();
    console.log(`Đã áp ${m.length} migration lên database tạm "${TEMP_DB}".\n`);

    app = spawn(process.execPath, [path.join(DIST, 'main.js')], {
      cwd: API,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: String(PORT),
        DATABASE_NAME: TEMP_DB,
        DATABASE_SYNC: 'false',
        AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET || 'chi-dung-cho-boot-check',
      },
    });

    let log = '';
    app.stdout.on('data', (d) => (log += d));
    app.stderr.on('data', (d) => (log += d));

    for (let i = 0; i < 45; i++) {
      await doi(1000);
      if (/Nest application successfully started|listening/i.test(log)) { ok = true; break; }
      if (app.exitCode !== null) break;
    }

    if (!ok) {
      const tep = path.join(API, 'boot-check-failure.log');
      require('fs').writeFileSync(tep, log, 'utf8');
      console.log('✗ ỨNG DỤNG KHÔNG KHỞI ĐỘNG ĐƯỢC. Nhật ký đầy đủ:', tep);
      const loi = log.match(/(QueryFailedError|Nest can't resolve|Error):[^\n]*/g);
      if (loi) console.log('  ' + [...new Set(loi)].slice(0, 5).join('\n  '));
      return;
    }

    console.log('✓ Nest khởi động thành công — DI graph hợp lệ, migration khớp entity.\n');

    const goi = async (duongDan) => {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}${duongDan}`);
        return res.status;
      } catch {
        return 0;
      }
    };

    // Hai guard toàn cục phải chặn mọi endpoint chưa đăng nhập (fail-closed).
    // Đường dẫn ở đây còn kiêm việc kiểm ROUTE CÓ ĐƯỢC ĐĂNG KÝ KHÔNG: controller quên khai trong
    // module thì Nest trả 404 chứ không phải 401, và build lẫn unit test đều không phát hiện được.
    console.log('Kiểm guard toàn cục — chưa đăng nhập thì phải nhận 401:');
    for (const duongDan of [
      '/api/v1/declarations',
      '/api/v1/workflow/queue',
      '/api/v1/reports/catalog',
      '/api/v1/dashboard/overview',
      '/api/v1/catalog/required-documents',
      '/api/v1/catalog/fee-rules',
      // Bảng phí của hồ sơ nằm ở controller khác cùng tiền tố `declarations` — kiểm luôn để chắc
      // route không bị `GET declarations/:id` nuốt mất.
      '/api/v1/declarations/00000000-0000-4000-8000-000000000000/fees',
    ]) {
      const ma = await goi(duongDan);
      const dat = ma === 401;
      if (!dat) ok = false;
      console.log(`  ${dat ? '✓' : '✗'} GET ${duongDan} → ${ma}${dat ? '' : ' (đáng lẽ 401!)'}`);
    }
    const docs = await goi('/docs');
    console.log(`  ${docs === 200 ? '✓' : '✗'} GET /docs → ${docs}`);
  } catch (e) {
    ok = false;
    console.log('\n✗ HỎNG:', e.message);
  } finally {
    if (app) app.kill('SIGKILL');
    await doi(400);
    await admin(`DROP DATABASE IF EXISTS ${TEMP_DB} WITH (FORCE)`).catch(() => {});
    console.log(`\n>>> ${ok ? 'ĐẠT' : 'KHÔNG ĐẠT'} — đã xóa database tạm "${TEMP_DB}".`);
    process.exit(ok ? 0 : 1);
  }
})();
