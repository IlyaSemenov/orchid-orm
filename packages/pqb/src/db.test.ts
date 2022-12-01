import {
  adapter,
  assertType,
  db,
  expectSql,
  User,
  userData,
  useTestDatabase,
} from './test-utils/test-utils';
import { createDb } from './db';
import { columnTypes } from './columnSchema';
import { QueryLogger } from './queryMethods';

describe('db', () => {
  useTestDatabase();

  it('supports table without schema', () => {
    const table = db('table');
    const query = table.select('id', 'name').where({ foo: 'bar' });
    expectSql(
      query.toSql(),
      `
        SELECT "table"."id", "table"."name" FROM "table"
        WHERE "table"."foo" = $1
      `,
      ['bar'],
    );
  });

  describe('primaryKeys', () => {
    it('should collect primary keys from schema', () => {
      const table = db('table', (t) => ({
        id: t.serial().primaryKey(),
        name: t.text().primaryKey(),
      }));
      expect(table.primaryKeys).toEqual(['id', 'name']);
    });

    it('should set primary keys from primaryKey in schema', () => {
      const table = db('table', (t) => ({
        ...t.primaryKey(['id', 'name']),
      }));
      expect(table.primaryKeys).toEqual(['id', 'name']);
    });
  });

  describe('overriding column types', () => {
    it('should return date as string by default', async () => {
      await User.create(userData);

      const db = createDb({ adapter, columnTypes });
      const table = db('user', (t) => ({
        id: t.serial().primaryKey(),
        createdAt: t.timestamp(),
      }));

      const result = await table.take().get('createdAt');
      expect(typeof result).toBe('string');

      assertType<typeof result, string>();
    });

    it('should return date as Date when overridden', async () => {
      await User.create(userData);

      const db = createDb({
        adapter,
        columnTypes: {
          serial: columnTypes.serial,
          timestamp() {
            return columnTypes.timestamp().parse((input) => new Date(input));
          },
        },
      });

      const table = db('user', (t) => ({
        id: t.serial().primaryKey(),
        createdAt: t.timestamp(),
      }));

      const result = await table.take().get('createdAt');
      expect(result instanceof Date).toBe(true);

      assertType<typeof result, Date>();
    });
  });

  describe('autoPreparedStatements', () => {
    it('should be false by default', () => {
      const db = createDb({ adapter, columnTypes });

      const table = db('table');
      expect(table.query.autoPreparedStatements).toBe(false);
    });
  });

  describe('noPrimaryKey', () => {
    it('should throw error when no primary key by default', () => {
      const db = createDb({ adapter, columnTypes });

      expect(() =>
        db('table', (t) => ({
          name: t.text(0, 100),
        })),
      ).toThrow(`Table table has no primary key`);
    });

    it('should throw error when no primary key when noPrimaryKey is set to `error`', () => {
      const db = createDb({ adapter, columnTypes, noPrimaryKey: 'error' });

      expect(() =>
        db('table', (t) => ({
          name: t.text(0, 100),
        })),
      ).toThrow(`Table table has no primary key`);
    });

    it('should not throw when no column shape is provided', () => {
      const db = createDb({ adapter, columnTypes });

      expect(() => db('table')).not.toThrow();
    });

    it('should warn when no primary key and noPrimaryKey is set to `warning`', () => {
      const logger = { warn: jest.fn() };
      const db = createDb({
        adapter,
        columnTypes,
        noPrimaryKey: 'warning',
        logger: logger as unknown as QueryLogger,
      });

      db('table', (t) => ({
        name: t.text(0, 100),
      }));

      expect(logger.warn).toBeCalledWith('Table table has no primary key');
    });

    it('should do nothing when no primary key and noPrimaryKey is set to `ignore`', () => {
      const logger = { warn: jest.fn() };
      const db = createDb({
        adapter,
        columnTypes,
        noPrimaryKey: 'ignore',
        logger: logger as unknown as QueryLogger,
      });

      db('table', (t) => ({
        name: t.text(0, 100),
      }));

      expect(logger.warn).not.toBeCalled();
    });
  });
});
