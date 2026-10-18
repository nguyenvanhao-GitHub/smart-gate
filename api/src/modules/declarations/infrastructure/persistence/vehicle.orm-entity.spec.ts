import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { VehicleOrmEntity } from './vehicle.orm-entity';

/**
 * **Đúng một phương tiện/hồ sơ** (CR8). Bảo đảm thật do chỉ mục **duy nhất** `uq_vehicles_dossier`
 * trên `dossier_id` ở tầng database (migration `VehicleSinglePerDossier1784076900000`) — không phải
 * kiểm-rồi-ghi trong code, nên phải khóa ngay ở khai báo ánh xạ ORM: nếu ai đó gỡ `{ unique: true }`
 * hoặc đổi cột, DB sẽ hết đảm bảo và test này đỏ trước khi lọt xuống migration.
 *
 * Đây là guard tầng-ánh-xạ, bổ trợ cho guard app-level `Declaration.setVehicles([a,b])` (giữ 1 xe)
 * đã có ở `declaration.entity.spec.ts`. Không chạm DB thật — chỉ đọc metadata decorator.
 */
describe('VehicleOrmEntity — khóa duy nhất một phương tiện/hồ sơ (CR8)', () => {
  it('khai chỉ mục DUY NHẤT `uq_vehicles_dossier` trên cột `dossier_id`', () => {
    const indices = getMetadataArgsStorage().indices.filter((index) => index.target === VehicleOrmEntity);
    const unique = indices.find((index) => index.name === 'uq_vehicles_dossier');

    expect(unique).toBeDefined();
    expect(unique?.unique).toBe(true);
    // @Index đặt ở mức cột nên TypeORM ghi thuộc tính `dossierId` vào danh sách cột của chỉ mục.
    expect(unique?.columns).toEqual(['dossierId']);
  });

  it('cột `dossier_id` là nơi gắn chỉ mục duy nhất (thuộc tính dossierId)', () => {
    const columns = getMetadataArgsStorage().columns.filter((column) => column.target === VehicleOrmEntity);
    const dossierColumn = columns.find((column) => column.propertyName === 'dossierId');

    expect(dossierColumn?.options.name).toBe('dossier_id');
  });
});
