import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';
import { UserStatus } from '../../../domain/user.entity';

export class ListUsersRequest extends PaginationQuery {
  /** Mã vai trò RBAC (`roles.code`). Không ràng buộc enum để thêm vai trò mới không phải sửa API. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'Trạng thái tài khoản chỉ nhận ACTIVE, LOCKED hoặc PENDING.' })
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Mã đơn vị phải là UUID.' })
  organizationId?: string;
}
