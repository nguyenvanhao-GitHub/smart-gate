import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AssignmentType } from '../../../../access-control/domain/assignment-type.enum';

export class UserAssignmentRequest {
  @IsEnum(AssignmentType, { message: 'Loại phân công không hợp lệ.' })
  type!: AssignmentType;

  @IsString()
  @MaxLength(64, { message: 'Mã phân công tối đa 64 ký tự.' })
  code!: string;
}

export class ReplaceUserAssignmentsRequest {
  @IsArray({ message: 'Danh sách phân công phải là mảng.' })
  @ArrayMaxSize(50, { message: 'Một tài khoản chỉ gán tối đa 50 phạm vi làm việc.' })
  @ValidateNested({ each: true })
  @Type(() => UserAssignmentRequest)
  assignments!: UserAssignmentRequest[];
}
