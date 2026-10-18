import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { GetYardDetailUseCase } from '../../application/use-cases/get-yard-detail.use-case';
import { ListYardsUseCase } from '../../application/use-cases/list-yards.use-case';
import { ReleaseYardSlotUseCase } from '../../application/use-cases/release-yard-slot.use-case';
import { SetYardSlotLockUseCase } from '../../application/use-cases/set-yard-slot-lock.use-case';
import { appBadRequest } from '../../../../common/i18n';

const YARD_ID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () => appBadRequest('yard.idInvalid'),
});

@ApiBearerAuth()
@ApiTags('Yards')
@Controller('yards')
export class YardsController {
  constructor(
    private readonly listYards: ListYardsUseCase,
    private readonly yardDetail: GetYardDetailUseCase,
    private readonly releaseSlot: ReleaseYardSlotUseCase,
    private readonly slotLock: SetYardSlotLockUseCase,
  ) {}

  // Các endpoint đọc dưới đây nhận cả quyền hành động trên sơ đồ bãi: sau khi giải phóng/khoá/mở ô
  // (`yard.update`) hay gán/chuyển/bỏ vị trí trên sơ đồ (`dispatch.*`), màn Sơ đồ bãi tải lại danh
  // sách/chi tiết khu ngay (`refresh`). Ai được thao tác bãi thì phải đọc lại được sơ đồ vừa tác động.
  @RequirePermission('yard.view', 'yard.update', 'dispatch.create', 'dispatch.update', 'dispatch.delete')
  @Get()
  list() {
    return this.listYards.execute();
  }

  /** Sơ đồ ô đỗ của một khu (UI-10). */
  @RequirePermission('yard.view', 'yard.update', 'dispatch.create', 'dispatch.update', 'dispatch.delete')
  @Get(':id')
  detail(@Param('id', YARD_ID_PIPE) id: string) {
    return this.yardDetail.execute(id);
  }

  /** Giải phóng ô đỗ khi xe rời bãi (F44). Trả về sơ đồ khu sau khi giải phóng. */
  @RequirePermission('yard.update')
  @Post(':id/slots/:slotCode/actions/release')
  release(
    @Param('id', YARD_ID_PIPE) id: string,
    @Param('slotCode') slotCode: string,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.releaseSlot.execute({ yardId: id, slotCode, actorId: actor.sub, access });
  }

  /** Khoá ô đỗ để bảo trì (F42). Không cho khoá ô đang có xe (409). Trả sơ đồ khu sau khi khoá. */
  @RequirePermission('yard.update')
  @Post(':id/slots/:slotCode/actions/lock')
  lock(
    @Param('id', YARD_ID_PIPE) id: string,
    @Param('slotCode') slotCode: string,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.slotLock.execute({ yardId: id, slotCode, lock: true, actorId: actor.sub, access });
  }

  /** Mở lại ô đỗ đang khoá (F42). Trả sơ đồ khu sau khi mở. */
  @RequirePermission('yard.update')
  @Post(':id/slots/:slotCode/actions/unlock')
  unlock(
    @Param('id', YARD_ID_PIPE) id: string,
    @Param('slotCode') slotCode: string,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.slotLock.execute({ yardId: id, slotCode, lock: false, actorId: actor.sub, access });
  }
}
