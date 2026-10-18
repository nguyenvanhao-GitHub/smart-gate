import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSettingRepository } from '../../application/ports/system-setting.repository';
import { SystemSetting } from '../../domain/system-setting.entity';
import { SystemSettingMapper } from './system-setting.mapper';
import { SystemSettingOrmEntity } from './system-setting.orm-entity';

@Injectable()
export class TypeOrmSystemSettingRepository implements SystemSettingRepository {
  constructor(
    @InjectRepository(SystemSettingOrmEntity)
    private readonly repository: Repository<SystemSettingOrmEntity>,
  ) {}

  async findAll(): Promise<SystemSetting[]> {
    const rows = await this.repository.find();
    return rows.map((row) => SystemSettingMapper.toDomain(row));
  }

  async findByKey(key: string): Promise<SystemSetting | null> {
    const row = await this.repository.findOne({ where: { key } });
    return row ? SystemSettingMapper.toDomain(row) : null;
  }

  async save(setting: SystemSetting): Promise<SystemSetting> {
    const saved = await this.repository.save(SystemSettingMapper.toPersistence(setting));
    return SystemSettingMapper.toDomain(saved);
  }

  async ensureDefaults(defaults: { key: string; value: string }[]): Promise<void> {
    if (!defaults.length) return;
    // `ON CONFLICT DO NOTHING` trên khóa chính: chỉ chèn tham số còn thiếu, không đè giá trị quản trị
    // viên đã chỉnh. Idempotent — chạy mỗi lần khởi động vẫn an toàn.
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(SystemSettingOrmEntity)
      .values(defaults.map((item) => ({ key: item.key, value: item.value, updatedById: null })))
      .orIgnore()
      .execute();
  }
}
