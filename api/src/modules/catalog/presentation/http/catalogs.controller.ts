import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { CreateCatalogItemUseCase } from '../../application/use-cases/create-catalog-item.use-case';
import { CreateCatalogTypeUseCase } from '../../application/use-cases/create-catalog-type.use-case';
import { DeleteCatalogItemUseCase } from '../../application/use-cases/delete-catalog-item.use-case';
import { DeleteCatalogTypeUseCase } from '../../application/use-cases/delete-catalog-type.use-case';
import { GetDossierFieldConfigsUseCase } from '../../application/use-cases/get-dossier-field-configs.use-case';
import { ListCatalogItemsUseCase } from '../../application/use-cases/list-catalog-items.use-case';
import { ListCatalogTypesUseCase } from '../../application/use-cases/list-catalog-types.use-case';
import { LockCatalogItemUseCase } from '../../application/use-cases/lock-catalog-item.use-case';
import { UnlockCatalogItemUseCase } from '../../application/use-cases/unlock-catalog-item.use-case';
import { UpdateCatalogItemUseCase } from '../../application/use-cases/update-catalog-item.use-case';
import { UpdateCatalogTypeUseCase } from '../../application/use-cases/update-catalog-type.use-case';
import { UpdateDossierFieldConfigsUseCase } from '../../application/use-cases/update-dossier-field-configs.use-case';
import { CreateCatalogItemRequest } from './dto/create-catalog-item.request';
import { CreateCatalogTypeRequest } from './dto/create-catalog-type.request';
import { ListCatalogItemsRequest } from './dto/list-catalog-items.request';
import { UpdateCatalogItemRequest } from './dto/update-catalog-item.request';
import { UpdateCatalogTypeRequest } from './dto/update-catalog-type.request';
import { UpdateDossierFieldConfigsRequest } from './dto/update-dossier-field-configs.request';

@ApiBearerAuth()
@ApiTags('Catalogs')
@Controller('catalogs')
export class CatalogsController {
  constructor(
    private readonly listTypes: ListCatalogTypesUseCase,
    private readonly createType: CreateCatalogTypeUseCase,
    private readonly updateType: UpdateCatalogTypeUseCase,
    private readonly listItems: ListCatalogItemsUseCase,
    private readonly createItem: CreateCatalogItemUseCase,
    private readonly updateItem: UpdateCatalogItemUseCase,
    private readonly lockItem: LockCatalogItemUseCase,
    private readonly unlockItem: UnlockCatalogItemUseCase,
    private readonly deleteItem: DeleteCatalogItemUseCase,
    private readonly deleteType: DeleteCatalogTypeUseCase,
    private readonly getDossierFieldConfigs: GetDossierFieldConfigsUseCase,
    private readonly updateDossierFieldConfigs: UpdateDossierFieldConfigsUseCase,
  ) {}

  @RequirePermission('catalog.view')
  @Get()
  types() {
    return this.listTypes.execute();
  }

  @RequirePermission('catalog.create')
  @Post()
  createCatalogType(@Body() body: CreateCatalogTypeRequest) {
    return this.createType.execute(body);
  }

  /** Sửa nội dung nhóm (tên/mô tả/thứ tự). Mã nhóm cố định — F04 không cho đổi mã, không xóa vật lý. */
  @RequirePermission('catalog.update')
  @Patch(':type')
  updateCatalogType(@Param('type') type: string, @Body() body: UpdateCatalogTypeRequest) {
    return this.updateType.execute({ ...body, typeCode: type });
  }

  /**
   * Xóa nhóm danh mục (BUG-058). Chỉ nhóm admin tự thêm & rỗng mới xóa được; nhóm mặc định hoặc còn
   * mục bị chặn ở use-case (400). Là thao tác xóa nên yêu cầu `catalog.delete`.
   */
  @RequirePermission('catalog.delete')
  @Delete(':type')
  removeCatalogType(@Param('type') type: string) {
    return this.deleteType.execute(type);
  }

  @RequirePermission('catalog.view', 'dossier.view', 'dossier.create', 'fee.rule.view', 'workflow.view')
  @Get(':type/items')
  items(@Param('type') type: string, @Query() query: ListCatalogItemsRequest) {
    return this.listItems.execute({
      typeCode: type,
      keyword: query.keyword,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @RequirePermission('catalog.create')
  @Post(':type/items')
  create(@Param('type') type: string, @Body() body: CreateCatalogItemRequest) {
    return this.createItem.execute({ ...body, typeCode: type });
  }

  @RequirePermission('catalog.update')
  @Patch(':type/items/:id')
  update(@Param('type') type: string, @Param('id') id: string, @Body() body: UpdateCatalogItemRequest) {
    return this.updateItem.execute({ ...body, typeCode: type, itemId: id });
  }

  /**
   * Xóa mục danh mục (BUG-058). Chỉ mục admin tự thêm (nhóm không mặc định) & chưa khóa/chưa dùng mới
   * xóa được; còn lại bị chặn ở use-case (400) — F04 vẫn giữ "đã phát sinh dữ liệu chỉ khóa".
   */
  @RequirePermission('catalog.delete')
  @Delete(':type/items/:id')
  removeItem(@Param('type') type: string, @Param('id') id: string) {
    return this.deleteItem.execute(type, id);
  }

  /** Khóa/mở khóa là thao tác sửa trạng thái nên dùng `catalog.update`. */
  @RequirePermission('catalog.update')
  @Post(':type/items/:id/actions/lock')
  lock(@Param('type') type: string, @Param('id') id: string) {
    return this.lockItem.execute(type, id);
  }

  @RequirePermission('catalog.update')
  @Post(':type/items/:id/actions/unlock')
  unlock(@Param('type') type: string, @Param('id') id: string) {
    return this.unlockItem.execute(type, id);
  }

  @RequirePermission('catalog.view', 'dossier.view', 'dossier.create')
  @Get('dossier-types/:dossierType/field-configs')
  getFieldConfigs(@Param('dossierType') dossierType: string) {
    return this.getDossierFieldConfigs.execute(dossierType);
  }

  @RequirePermission('catalog.update')
  @Put('dossier-types/:dossierType/field-configs')
  updateFieldConfigs(
    @Param('dossierType') dossierType: string,
    @Body() body: UpdateDossierFieldConfigsRequest,
  ) {
    return this.updateDossierFieldConfigs.execute(dossierType, body.items);
  }
}
