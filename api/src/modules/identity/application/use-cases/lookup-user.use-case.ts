import { Inject, Injectable } from '@nestjs/common';
import { LookupUserDto, toLookupUserDto } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';

export interface LookupUserQuery {
  taxCode?: string;
  idNumber?: string;
  email?: string;
  accountType?: string;
}

@Injectable()
export class LookupUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly assembler: UserViewAssembler,
  ) {}

  async execute(query: LookupUserQuery): Promise<LookupUserDto | null> {
    const rawType = query.accountType?.trim().toUpperCase();

    // 1. Phân nhánh theo accountType nếu có (đồng bộ với DossierAccountLinkerService)
    if (rawType === 'INDIVIDUAL') {
      const idNumber = query.idNumber?.trim();
      if (idNumber) {
        const user = await this.users.findByIdNumber(idNumber);
        if (user) return toLookupUserDto(await this.assembler.assemble(user));
      }
      const taxCode = query.taxCode?.trim();
      if (taxCode) {
        const user = await this.users.findByIdNumber(taxCode);
        if (user) return toLookupUserDto(await this.assembler.assemble(user));
      }
      return null;
    }

    if (rawType === 'ENTERPRISE') {
      const taxCode = query.taxCode?.trim();
      if (taxCode) {
        const user = await this.users.findByTaxCode(taxCode);
        if (user) return toLookupUserDto(await this.assembler.assemble(user));
      }
      const idNumber = query.idNumber?.trim();
      if (idNumber) {
        const user = await this.users.findByTaxCode(idNumber);
        if (user) return toLookupUserDto(await this.assembler.assemble(user));
      }
      return null;
    }

    if (rawType === 'INTERNAL') {
      const email = query.email?.trim();
      if (email) {
        const user = await this.users.findByEmail(email);
        if (user) return toLookupUserDto(await this.assembler.assemble(user));
      }
      return null;
    }

    // 2. Fallback khi không truyền accountType: tra cứu theo taxCode -> idNumber -> email
    const taxCode = query.taxCode?.trim();
    if (taxCode) {
      const user = await this.users.findByTaxCode(taxCode);
      if (user) return toLookupUserDto(await this.assembler.assemble(user));

      const byIdNumber = await this.users.findByIdNumber(taxCode);
      if (byIdNumber) return toLookupUserDto(await this.assembler.assemble(byIdNumber));
    }

    const idNumber = query.idNumber?.trim();
    if (idNumber) {
      const user = await this.users.findByIdNumber(idNumber);
      if (user) return toLookupUserDto(await this.assembler.assemble(user));
    }

    const email = query.email?.trim();
    if (email) {
      const user = await this.users.findByEmail(email);
      if (user) return toLookupUserDto(await this.assembler.assemble(user));
    }

    return null;
  }
}
