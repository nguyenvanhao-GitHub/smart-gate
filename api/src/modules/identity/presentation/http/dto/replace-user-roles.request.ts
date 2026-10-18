import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsString, ValidateNested } from 'class-validator';
import { DataScopeLevel } from '../../../../access-control/domain/data-scope.enum';

export class UserRoleGrantRequest {
  @IsString()
  roleCode!: string;

  @IsEnum(DataScopeLevel, { message: 'Phạm vi dữ liệu chỉ nhận ALL, ORGANIZATION, OWN hoặc ASSIGNMENT.' })
  dataScope!: DataScopeLevel;
}

export class ReplaceUserRolesRequest {
  @IsArray({ message: 'Danh sách vai trò phải là mảng.' })
  @ArrayMaxSize(20, { message: 'Một tài khoản chỉ gán tối đa 20 vai trò.' })
  @ValidateNested({ each: true })
  @Type(() => UserRoleGrantRequest)
  roles!: UserRoleGrantRequest[];
}
