import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { AccountType, UserStatus } from '../../domain/user.entity';

@Entity('users')
export class UserOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  username!: string;

  @Column({ length: 128 })
  passwordHash!: string;

  @Column({ length: 160 })
  displayName!: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ name: 'email', type: 'varchar', length: 160, nullable: true })
  email!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ length: 160 })
  defaultRoute!: string;

  @Index()
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  // varchar (không phải enum PG): thêm trạng thái mới là dữ liệu, không phải kiểu — xem
  // migration UserStatusToVarchar. Cùng lối với `declarations.status`.
  @Index()
  @Column({ type: 'varchar', length: 32, default: UserStatus.ACTIVE })
  status!: UserStatus;

  // Loại tài khoản tự đăng ký (F00): varchar tập đóng ENTERPRISE/INDIVIDUAL; tài khoản admin tạo là null.
  @Column({ name: 'account_type', type: 'varchar', length: 16, nullable: true })
  accountType!: AccountType | null;

  @Column({ name: 'tax_code', type: 'varchar', length: 32, nullable: true })
  taxCode!: string | null;

  @Column({ name: 'id_number', type: 'varchar', length: 32, nullable: true })
  idNumber!: string | null;

  @Column({ name: 'address', type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ name: 'representative_name', type: 'varchar', length: 160, nullable: true })
  representativeName!: string | null;

  @Column({ name: 'lock_reason', type: 'varchar', length: 255, nullable: true })
  lockReason!: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'is_protected', type: 'boolean', default: false })
  isProtected!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
