import { DirectoryUser, UserDirectory } from '../../../access-control/application/ports/user-directory.repository';
import { Notification } from '../../domain/notification.entity';
import { NotificationType } from '../../domain/notification-type.enum';
import { NotificationRepository, NotificationSearchCriteria } from '../ports/notification.repository';
import { NotificationPublisherService } from './notification-publisher.service';

class FakeNotificationRepository implements NotificationRepository {
  readonly notifications: Notification[] = [];

  async saveMany(notifications: Notification[]): Promise<void> {
    this.notifications.push(...notifications);
  }

  async findMany(_criteria: NotificationSearchCriteria) {
    return { items: this.notifications, total: this.notifications.length, page: 1, pageSize: 20 };
  }

  async findById(id: string): Promise<Notification | null> {
    return this.notifications.find((n) => n.id === id) ?? null;
  }

  async save(notification: Notification): Promise<void> {
    const index = this.notifications.findIndex((n) => n.id === notification.id);
    if (index >= 0) this.notifications[index] = notification;
    else this.notifications.push(notification);
  }

  async countUnread(_recipientId: string): Promise<number> {
    return this.notifications.filter((n) => !n.readAt).length;
  }

  async markAllRead(_recipientId: string, _at: Date): Promise<number> {
    return 0;
  }
}

class FakeUserDirectory implements UserDirectory {
  readonly roleAssignments = new Map<string, string[]>();
  readonly taxCodeAssignments = new Map<string, string[]>();
  readonly stepAssignments = new Map<string, string[]>();

  async findById(_userId: string): Promise<DirectoryUser | null> {
    return null;
  }

  async findAll(): Promise<DirectoryUser[]> {
    return [];
  }

  async setOrganization(_userId: string, _organizationId: string): Promise<void> {}

  async findIdsByTaxCode(taxCode: string): Promise<string[]> {
    return this.taxCodeAssignments.get(taxCode) ?? [];
  }

  async findIdsByRoleCode(roleCode: string): Promise<string[]> {
    return this.roleAssignments.get(roleCode) ?? [];
  }

  async findIdsByRoleCodes(roleCodes: string[]): Promise<string[]> {
    const res = new Set<string>();
    for (const code of roleCodes) {
      for (const id of this.roleAssignments.get(code) ?? []) res.add(id);
    }
    return [...res];
  }

  async findIdsByStepCode(stepCode: string): Promise<string[]> {
    return this.stepAssignments.get(stepCode) ?? [];
  }
}

describe('NotificationPublisherService', () => {
  let notifs: FakeNotificationRepository;
  let users: FakeUserDirectory;
  let service: NotificationPublisherService;

  beforeEach(() => {
    notifs = new FakeNotificationRepository();
    users = new FakeUserDirectory();
    service = new NotificationPublisherService(notifs, users);
  });

  it('gửi thông báo USER_REGISTERED tới tất cả các tài khoản quản trị hệ thống', async () => {
    users.roleAssignments.set('SYS_ADMIN', ['admin-1', 'admin-2']);

    await service.publish({
      type: NotificationType.USER_REGISTERED,
      title: 'Tài khoản mới chờ phê duyệt',
      content: 'Tài khoản congty.abc vừa được đăng ký và đang ở trạng thái Chờ duyệt. Vui lòng kiểm tra và thực hiện phê duyệt.',
      route: '/admin/users',
    });

    expect(notifs.notifications).toHaveLength(2);
    expect(notifs.notifications.map((n) => n.recipientId)).toEqual(['admin-1', 'admin-2']);
    expect(notifs.notifications[0].title).toBe('Tài khoản mới chờ phê duyệt');
    expect(notifs.notifications[0].content).toContain('Tài khoản congty.abc vừa được đăng ký');
    expect(notifs.notifications[0].route).toBe('/admin/users');
  });

  it('gửi thông báo có chỉ định người nhận cụ thể', async () => {
    await service.publish({
      type: NotificationType.SYSTEM,
      title: 'Bảo trì hệ thống',
      content: 'Hệ thống sẽ bảo trì vào 22h.',
      recipientIds: ['user-100'],
    });

    expect(notifs.notifications).toHaveLength(1);
    expect(notifs.notifications[0].recipientId).toBe('user-100');
  });

  it('gửi thông báo tới các vai trò được chỉ định qua recipientRoleCodes', async () => {
    users.roleAssignments.set('BORDER_GUARD', ['bp-1', 'bp-2']);
    users.roleAssignments.set('CUSTOMS', ['hq-1']);

    await service.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      title: 'Xe (29C-123.45) vào kiểm tra',
      content: 'Phương tiện 29C-123.45 đã được gọi vào khu vực kiểm tra nghiệp vụ.',
      recipientRoleCodes: ['BORDER_GUARD', 'CUSTOMS'],
    });

    expect(notifs.notifications).toHaveLength(3);
    const recipients = notifs.notifications.map((n) => n.recipientId);
    expect(recipients).toContain('bp-1');
    expect(recipients).toContain('bp-2');
    expect(recipients).toContain('hq-1');
    expect(notifs.notifications[0].title).toBe('Xe (29C-123.45) vào kiểm tra');
  });

  it('gửi thông báo đến tài khoản phụ trách khi hồ sơ đến lượt xử lý tại bước quy trình', async () => {
    users.stepAssignments.set('EXPORT_CUSTOMS', ['user-customs-1', 'user-customs-2']);

    await service.publish({
      type: NotificationType.DOSSIER_TURN_PROCESSING,
      title: 'Hồ sơ HS-001 đến lượt xử lý',
      content: 'Hồ sơ HS-001 đã được chuyển đến bước Hải quan kiểm tra nghiệp vụ.',
      dossierId: 'd-1',
      dossierCode: 'HS-001',
      stepCodes: ['EXPORT_CUSTOMS'],
    });

    expect(notifs.notifications).toHaveLength(2);
    expect(notifs.notifications.map((n) => n.recipientId)).toEqual(['user-customs-1', 'user-customs-2']);
    expect(notifs.notifications[0].type).toBe(NotificationType.DOSSIER_TURN_PROCESSING);
    expect(notifs.notifications[0].title).toBe('Hồ sơ HS-001 đến lượt xử lý');
  });

  it('gửi thông báo đến cả chủ hồ sơ và tài khoản phụ trách bước tiếp theo', async () => {
    users.stepAssignments.set('EXPORT_BORDER', ['officer-guard-1']);

    await service.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      title: 'Hồ sơ HS-002 chuyển bước',
      content: 'Hồ sơ chuyển sang bước tiếp theo.',
      dossierId: 'd-2',
      dossierCode: 'HS-002',
      ownerUserId: 'owner-1',
      stepCodes: ['EXPORT_BORDER'],
    });

    expect(notifs.notifications).toHaveLength(2);
    expect(notifs.notifications.map((n) => n.recipientId)).toEqual(['owner-1', 'officer-guard-1']);
  });

  it('gửi thông báo với titleKey và contentKey tự động dịch ra tiếng Việt mặc định và lưu tham số i18n', async () => {
    await service.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      titleKey: 'notification.dossierCancelledTitle',
      titleParams: { code: 'IMP-9999' },
      contentKey: 'notification.dossierCancelledContent',
      contentParams: { note: 'Doanh nghiệp xin rút hồ sơ' },
      recipientIds: ['owner-1'],
    });

    expect(notifs.notifications).toHaveLength(1);
    const n = notifs.notifications[0];
    expect(n.titleKey).toBe('notification.dossierCancelledTitle');
    expect(n.titleParams).toEqual({ code: 'IMP-9999' });
    expect(n.title).toBe('Hồ sơ IMP-9999 đã bị hủy');
    expect(n.contentKey).toBe('notification.dossierCancelledContent');
    expect(n.contentParams).toEqual({ note: 'Doanh nghiệp xin rút hồ sơ' });
    expect(n.content).toBe('Doanh nghiệp xin rút hồ sơ');
  });

  it('loại trừ tài khoản người thao tác (excludeActorId) khỏi danh sách người nhận thông báo', async () => {
    users.roleAssignments.set('BORDER_GUARD', ['bp-1', 'bp-2']);

    await service.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      title: 'Xe (29C-123.45) đã vào',
      content: 'Xe 29C-123.45 đã vào cổng.',
      recipientRoleCodes: ['BORDER_GUARD'],
      excludeActorId: 'bp-1',
    });

    expect(notifs.notifications).toHaveLength(1);
    expect(notifs.notifications[0].recipientId).toBe('bp-2');
  });
});
