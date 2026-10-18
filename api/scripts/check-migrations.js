/**
 * Kiểm chứng migration trên PostgreSQL THẬT.
 *
 * Vì sao cần: unit test chỉ kiểm được logic biến đổi dữ liệu, KHÔNG chạy một câu SQL nào.
 * Những lỗi chỉ lộ ra khi có máy chủ thật — sai tên cột, tham số truyền thừa, `down()` không
 * đảo ngược được — đều lọt qua toàn bộ test. Kịch bản này bịt đúng khoảng trống đó.
 *
 * Cách chạy:  npm run build  &&  npm run migration:check
 *
 * An toàn: tạo một database TẠM riêng, chạy migration ở đó rồi xóa. KHÔNG bao giờ đụng
 * database dev/production — có chốt chặn nếu tên trùng.
 */
const path = require('path');
const { DataSource } = require('typeorm');
const { Client } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TEMP_DB = process.env.MIGRATION_CHECK_DB || 'smart_gate_migration_check';
const DIST = path.join(__dirname, '..', 'dist');

const base = {
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
};

function chotChan() {
  if (!base.host || !base.user) {
    throw new Error('Thiếu DATABASE_HOST / DATABASE_USER trong .env');
  }
  if (process.env.DATABASE_NAME && process.env.DATABASE_NAME === TEMP_DB) {
    throw new Error(
      `DỪNG: tên database tạm (${TEMP_DB}) trùng với DATABASE_NAME đang dùng. ` +
        'Đặt biến MIGRATION_CHECK_DB sang tên khác.',
    );
  }
}

const admin = () => new Client({ ...base, database: 'postgres' });

async function taoDbTam() {
  const c = admin();
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${TEMP_DB} WITH (FORCE)`);
  await c.query(`CREATE DATABASE ${TEMP_DB}`);
  await c.end();
}

async function xoaDbTam() {
  const c = admin();
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${TEMP_DB} WITH (FORCE)`);
  await c.end();
}

function taoDataSource() {
  return new DataSource({
    type: 'postgres',
    host: base.host,
    port: base.port,
    // TypeORM dùng `username`; driver `pg` dùng `user`. Đừng trải chung một đối tượng.
    username: base.user,
    password: base.password,
    database: TEMP_DB,
    entities: [path.join(DIST, '**', '*.orm-entity.js')],
    migrations: [path.join(DIST, 'database', 'migrations', '*.js')],
    synchronize: false,
    logging: false,
  });
}

(async () => {
  let ds;
  let hong = false;
  try {
    chotChan();
    await taoDbTam();
    console.log(`Đã tạo database tạm "${TEMP_DB}".\n`);

    ds = taoDataSource();
    await ds.initialize();

    console.log('=== 1. CHẠY TIẾN ===');
    const daChay = await ds.runMigrations({ transaction: 'each' });
    daChay.forEach((m) => console.log('  áp dụng:', m.name));
    if (daChay.length === 0) throw new Error('Không migration nào được áp dụng — đã chạy npm run build chưa?');

    const bang = await ds.query(
      `select table_name from information_schema.tables where table_schema='public' order by table_name`,
    );
    console.log(`\n=== 2. SCHEMA: ${bang.length} bảng ===`);

    // Rủi ro R2: cột jsonb cũ của declarations phải còn nguyên cho tới khi nghiệm thu.
    const jsonb = await ds.query(
      `select column_name from information_schema.columns
       where table_name='declarations' and data_type='jsonb' order by column_name`,
    );
    console.log('\n=== 3. RỦI RO R2 — cột jsonb cũ phải còn ===');
    if (jsonb.length === 0) {
      hong = true;
      console.log('  ✗ KHÔNG còn cột jsonb nào. Migration đã xóa dữ liệu nguồn trước khi nghiệm thu!');
    } else {
      console.log('  ✓ còn:', jsonb.map((c) => c.column_name).join(', '));
    }

    console.log('\n=== 4. CHẠY LÙI TOÀN BỘ (kiểm down()) ===');
    for (let i = 0; i < daChay.length; i++) await ds.undoLastMigration({ transaction: 'each' });
    const conLai = await ds.query(
      `select count(*)::int as n from information_schema.tables where table_schema='public'`,
    );
    // Chỉ còn đúng bảng "migrations" do TypeORM giữ lại.
    if (conLai[0].n > 1) {
      hong = true;
      console.log(`  ✗ còn ${conLai[0].n} bảng sau khi lùi hết — down() chưa đảo ngược hết.`);
    } else {
      console.log('  ✓ đã lùi sạch.');
    }

    console.log('\n=== 5. CHẠY TIẾN LẠI (kiểm lặp lại được) ===');
    const lanHai = await ds.runMigrations({ transaction: 'each' });
    console.log(`  ✓ áp dụng lại ${lanHai.length} migration.`);

    console.log('\n>>> ' + (hong ? 'CÓ VẤN ĐỀ — xem dấu ✗ ở trên' : 'TẤT CẢ ĐỀU ĐẠT'));
  } catch (e) {
    hong = true;
    console.log('\n>>> HỎNG:', e.message);
    if (e.query) console.log('    câu lệnh:', String(e.query).slice(0, 500));
  } finally {
    if (ds && ds.isInitialized) await ds.destroy().catch(() => {});
    await xoaDbTam().catch(() => {});
    console.log(`Đã xóa database tạm "${TEMP_DB}".`);
    process.exit(hong ? 1 : 0);
  }
})();
