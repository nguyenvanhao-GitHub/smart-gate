import { validate } from 'class-validator';
import { CreateCatalogTypeRequest } from './create-catalog-type.request';
import { UpdateCatalogTypeRequest } from './update-catalog-type.request';

describe('Catalog type request validation', () => {
  it('accepts the catalog type lengths supported by persistence', async () => {
    const create = Object.assign(new CreateCatalogTypeRequest(), {
      code: 'C'.repeat(64),
      name: 'N'.repeat(160),
    });
    const update = Object.assign(new UpdateCatalogTypeRequest(), { name: 'N'.repeat(160) });

    expect(await validate(create)).toHaveLength(0);
    expect(await validate(update)).toHaveLength(0);
  });

  it('rejects values longer than the persistence columns', async () => {
    const create = Object.assign(new CreateCatalogTypeRequest(), {
      code: 'C'.repeat(65),
      name: 'N'.repeat(161),
    });
    const update = Object.assign(new UpdateCatalogTypeRequest(), { name: 'N'.repeat(161) });

    const createErrors = await validate(create);
    const updateErrors = await validate(update);

    expect(createErrors.map((error) => error.property)).toEqual(expect.arrayContaining(['code', 'name']));
    expect(updateErrors.map((error) => error.property)).toContain('name');
  });
});
