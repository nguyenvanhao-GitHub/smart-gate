import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateCatalogItemRequest {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Tên danh mục không được để trống.' })
  @MaxLength(200, { message: 'Tên danh mục tối đa 200 ký tự.' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Thứ tự phải là số nguyên khác 0.' })
  @Min(1, { message: 'Thứ tự phải là số nguyên khác 0.' })
  sortOrder?: number;

  @IsOptional()
  @IsObject({ message: 'Thuộc tính mở rộng phải là đối tượng JSON.' })
  metadata?: Record<string, unknown>;
}
