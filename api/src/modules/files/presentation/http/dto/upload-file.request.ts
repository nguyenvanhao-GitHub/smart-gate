import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * Các trường đi kèm tệp trong request multipart. ValidationPipe bật `forbidNonWhitelisted` nên mọi
 * trường FE gửi lên đều phải khai ở đây, nếu không request bị từ chối 400.
 *
 * Bản thân tệp KHÔNG nằm trong DTO này — nó đến qua `@UploadedFile()` và được kiểm ở use-case
 * bằng nội dung thật (magic bytes), không kiểm bằng dữ liệu client khai.
 */
export class UploadFileRequest {
  /** Hồ sơ liên kết. Cho phép bỏ trống vì việc tách bảng hồ sơ làm ở lượt sau. */
  @IsOptional()
  @IsUUID('4', { message: 'Mã hồ sơ không đúng định dạng.' })
  dossierId?: string;

  /** Mã trong danh mục `DOCUMENT_TYPE`, ví dụ `CUSTOMS_DECLARATION`. */
  @IsOptional()
  @IsString({ message: 'Mã loại chứng từ phải là chuỗi ký tự.' })
  @MaxLength(64, { message: 'Mã loại chứng từ tối đa 64 ký tự.' })
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Mã loại chứng từ chỉ gồm chữ in hoa, số và dấu gạch dưới.',
  })
  documentTypeCode?: string;
}
