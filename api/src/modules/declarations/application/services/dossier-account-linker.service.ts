import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, UserRepository } from '../../../identity/application/ports/user.repository';

export interface DossierIdentityInput {
  accountType?: string | null;
  taxCode?: string | null;
  idNumber?: string | null;
  username?: string | null;
  email?: string | null;
}

@Injectable()
export class DossierAccountLinkerService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  /**
   * Xác định ID tài khoản tương ứng theo quy tắc:
   * 1. Nếu có `accountType`: Tra cứu đúng định danh của loại tài khoản đó.
   *    - Cá nhân (INDIVIDUAL): Tra cứu theo idNumber hoặc taxCode dạng CCCD.
   *    - Doanh nghiệp (ENTERPRISE): Tra cứu theo taxCode.
   *    - Nội bộ (INTERNAL): Tra cứu theo email.
   * 2. Nếu không có `accountType`: Tra cứu fallback theo thứ tự:
   *    taxCode -> idNumber -> email -> username (đồng bộ với lookup-user).
   */
  async resolveAccountId(input: DossierIdentityInput): Promise<string | null> {
    const rawType = input.accountType?.trim().toUpperCase();

    // 1. Phân nhánh rõ ràng theo accountType nếu có
    if (rawType === 'INDIVIDUAL') {
      const idNumber = input.idNumber?.trim();
      if (idNumber) {
        const byIdNumber = await this.users.findByIdNumber(idNumber);
        if (byIdNumber) return byIdNumber.id;
      }
      const taxCode = input.taxCode?.trim();
      if (taxCode) {
        const byTaxCode = await this.users.findByIdNumber(taxCode);
        if (byTaxCode) return byTaxCode.id;
      }
      return null;
    }

    if (rawType === 'ENTERPRISE') {
      const taxCode = input.taxCode?.trim();
      if (taxCode) {
        const byTaxCode = await this.users.findByTaxCode(taxCode);
        if (byTaxCode) return byTaxCode.id;
      }
      const idNumber = input.idNumber?.trim();
      if (idNumber) {
        const byIdNumber = await this.users.findByTaxCode(idNumber);
        if (byIdNumber) return byIdNumber.id;
      }
      return null;
    }

    if (rawType === 'INTERNAL') {
      const email = input.email?.trim();
      if (email) {
        const byEmail = await this.users.findByEmail(email);
        if (byEmail) return byEmail.id;
      }
      return null;
    }

    // 2. Fallback khi không xác định được accountType (ưu tiên taxCode/idNumber trước email)
    const taxCode = input.taxCode?.trim();
    if (taxCode) {
      const byTaxCode = await this.users.findByTaxCode(taxCode);
      if (byTaxCode) return byTaxCode.id;

      const byIdNumber = await this.users.findByIdNumber(taxCode);
      if (byIdNumber) return byIdNumber.id;
    }

    const idNumber = input.idNumber?.trim();
    if (idNumber) {
      const byIdNumber = await this.users.findByIdNumber(idNumber);
      if (byIdNumber) return byIdNumber.id;
    }

    const email = input.email?.trim();
    if (email) {
      const byEmail = await this.users.findByEmail(email);
      if (byEmail) return byEmail.id;
    }

    const username = input.username?.trim();
    if (username) {
      const byUsername = await this.users.findByUsername(username);
      if (byUsername) return byUsername.id;
    }

    return null;
  }
}
