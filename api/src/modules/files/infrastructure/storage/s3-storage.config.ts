import { ConfigService } from '@nestjs/config';

/**
 * Cấu hình kho lưu trữ chuẩn S3. Dùng được cho **cả MinIO lẫn AWS S3 thật** — đổi giữa hai bên
 * chỉ cần đổi `STORAGE_S3_ENDPOINT` và `STORAGE_S3_FORCE_PATH_STYLE`.
 *
 * Khoá truy cập **không được đặt trong `api/.env*`** (các tệp này đã bị commit vào repo);
 * `.env.example` chỉ khai tên biến với giá trị rỗng, khoá thật cấp qua biến CI/CD.
 */
export interface S3StorageSettings {
  /** Bỏ trống = dùng endpoint mặc định của AWS theo region. MinIO thì bắt buộc khai. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** MinIO bắt buộc `true` (bucket nằm trong đường dẫn); AWS S3 thật đặt `false`. */
  forcePathStyle: boolean;
}

export interface S3StorageConfigResult {
  settings: S3StorageSettings | null;
  /** Tên các biến môi trường còn thiếu — dùng cho log cảnh báo lúc khởi động. */
  missing: string[];
}

const REQUIRED_KEYS = ['STORAGE_S3_BUCKET', 'STORAGE_S3_ACCESS_KEY', 'STORAGE_S3_SECRET_KEY'] as const;

function readTrimmed(config: ConfigService, key: string): string {
  return (config.get<string>(key) ?? '').trim();
}

export function readS3StorageConfig(config: ConfigService): S3StorageConfigResult {
  const missing = REQUIRED_KEYS.filter((key) => !readTrimmed(config, key));
  if (missing.length > 0) return { settings: null, missing: [...missing] };

  const endpoint = readTrimmed(config, 'STORAGE_S3_ENDPOINT');
  return {
    settings: {
      endpoint: endpoint || undefined,
      region: readTrimmed(config, 'STORAGE_S3_REGION') || 'us-east-1',
      bucket: readTrimmed(config, 'STORAGE_S3_BUCKET'),
      accessKey: readTrimmed(config, 'STORAGE_S3_ACCESS_KEY'),
      secretKey: readTrimmed(config, 'STORAGE_S3_SECRET_KEY'),
      // Mặc định `true` vì môi trường dev/pilot dùng MinIO; AWS S3 thật phải đặt tường minh `false`.
      forcePathStyle: readTrimmed(config, 'STORAGE_S3_FORCE_PATH_STYLE') !== 'false',
    },
    missing: [],
  };
}
