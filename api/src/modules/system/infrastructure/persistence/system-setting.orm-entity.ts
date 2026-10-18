import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('system_settings')
export class SystemSettingOrmEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 64 })
  key!: string;

  @Column({ name: 'value', type: 'varchar', length: 255 })
  value!: string;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;
}
