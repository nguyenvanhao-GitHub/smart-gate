import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { MessageKey, MessageParams } from '../../../../common/i18n/message-catalog';
import { NotificationType } from '../../domain/notification-type.enum';

@Entity('notifications')
// Truy vấn nóng nhất của F06: đếm/lọc thông báo chưa đọc của một người nhận.
@Index('IDX_notifications_recipient_read', ['recipientId', 'readAt'])
export class NotificationOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Index()
  @Column({ name: 'type', length: 48 })
  type!: NotificationType;

  @Column({ name: 'title', length: 200 })
  title!: string;

  @Column({ name: 'content', type: 'text' })
  content!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid', nullable: true })
  dossierId!: string | null;

  @Column({ name: 'dossier_code', type: 'varchar', length: 32, nullable: true })
  dossierCode!: string | null;

  @Column({ name: 'route', type: 'varchar', length: 200, nullable: true })
  route!: string | null;

  @Column({ name: 'title_key', type: 'varchar', length: 100, nullable: true })
  titleKey!: MessageKey | null;

  @Column({ name: 'title_params', type: 'jsonb', nullable: true })
  titleParams!: MessageParams | null;

  @Column({ name: 'content_key', type: 'varchar', length: 100, nullable: true })
  contentKey!: MessageKey | null;

  @Column({ name: 'content_params', type: 'jsonb', nullable: true })
  contentParams!: MessageParams | null;

  @Index()
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
