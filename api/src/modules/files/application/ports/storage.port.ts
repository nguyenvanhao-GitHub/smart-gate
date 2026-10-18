import { Readable } from 'stream';

/**
 * Cổng kho lưu trữ tệp. Tầng nghiệp vụ **chỉ biết cổng này** — không biết phía sau là S3, MinIO,
 * ổ đĩa hay thứ gì khác. Đổi nhà cung cấp = thay implementation trong `infrastructure/storage/`,
 * không đụng use-case (rủi ro R8 của kế hoạch: tệp lưu trong container sẽ mất khi deploy lại).
 */
export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface PutObjectInput {
  /** Khoá do server sinh (`buildStorageKey`), không bao giờ lấy từ tên tệp của client. */
  key: string;
  content: Buffer;
  contentType: string;
  /** Checksum SHA-256 hex, lưu kèm để đối chiếu toàn vẹn khi cần. */
  checksum?: string;
}

export interface StoredObject {
  stream: Readable;
  contentType?: string;
  contentLength?: number;
}

export interface StoragePort {
  /**
   * Kho lưu trữ đã được cấu hình đủ chưa. Thiếu cấu hình thì API **vẫn khởi động bình thường**
   * (không chặn dev), use-case dựa vào cờ này để trả lỗi tiếng Việt thay vì lỗi kỹ thuật.
   */
  isConfigured(): boolean;
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
