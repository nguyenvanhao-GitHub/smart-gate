import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class ReplaceRolePermissionsRequest {
  @IsArray({ message: 'Danh sách quyền phải là mảng mã quyền.' })
  @ArrayUnique({ message: 'Danh sách quyền không được trùng mã.' })
  @IsString({ each: true, message: 'Mã quyền phải là chuỗi.' })
  permissions!: string[];
}
