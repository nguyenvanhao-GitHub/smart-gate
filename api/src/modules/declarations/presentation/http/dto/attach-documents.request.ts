import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** Gắn các tệp đã tải lên qua `POST /files` vào hồ sơ. */
export class AttachDocumentsRequest {
  @IsArray()
  @ArrayNotEmpty({ message: 'Chưa chọn tệp nào để gắn vào hồ sơ.' })
  @ArrayMaxSize(50, { message: 'Mỗi lần chỉ gắn được tối đa 50 tệp.' })
  @IsUUID('4', { each: true, message: 'Mã tệp đính kèm không đúng định dạng.' })
  attachmentIds!: string[];
}
