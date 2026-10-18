import { IsDefined, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCatalogItemRequest {
  @IsString()
  @MinLength(1, { message: 'Mã danh mục không được để trống.' })
  @MaxLength(64, { message: 'Mã danh mục tối đa 64 ký tự.' })
  code!: string;

  @IsString()
  @MinLength(1, { message: 'Tên danh mục không được để trống.' })
  @MaxLength(200, { message: 'Tên danh mục tối đa 200 ký tự.' })
  name!: string;

  @IsDefined({ message: 'Vui lòng nhập thứ tự sắp xếp.' })
  @IsInt({ message: 'Thứ tự phải là số nguyên khác 0.' })
  @Min(1, { message: 'Thứ tự phải là số nguyên khác 0.' })
  sortOrder!: number;

  @IsOptional()
  @IsObject({ message: 'Thuộc tính mở rộng phải là đối tượng JSON.' })
  metadata?: Record<string, unknown>;
}
