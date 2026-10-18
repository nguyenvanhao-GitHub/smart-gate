import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateCatalogTypeRequest {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Tên nhóm danh mục không được để trống.' })
  @MaxLength(160, { message: 'Tên nhóm danh mục tối đa 160 ký tự.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Mô tả nhóm danh mục tối đa 2000 ký tự.' })
  description?: string;

  @IsOptional()
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự hiển thị không được âm.' })
  sortOrder?: number;
}
