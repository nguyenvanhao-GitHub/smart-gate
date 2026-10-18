import { QueryRunner } from 'typeorm';
import { DeleteUnusedTestCatalogs1787739000000 } from './migrations/1787739000000-DeleteUnusedTestCatalogs';

describe('DeleteUnusedTestCatalogs1787739000000 (SG-252)', () => {
  it('up() thực thi câu lệnh xoá mục VN01 và nhóm danh mục thử nghiệm', async () => {
    const executedQueries: string[] = [];
    const queryRunner = {
      query: jest.fn().mockImplementation((sql: string) => {
        executedQueries.push(sql);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    const migration = new DeleteUnusedTestCatalogs1787739000000();
    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(executedQueries[0]).toContain('"type_code" = \'VEHICLE_TYPE\'');
    expect(executedQueries[0]).toContain('"code" = \'VN01\'');
    expect(executedQueries[1]).toContain('catalog_items');
    expect(executedQueries[2]).toContain('catalog_types');
  });

  it('down() không ném lỗi', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    const migration = new DeleteUnusedTestCatalogs1787739000000();
    await expect(migration.down(queryRunner)).resolves.not.toThrow();
  });
});