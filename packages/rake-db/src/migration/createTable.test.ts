import {
  asMock,
  expectSql,
  getDb,
  queryMock,
  resetDb,
  toLine,
} from '../test-utils';

const db = getDb();

(['createTable', 'dropTable'] as const).forEach((action) => {
  const testUpAndDown = async (
    fn: () => Promise<void>,
    expectUp: () => void,
    expectDown: () => void,
  ) => {
    await fn();
    (action === 'createTable' ? expectUp : expectDown)();

    db.up = false;
    queryMock.mockClear();
    await fn();
    (action === 'createTable' ? expectDown : expectUp)();
  };

  describe(action, () => {
    beforeEach(resetDb);

    it('should push ast to migratedAsts', async () => {
      await db[action]('name', (t) => ({
        id: t.serial().primaryKey(),
      }));

      expect(db.migratedAsts.length).toBe(1);
    });

    it(`should ${action} with schema`, async () => {
      await db[action]('schema.name', (t) => ({ id: t.serial().primaryKey() }));

      if (action === 'createTable') {
        expectSql(`
          CREATE TABLE "schema"."name" (
            "id" serial PRIMARY KEY
          )
        `);
      } else {
        expectSql(`
          DROP TABLE "schema"."name"
        `);
      }
    });

    it(`should ${action} with comment`, async () => {
      await db[action]('name', { comment: 'this is a table comment' }, (t) => ({
        id: t.serial().primaryKey(),
      }));

      if (action === 'createTable') {
        expectSql([
          `
            CREATE TABLE "name" (
              "id" serial PRIMARY KEY
            )
          `,
          `COMMENT ON TABLE "name" IS 'this is a table comment'`,
        ]);
      } else {
        expectSql(`
          DROP TABLE "name"
        `);
      }
    });

    it(`should ${action} and revert on rollback`, async () => {
      const fn = () => {
        return db[action]('table', { dropMode: 'CASCADE' }, (t) => ({
          id: t.serial().primaryKey(),
          nullable: t.text().nullable(),
          nonNullable: t.text(),
          enum: t.enum('mood'),
          withDefault: t.boolean().default(false),
          withDefaultRaw: t.date().default(t.raw(`now()`)),
          withIndex: t.text().index({
            name: 'indexName',
            unique: true,
            using: 'gin',
            collate: 'utf-8',
            opclass: 'opclass',
            order: 'ASC',
            include: 'id',
            with: 'fillfactor = 70',
            tablespace: 'tablespace',
            where: 'column = 123',
          }),
          uniqueColumn: t.text().unique(),
          varcharWithLength: t.varchar(20),
          decimalWithPrecisionAndScale: t.decimal(10, 5),
          columnWithCompression: t.text().compression('compression'),
          columnWithCollate: t.text().collate('utf-8'),
          columnWithForeignKey: t.integer().foreignKey('table', 'column', {
            name: 'fkeyConstraint',
            match: 'FULL',
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          }),
          ...t.timestamps(),
        }));
      };

      const expectCreateTable = () => {
        expectSql([
          'SELECT unnest(enum_range(NULL::"mood"))::text',
          `
            CREATE TABLE "table" (
              "id" serial PRIMARY KEY,
              "nullable" text,
              "nonNullable" text NOT NULL,
              "enum" "mood" NOT NULL,
              "withDefault" boolean NOT NULL DEFAULT false,
              "withDefaultRaw" date NOT NULL DEFAULT now(),
              "withIndex" text NOT NULL,
              "uniqueColumn" text NOT NULL,
              "varcharWithLength" varchar(20) NOT NULL,
              "decimalWithPrecisionAndScale" decimal(10, 5) NOT NULL,
              "columnWithCompression" text COMPRESSION compression NOT NULL,
              "columnWithCollate" text COLLATE 'utf-8' NOT NULL,
              "columnWithForeignKey" integer NOT NULL CONSTRAINT "fkeyConstraint" REFERENCES "table"("column") MATCH FULL ON DELETE CASCADE ON UPDATE CASCADE,
              "createdAt" timestamp NOT NULL DEFAULT now(),
              "updatedAt" timestamp NOT NULL DEFAULT now()
            )
          `,
          toLine(`
            CREATE UNIQUE INDEX "indexName"
              ON "table"
              USING gin
              ("withIndex" COLLATE 'utf-8' opclass ASC)
              INCLUDE ("id")
              WITH (fillfactor = 70)
              TABLESPACE tablespace
              WHERE column = 123
          `),
          toLine(`
            CREATE UNIQUE INDEX "table_uniqueColumn_idx"
              ON "table"
              ("uniqueColumn")
          `),
        ]);
      };

      const expectDropTable = () => {
        expectSql([
          'SELECT unnest(enum_range(NULL::"mood"))::text',
          `
            DROP TABLE "table" CASCADE
          `,
        ]);
      };

      const enumRows = [['one'], ['two']];
      asMock(db.adapter.arrays).mockResolvedValueOnce({ rows: enumRows });

      await fn();
      (action === 'createTable' ? expectCreateTable : expectDropTable)();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [ast1] = db.migratedAsts as any[];
      expect(ast1.shape.enum.options).toEqual(['one', 'two']);

      db.up = false;
      db.migratedAsts.length = 0;
      queryMock.mockClear();
      asMock(db.adapter.arrays).mockResolvedValueOnce({ rows: enumRows });
      await fn();
      (action === 'createTable' ? expectDropTable : expectCreateTable)();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [ast2] = db.migratedAsts as any[];
      expect(ast2.shape.enum.options).toEqual(['one', 'two']);
    });

    it(`should ${action} snake case timestamps if config has snakeCase: true`, async () => {
      await testUpAndDown(
        async () => {
          db.options.snakeCase = true;

          await db[action]('table', (t) => ({
            id: t.serial().primaryKey(),
            ...t.timestamps(),
          }));

          db.options.snakeCase = false;
        },
        () =>
          expectSql(`
          CREATE TABLE "table" (
            "id" serial PRIMARY KEY,
            "created_at" timestamp NOT NULL DEFAULT now(),
            "updated_at" timestamp NOT NULL DEFAULT now()
          )
        `),
        () => expectSql(`DROP TABLE "table"`),
      );
    });

    it('should handle column with explicit name', async () => {
      await testUpAndDown(
        () =>
          db[action]('table', (t) => ({
            columnKey: t.name('columnName').serial().primaryKey(),
          })),
        () =>
          expectSql(`
          CREATE TABLE "table" (
            "columnName" serial PRIMARY KEY
          )
        `),
        () => expectSql(`DROP TABLE "table"`),
      );
    });

    it('should handle column comment', async () => {
      const fn = () => {
        return db[action]('table', (t) => ({
          id: t.serial().primaryKey().comment('this is a column comment'),
        }));
      };

      const expectCreate = () => {
        expectSql([
          `
            CREATE TABLE "table" (
              "id" serial PRIMARY KEY
            )
          `,
          `COMMENT ON COLUMN "table"."id" IS 'this is a column comment'`,
        ]);
      };

      const expectDrop = () => {
        expectSql([`DROP TABLE "table"`]);
      };

      await fn();
      (action === 'createTable' ? expectCreate : expectDrop)();

      db.up = false;
      queryMock.mockClear();
      await fn();
      (action === 'createTable' ? expectDrop : expectCreate)();
    });

    it('should support composite primary key defined on multiple columns', async () => {
      await db[action]('table', (t) => ({
        id: t.integer().primaryKey(),
        name: t.text().primaryKey(),
        active: t.boolean().primaryKey(),
      }));

      if (action === 'createTable') {
        expectSql(`
          CREATE TABLE "table" (
            "id" integer NOT NULL,
            "name" text NOT NULL,
            "active" boolean NOT NULL,
            PRIMARY KEY ("id", "name", "active")
          )
        `);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    it('should support composite primary key', async () => {
      await db[action]('table', (t) => ({
        id: t.integer(),
        name: t.text(),
        active: t.boolean(),
        ...t.primaryKey(['id', 'name', 'active']),
      }));

      if (action === 'createTable') {
        expectSql(`
          CREATE TABLE "table" (
            "id" integer NOT NULL,
            "name" text NOT NULL,
            "active" boolean NOT NULL,
            PRIMARY KEY ("id", "name", "active")
          )
        `);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    it('should support composite primary key with constraint name', async () => {
      await db[action]('table', (t) => ({
        id: t.integer(),
        name: t.text(),
        active: t.boolean(),
        ...t.primaryKey(['id', 'name', 'active'], { name: 'primaryKeyName' }),
      }));

      if (action === 'createTable') {
        expectSql(`
          CREATE TABLE "table" (
            "id" integer NOT NULL,
            "name" text NOT NULL,
            "active" boolean NOT NULL,
            CONSTRAINT "primaryKeyName" PRIMARY KEY ("id", "name", "active")
          )
        `);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    it('should support composite index', async () => {
      await db[action]('table', (t) => ({
        id: t.serial().primaryKey(),
        name: t.text(),
        ...t.index(['id', { column: 'name', order: 'DESC' }], {
          name: 'compositeIndexOnTable',
        }),
      }));

      if (action === 'createTable') {
        expectSql([
          `
            CREATE TABLE "table" (
              "id" serial PRIMARY KEY,
              "name" text NOT NULL
            )
          `,
          `
            CREATE INDEX "compositeIndexOnTable" ON "table" ("id", "name" DESC)
          `,
        ]);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    it('should support composite unique index', async () => {
      await db[action]('table', (t) => ({
        id: t.serial().primaryKey(),
        name: t.text(),
        ...t.unique(['id', { column: 'name', order: 'DESC' }], {
          name: 'compositeIndexOnTable',
        }),
      }));

      if (action === 'createTable') {
        expectSql([
          `
            CREATE TABLE "table" (
              "id" serial PRIMARY KEY,
              "name" text NOT NULL
            )
          `,
          `
            CREATE UNIQUE INDEX "compositeIndexOnTable" ON "table" ("id", "name" DESC)
          `,
        ]);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    it('should support composite foreign key', async () => {
      await db[action]('table', (t) => ({
        id: t.serial().primaryKey(),
        name: t.text(),
        ...t.foreignKey(
          ['id', 'name'],
          'otherTable',
          ['foreignId', 'foreignName'],
          {
            name: 'constraintName',
            match: 'FULL',
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        ),
      }));

      if (action === 'createTable') {
        const expectedConstraint = toLine(`
          CONSTRAINT "constraintName"
            FOREIGN KEY ("id", "name")
            REFERENCES "otherTable"("foreignId", "foreignName")
            MATCH FULL
            ON DELETE CASCADE
            ON UPDATE CASCADE
        `);

        expectSql(`
          CREATE TABLE "table" (
            "id" serial PRIMARY KEY,
            "name" text NOT NULL,
            ${expectedConstraint}
          )
        `);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    it('should support database check on the column', async () => {
      await db[action]('table', (t) => ({
        id: t.serial().primaryKey(),
        columnWithCheck: t
          .text()
          .check(t.raw('length("columnWithCheck") > 10')),
      }));

      if (action === 'createTable') {
        expectSql(`
          CREATE TABLE "table" (
            "id" serial PRIMARY KEY,
            "columnWithCheck" text NOT NULL CHECK (length("columnWithCheck") > 10)
          )
        `);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    it('should support domain column', async () => {
      await db[action]('table', (t) => ({
        id: t.serial().primaryKey(),
        domainColumn: t.domain('domainName'),
      }));

      if (action === 'createTable') {
        expectSql(`
          CREATE TABLE "table" (
            "id" serial PRIMARY KEY,
            "domainColumn" "domainName" NOT NULL
          )
        `);
      } else {
        expectSql(`
          DROP TABLE "table"
        `);
      }
    });

    describe('noPrimaryKey', () => {
      const { warn } = console;
      afterAll(() => {
        db.options.noPrimaryKey = undefined;
        console.warn = warn;
      });

      it('should throw by default when no primary key', async () => {
        await expect(() => db[action]('table', () => ({}))).rejects.toThrow(
          'Table table has no primary key.\nYou can suppress this error by setting { noPrimaryKey: true } after a table name.',
        );
      });

      it('should throw when no primary key and noPrimaryKey is set to `error`', async () => {
        db.options.noPrimaryKey = 'error';

        await expect(() => db[action]('table', () => ({}))).rejects.toThrow(
          'Table table has no primary key.\nYou can suppress this error by setting { noPrimaryKey: true } after a table name.',
        );
      });

      it('should warn when no primary key and noPrimaryKey is set to `warning`', async () => {
        console.warn = jest.fn();
        db.options.noPrimaryKey = 'warning';

        db[action]('table', () => ({}));

        expect(console.warn).toBeCalledWith(
          'Table table has no primary key.\nYou can suppress this error by setting { noPrimaryKey: true } after a table name.',
        );
      });

      it('should not throw when no primary key and noPrimaryKey is set to `ignore`', async () => {
        db.options.noPrimaryKey = 'ignore';

        expect(() => db[action]('table', () => ({}))).not.toThrow();
      });

      it(`should not throw if option is set to \`true\` as a ${action} option`, async () => {
        db.options.noPrimaryKey = 'error';

        expect(() =>
          db[action]('table', { noPrimaryKey: true }, () => ({})),
        ).not.toThrow();
      });
    });
  });
});
