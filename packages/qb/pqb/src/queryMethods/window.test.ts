import {
  assertType,
  expectQueryNotMutated,
  expectSql,
  Snake,
  User,
  userData,
  useTestDatabase,
} from '../test-utils/test-utils';

describe('window functions', () => {
  useTestDatabase();

  describe.each`
    method                 | functionName      | results
    ${'selectRowNumber'}   | ${'row_number'}   | ${[1, 2, 1, 2]}
    ${'selectRank'}        | ${'rank'}         | ${[1, 1, 1, 1]}
    ${'selectDenseRank'}   | ${'dense_rank'}   | ${[1, 1, 1, 1]}
    ${'selectPercentRank'} | ${'percent_rank'} | ${[0, 0, 0, 0]}
    ${'selectCumeDist'}    | ${'cume_dist'}    | ${[1, 1, 1, 1]}
  `('$method', ({ method, functionName, results }) => {
    it('should return array of objects with number value', async () => {
      if (method === 'selectCumeDist') {
        await User.createMany([
          { ...userData, age: 20 },
          { ...userData, age: 20 },
        ]);
        await User.createMany([
          { ...userData, age: 30 },
          { ...userData, age: 30 },
        ]);

        const value = await User[method as 'selectRowNumber']({
          partitionBy: 'age',
        });

        assertType<typeof value, { row_number: number }[]>();

        expect(value).toEqual(
          (results as number[]).map((item) => ({ [functionName]: item })),
        );
      }
    });

    it(`should perform ${method} query`, () => {
      const q = User.clone();
      const expectedSql = `
        SELECT ${functionName}() OVER (
          PARTITION BY "user"."name"
          ORDER BY "user"."createdAt" DESC
        ) AS "as" FROM "user"
      `;

      expectSql(
        q[method as 'selectRank']({
          as: 'as',
          partitionBy: 'name',
          order: { createdAt: 'DESC' },
        }).toSql(),
        expectedSql,
      );
      expectQueryNotMutated(q);

      q[`_${method}` as '_selectRank']({
        as: 'as',
        partitionBy: 'name',
        order: { createdAt: 'DESC' },
      });
      expectSql(q.toSql({ clearCache: true }), expectedSql);
    });

    it(`should perform ${method} query for named columns`, () => {
      const q = Snake[method as 'selectRank']({
        as: 'as',
        partitionBy: 'snakeName',
        order: { tailLength: 'DESC' },
      });

      expectSql(
        q.toSql(),
        `
          SELECT ${functionName}() OVER (
            PARTITION BY "snake"."snake_name"
            ORDER BY "snake"."tail_length" DESC
          ) AS "as" FROM "snake"
        `,
      );
    });
  });
});
