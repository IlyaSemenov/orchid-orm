import { db, expectSql, Message, User } from '../test-utils/test-utils';
import { Sql } from '../sql';
import { Query } from '../query';
import { pushQueryOn } from './join';

describe('and', () => {
  const [where, _where] = [User.where, User._where];
  beforeEach(() => {
    User.where = jest.fn();
    User._where = jest.fn();
  });
  afterAll(() => {
    User.where = where;
    User._where = _where;
  });

  it('is alias for where', () => {
    User.and({});
    expect(User.where).toBeCalled();
  });

  it('has modifier', () => {
    User._and({});
    expect(User._where).toBeCalled();
  });
});

describe('andNot', () => {
  const [whereNot, _whereNot] = [User.whereNot, User._whereNot];
  beforeEach(() => {
    User.whereNot = jest.fn();
    User._whereNot = jest.fn();
  });
  afterAll(() => {
    User.whereNot = whereNot;
    User._whereNot = _whereNot;
  });

  it('is alias for where', () => {
    User.andNot({});
    expect(User.whereNot).toBeCalled();
  });

  it('has modifier', () => {
    User._andNot({});
    expect(User._whereNot).toBeCalled();
  });
});

export const testWhere = (
  buildSql: (cb: (q: Query) => Query) => Sql,
  startSql: string,
) => {
  describe('where', () => {
    it('should handle null value', () => {
      expectSql(
        buildSql((q) => q.where({ id: 1, 'user.picture': null })),
        `
            ${startSql} "user"."id" = $1 AND "user"."picture" IS NULL
          `,
        [1],
      );
    });

    it('should accept sub query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where(
              { id: 1 },
              q.where({ OR: [{ id: 2 }, { id: 3, name: 'n' }] }),
            ),
          ),
          buildSql((q) =>
            q.where({ id: 1 }, q.or({ id: 2 }, { id: 3, name: 'n' })),
          ),
        ],
        `
            ${startSql} "user"."id" = $1 AND (
              "user"."id" = $2 OR "user"."id" = $3 AND "user"."name" = $4
            )
          `,
        [1, 2, 3, 'n'],
      );
    });

    it('should handle condition with operator', () => {
      expectSql(
        buildSql((q) => q.where({ age: { gt: 20 } })),
        `
            ${startSql} "user"."age" > $1
          `,
        [20],
      );
    });

    it('should handle condition with operator and sub query', () => {
      expectSql(
        buildSql((q) => q.where({ id: { in: User.select('id') } })),
        `
            ${startSql}
            "user"."id" IN (SELECT "user"."id" FROM "user")
          `,
      );
    });

    it('should handle condition with operator and raw', () => {
      expectSql(
        buildSql((q) => q.where({ id: { in: db.raw('(1, 2, 3)') } })),
        `
            ${startSql}
            "user"."id" IN (1, 2, 3)
          `,
      );
    });

    it('should accept raw sql', () => {
      expectSql(
        buildSql((q) => q.where({ id: db.raw('1 + 2') })),
        `
            ${startSql} "user"."id" = 1 + 2
          `,
      );
    });
  });

  describe('whereNot', () => {
    it('should handle null value', () => {
      expectSql(
        [
          buildSql((q) => q.where({ NOT: { id: 1, picture: null } })),
          buildSql((q) => q.whereNot({ id: 1, picture: null })),
        ],
        `
            ${startSql}
            NOT "user"."id" = $1 AND NOT "user"."picture" IS NULL
          `,
        [1],
      );
    });

    it('should accept sub query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              NOT: [
                { id: 1 },
                q.where({ OR: [{ id: 2 }, { id: 3, name: 'n' }] }),
              ],
            }),
          ),
          buildSql((q) =>
            q.whereNot({ id: 1 }, q.or({ id: 2 }, { id: 3, name: 'n' })),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" = $1 AND NOT (
              "user"."id" = $2 OR "user"."id" = $3 AND "user"."name" = $4
            )
          `,
        [1, 2, 3, 'n'],
      );
    });

    it('should handle condition with operator', () => {
      expectSql(
        [
          buildSql((q) => q.where({ NOT: { age: { gt: 20 } } })),
          buildSql((q) => q.whereNot({ age: { gt: 20 } })),
        ],
        `
          ${startSql}
          NOT "user"."age" > $1
        `,
        [20],
      );
    });

    it('should handle condition with operator and sub query', () => {
      expectSql(
        [
          buildSql((q) => q.where({ NOT: { id: { in: User.select('id') } } })),
          buildSql((q) => q.whereNot({ id: { in: User.select('id') } })),
        ],
        `
            ${startSql}
            NOT "user"."id" IN (SELECT "user"."id" FROM "user")
          `,
      );
    });

    it('should handle condition with operator and raw', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({ NOT: { id: { in: db.raw('(1, 2, 3)') } } }),
          ),
          buildSql((q) => q.whereNot({ id: { in: db.raw('(1, 2, 3)') } })),
        ],
        `
            ${startSql}
            NOT "user"."id" IN (1, 2, 3)
          `,
      );
    });

    it('should accept raw sql', () => {
      expectSql(
        [
          buildSql((q) => q.where({ NOT: { id: db.raw('1 + 2') } })),
          buildSql((q) => q.whereNot({ id: db.raw('1 + 2') })),
        ],
        `
            ${startSql} NOT "user"."id" = 1 + 2
          `,
      );
    });

    it('should handle sub query builder', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              NOT: (q) =>
                q.where({
                  IN: { columns: ['id'], values: [[1, 2, 3]] },
                  EXISTS: [Message, 'authorId', 'id'],
                }),
            }),
          ),
          buildSql((q) =>
            q.whereNot((q) =>
              q.whereIn('id', [1, 2, 3]).whereExists(Message, 'authorId', 'id'),
            ),
          ),
        ],
        `
          ${startSql}
          NOT "user"."id" IN ($1, $2, $3)
          AND NOT EXISTS (SELECT 1 FROM "message" WHERE "message"."authorId" = "user"."id" LIMIT 1)
        `,
        [1, 2, 3],
      );
    });
  });

  describe('or', () => {
    it('should join conditions with or', () => {
      expectSql(
        [
          buildSql((q) => q.where({ OR: [{ id: 1 }, { name: 'ko' }] })),
          buildSql((q) => q.or({ id: 1 }, { name: 'ko' })),
        ],
        `
            ${startSql}
            "user"."id" = $1 OR "user"."name" = $2
          `,
        [1, 'ko'],
      );
    });

    it('should handle sub queries', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [{ id: 1 }, User.where({ id: 2 }).and({ name: 'n' })],
            }),
          ),
          buildSql((q) =>
            q.or({ id: 1 }, User.where({ id: 2 }).and({ name: 'n' })),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1 OR ("user"."id" = $2 AND "user"."name" = $3)
          `,
        [1, 2, 'n'],
      );
    });

    it('should accept raw sql', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [{ id: db.raw('1 + 2') }, { name: db.raw('2 + 3') }],
            }),
          ),
          buildSql((q) =>
            q.or({ id: db.raw('1 + 2') }, { name: db.raw('2 + 3') }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = 1 + 2 OR "user"."name" = 2 + 3
          `,
      );
    });
  });

  describe('orNot', () => {
    it('should join conditions with or', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({ OR: [{ NOT: { id: 1 } }, { NOT: { name: 'ko' } }] }),
          ),
          buildSql((q) => q.orNot({ id: 1 }, { name: 'ko' })),
        ],
        `
            ${startSql}
            NOT "user"."id" = $1 OR NOT "user"."name" = $2
          `,
        [1, 'ko'],
      );
    });

    it('should handle sub queries', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { NOT: { id: 1 } },
                { NOT: User.where({ id: 2 }).and({ name: 'n' }) },
              ],
            }),
          ),
          buildSql((q) =>
            q.orNot(
              {
                id: 1,
              },
              User.where({ id: 2 }).and({ name: 'n' }),
            ),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" = $1 OR NOT ("user"."id" = $2 AND "user"."name" = $3)
          `,
        [1, 2, 'n'],
      );
    });

    it('should accept raw sql', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { NOT: { id: db.raw('1 + 2') } },
                { NOT: { name: db.raw('2 + 3') } },
              ],
            }),
          ),
          buildSql((q) =>
            q.orNot({ id: db.raw('1 + 2') }, { name: db.raw('2 + 3') }),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" = 1 + 2 OR NOT "user"."name" = 2 + 3
          `,
      );
    });
  });

  describe('whereIn', () => {
    it('should handle (column, array)', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({ IN: { columns: ['id'], values: [[1, 2, 3]] } }),
          ),
          buildSql((q) => q.whereIn('id', [1, 2, 3])),
        ],
        `
            ${startSql}
            "user"."id" IN ($1, $2, $3)
          `,
        [1, 2, 3],
      );
    });

    it('should handle multiple expressions', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              IN: [
                { columns: ['id'], values: [[1, 2, 3]] },
                { columns: ['name'], values: [['a', 'b', 'c']] },
              ],
            }),
          ),
          buildSql((q) =>
            q.whereIn({
              id: [1, 2, 3],
              name: ['a', 'b', 'c'],
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" IN ($1, $2, $3)
              AND "user"."name" IN ($4, $5, $6)
          `,
        [1, 2, 3, 'a', 'b', 'c'],
      );
    });

    it('should handle raw query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({ IN: { columns: ['id'], values: db.raw('(1, 2, 3)') } }),
          ),
          buildSql((q) => q.whereIn('id', db.raw('(1, 2, 3)'))),
        ],
        `
            ${startSql}
            "user"."id" IN (1, 2, 3)
          `,
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              IN: [
                { columns: ['id'], values: db.raw('(1, 2, 3)') },
                { columns: ['name'], values: db.raw(`('a', 'b', 'c')`) },
              ],
            }),
          ),
          buildSql((q) =>
            q.whereIn({
              id: db.raw('(1, 2, 3)'),
              name: db.raw(`('a', 'b', 'c')`),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" IN (1, 2, 3)
              AND "user"."name" IN ('a', 'b', 'c')
          `,
      );
    });

    it('should handle sub query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({ IN: { columns: ['id'], values: User.select('id') } }),
          ),
          buildSql((q) => q.whereIn('id', User.select('id'))),
        ],
        `
            ${startSql}
            "user"."id" IN (SELECT "user"."id" FROM "user")
          `,
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              IN: [
                { columns: ['id'], values: User.select('id') },
                { columns: ['name'], values: User.select('name') },
              ],
            }),
          ),
          buildSql((q) =>
            q.whereIn({
              id: User.select('id'),
              name: User.select('name'),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" IN (SELECT "user"."id" FROM "user")
              AND "user"."name" IN (SELECT "user"."name" FROM "user")
          `,
      );
    });

    describe('tuple', () => {
      it('should handle values', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                IN: {
                  columns: ['id', 'name'],
                  values: [
                    [1, 'a'],
                    [2, 'b'],
                  ],
                },
              }),
            ),
            buildSql((q) =>
              q.whereIn(
                ['id', 'name'],
                [
                  [1, 'a'],
                  [2, 'b'],
                ],
              ),
            ),
          ],
          `
              ${startSql}
              ("user"."id", "user"."name") IN (($1, $2), ($3, $4))
            `,
          [1, 'a', 2, 'b'],
        );
      });

      it('should handle raw query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                IN: {
                  columns: ['id', 'name'],
                  values: db.raw(`((1, 'a'), (2, 'b'))`),
                },
              }),
            ),
            buildSql((q) =>
              q.whereIn(['id', 'name'], db.raw(`((1, 'a'), (2, 'b'))`)),
            ),
          ],
          `
              ${startSql}
              ("user"."id", "user"."name") IN ((1, 'a'), (2, 'b'))
            `,
        );
      });

      it('should handle sub query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                IN: {
                  columns: ['id', 'name'],
                  values: User.select('id', 'name'),
                },
              }),
            ),
            buildSql((q) =>
              q.whereIn(['id', 'name'], User.select('id', 'name')),
            ),
          ],
          `
              ${startSql}
              ("user"."id", "user"."name")
                 IN (SELECT "user"."id", "user"."name" FROM "user")
            `,
        );
      });
    });
  });

  describe('orWhereIn', () => {
    it('should handle (column, array)', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [{ id: 1 }, { IN: { columns: ['id'], values: [[1, 2, 3]] } }],
            }),
          ),
          buildSql((q) => q.where({ id: 1 }).orWhereIn('id', [1, 2, 3])),
        ],
        `
            ${startSql}
            "user"."id" = $1 OR "user"."id" IN ($2, $3, $4)
          `,
        [1, 1, 2, 3],
      );
    });

    it('should handle object of columns and arrays', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                {
                  IN: [
                    { columns: ['id'], values: [[1, 2, 3]] },
                    { columns: ['name'], values: [['a', 'b', 'c']] },
                  ],
                },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereIn({
              id: [1, 2, 3],
              name: ['a', 'b', 'c'],
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
              OR "user"."id" IN ($2, $3, $4) AND "user"."name" IN ($5, $6, $7)
          `,
        [1, 1, 2, 3, 'a', 'b', 'c'],
      );
    });

    it('should handle raw query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                { IN: { columns: ['id'], values: db.raw('(1, 2, 3)') } },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereIn({ id: db.raw('(1, 2, 3)') }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1 OR "user"."id" IN (1, 2, 3)
          `,
        [1],
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                {
                  IN: [
                    { columns: ['id'], values: db.raw('(1, 2, 3)') },
                    { columns: ['name'], values: db.raw(`('a', 'b', 'c')`) },
                  ],
                },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereIn({
              id: db.raw('(1, 2, 3)'),
              name: db.raw(`('a', 'b', 'c')`),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
               OR "user"."id" IN (1, 2, 3)
              AND "user"."name" IN ('a', 'b', 'c')
          `,
        [1],
      );
    });

    it('should handle sub query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                { IN: { columns: ['id'], values: User.select('id') } },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereIn({ id: User.select('id') }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
               OR "user"."id" IN (SELECT "user"."id" FROM "user")
          `,
        [1],
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                {
                  IN: [
                    { columns: ['id'], values: User.select('id') },
                    { columns: ['name'], values: User.select('name') },
                  ],
                },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereIn({
              id: User.select('id'),
              name: User.select('name'),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
               OR "user"."id" IN (SELECT "user"."id" FROM "user")
              AND "user"."name" IN (SELECT "user"."name" FROM "user")
          `,
        [1],
      );
    });

    describe('tuple', () => {
      it('should handle values', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                OR: [
                  { id: 1 },
                  {
                    IN: {
                      columns: ['id', 'name'],
                      values: [
                        [1, 'a'],
                        [2, 'b'],
                      ],
                    },
                  },
                ],
              }),
            ),
            buildSql((q) =>
              q.where({ id: 1 }).orWhereIn(
                ['id', 'name'],
                [
                  [1, 'a'],
                  [2, 'b'],
                ],
              ),
            ),
          ],
          `
              ${startSql}
              "user"."id" = $1
                 OR ("user"."id", "user"."name") IN (($2, $3), ($4, $5))
            `,
          [1, 1, 'a', 2, 'b'],
        );
      });

      it('should handle raw query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                OR: [
                  { id: 1 },
                  {
                    IN: {
                      columns: ['id', 'name'],
                      values: db.raw(`((1, 'a'), (2, 'b'))`),
                    },
                  },
                ],
              }),
            ),
            buildSql((q) =>
              q
                .where({ id: 1 })
                .orWhereIn(['id', 'name'], db.raw(`((1, 'a'), (2, 'b'))`)),
            ),
          ],
          `
              ${startSql}
              "user"."id" = $1
                 OR ("user"."id", "user"."name") IN ((1, 'a'), (2, 'b'))
            `,
          [1],
        );
      });

      it('should handle sub query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                OR: [
                  { id: 1 },
                  {
                    IN: {
                      columns: ['id', 'name'],
                      values: User.select('id', 'name'),
                    },
                  },
                ],
              }),
            ),
            buildSql((q) =>
              q
                .where({ id: 1 })
                .orWhereIn(['id', 'name'], User.select('id', 'name')),
            ),
          ],
          `
              ${startSql}
              "user"."id" = $1
                 OR ("user"."id", "user"."name")
                 IN (SELECT "user"."id", "user"."name" FROM "user")
            `,
          [1],
        );
      });
    });
  });

  describe('whereNotIn', () => {
    it('should handle (column, array)', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({ NOT: { IN: { columns: ['id'], values: [[1, 2, 3]] } } }),
          ),
          buildSql((q) => q.whereNotIn('id', [1, 2, 3])),
        ],
        `
            ${startSql}
            NOT "user"."id" IN ($1, $2, $3)
          `,
        [1, 2, 3],
      );
    });

    it('should handle object of columns and arrays', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              NOT: {
                IN: [
                  { columns: ['id'], values: [[1, 2, 3]] },
                  { columns: ['name'], values: [['a', 'b', 'c']] },
                ],
              },
            }),
          ),
          buildSql((q) =>
            q.whereNotIn({
              id: [1, 2, 3],
              name: ['a', 'b', 'c'],
            }),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" IN ($1, $2, $3)
              AND NOT "user"."name" IN ($4, $5, $6)
          `,
        [1, 2, 3, 'a', 'b', 'c'],
      );
    });

    it('should handle raw query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              NOT: { IN: { columns: ['id'], values: db.raw('(1, 2, 3)') } },
            }),
          ),
          buildSql((q) =>
            q.whereNotIn({
              id: db.raw('(1, 2, 3)'),
            }),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" IN (1, 2, 3)
          `,
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              NOT: {
                IN: [
                  { columns: ['id'], values: db.raw('(1, 2, 3)') },
                  { columns: ['name'], values: db.raw(`('a', 'b', 'c')`) },
                ],
              },
            }),
          ),
          buildSql((q) =>
            q.whereNotIn({
              id: db.raw('(1, 2, 3)'),
              name: db.raw(`('a', 'b', 'c')`),
            }),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" IN (1, 2, 3)
              AND NOT "user"."name" IN ('a', 'b', 'c')
          `,
      );
    });

    it('should handle sub query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              NOT: { IN: { columns: ['id'], values: User.select('id') } },
            }),
          ),
          buildSql((q) =>
            q.whereNotIn({
              id: User.select('id'),
            }),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" IN (SELECT "user"."id" FROM "user")
          `,
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              NOT: {
                IN: [
                  { columns: ['id'], values: User.select('id') },
                  { columns: ['name'], values: User.select('name') },
                ],
              },
            }),
          ),
          buildSql((q) =>
            q.whereNotIn({
              id: User.select('id'),
              name: User.select('name'),
            }),
          ),
        ],
        `
            ${startSql}
            NOT "user"."id" IN (SELECT "user"."id" FROM "user")
              AND NOT "user"."name" IN (SELECT "user"."name" FROM "user")
          `,
      );
    });

    describe('tuple', () => {
      it('should handle values', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                NOT: {
                  IN: {
                    columns: ['id', 'name'],
                    values: [
                      [1, 'a'],
                      [2, 'b'],
                    ],
                  },
                },
              }),
            ),
            buildSql((q) =>
              q.whereNotIn(
                ['id', 'name'],
                [
                  [1, 'a'],
                  [2, 'b'],
                ],
              ),
            ),
          ],
          `
              ${startSql}
              NOT ("user"."id", "user"."name") IN (($1, $2), ($3, $4))
            `,
          [1, 'a', 2, 'b'],
        );
      });

      it('should handle raw query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                NOT: {
                  IN: {
                    columns: ['id', 'name'],
                    values: db.raw(`((1, 'a'), (2, 'b'))`),
                  },
                },
              }),
            ),
            buildSql((q) =>
              q.whereNotIn(['id', 'name'], db.raw(`((1, 'a'), (2, 'b'))`)),
            ),
          ],
          `
            ${startSql}
            NOT ("user"."id", "user"."name") IN ((1, 'a'), (2, 'b'))
          `,
        );
      });

      it('should handle sub query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                NOT: {
                  IN: {
                    columns: ['id', 'name'],
                    values: User.select('id', 'name'),
                  },
                },
              }),
            ),
            buildSql((q) =>
              q.whereNotIn(['id', 'name'], User.select('id', 'name')),
            ),
          ],
          `
            ${startSql}
            NOT ("user"."id", "user"."name")
               IN (SELECT "user"."id", "user"."name" FROM "user")
          `,
        );
      });
    });
  });

  describe('orWhereNotIn', () => {
    it('should handle (column, array)', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                { NOT: { IN: { columns: ['id'], values: [[1, 2, 3]] } } },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereNotIn({
              id: [1, 2, 3],
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1 OR NOT "user"."id" IN ($2, $3, $4)
          `,
        [1, 1, 2, 3],
      );
    });

    it('should handle object of columns and arrays', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                {
                  NOT: {
                    IN: [
                      { columns: ['id'], values: [[1, 2, 3]] },
                      { columns: ['name'], values: [['a', 'b', 'c']] },
                    ],
                  },
                },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereNotIn({
              id: [1, 2, 3],
              name: ['a', 'b', 'c'],
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
              OR NOT "user"."id" IN ($2, $3, $4) AND NOT "user"."name" IN ($5, $6, $7)
          `,
        [1, 1, 2, 3, 'a', 'b', 'c'],
      );
    });

    it('should handle raw query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                {
                  NOT: { IN: { columns: ['id'], values: db.raw('(1, 2, 3)') } },
                },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereNotIn({
              id: db.raw('(1, 2, 3)'),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1 OR NOT "user"."id" IN (1, 2, 3)
          `,
        [1],
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                {
                  NOT: {
                    IN: [
                      { columns: ['id'], values: db.raw('(1, 2, 3)') },
                      { columns: ['name'], values: db.raw(`('a', 'b', 'c')`) },
                    ],
                  },
                },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereNotIn({
              id: db.raw('(1, 2, 3)'),
              name: db.raw(`('a', 'b', 'c')`),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
               OR NOT "user"."id" IN (1, 2, 3)
              AND NOT "user"."name" IN ('a', 'b', 'c')
          `,
        [1],
      );
    });

    it('should handle sub query', () => {
      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                { NOT: { IN: { columns: ['id'], values: User.select('id') } } },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereNotIn({
              id: User.select('id'),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
               OR NOT "user"."id" IN (SELECT "user"."id" FROM "user")
          `,
        [1],
      );

      expectSql(
        [
          buildSql((q) =>
            q.where({
              OR: [
                { id: 1 },
                {
                  NOT: {
                    IN: [
                      { columns: ['id'], values: User.select('id') },
                      { columns: ['name'], values: User.select('name') },
                    ],
                  },
                },
              ],
            }),
          ),
          buildSql((q) =>
            q.where({ id: 1 }).orWhereNotIn({
              id: User.select('id'),
              name: User.select('name'),
            }),
          ),
        ],
        `
            ${startSql}
            "user"."id" = $1
               OR NOT "user"."id" IN (SELECT "user"."id" FROM "user")
              AND NOT "user"."name" IN (SELECT "user"."name" FROM "user")
          `,
        [1],
      );
    });

    describe('tuple', () => {
      it('should handle values', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                OR: [
                  { id: 1 },
                  {
                    NOT: {
                      IN: {
                        columns: ['id', 'name'],
                        values: [
                          [1, 'a'],
                          [2, 'b'],
                        ],
                      },
                    },
                  },
                ],
              }),
            ),
            buildSql((q) =>
              q.where({ id: 1 }).orWhereNotIn(
                ['id', 'name'],
                [
                  [1, 'a'],
                  [2, 'b'],
                ],
              ),
            ),
          ],
          `
              ${startSql}
              "user"."id" = $1
                 OR NOT ("user"."id", "user"."name") IN (($2, $3), ($4, $5))
            `,
          [1, 1, 'a', 2, 'b'],
        );
      });

      it('should handle raw query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                OR: [
                  { id: 1 },
                  {
                    NOT: {
                      IN: {
                        columns: ['id', 'name'],
                        values: db.raw(`((1, 'a'), (2, 'b'))`),
                      },
                    },
                  },
                ],
              }),
            ),
            buildSql((q) =>
              q
                .where({ id: 1 })
                .orWhereNotIn(['id', 'name'], db.raw(`((1, 'a'), (2, 'b'))`)),
            ),
          ],
          `
              ${startSql}
              "user"."id" = $1
                 OR NOT ("user"."id", "user"."name") IN ((1, 'a'), (2, 'b'))
            `,
          [1],
        );
      });

      it('should handle sub query', () => {
        expectSql(
          [
            buildSql((q) =>
              q.where({
                OR: [
                  { id: 1 },
                  {
                    NOT: {
                      IN: {
                        columns: ['id', 'name'],
                        values: User.select('id', 'name'),
                      },
                    },
                  },
                ],
              }),
            ),
            buildSql((q) =>
              q
                .where({ id: 1 })
                .orWhereNotIn(['id', 'name'], User.select('id', 'name')),
            ),
          ],
          `
              ${startSql}
              "user"."id" = $1
                 OR NOT ("user"."id", "user"."name")
                   IN (SELECT "user"."id", "user"."name" FROM "user")
            `,
          [1],
        );
      });
    });
  });

  describe('whereExists', () => {
    testJoin(
      'whereExists',
      (target: string, conditions: string) => `
        SELECT * FROM "user"
        WHERE EXISTS (
          SELECT 1 FROM ${target}
          WHERE ${conditions}
          LIMIT 1
        )
      `,
    );
  });

  describe('orWhereExists', () => {
    testJoin(
      'orWhereExists',
      (target: string, conditions: string) => `
        SELECT * FROM "user"
        WHERE "user"."id" = $1 OR EXISTS (
          SELECT 1 FROM ${target}
          WHERE ${conditions}
          LIMIT 1
        )
      `,
      User.where({ id: 1 }),
      [1],
    );
  });

  describe('whereNotExists', () => {
    testJoin(
      'whereNotExists',
      (target: string, conditions: string) => `
        SELECT * FROM "user"
        WHERE NOT EXISTS (
          SELECT 1 FROM ${target}
          WHERE ${conditions}
          LIMIT 1
        )
      `,
    );
  });

  describe('orWhereNotExists', () => {
    testJoin(
      'orWhereNotExists',
      (target: string, conditions: string) => `
        SELECT * FROM "user"
        WHERE "user"."id" = $1 OR NOT EXISTS (
          SELECT 1 FROM ${target}
          WHERE ${conditions}
          LIMIT 1
        )
      `,
      User.where({ id: 1 }),
      [1],
    );
  });
};

export const testJoin = (
  method: string,
  sql: (target: string, conditions: string) => string,
  q: Query = User.all(),
  values: unknown[] = [],
) => {
  const join = method as unknown as 'join';
  const initialSql = q.toSql().text;

  it('should accept left column and right column', () => {
    expectSql(
      q[join](Message, 'authorId', 'id').toSql(),
      sql(`"message"`, `"message"."authorId" = "user"."id"`),
      values,
    );
    expectSql(
      q[join](Message.as('as'), 'authorId', 'id').toSql(),
      sql(`"message" AS "as"`, `"as"."authorId" = "user"."id"`),
      values,
    );
    expect(q.toSql().text).toBe(initialSql);
  });

  it('should accept left column, op and right column', () => {
    expectSql(
      q[join](Message, 'authorId', '=', 'id').toSql(),
      sql(`"message"`, `"message"."authorId" = "user"."id"`),
      values,
    );
    expectSql(
      q[join](Message.as('as'), 'authorId', '=', 'id').toSql(),
      sql(`"message" AS "as"`, `"as"."authorId" = "user"."id"`),
      values,
    );
    expect(q.toSql().text).toBe(initialSql);
  });

  it('should accept raw and raw', () => {
    expectSql(
      q[join](
        Message,
        db.raw('"message"."authorId"'),
        db.raw('"user"."id"'),
      ).toSql(),
      sql(`"message"`, `"message"."authorId" = "user"."id"`),
      values,
    );
    expectSql(
      q[join](
        Message.as('as'),
        db.raw('"as"."authorId"'),
        db.raw('"user"."id"'),
      ).toSql(),
      sql(`"message" AS "as"`, `"as"."authorId" = "user"."id"`),
      values,
    );
    expect(q.toSql().text).toBe(initialSql);
  });

  it('should accept raw, op and raw', () => {
    expectSql(
      q[join](
        Message,
        db.raw('"message"."authorId"'),
        '=',
        db.raw('"user"."id"'),
      ).toSql(),
      sql(`"message"`, `"message"."authorId" = "user"."id"`),
      values,
    );
    expectSql(
      q[join](
        Message.as('as'),
        db.raw('"as"."authorId"'),
        '=',
        db.raw('"user"."id"'),
      ).toSql(),
      sql(`"message" AS "as"`, `"as"."authorId" = "user"."id"`),
      values,
    );
    expect(q.toSql().text).toBe(initialSql);
  });

  it('should accept object of columns', () => {
    expectSql(
      q[join](Message, { authorId: 'id' }).toSql(),
      sql(`"message"`, `"message"."authorId" = "user"."id"`),
      values,
    );
    expectSql(
      q[join](Message.as('as'), { authorId: 'id' }).toSql(),
      sql(`"message" AS "as"`, `"as"."authorId" = "user"."id"`),
      values,
    );
    expect(q.toSql().text).toBe(initialSql);
  });

  it('should accept object of columns with raw value', () => {
    expectSql(
      q[join](Message, { authorId: db.raw('"user"."id"') }).toSql(),
      sql(`"message"`, `"message"."authorId" = "user"."id"`),
      values,
    );
    expectSql(
      q[join](Message.as('as'), { authorId: db.raw('"user"."id"') }).toSql(),
      sql(`"message" AS "as"`, `"as"."authorId" = "user"."id"`),
      values,
    );
    expect(q.toSql().text).toBe(initialSql);
  });

  it('should accept raw sql', () => {
    expectSql(
      q[join](Message, db.raw('"authorId" = "user".id')).toSql(),
      sql(`"message"`, `"authorId" = "user".id`),
      values,
    );
    expectSql(
      q[join](Message.as('as'), db.raw('"authorId" = "user".id')).toSql(),
      sql(`"message" AS "as"`, `"authorId" = "user".id`),
      values,
    );
    expect(q.toSql().text).toBe(initialSql);
  });

  it('should use conditions from provided query', () => {
    expectSql(
      q[join](Message, (q) =>
        q.on('authorId', 'id').where({ text: 'text' }),
      ).toSql(),
      sql(
        `"message"`,
        `"message"."authorId" = "user"."id" AND "message"."text" = $${
          values.length + 1
        }`,
      ),
      [...values, 'text'],
    );
  });

  describe('relation', () => {
    const withRelation = q as Query & {
      relations: {
        message: {
          key: 'message';
          query: typeof Message;
          joinQuery(fromQuery: Query, toQuery: Query): Query;
        };
      };
    };

    Object.assign(withRelation.baseQuery, {
      relations: {
        message: {
          key: 'message',
          query: Message,
          joinQuery(fromQuery: Query, toQuery: Query) {
            return pushQueryOn(
              toQuery.clone(),
              fromQuery,
              toQuery,
              'authorId',
              'id',
            );
          },
        },
      },
    });

    it('should join relation', () => {
      expectSql(
        withRelation[join]('message').toSql(),
        sql(`"message"`, `"message"."authorId" = "user"."id"`),
        values,
      );
    });

    it('should join relation with additional conditions', () => {
      expectSql(
        withRelation[join]('message', (q) =>
          q.where({
            'message.text': 'text',
          }),
        ).toSql(),
        sql(
          `"message"`,
          `"message"."authorId" = "user"."id" AND "message"."text" = $${
            values.length + 1
          }`,
        ),
        [...values, 'text'],
      );
    });
  });
};

const buildSql = (cb: (q: Query) => Query) => {
  return cb(User.all()).toSql();
};

const startSql = `SELECT * FROM "user" WHERE`;

testWhere(buildSql, startSql);

describe('where', () => {
  it('should be assignable to the query', () => {
    let q = User.all();
    q = q.where({ id: 1 });
    expectSql(q.toSql(), 'SELECT * FROM "user" WHERE "user"."id" = $1', [1]);
  });
});

describe('joined columns', () => {
  const j = User.join(Message, (q) => q.on('authorId', 'id'));
  const sql = `SELECT "user".* FROM "user" JOIN "message" ON "message"."authorId" = "user"."id" WHERE `;

  it('should be available in `where` object', () => {
    const q = j.where({ 'message.id': 1, 'message.text': null });

    expectSql(
      q.toSql(),
      sql + '"message"."id" = $1 AND "message"."text" IS NULL',
      [1],
    );
  });

  it('should accept sub query', () => {
    const q = j.where(
      { 'message.id': 1 },
      j.or({ 'message.id': 2 }, { 'message.id': 3, 'message.text': 'text' }),
    );

    expectSql(
      q.toSql(),
      sql +
        `"message"."id" = $1 AND ("message"."id" = $2 OR "message"."id" = $3 AND "message"."text" = $4)`,
      [1, 2, 3, 'text'],
    );
  });

  it('should handle condition with operator', () => {
    const q = j.where({ 'message.id': { gt: 1 } });

    expectSql(q.toSql(), sql + '"message"."id" > $1', [1]);
  });

  it('should handle condition with operator and sub query', () => {
    const q = j.where({ 'message.id': { in: User.select('id') } });

    expectSql(
      q.toSql(),
      sql + `"message"."id" IN (SELECT "user"."id" FROM "user")`,
    );
  });

  it('should handle condition with operator and raw', () => {
    const q = j.where({ 'message.id': { in: db.raw(`(1, 2, 3)`) } });

    expectSql(q.toSql(), sql + `"message"."id" IN (1, 2, 3)`);
  });

  it('should accept raw sql', () => {
    const q = j.where({ 'message.id': db.raw(`1 + 2`) });

    expectSql(q.toSql(), sql + `"message"."id" = 1 + 2`);
  });

  describe('whereNot', () => {
    it('should handle null value', () => {
      const qs = [
        j.where({ NOT: { 'message.id': 1, 'message.text': null } }),
        j.whereNot({ 'message.id': 1, 'message.text': null }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `NOT "message"."id" = $1 AND NOT "message"."text" IS NULL`,
          [1],
        );
      }
    });

    it('should accept sub query', () => {
      const qs = [
        j.where({
          NOT: [
            { 'message.id': 1 },
            j.where({
              OR: [
                { 'message.id': 2 },
                { 'message.id': 3, 'message.text': 'text' },
              ],
            }),
          ],
        }),
        j.whereNot(
          { 'message.id': 1 },
          j.or(
            { 'message.id': 2 },
            { 'message.id': 3, 'message.text': 'text' },
          ),
        ),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `NOT "message"."id" = $1 AND NOT (
            "message"."id" = $2 OR "message"."id" = $3 AND "message"."text" = $4
          )`,
          [1, 2, 3, 'text'],
        );
      }
    });

    it('should handle condition with operator', () => {
      const qs = [
        j.where({ NOT: { 'message.id': { gt: 20 } } }),
        j.whereNot({ 'message.id': { gt: 20 } }),
      ];

      for (const q of qs) {
        expectSql(q.toSql(), sql + `NOT "message"."id" > $1`, [20]);
      }
    });

    it('should handle condition with operator and sub query', () => {
      const qs = [
        j.where({ NOT: { 'message.id': { in: User.select('id') } } }),
        j.whereNot({ 'message.id': { in: User.select('id') } }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `NOT "message"."id" IN (SELECT "user"."id" FROM "user")`,
        );
      }
    });

    it('should handle condition with operator and raw', () => {
      const qs = [
        j.where({ NOT: { 'message.id': { in: db.raw(`(1, 2, 3)`) } } }),
        j.whereNot({ 'message.id': { in: db.raw(`(1, 2, 3)`) } }),
      ];

      for (const q of qs) {
        expectSql(q.toSql(), sql + `NOT "message"."id" IN (1, 2, 3)`);
      }
    });

    it('should accept raw sql', () => {
      const qs = [
        j.where({ NOT: { 'message.id': db.raw(`1 + 2`) } }),
        j.whereNot({ 'message.id': db.raw(`1 + 2`) }),
      ];

      for (const q of qs) {
        expectSql(q.toSql(), sql + `NOT "message"."id" = 1 + 2`);
      }
    });

    it('should handle sub query builder', () => {
      const qs = [
        j.where({
          NOT: (q) =>
            q.where({
              IN: { columns: ['message.id'], values: [[1, 2, 3]] },
              EXISTS: [User, 'id', 'message.id'],
            }),
        }),
        j.whereNot((q) =>
          q.where({
            IN: { columns: ['message.id'], values: [[1, 2, 3]] },
            EXISTS: [User, 'id', 'message.id'],
          }),
        ),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `NOT "message"."id" IN ($1, $2, $3) AND NOT EXISTS (
            SELECT 1 FROM "user" WHERE "user"."id" = "message"."id" LIMIT 1
          )`,
          [1, 2, 3],
        );
      }
    });
  });

  describe('or', () => {
    it('should join conditions with or', () => {
      const qs = [
        j.where({ OR: [{ 'message.id': 1 }, { 'message.text': 'text' }] }),
        j.or({ 'message.id': 1 }, { 'message.text': 'text' }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `"message"."id" = $1 OR "message"."text" = $2`,
          [1, 'text'],
        );
      }
    });

    it('should handle sub queries', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            j.where({ 'message.id': 2 }).and({ 'message.text': 'text' }),
          ],
        }),
        j.or(
          { 'message.id': 1 },
          j.where({ 'message.id': 2 }).and({ 'message.text': 'text' }),
        ),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1 OR ("message"."id" = $2 AND "message"."text" = $3)`,
          [1, 2, 'text'],
        );
      }
    });

    it('should accept raw sql', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': db.raw(`1 + 2`) },
            { 'message.text': db.raw(`2 + 3`) },
          ],
        }),
        j.or(
          { 'message.id': db.raw(`1 + 2`) },
          { 'message.text': db.raw(`2 + 3`) },
        ),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `"message"."id" = 1 + 2 OR "message"."text" = 2 + 3`,
        );
      }
    });
  });

  describe('orNot', () => {
    it('should join conditions with or', () => {
      const qs = [
        j.where({
          OR: [
            { NOT: { 'message.id': 1 } },
            { NOT: { 'message.text': 'text' } },
          ],
        }),
        j.orNot({ 'message.id': 1 }, { 'message.text': 'text' }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `NOT "message"."id" = $1 OR NOT "message"."text" = $2`,
          [1, 'text'],
        );
      }
    });

    it('should handle sub queries', () => {
      const qs = [
        j.where({
          OR: [
            { NOT: { 'message.id': 1 } },
            {
              NOT: j.where({ 'message.id': 2 }).and({ 'message.text': 'text' }),
            },
          ],
        }),
        j.orNot(
          { 'message.id': 1 },
          j.where({ 'message.id': 2 }).and({ 'message.text': 'text' }),
        ),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `NOT "message"."id" = $1 OR NOT ("message"."id" = $2 AND "message"."text" = $3)`,
          [1, 2, 'text'],
        );
      }
    });

    it('should accept raw sql', () => {
      const qs = [
        j.where({
          OR: [
            { NOT: { 'message.id': db.raw(`1 + 2`) } },
            { NOT: { 'message.text': db.raw(`2 + 3`) } },
          ],
        }),
        j.orNot(
          { 'message.id': db.raw(`1 + 2`) },
          { 'message.text': db.raw(`2 + 3`) },
        ),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `NOT "message"."id" = 1 + 2 OR NOT "message"."text" = 2 + 3`,
        );
      }
    });
  });

  describe('whereIn', () => {
    it('should handle (column, array)', () => {
      const qs = [
        j.where({ IN: { columns: ['message.id'], values: [[1, 2, 3]] } }),
        j.whereIn('message.id', [1, 2, 3]),
      ];

      for (const q of qs) {
        expectSql(q.toSql(), sql + `"message"."id" IN ($1, $2, $3)`, [1, 2, 3]);
      }
    });

    it('should handle multiple expressions', () => {
      const qs = [
        j.where({
          IN: [
            { columns: ['message.id'], values: [[1, 2, 3]] },
            { columns: ['message.text'], values: [['a', 'b', 'c']] },
          ],
        }),
        j.whereIn({
          'message.id': [1, 2, 3],
          'message.text': ['a', 'b', 'c'],
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" IN ($1, $2, $3) AND "message"."text" IN ($4, $5, $6)`,
          [1, 2, 3, 'a', 'b', 'c'],
        );
      }
    });

    it('should handle raw query', () => {
      const qs = [
        j.where({
          IN: { columns: ['message.id'], values: db.raw(`(1, 2, 3)`) },
        }),
        j.whereIn('message.id', db.raw(`(1, 2, 3)`)),
      ];

      for (const q of qs) {
        expectSql(q.toSql(), sql + `"message"."id" IN (1, 2, 3)`);
      }
    });

    it('should handle multiple raw queries', () => {
      const qs = [
        j.where({
          IN: [
            { columns: ['message.id'], values: db.raw(`(1, 2, 3)`) },
            { columns: ['message.text'], values: db.raw(`('a', 'b', 'c')`) },
          ],
        }),
        j.whereIn({
          'message.id': db.raw(`(1, 2, 3)`),
          'message.text': db.raw(`('a', 'b', 'c')`),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" IN (1, 2, 3) AND "message"."text" IN ('a', 'b', 'c')`,
        );
      }
    });

    it('should handle sub query', () => {
      const qs = [
        j.where({ IN: { columns: ['message.id'], values: User.select('id') } }),
        j.whereIn('message.id', User.select('id')),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `"message"."id" IN (SELECT "user"."id" FROM "user")`,
        );
      }
    });

    it('should handle multiple sub queries', () => {
      const qs = [
        j.where({
          IN: [
            { columns: ['message.id'], values: User.select('id') },
            { columns: ['message.text'], values: User.select('name') },
          ],
        }),
        j.whereIn({
          'message.id': User.select('id'),
          'message.text': User.select('name'),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" IN (SELECT "user"."id" FROM "user")
          AND "message"."text" IN (SELECT "user"."name" FROM "user")`,
        );
      }
    });

    describe('tuple', () => {
      it('should handle values', () => {
        const qs = [
          j.where({
            IN: {
              columns: ['message.id', 'message.text'],
              values: [
                [1, 'a'],
                [2, 'b'],
              ],
            },
          }),
          j.whereIn(
            ['message.id', 'message.text'],
            [
              [1, 'a'],
              [2, 'b'],
            ],
          ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql + `("message"."id", "message"."text") IN (($1, $2), ($3, $4))`,
            [1, 'a', 2, 'b'],
          );
        }
      });

      it('should handle raw query', () => {
        const qs = [
          j.where({
            IN: {
              columns: ['message.id', 'message.text'],
              values: db.raw(`((1, 'a'), (2, 'b'))`),
            },
          }),
          j.whereIn(
            ['message.id', 'message.text'],
            db.raw(`((1, 'a'), (2, 'b'))`),
          ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql + `("message"."id", "message"."text") IN ((1, 'a'), (2, 'b'))`,
          );
        }
      });

      it('should handle sub query', () => {
        const qs = [
          j.where({
            IN: {
              columns: ['message.id', 'message.text'],
              values: User.select('id', 'name'),
            },
          }),
          j.whereIn(['message.id', 'message.text'], User.select('id', 'name')),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `("message"."id", "message"."text") IN (SELECT "user"."id", "user"."name" FROM "user")`,
          );
        }
      });
    });
  });

  describe('orWhereIn', () => {
    it('should handle (column, array)', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            { IN: { columns: ['message.id'], values: [[1, 2, 3]] } },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereIn('message.id', [1, 2, 3]),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `"message"."id" = $1 OR "message"."id" IN ($2, $3, $4)`,
          [1, 1, 2, 3],
        );
      }
    });

    it('should handle object of columns and arrays', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              IN: [
                { columns: ['message.id'], values: [[1, 2, 3]] },
                { columns: ['message.text'], values: [['a', 'b', 'c']] },
              ],
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereIn({
          'message.id': [1, 2, 3],
          'message.text': ['a', 'b', 'c'],
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1
          OR "message"."id" IN ($2, $3, $4) AND "message"."text" IN ($5, $6, $7)`,
          [1, 1, 2, 3, 'a', 'b', 'c'],
        );
      }
    });

    it('should handle raw query', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            { IN: { columns: ['message.id'], values: db.raw(`(1, 2, 3)`) } },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereIn({
          'message.id': db.raw(`(1, 2, 3)`),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `"message"."id" = $1 OR "message"."id" IN (1, 2, 3)`,
          [1],
        );
      }
    });

    it('should handle multiple raw queries', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              IN: [
                { columns: ['message.id'], values: db.raw(`(1, 2, 3)`) },
                {
                  columns: ['message.text'],
                  values: db.raw(`('a', 'b', 'c')`),
                },
              ],
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereIn({
          'message.id': db.raw(`(1, 2, 3)`),
          'message.text': db.raw(`('a', 'b', 'c')`),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1
          OR "message"."id" IN (1, 2, 3)
          AND "message"."text" IN ('a', 'b', 'c')`,
          [1],
        );
      }
    });

    it('should handle sub query', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              IN: { columns: ['message.id'], values: User.select('id') },
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereIn({
          'message.id': User.select('id'),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1 OR "message"."id" IN (SELECT "user"."id" FROM "user")`,
          [1],
        );
      }
    });

    it('should handle multiple sub queries', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              IN: [
                { columns: ['message.id'], values: User.select('id') },
                { columns: ['message.text'], values: User.select('name') },
              ],
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereIn({
          'message.id': User.select('id'),
          'message.text': User.select('name'),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1
          OR "message"."id" IN (SELECT "user"."id" FROM "user")
          AND "message"."text" IN (SELECT "user"."name" FROM "user")`,
          [1],
        );
      }
    });

    describe('tuple', () => {
      it('should handle values', () => {
        const qs = [
          j.where({
            OR: [
              { 'message.id': 1 },
              {
                IN: {
                  columns: ['message.id', 'message.text'],
                  values: [
                    [1, 'a'],
                    [2, 'b'],
                  ],
                },
              },
            ],
          }),
          j.where({ 'message.id': 1 }).orWhereIn(
            ['message.id', 'message.text'],
            [
              [1, 'a'],
              [2, 'b'],
            ],
          ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `"message"."id" = $1
            OR ("message"."id", "message"."text") IN (($2, $3), ($4, $5))`,
            [1, 1, 'a', 2, 'b'],
          );
        }
      });

      it('should handle raw query', () => {
        const qs = [
          j.where({
            OR: [
              { 'message.id': 1 },
              {
                IN: {
                  columns: ['message.id', 'message.text'],
                  values: db.raw(`((1, 'a'), (2, 'b'))`),
                },
              },
            ],
          }),
          j
            .where({ 'message.id': 1 })
            .orWhereIn(
              ['message.id', 'message.text'],
              db.raw(`((1, 'a'), (2, 'b'))`),
            ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `"message"."id" = $1
            OR ("message"."id", "message"."text") IN ((1, 'a'), (2, 'b'))`,
            [1],
          );
        }
      });

      it('should handle sub query', () => {
        const qs = [
          j.where({
            OR: [
              { 'message.id': 1 },
              {
                IN: {
                  columns: ['message.id', 'message.text'],
                  values: User.select('id', 'name'),
                },
              },
            ],
          }),
          j
            .where({ 'message.id': 1 })
            .orWhereIn(
              ['message.id', 'message.text'],
              User.select('id', 'name'),
            ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `"message"."id" = $1
            OR ("message"."id", "message"."text")
            IN (SELECT "user"."id", "user"."name" FROM "user")`,
            [1],
          );
        }
      });
    });
  });

  describe('whereNotIn', () => {
    it('should handle (column, array)', () => {
      const qs = [
        j.where({
          NOT: { IN: { columns: ['message.id'], values: [[1, 2, 3]] } },
        }),
        j.whereNotIn('message.id', [1, 2, 3]),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `NOT "message"."id" IN ($1, $2, $3)`,
          [1, 2, 3],
        );
      }
    });

    it('should handle object of columns and arrays', () => {
      const qs = [
        j.where({
          NOT: {
            IN: [
              { columns: ['message.id'], values: [[1, 2, 3]] },
              { columns: ['message.text'], values: [['a', 'b', 'c']] },
            ],
          },
        }),
        j.whereNotIn({
          'message.id': [1, 2, 3],
          'message.text': ['a', 'b', 'c'],
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `NOT "message"."id" IN ($1, $2, $3)
          AND NOT "message"."text" IN ($4, $5, $6)`,
          [1, 2, 3, 'a', 'b', 'c'],
        );
      }
    });

    it('should handle raw query', () => {
      const qs = [
        j.where({
          NOT: { IN: { columns: ['message.id'], values: db.raw(`(1, 2, 3)`) } },
        }),
        j.whereNotIn({
          'message.id': db.raw(`(1, 2, 3)`),
        }),
      ];

      for (const q of qs) {
        expectSql(q.toSql(), sql + `NOT "message"."id" IN (1, 2, 3)`);
      }
    });

    it('should handle multiple raw queries', () => {
      const qs = [
        j.where({
          NOT: {
            IN: [
              { columns: ['message.id'], values: db.raw(`(1, 2, 3)`) },
              { columns: ['message.text'], values: db.raw(`('a', 'b', 'c')`) },
            ],
          },
        }),
        j.whereNotIn({
          'message.id': db.raw(`(1, 2, 3)`),
          'message.text': db.raw(`('a', 'b', 'c')`),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `NOT "message"."id" IN (1, 2, 3)
          AND NOT "message"."text" IN ('a', 'b', 'c')`,
        );
      }
    });

    it('should handle sub query', () => {
      const qs = [
        j.where({
          NOT: { IN: { columns: ['message.id'], values: User.select('id') } },
        }),
        j.whereNotIn({
          'message.id': User.select('id'),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `NOT "message"."id" IN (SELECT "user"."id" FROM "user")`,
        );
      }
    });

    it('should handle multiple sub queries', () => {
      const qs = [
        j.where({
          NOT: {
            IN: [
              { columns: ['message.id'], values: User.select('id') },
              { columns: ['message.text'], values: User.select('name') },
            ],
          },
        }),
        j.whereNotIn({
          'message.id': User.select('id'),
          'message.text': User.select('name'),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `NOT "message"."id" IN (SELECT "user"."id" FROM "user")
          AND NOT "message"."text" IN (SELECT "user"."name" FROM "user")`,
        );
      }
    });

    describe('tuple', () => {
      it('should handle values', () => {
        const qs = [
          j.where({
            NOT: {
              IN: {
                columns: ['message.id', 'message.text'],
                values: [
                  [1, 'a'],
                  [2, 'b'],
                ],
              },
            },
          }),
          j.whereNotIn(
            ['message.id', 'message.text'],
            [
              [1, 'a'],
              [2, 'b'],
            ],
          ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `NOT ("message"."id", "message"."text") IN (($1, $2), ($3, $4))`,
            [1, 'a', 2, 'b'],
          );
        }
      });

      it('should handle raw query', () => {
        const qs = [
          j.where({
            NOT: {
              IN: {
                columns: ['message.id', 'message.text'],
                values: db.raw(`((1, 'a'), (2, 'b'))`),
              },
            },
          }),
          j.whereNotIn(
            ['message.id', 'message.text'],
            db.raw(`((1, 'a'), (2, 'b'))`),
          ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `NOT ("message"."id", "message"."text") IN ((1, 'a'), (2, 'b'))`,
          );
        }
      });

      it('should handle sub query', () => {
        const qs = [
          j.where({
            NOT: {
              IN: {
                columns: ['message.id', 'message.text'],
                values: User.select('id', 'name'),
              },
            },
          }),
          j.whereNotIn(
            ['message.id', 'message.text'],
            User.select('id', 'name'),
          ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `NOT ("message"."id", "message"."text") IN (
              SELECT "user"."id", "user"."name" FROM "user"
            )`,
          );
        }
      });
    });
  });

  describe('orWhereNotIn', () => {
    it('should handle (column, array)', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            { NOT: { IN: { columns: ['message.id'], values: [[1, 2, 3]] } } },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereNotIn({
          'message.id': [1, 2, 3],
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `"message"."id" = $1 OR NOT "message"."id" IN ($2, $3, $4)`,
          [1, 1, 2, 3],
        );
      }
    });

    it('should handle object of columns and arrays', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              NOT: {
                IN: [
                  { columns: ['message.id'], values: [[1, 2, 3]] },
                  { columns: ['message.text'], values: [['a', 'b', 'c']] },
                ],
              },
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereNotIn({
          'message.id': [1, 2, 3],
          'message.text': ['a', 'b', 'c'],
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1
          OR NOT "message"."id" IN ($2, $3, $4) AND NOT "message"."text" IN ($5, $6, $7)`,
          [1, 1, 2, 3, 'a', 'b', 'c'],
        );
      }
    });

    it('should handle raw query', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              NOT: {
                IN: {
                  columns: ['message.id'],
                  values: db.raw(`(1, 2, 3)`),
                },
              },
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereNotIn({
          'message.id': db.raw(`(1, 2, 3)`),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql + `"message"."id" = $1 OR NOT "message"."id" IN (1, 2, 3)`,
          [1],
        );
      }
    });

    it('should handle multiple raw queries', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              NOT: {
                IN: [
                  { columns: ['message.id'], values: db.raw(`(1, 2, 3)`) },
                  {
                    columns: ['message.text'],
                    values: db.raw(`('a', 'b', 'c')`),
                  },
                ],
              },
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereNotIn({
          'message.id': db.raw(`(1, 2, 3)`),
          'message.text': db.raw(`('a', 'b', 'c')`),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1
          OR NOT "message"."id" IN (1, 2, 3)
          AND NOT "message"."text" IN ('a', 'b', 'c')`,
          [1],
        );
      }
    });

    it('should handle sub query', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              NOT: {
                IN: { columns: ['message.id'], values: User.select('id') },
              },
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereNotIn({
          'message.id': User.select('id'),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1
          OR NOT "message"."id" IN (SELECT "user"."id" FROM "user")`,
          [1],
        );
      }
    });

    it('should handle multiple sub queries', () => {
      const qs = [
        j.where({
          OR: [
            { 'message.id': 1 },
            {
              NOT: {
                IN: [
                  { columns: ['message.id'], values: User.select('id') },
                  { columns: ['message.text'], values: User.select('name') },
                ],
              },
            },
          ],
        }),
        j.where({ 'message.id': 1 }).orWhereNotIn({
          'message.id': User.select('id'),
          'message.text': User.select('name'),
        }),
      ];

      for (const q of qs) {
        expectSql(
          q.toSql(),
          sql +
            `"message"."id" = $1
          OR NOT "message"."id" IN (SELECT "user"."id" FROM "user")
          AND NOT "message"."text" IN (SELECT "user"."name" FROM "user")`,
          [1],
        );
      }
    });

    describe('tuple', () => {
      it('should handle values', () => {
        const qs = [
          j.where({
            OR: [
              { 'message.id': 1 },
              {
                NOT: {
                  IN: {
                    columns: ['message.id', 'message.text'],
                    values: [
                      [1, 'a'],
                      [2, 'b'],
                    ],
                  },
                },
              },
            ],
          }),
          j.where({ 'message.id': 1 }).orWhereNotIn(
            ['message.id', 'message.text'],
            [
              [1, 'a'],
              [2, 'b'],
            ],
          ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `"message"."id" = $1
            OR NOT ("message"."id", "message"."text") IN (($2, $3), ($4, $5))`,
            [1, 1, 'a', 2, 'b'],
          );
        }
      });

      it('should handle raw query', () => {
        const qs = [
          j.where({
            OR: [
              { 'message.id': 1 },
              {
                NOT: {
                  IN: {
                    columns: ['message.id', 'message.text'],
                    values: db.raw(`((1, 'a'), (2, 'b'))`),
                  },
                },
              },
            ],
          }),
          j
            .where({ 'message.id': 1 })
            .orWhereNotIn(
              ['message.id', 'message.text'],
              db.raw(`((1, 'a'), (2, 'b'))`),
            ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `"message"."id" = $1
            OR NOT ("message"."id", "message"."text") IN ((1, 'a'), (2, 'b'))`,
            [1],
          );
        }
      });

      it('should handle sub query', () => {
        const qs = [
          j.where({
            OR: [
              { 'message.id': 1 },
              {
                NOT: {
                  IN: {
                    columns: ['message.id', 'message.text'],
                    values: User.select('id', 'name'),
                  },
                },
              },
            ],
          }),
          j
            .where({ 'message.id': 1 })
            .orWhereNotIn(
              ['message.id', 'message.text'],
              User.select('id', 'name'),
            ),
        ];

        for (const q of qs) {
          expectSql(
            q.toSql(),
            sql +
              `"message"."id" = $1
            OR NOT ("message"."id", "message"."text") IN (
              SELECT "user"."id", "user"."name" FROM "user"
            )`,
            [1],
          );
        }
      });
    });
  });
});
