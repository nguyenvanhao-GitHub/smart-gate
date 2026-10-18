import { AsyncLocalStorage } from 'async_hooks';

/** Dữ liệu đi kèm một request HTTP, dùng cho nhật ký kiểm toán (F05). */
export interface RequestContextStore {
  correlationId: string;
  ip?: string;
  actorId?: string;
  actorRole?: string;
  actorUsername?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Ngữ cảnh request lưu theo AsyncLocalStorage (module chuẩn của Node, không thêm phụ thuộc).
 * Nhờ vậy use-case ghi nhật ký không phải truyền correlationId/IP qua từng tham số.
 */
export const RequestContext = {
  run<T>(store: RequestContextStore, callback: () => T): T {
    return storage.run(store, callback);
  },

  current(): RequestContextStore | undefined {
    return storage.getStore();
  },

  /** Gắn actor sau khi guard xác thực xong token. */
  setActor(actorId?: string, actorRole?: string, actorUsername?: string): void {
    const store = storage.getStore();
    if (!store) return;
    store.actorId = actorId;
    store.actorRole = actorRole;
    store.actorUsername = actorUsername;
  },
};
