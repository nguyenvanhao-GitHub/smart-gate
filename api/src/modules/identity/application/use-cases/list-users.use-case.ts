import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../common/http/pagination';
import { PublicUserDto } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly assembler: UserViewAssembler,
  ) {}

  async execute(criteria: UserSearchCriteria): Promise<PaginatedResult<PublicUserDto>> {
    const page = await this.users.findMany(criteria);
    return { ...page, items: await this.assembler.assembleMany(page.items) };
  }
}
