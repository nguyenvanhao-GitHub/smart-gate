import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import { CatalogItemSearchCriteria, CatalogRepository } from '../../application/ports/catalog.repository';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogTypeSeed } from '../../domain/catalog.seed';
import { CatalogItemOrmEntity } from './catalog-item.orm-entity';
import { CatalogTypeOrmEntity } from './catalog-type.orm-entity';
import { CatalogMapper } from './catalog.mapper';

@Injectable()
export class TypeOrmCatalogRepository implements CatalogRepository {
  constructor(
    @InjectRepository(CatalogTypeOrmEntity)
    private readonly types: Repository<CatalogTypeOrmEntity>,
    @InjectRepository(CatalogItemOrmEntity)
    private readonly items: Repository<CatalogItemOrmEntity>,
  ) {}

  async listTypes(): Promise<CatalogType[]> {
    const rows = await this.types.find({
      order: {
        isSystem: 'ASC',
        createdAt: 'DESC',
        sortOrder: 'ASC',
        code: 'ASC',
      },
    });
    return rows.map((row) => CatalogMapper.toTypeDomain(row));
  }

  async findTypeByCode(code: string): Promise<CatalogType | null> {
    const row = await this.types.findOne({ where: { code } });
    return row ? CatalogMapper.toTypeDomain(row) : null;
  }

  async findTypeByName(name: string): Promise<CatalogType | null> {
    const row = await this.types
      .createQueryBuilder('type')
      .where('LOWER(TRIM(type.name)) = LOWER(:name)', { name: name.trim() })
      .getOne();
    return row ? CatalogMapper.toTypeDomain(row) : null;
  }

  async saveType(type: CatalogType): Promise<CatalogType> {
    const saved = await this.types.save(CatalogMapper.toTypePersistence(type));
    return CatalogMapper.toTypeDomain(saved);
  }

  async deleteType(id: string): Promise<void> {
    await this.types.delete({ id });
  }

  async countItemsOfType(typeCode: string): Promise<number> {
    return this.items.count({ where: { typeCode } });
  }

  async countItemsByType(): Promise<Record<string, number>> {
    const rows = await this.items
      .createQueryBuilder('item')
      .select('item.typeCode', 'typeCode')
      .addSelect('COUNT(item.id)', 'count')
      .groupBy('item.typeCode')
      .getRawMany<{ typeCode: string; count: string }>();
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.typeCode] = Number(row.count);
      return acc;
    }, {});
  }

  async findItems(criteria: CatalogItemSearchCriteria): Promise<PaginatedResult<CatalogItem>> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    const query = this.items
      .createQueryBuilder('item')
      .where('item.typeCode = :typeCode', { typeCode: criteria.typeCode })
      .orderBy('item.sortOrder', 'ASC')
      .addOrderBy('item.code', 'ASC');

    if (criteria.status) query.andWhere('item.status = :status', { status: criteria.status });
    if (criteria.keyword) {
      const keyword = `%${criteria.keyword.trim()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('item.code ILIKE :keyword', { keyword }).orWhere('item.name ILIKE :keyword', { keyword });
        }),
      );
    }

    const [rows, total] = await query.skip(paging.skip).take(paging.take).getManyAndCount();
    return toPaginatedResult(rows.map((row) => CatalogMapper.toItemDomain(row)), total, paging);
  }

  async findItemById(id: string): Promise<CatalogItem | null> {
    const row = await this.items.findOne({ where: { id } });
    return row ? CatalogMapper.toItemDomain(row) : null;
  }

  async findItemByCode(typeCode: string, code: string): Promise<CatalogItem | null> {
    const row = await this.items.findOne({ where: { typeCode, code } });
    return row ? CatalogMapper.toItemDomain(row) : null;
  }

  async findItemByName(typeCode: string, name: string): Promise<CatalogItem | null> {
    const row = await this.items
      .createQueryBuilder('item')
      .where('item.typeCode = :typeCode', { typeCode })
      .andWhere('LOWER(TRIM(item.name)) = LOWER(:name)', { name: name.trim() })
      .getOne();
    return row ? CatalogMapper.toItemDomain(row) : null;
  }

  async findItemBySortOrder(typeCode: string, sortOrder: number): Promise<CatalogItem | null> {
    const row = await this.items.findOne({ where: { typeCode, sortOrder } });
    return row ? CatalogMapper.toItemDomain(row) : null;
  }

  async saveItem(item: CatalogItem): Promise<CatalogItem> {
    const saved = await this.items.save(CatalogMapper.toItemPersistence(item));
    return CatalogMapper.toItemDomain(saved);
  }

  async deleteItem(id: string): Promise<void> {
    await this.items.delete({ id });
  }

  /** Chỉ thêm phần còn thiếu — không sửa tên/thứ tự mà quản trị viên đã chỉnh trên giao diện. */
  async ensure(seeds: CatalogTypeSeed[]): Promise<void> {
    const existingTypes = await this.types.find();
    const typeCodes = new Set(existingTypes.map((row) => row.code));

    const pendingTypes = seeds
      .filter((seed) => !typeCodes.has(seed.code))
      .map((seed) =>
        CatalogMapper.toTypePersistence(
          CatalogType.create({
            code: seed.code,
            name: seed.name,
            description: seed.description,
            isSystem: true,
            sortOrder: seed.sortOrder,
          }),
        ),
      );
    if (pendingTypes.length > 0) await this.types.save(pendingTypes);

    const seedCodes = seeds.map((seed) => seed.code);
    const existingItems =
      seedCodes.length > 0 ? await this.items.find({ where: { typeCode: In(seedCodes) } }) : [];
    const itemKeys = new Set(existingItems.map((row) => `${row.typeCode}::${row.code}`));

    const pendingItems: CatalogItemOrmEntity[] = [];
    for (const seed of seeds) {
      seed.items.forEach((item, index) => {
        if (itemKeys.has(`${seed.code}::${item.code}`)) return;
        pendingItems.push(
          CatalogMapper.toItemPersistence(
            CatalogItem.create({
              typeCode: seed.code,
              code: item.code,
              name: item.name,
              sortOrder: index + 1,
              metadata: item.metadata ?? null,
            }),
          ),
        );
      });
    }
    if (pendingItems.length > 0) await this.items.save(pendingItems);
  }
}
