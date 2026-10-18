import { randomUUID } from 'crypto';
import { MessageKey, MessageParams } from '../../../common/i18n/message-catalog';
import { NotificationType } from './notification-type.enum';

/** Thông báo in-app gửi tới một người nhận cụ thể (F06 — mức Rút gọn). */
export class Notification {
  constructor(
    public readonly id: string,
    public readonly recipientId: string,
    public readonly type: NotificationType,
    public readonly title: string,
    public readonly content: string,
    public readonly dossierId: string | null,
    public readonly dossierCode: string | null,
    public readonly route: string | null,
    public readAt: Date | null,
    public readonly createdAt: Date,
    public readonly titleKey: MessageKey | null = null,
    public readonly titleParams: MessageParams | null = null,
    public readonly contentKey: MessageKey | null = null,
    public readonly contentParams: MessageParams | null = null,
  ) {}

  static create(input: {
    recipientId: string;
    type: NotificationType;
    title: string;
    content: string;
    dossierId?: string | null;
    dossierCode?: string | null;
    route?: string | null;
    titleKey?: MessageKey | null;
    titleParams?: MessageParams | null;
    contentKey?: MessageKey | null;
    contentParams?: MessageParams | null;
  }): Notification {
    return new Notification(
      randomUUID(),
      input.recipientId,
      input.type,
      input.title,
      input.content,
      input.dossierId ?? null,
      input.dossierCode ?? null,
      input.route ?? null,
      null,
      new Date(),
      input.titleKey ?? null,
      input.titleParams ?? null,
      input.contentKey ?? null,
      input.contentParams ?? null,
    );
  }

  markRead(at: Date = new Date()): void {
    if (!this.readAt) this.readAt = at;
  }
}
