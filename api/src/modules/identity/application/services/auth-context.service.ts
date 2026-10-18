import { Injectable } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { AuthTokenPayload } from './auth-token.service';

@Injectable()
export class AuthContextService {
  constructor(private readonly identity: IdentityService) {}

  optionalUser(authorization?: string): AuthTokenPayload | null {
    if (!authorization) return null;
    return this.identity.verifyTokenFromHeader(authorization);
  }

  requireUser(authorization?: string): AuthTokenPayload {
    return this.identity.verifyTokenFromHeader(authorization);
  }
}
