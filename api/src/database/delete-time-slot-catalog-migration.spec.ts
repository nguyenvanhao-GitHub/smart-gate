import { QueryRunner } from 'typeorm';
import { DeleteRedundantCatalogs1787900000000 } from './migrations/1787900000000-DeleteRedundantCatalogs';

describe('DeleteRedundantCatalogs1787900000000', () => {
  it('up() thực thi câu lệnh xoá các mục và nhóm danh mục thừa (TIME_SLOT, BORDER_GATE, GATE_LANE, GATE_CHECKLIST)', async () => {
    const executedQueries: string[] = [];
    const queryRunner = {
      query: jest.fn().mockImplementation((sql: string) => {
        executedQueries.push(sql);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    const migration = new DeleteRedundantCatalogs1787900000000();
    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledTimes(2);
    expect(executedQueries[0]).toContain("DELETE FROM \"catalog_items\" WHERE \"type_code\" IN ('TIME_SLOT', 'BORDER_GATE', 'GATE_LANE', 'GATE_CHECKLIST')");
    expect(executedQueries[1]).toContain("DELETE FROM \"catalog_types\" WHERE \"code\" IN ('TIME_SLOT', 'BORDER_GATE', 'GATE_LANE', 'GATE_CHECKLIST')");
  });

  it('down() không ném lỗi', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    const migration = new DeleteRedundantCatalogs1787900000000();
    await expect(migration.down(queryRunner)).resolves.not.toThrow();
  });
});
