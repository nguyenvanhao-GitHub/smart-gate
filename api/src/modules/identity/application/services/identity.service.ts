import { MailerService } from '@nestjs-modules/mailer';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { UserStatus } from '../../domain/user.entity';
import { PublicUserDto } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { AuthTokenPayload, AuthTokenService } from './auth-token.service';
import { PasswordService } from './password.service';
import { UserViewAssembler } from './user-view.assembler';
import { appUnauthorized } from '../../../../common/i18n';

export type { PublicUserDto } from '../dto/public-user.dto';

/** Dịch vụ xác thực. Quản trị người dùng đã tách sang các use-case trong `application/use-cases`. */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokenService,
    private readonly assembler: UserViewAssembler,
    private readonly mailer: MailerService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async login(identifier: string, password: string) {
    const trimmed = (identifier || '').trim();
    const user =
      (await this.users.findByUsername(trimmed.toLowerCase())) ||
      (await this.users.findByEmail(trimmed));
    const check = user
      ? this.passwords.verifyDetailed(password, user.passwordHash)
      : { valid: false, needsRehash: false };
    if (!user || !check.valid) {
      await this.audit.record({
        action: 'AUTH_LOGIN',
        targetType: 'USER',
        targetId: user?.id,
        result: AuditResult.FAILURE,
        actorId: user?.id,
        actorUsername: identifier,
        after: { reason: 'Sai tài khoản hoặc mật khẩu' },
      });
      throw appUnauthorized('auth.invalidCredentials');
    }
    if (user.status !== UserStatus.ACTIVE) {
      // Tách thông báo: chờ duyệt (F00) khác với bị khóa (F03) — người dùng cần biết đúng lý do.
      const pending = user.status === UserStatus.PENDING;
      await this.audit.record({
        action: 'AUTH_LOGIN',
        targetType: 'USER',
        targetId: user.id,
        result: AuditResult.FAILURE,
        actorId: user.id,
        actorUsername: user.username,
        after: pending
          ? { reason: 'Tài khoản đang chờ duyệt' }
          : { reason: 'Tài khoản đang bị khóa', lockReason: user.lockReason },
      });
      throw appUnauthorized(pending ? 'auth.accountPending' : 'auth.accountLocked');
    }

    // Nâng cấp dần hash cũ (SHA-256) sang scrypt ngay khi người dùng đăng nhập thành công.
    if (check.needsRehash) user.changePassword(this.passwords.hash(password));
    user.recordLogin();
    const loggedIn = await this.users.save(user);

    // Nạp vai trò RBAC (nguồn sự thật) để nhồi vào token — dùng cho ảnh chụp kiểm toán, không dùng
    // để phân quyền (quyền vẫn được nạp lại từ DB mỗi request qua PermissionsGuard).
    const view = await this.assembler.assemble(loggedIn);
    const roles = view.roles.map((role) => role.code);

    const token = this.tokens.sign({ sub: user.id, username: user.username, roles });
    const refreshToken = this.tokens.signRefreshToken({ sub: user.id, username: user.username });
    await this.audit.record({
      action: 'AUTH_LOGIN',
      targetType: 'USER',
      targetId: user.id,
      actorId: user.id,
      actorUsername: user.username,
      actorRole: roles.join('+'),
      after: { username: user.username, displayName: user.displayName },
    });
    return {
      ...token,
      refreshToken: refreshToken.refreshToken,
      refreshExpiresIn: refreshToken.expiresIn,
      user: view,
    };
  }

  async refresh(refreshToken: string) {
    const payload = this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw appUnauthorized('auth.accountNotFound');
    }
    if (user.status !== UserStatus.ACTIVE) {
      const pending = user.status === UserStatus.PENDING;
      await this.audit.record({
        action: 'AUTH_REFRESH',
        targetType: 'USER',
        targetId: user.id,
        result: AuditResult.FAILURE,
        actorId: user.id,
        actorUsername: user.username,
        after: pending
          ? { reason: 'Tài khoản đang chờ duyệt' }
          : { reason: 'Tài khoản đang bị khóa', lockReason: user.lockReason },
      });
      throw appUnauthorized(pending ? 'auth.accountPending' : 'auth.accountLocked');
    }

    const view = await this.assembler.assemble(user);
    const roles = view.roles.map((role) => role.code);

    const token = this.tokens.sign({ sub: user.id, username: user.username, roles });
    const newRefreshToken = this.tokens.signRefreshToken({ sub: user.id, username: user.username });

    await this.audit.record({
      action: 'AUTH_REFRESH',
      targetType: 'USER',
      targetId: user.id,
      actorId: user.id,
      actorUsername: user.username,
      actorRole: roles.join('+'),
      after: { username: user.username, displayName: user.displayName },
    });

    return {
      ...token,
      refreshToken: newRefreshToken.refreshToken,
      refreshExpiresIn: newRefreshToken.expiresIn,
      user: view,
    };
  }

  async me(tokenPayload: AuthTokenPayload): Promise<PublicUserDto> {
    const user = await this.users.findById(tokenPayload.sub);
    if (!user) throw appUnauthorized('auth.accountNotFound');
    return this.assembler.assemble(user);
  }

  verifyTokenFromHeader(authorization?: string): AuthTokenPayload {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw appUnauthorized('auth.missingToken');
    return this.tokens.verify(token);
  }

  async sendForgotPasswordEmail(email: string): Promise<{ success: boolean; message: string }> {
    const trimmed = (email || '').trim();
    const user =
      (await this.users.findByEmail(trimmed)) ||
      (await this.users.findByUsername(trimmed.toLowerCase()));

    const newPassword = 'SmartGate@' + Math.floor(1000 + Math.random() * 9000);
    if (user) {
      if (!user.email) user.email = trimmed;
      user.changePassword(this.passwords.hash(newPassword));
      await this.users.save(user);
    }

    try {
      await this.mailer.sendMail({
        to: trimmed,
        subject: '[Cửa khẩu thông minh] Cấp lại mật khẩu tài khoản',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #0b3c5d;">Hệ thống Cửa khẩu thông minh</h2>
            <p>Xin chào <strong>${user ? user.username : trimmed}</strong>,</p>
            <p>Hệ thống nhận được yêu cầu cấp lại mật khẩu cho tài khoản liên kết với email này.</p>
            <div style="background: #f4f6f9; padding: 15px; border-left: 4px solid #0b3c5d; margin: 15px 0;">
              <p style="margin: 0;">Mật khẩu mới của bạn là: <strong style="font-size: 18px; color: #d93025;">${newPassword}</strong></p>
            </div>
            <p>Vui lòng sử dụng mật khẩu trên để đăng nhập và tiến hành đổi lại mật khẩu ngay trong trang Hồ sơ cá nhân.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #777;">Email này được gửi tự động từ Hệ thống Cửa khẩu thông minh.</p>
          </div>
        `,
      });
    } catch (err) {
      // Ignore mailer failure gracefully if SMTP offline
      console.error('Failed to dispatch email via MailerService:', err);
    }

    return { success: true, message: 'Mật khẩu mới đã được gửi về email của bạn.' };
  }
}
