import {
  User,
  expectQueryNotMutated,
  userData,
  Snake,
} from '../test-utils/test-utils';
import { assertType, expectSql, testDb, useTestDatabase } from 'test-utils';

describe('aggregate', () => {
  useTestDatabase();

  describe('aggregate options', () => {
    it('should work without options', async () => {
      expectSql(User.count('*').toSql(), 'SELECT count(*) FROM "user"');
    });

    it('should support as option', () => {
      const q = User.count('*', { as: 'a' });
      expectSql(q.toSql(), 'SELECT count(*) AS "a" FROM "user"');
    });

    it('should support a column with name', () => {
      expectSql(
        Snake.count('snakeName').toSql(),
        'SELECT count("snake"."snake_name") FROM "snake"',
      );
    });

    it('should support distinct option', () => {
      expectSql(
        User.count('name', { distinct: true }).toSql(),
        'SELECT count(DISTINCT "user"."name") FROM "user"',
      );
    });

    it('should support order', () => {
      expectSql(
        User.count('name', { order: { name: 'DESC' } }).toSql(),
        'SELECT count("user"."name" ORDER BY "user"."name" DESC) FROM "user"',
      );
    });

    it('should support order by column with name', () => {
      expectSql(
        Snake.count('snakeName', { order: { snakeName: 'DESC' } }).toSql(),
        'SELECT count("snake"."snake_name" ORDER BY "snake"."snake_name" DESC) FROM "snake"',
      );
    });

    it('should support filter', () => {
      expectSql(
        User.count('name', { filter: { age: { not: null } } }).toSql(),
        'SELECT count("user"."name") FILTER (WHERE "user"."age" IS NOT NULL) FROM "user"',
      );
    });

    it('should support filter by column with name', () => {
      expectSql(
        Snake.count('snakeName', {
          filter: { snakeName: { not: 'Bob' } },
        }).toSql(),
        'SELECT count("snake"."snake_name") FILTER (WHERE "snake"."snake_name" <> $1) FROM "snake"',
        ['Bob'],
      );
    });

    describe('over', () => {
      it('should support partitionBy', () => {
        expectSql(
          User.count('name', {
            over: {
              partitionBy: 'id',
              order: {
                id: 'DESC',
              },
            },
          }).toSql(),
          `
            SELECT count("user"."name") OVER (PARTITION BY "user"."id" ORDER BY "user"."id" DESC)
            FROM "user"
          `,
        );
      });

      it('should support partitionBy column with name', () => {
        expectSql(
          Snake.count('snakeName', {
            over: {
              partitionBy: 'snakeName',
              order: {
                snakeName: 'DESC',
              },
            },
          }).toSql(),
          `
            SELECT count("snake"."snake_name") OVER (PARTITION BY "snake"."snake_name" ORDER BY "snake"."snake_name" DESC)
            FROM "snake"
          `,
        );
      });

      it('should support columns array partitionBy', () => {
        expectSql(
          User.count('name', {
            over: {
              partitionBy: ['id', 'name'],
              order: {
                id: 'DESC',
              },
            },
          }).toSql(),
          `
            SELECT count("user"."name") OVER (PARTITION BY "user"."id", "user"."name" ORDER BY "user"."id" DESC)
            FROM "user"
          `,
        );
      });

      it('should support partitionBy array of columns with names', () => {
        expectSql(
          Snake.count('snakeName', {
            over: {
              partitionBy: ['snakeName', 'tailLength'],
              order: {
                tailLength: 'DESC',
              },
            },
          }).toSql(),
          `
            SELECT count("snake"."snake_name") OVER (PARTITION BY "snake"."snake_name", "snake"."tail_length" ORDER BY "snake"."tail_length" DESC)
            FROM "snake"
          `,
        );
      });
    });

    it('should support all options', () => {
      expectSql(
        User.count('name', {
          as: 'a',
          distinct: true,
          order: { name: 'DESC' },
          filter: { age: { not: null } },
          over: {
            partitionBy: 'id',
            order: {
              id: 'DESC',
            },
          },
        }).toSql(),
        `
          SELECT
            count(DISTINCT "user"."name" ORDER BY "user"."name" DESC)
              FILTER (WHERE "user"."age" IS NOT NULL)
              OVER (
                PARTITION BY "user"."id"
                ORDER BY "user"."id" DESC
              ) AS "a"
          FROM "user"
        `,
      );
    });

    it('should support withinGroup', () => {
      expectSql(
        User.count('name', {
          distinct: true,
          order: { name: 'DESC' },
          filter: { age: { not: null } },
          withinGroup: true,
        }).toSql(),
        `
          SELECT count("user"."name")
          WITHIN GROUP (ORDER BY "user"."name" DESC)
          FILTER (WHERE "user"."age" IS NOT NULL) FROM "user"
        `,
      );
    });
  });

  describe('count', () => {
    it('should return a number', async () => {
      const count = await User.count();

      assertType<typeof count, number>();

      expect(typeof count).toBe('number');
    });

    describe('selectCount', () => {
      it('should select number', async () => {
        await User.create(userData);

        const user = await User.selectCount().take();
        expect(user.count).toBe(1);

        assertType<typeof user.count, number>();
      });
    });
  });

  describe.each`
    method      | functionName
    ${'avg'}    | ${'avg'}
    ${'min'}    | ${'min'}
    ${'max'}    | ${'max'}
    ${'sum'}    | ${'sum'}
    ${'bitAnd'} | ${'bit_and'}
    ${'bitOr'}  | ${'bit_or'}
  `('$method', ({ method, functionName }) => {
    it('should return null when no records', async () => {
      const value = await User[method as 'avg']('id');

      assertType<typeof value, number | null>();

      expect(value).toBe(null);
    });

    it('should return number when have records', async () => {
      await User.create(userData);

      const value = await User[method as 'avg']('id');

      assertType<typeof value, number | null>();

      expect(typeof value).toBe('number');
    });

    const selectMethod = `select${method[0].toUpperCase()}${method.slice(
      1,
    )}` as 'selectAvg';
    describe(selectMethod, () => {
      it('should select null when no record', async () => {
        const value = await User[selectMethod]('id').take();

        assertType<typeof value, { avg: number | null }>();

        expect(value).toEqual({ [functionName]: null });
      });

      it('should return number when have records', async () => {
        const id = await User.get('id').create(userData);

        const value = await User[selectMethod]('id').take();

        assertType<typeof value, { avg: number | null }>();

        expect(value).toEqual({ [functionName]: id });
      });
    });
  });

  describe.each`
    method       | functionName
    ${'boolAnd'} | ${'bool_and'}
    ${'boolOr'}  | ${'bool_or'}
    ${'every'}   | ${'every'}
  `('$method', ({ method, functionName }) => {
    it('should return null when no records', async () => {
      const value = await User[method as 'boolAnd']('active');

      assertType<typeof value, boolean | null>();

      expect(value).toBe(null);
    });

    it('should return boolean when have records', async () => {
      await User.create({ ...userData, active: true });

      const value = await User[method as 'boolAnd']('active');

      assertType<typeof value, boolean | null>();

      expect(typeof value).toBe('boolean');
    });

    const selectMethod = `select${method[0].toUpperCase()}${method.slice(
      1,
    )}` as 'selectBoolAnd';
    describe(selectMethod, () => {
      it('should select null when no record', async () => {
        const value = await User[selectMethod]('active').take();

        assertType<typeof value, { bool_and: boolean | null }>();

        expect(value).toEqual({ [functionName]: null });
      });

      it('should return boolean when have records', async () => {
        await User.create({ ...userData, active: true });

        const value = await User[selectMethod]('active').take();

        assertType<typeof value, { bool_and: boolean | null }>();

        expect(value).toEqual({ [functionName]: true });
      });
    });
  });

  describe.each`
    method        | functionName
    ${'jsonAgg'}  | ${'json_agg'}
    ${'jsonbAgg'} | ${'jsonb_agg'}
  `('$method', ({ method, functionName }) => {
    const data = { name: 'name', tags: [] };

    it('should return null when no records', async () => {
      const value = await User[method as 'jsonAgg']('data');

      assertType<
        typeof value,
        ({ name: string; tags: string[] } | null)[] | null
      >();

      expect(value).toBe(null);
    });

    it('should return json array when have records', async () => {
      await User.create({ ...userData, data });

      const value = await User[method as 'jsonAgg']('data');

      assertType<
        typeof value,
        ({ name: string; tags: string[] } | null)[] | null
      >();

      expect(value).toEqual([data]);
    });

    const selectMethod = `select${method[0].toUpperCase()}${method.slice(
      1,
    )}` as 'selectJsonAgg';
    describe(selectMethod, () => {
      it('should select null when no record', async () => {
        const value = await User[selectMethod]('data').take();

        assertType<
          typeof value,
          { json_agg: ({ name: string; tags: string[] } | null)[] | null }
        >();

        expect(value).toEqual({ [functionName]: null });
      });

      it('should return json array when have records', async () => {
        await User.create({ ...userData, data });

        const value = await User[selectMethod]('data').take();

        assertType<
          typeof value,
          { json_agg: ({ name: string; tags: string[] } | null)[] | null }
        >();

        expect(value).toEqual({ [functionName]: [data] });
      });
    });
  });

  describe.each`
    method        | functionName
    ${'count'}    | ${'count'}
    ${'avg'}      | ${'avg'}
    ${'min'}      | ${'min'}
    ${'max'}      | ${'max'}
    ${'sum'}      | ${'sum'}
    ${'bitAnd'}   | ${'bit_and'}
    ${'bitOr'}    | ${'bit_or'}
    ${'boolAnd'}  | ${'bool_and'}
    ${'boolOr'}   | ${'bool_or'}
    ${'every'}    | ${'every'}
    ${'jsonAgg'}  | ${'json_agg'}
    ${'jsonbAgg'} | ${'jsonb_agg'}
    ${'xmlAgg'}   | ${'xmlagg'}
  `('$method', ({ method, functionName }) => {
    const getSql = (arg: string, as?: string) => {
      let select = `${functionName}(${arg})`;

      if (as) select += ` AS "${as}"`;

      return `SELECT ${select} FROM "user"`;
    };

    it(`should perform ${method} query for a column`, () => {
      const q = User.clone();

      const expectedSql = getSql('"user"."name"');
      expectSql(q[method as 'count']('name').toSql(), expectedSql);
      expectQueryNotMutated(q);

      q[`_${method}` as `_count`]('name');
      expectSql(q.toSql({ clearCache: true }), expectedSql);
    });

    it('should support raw sql parameter', () => {
      const q = User.all();
      expectSql(q[method as 'count'](testDb.sql`name`).toSql(), getSql('name'));
      expectQueryNotMutated(q);
    });

    const selectMethod = `select${method[0].toUpperCase()}${method.slice(1)}`;
    it(`.${selectMethod} should select aggregated value`, () => {
      const q = User.all();
      const expectedSql = getSql('"user"."name"', 'name');
      expectSql(
        q[selectMethod as 'selectCount']('name', { as: 'name' }).toSql(),
        expectedSql,
      );
      expectQueryNotMutated(q);
    });

    it(`.${selectMethod} supports raw sql`, () => {
      const q = User.all();
      const expectedSql = getSql('name', 'name');
      expectSql(
        q[selectMethod as 'selectCount'](testDb.sql`name`, {
          as: 'name',
        }).toSql(),
        expectedSql,
      );
      expectQueryNotMutated(q);
    });
  });

  describe.each`
    method              | functionName
    ${'jsonObjectAgg'}  | ${'json_object_agg'}
    ${'jsonbObjectAgg'} | ${'jsonb_object_agg'}
  `('$method', ({ method, functionName }) => {
    it('should return null when no records', async () => {
      const value = await User[method as 'jsonObjectAgg']({ alias: 'name' });

      assertType<typeof value, { alias: string } | null>();

      expect(value).toBe(null);
    });

    it('should return json object when have records', async () => {
      await User.create(userData);

      const value = await User[method as 'jsonObjectAgg']({ alias: 'name' });

      assertType<typeof value, { alias: string } | null>();

      expect(value).toEqual({ alias: 'name' });
    });

    const selectMethod = `select${method[0].toUpperCase()}${method.slice(
      1,
    )}` as 'selectJsonObjectAgg';
    describe(selectMethod, () => {
      it('should select null when no record', async () => {
        const value = await User[selectMethod]({ alias: 'name' }).take();

        assertType<
          typeof value,
          { json_object_agg: { alias: string } | null }
        >();

        expect(value).toEqual({ [functionName]: null });
      });

      it('should return json object when have records', async () => {
        await User.create(userData);

        const value = await User[selectMethod]({ alias: 'name' }).take();

        assertType<
          typeof value,
          { json_object_agg: { alias: string } | null }
        >();

        expect(value).toEqual({ [functionName]: { alias: 'name' } });
      });
    });

    it(`should perform ${method} query for a column`, () => {
      const q = User.clone();
      const expectedSql = `SELECT ${functionName}($1::text, "user"."name") FROM "user"`;
      expectSql(
        q[method as 'jsonObjectAgg']({ alias: 'name' }).toSql(),
        expectedSql,
        ['alias'],
      );
      expectQueryNotMutated(q);

      q[`_${method}` as '_jsonObjectAgg']({ alias: 'name' });
      expectSql(q.toSql({ clearCache: true }), expectedSql, ['alias']);
    });

    it('should support raw sql parameter', () => {
      const q = User.clone();
      expectSql(
        q[method as 'jsonObjectAgg']({
          alias: testDb.sql`name`,
        }).toSql(),
        `SELECT ${functionName}($1::text, name) FROM "user"`,
        ['alias'],
      );
      expectQueryNotMutated(q);
    });

    it(`.${selectMethod} should select aggregated value`, () => {
      const q = User.all();
      const expectedSql = `SELECT ${functionName}($1::text, "user"."name") AS "name" FROM "user"`;
      expectSql(
        q[selectMethod as 'jsonObjectAgg'](
          { alias: 'name' },
          { as: 'name' },
        ).toSql(),
        expectedSql,
        ['alias'],
      );
      expectQueryNotMutated(q);
    });

    it(`.${selectMethod} supports raw sql`, () => {
      const q = User.all();
      const expectedSql = `SELECT ${functionName}($1::text, name) AS "name" FROM "user"`;
      expectSql(
        q[selectMethod as 'jsonObjectAgg'](
          { alias: testDb.sql`name` },
          { as: 'name' },
        ).toSql(),
        expectedSql,
        ['alias'],
      );
      expectQueryNotMutated(q);
    });
  });

  describe('stringAgg', () => {
    it('should return null when no records', async () => {
      const value = await User.stringAgg('name', ', ');

      assertType<typeof value, string | null>();

      expect(value).toBe(null);
    });

    it('should return json object when have records', async () => {
      await User.createMany([userData, userData]);

      const value = await User.stringAgg('name', ', ');

      assertType<typeof value, string | null>();

      expect(value).toEqual('name, name');
    });

    describe('selectStringAgg', () => {
      it('should select null when no record', async () => {
        const value = await User.selectStringAgg('name', ', ').take();

        assertType<typeof value, { string_agg: string | null }>();

        expect(value).toEqual({ string_agg: null });
      });

      it('should return json object when have records', async () => {
        await User.createMany([userData, userData]);

        const value = await User.selectStringAgg('name', ', ').take();

        assertType<typeof value, { string_agg: string | null }>();

        expect(value).toEqual({ string_agg: 'name, name' });
      });
    });

    it('makes stringAgg query', () => {
      const q = User.clone();
      const expectedSql = `SELECT string_agg("user"."name", $1) FROM "user"`;
      expectSql(q.stringAgg('name', ' & ').toSql(), expectedSql, [' & ']);
      expectQueryNotMutated(q);

      q._stringAgg('name', ' & ');
      expectSql(q.toSql({ clearCache: true }), expectedSql, [' & ']);
    });

    it('should support raw sql parameter', async () => {
      const q = User.all();
      expectSql(
        q.stringAgg(testDb.sql`name`, ' & ').toSql(),
        `SELECT string_agg(name, $1) FROM "user"`,
        [' & '],
      );
      expectQueryNotMutated(q);
    });

    it(`.stringAgg should select aggregated value`, () => {
      const q = User.all();
      const expectedSql = `SELECT string_agg("user"."name", $1) AS "name" FROM "user"`;
      expectSql(
        q.stringAgg('name', ' & ', { as: 'name' }).toSql(),
        expectedSql,
        [' & '],
      );
      expectQueryNotMutated(q);
    });

    it(`.stringAgg supports raw sql`, () => {
      const q = User.all();
      const expectedSql = `SELECT string_agg(name, $1) AS "name" FROM "user"`;
      expectSql(
        q.stringAgg(testDb.sql`name`, ' & ', { as: 'name' }).toSql(),
        expectedSql,
        [' & '],
      );
      expectQueryNotMutated(q);
    });
  });
});
