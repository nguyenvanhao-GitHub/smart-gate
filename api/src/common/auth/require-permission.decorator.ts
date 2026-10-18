import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';
export const AUTHENTICATED_ONLY_KEY = 'authenticatedOnly';

/**
 * Khai báo quyền cần có để gọi endpoint, ví dụ `@RequirePermission('dossier.approve')`.
 * Truyền nhiều mã thì áp dụng phép HOẶC — có một mã là đủ.
 */
export const RequirePermission = (...permissions: string[]): CustomDecorator<string> =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissions);

/**
 * Endpoint chỉ cần đăng nhập hợp lệ, không ràng buộc quyền cụ thể
 * (hồ sơ cá nhân, menu của chính người dùng…).
 */
export const AuthenticatedOnly = (): CustomDecorator<string> => SetMetadata(AUTHENTICATED_ONLY_KEY, true);
