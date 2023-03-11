import {
  db,
  expectQueryNotMutated,
  expectSql,
  Snake,
  User,
} from '../test-utils/test-utils';

describe('columnInfo', () => {
  afterAll(db.close);

  it('should return all columns info', async () => {
    const q = User.all();

    const query = q.columnInfo();
    expectSql(
      query.toSql(),
      `SELECT * FROM information_schema.columns WHERE table_name = $1 AND table_catalog = current_database() AND table_schema = current_schema()`,
      ['user'],
    );

    const result = await query;
    expect(result.name).toEqual({
      defaultValue: null,
      type: 'text',
      maxLength: null,
      nullable: false,
    });

    expectQueryNotMutated(q);
  });

  it('should return specified column info', async () => {
    const q = User.all();

    const query = q.columnInfo('name');
    expectSql(
      query.toSql(),
      `SELECT * FROM information_schema.columns WHERE table_name = $1 AND table_catalog = current_database() AND table_schema = current_schema() AND column_name = $2`,
      ['user', 'name'],
    );

    const result = await query;
    expect(result).toEqual({
      defaultValue: null,
      type: 'text',
      maxLength: null,
      nullable: false,
    });

    expectQueryNotMutated(q);
  });

  it('should return info about column with custom name', async () => {
    const query = Snake.columnInfo('snakeName');
    expectSql(
      query.toSql(),
      `SELECT * FROM information_schema.columns WHERE table_name = $1 AND table_catalog = current_database() AND table_schema = current_schema() AND column_name = $2`,
      ['snake', 'snake_name'],
    );
  });
});
