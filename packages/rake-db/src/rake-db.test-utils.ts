import { createMigrationInterface, Migration } from './migration/migration';
import { columnTypes, QueryLogger, TransactionAdapter } from 'pqb';
import { MaybeArray, noop, toArray } from 'orchid-core';
import { migrationConfigDefaults, RakeDbConfig } from './common';
import { join } from 'path';

let db: Migration | undefined;

export const testMigrationsPath = 'migrations-path';

export const testConfig: RakeDbConfig & { logger: QueryLogger } = {
  ...migrationConfigDefaults,
  basePath: __dirname,
  dbScript: 'dbScript.ts',
  columnTypes,
  log: false,
  logger: {
    log: jest.fn(),
    error: noop,
    warn: noop,
  },
  migrationsPath: testMigrationsPath,
  recurrentPath: join(testMigrationsPath, 'recurrent'),
  migrationsTable: 'schemaMigrations',
  snakeCase: false,
  import: require,
  commands: {},
};

export const getDb = () => {
  if (db) return db;

  db = createMigrationInterface(
    {} as unknown as TransactionAdapter,
    true,
    testConfig,
  );
  db.adapter.query = queryMock;
  db.adapter.arrays = queryMock;
  return db;
};

export const queryMock = jest.fn();

export const resetDb = (up = true) => {
  queryMock.mockClear();
  queryMock.mockResolvedValue(undefined);
  const db = getDb();
  db.up = up;
  db.migratedAsts.length = 0;
};

export const trim = (s: string) => {
  return s.trim().replace(/\n\s+/g, '\n');
};

export const toLine = (s: string) => {
  return s.trim().replace(/\n\s*/g, ' ');
};

export const expectSql = (sql: MaybeArray<string>) => {
  expect(
    queryMock.mock.calls.map((call) =>
      trim(
        typeof call[0] === 'string'
          ? call[0]
          : (call[0] as { text: string }).text,
      ),
    ),
  ).toEqual(toArray(sql).map(trim));
};

export const makeTestUpAndDown = <
  Up extends string,
  Down extends string | undefined = undefined,
>(
  up: Up,
  down?: Down,
) => {
  return async (
    fn: (action: Up | Down) => Promise<void>,
    expectUp: () => void,
    expectDown: () => void,
  ) => {
    resetDb(true);
    await fn(up);
    expectUp();

    resetDb(false);
    await fn(up);
    expectDown();

    if (down) {
      resetDb(true);
      await fn(down);
      expectDown();

      resetDb(false);
      await fn(down);
      expectUp();
    }
  };
};
