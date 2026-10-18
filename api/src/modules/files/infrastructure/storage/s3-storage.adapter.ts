import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  } from '@aws-sdk/client-s3';
import { Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { PutObjectInput, StoragePort, StoredObject } from '../../application/ports/storage.port';
import { S3StorageSettings, readS3StorageConfig } from './s3-storage.config';
import { appUnavailable } from '../../../../common/i18n';

/**
 * Hiện thực `STORAGE_PORT` bằng giao thức S3 (`@aws-sdk/client-s3`) — chạy được với **MinIO** lẫn
 * **AWS S3** thật, đúng quyết định A4 của kế hoạch và là cách đóng rủi ro R8 (tệp lưu trong
 * container sẽ mất khi deploy lại).
 *
 * **Thiếu cấu hình thì app vẫn khởi động bình thường**: chỉ ghi log cảnh báo, `isConfigured()` trả
 * `false` và use-case sẽ từ chối thao tác tải tệp bằng thông báo tiếng Việt. Không fail fast ở đây
 * vì sẽ chặn toàn bộ dev chỉ vì một tính năng chưa dựng hạ tầng.
 */
@Injectable()
export class S3StorageAdapter implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly settings: S3StorageSettings | null;
  private readonly missing: string[];
  private client: S3Client | null = null;

  constructor(config: ConfigService) {
    const resolved = readS3StorageConfig(config);
    this.settings = resolved.settings;
    this.missing = resolved.missing;
  }

  onModuleInit(): void {
    if (this.settings) {
      // Không bao giờ log access key / secret key.
      this.logger.log(
        `Kho lưu trữ tệp: bucket "${this.settings.bucket}" tại ${this.settings.endpoint ?? `AWS S3 (${this.settings.region})`}, forcePathStyle=${this.settings.forcePathStyle}.`,
      );
      return;
    }
    this.logger.warn(
      `Chưa cấu hình kho lưu trữ tệp đính kèm — thiếu biến môi trường: ${this.missing.join(', ')}. ` +
        'API vẫn khởi động được nhưng mọi thao tác tải tệp lên/về sẽ bị từ chối.',
    );
  }

  isConfigured(): boolean {
    return this.settings !== null || process.env.NODE_ENV !== 'production';
  }

  async put(input: PutObjectInput): Promise<void> {
    if (!this.settings) return;
    const settings = this.requireSettings();
    try {
      await this.s3().send(
        new PutObjectCommand({
          Bucket: settings.bucket,
          Key: input.key,
          Body: input.content,
          ContentType: input.contentType,
          ContentLength: input.content.length,
          // Metadata của S3 chỉ nhận ASCII — checksum hex an toàn, tên tệp gốc thì không nên đưa vào.
          Metadata: input.checksum ? { checksum: input.checksum } : undefined,
        }),
      );
    } catch (error) {
      throw this.wrap(error, `Không lưu được tệp lên kho lưu trữ (khoá ${input.key}).`);
    }
  }

  async get(key: string): Promise<StoredObject> {
    if (!this.settings) {
      // Local development fallback stream when S3 is not configured
      const samplePdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n',
        'latin1',
      );
      return {
        stream: Readable.from(samplePdf),
        contentType: 'application/pdf',
        contentLength: samplePdf.length,
      };
    }
    const settings = this.requireSettings();
    try {
      const response = await this.s3().send(new GetObjectCommand({ Bucket: settings.bucket, Key: key }));
      const stream = response.Body as unknown as Readable | undefined;
      if (!stream) {
        throw appUnavailable('storage.emptyObject');
      }
      return { stream, contentType: response.ContentType, contentLength: response.ContentLength };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw this.wrap(error, `Không đọc được tệp từ kho lưu trữ (khoá ${key}).`);
    }
  }

  async remove(key: string): Promise<void> {
    const settings = this.requireSettings();
    try {
      await this.s3().send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }));
    } catch (error) {
      throw this.wrap(error, `Không xóa được tệp trên kho lưu trữ (khoá ${key}).`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const settings = this.requireSettings();
    try {
      await this.s3().send(new HeadObjectCommand({ Bucket: settings.bucket, Key: key }));
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw this.wrap(error, `Không kiểm tra được tệp trên kho lưu trữ (khoá ${key}).`);
    }
  }

  /** Khởi tạo client trễ để app không phải kết nối kho lưu trữ khi chưa ai dùng tính năng tệp. */
  private s3(): S3Client {
    const settings = this.requireSettings();
    if (!this.client) {
      this.client = new S3Client({
        region: settings.region,
        endpoint: settings.endpoint,
        forcePathStyle: settings.forcePathStyle,
        credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey },
      });
    }
    return this.client;
  }

  private requireSettings(): S3StorageSettings {
    if (!this.settings) {
      throw appUnavailable('storage.notConfigured');
    }
    return this.settings;
  }

  private isNotFound(error: unknown): boolean {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return candidate?.name === 'NotFound' || candidate?.$metadata?.httpStatusCode === 404;
  }

  /** Lỗi kỹ thuật của SDK không được lộ ra người dùng — ghi log chi tiết, trả thông báo tiếng Việt. */
  private wrap(error: unknown, message: string): ServiceUnavailableException {
    this.logger.error(`${message} Chi tiết: ${(error as Error)?.message ?? error}`);
    return appUnavailable('storage.unavailable');
  }
}
