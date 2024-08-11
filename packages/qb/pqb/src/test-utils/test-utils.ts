import { Query } from '../query/query';
import { quote } from '../quote';
import { expectSql, testDb, testDbZodTypes } from 'test-utils';
import { z } from 'zod';
import { RecordUnknown } from 'orchid-core';

export type UserRecord = typeof User.outputType;
export type UserInsert = typeof User.inputType;
export type UserData = { name: string; tags: string[] };
export const User = testDb('user', (t) => ({
  id: t.identity().primaryKey(),
  name: t.text().unique(),
  password: t.text(),
  picture: t.text().nullable(),
  data: t.json<UserData>().nullable(),
  age: t.integer().nullable(),
  active: t.boolean().nullable(),
  ...t.timestamps(),
}));

export const UserZodTypes = testDbZodTypes('user', (t) => ({
  id: t.identity().primaryKey(),
  name: t.text(),
  password: t.text(),
  picture: t.text().nullable(),
  data: t
    .json(
      z.object({
        name: z.string(),
        tags: z.string().array(),
      }),
    )
    .nullable(),
  age: t.integer().nullable(),
  active: t.boolean().nullable(),
  ...t.timestamps(),
}));

export const UserSoftDelete = testDb(
  'user',
  (t) => ({
    id: t.identity().primaryKey(),
    name: t.string(),
    active: t.boolean().nullable(),
    deletedAt: t.timestamp().nullable(),
  }),
  undefined,
  {
    softDelete: true,
  },
);

export type ProfileRecord = typeof Profile.outputType;
export const Profile = testDb('profile', (t) => ({
  id: t.identity().primaryKey(),
  userId: t.integer().foreignKey('user', 'id'),
  bio: t.text().nullable(),
  ...t.timestamps(),
}));

export const Chat = testDb('chat', (t) => ({
  idOfChat: t.identity().primaryKey(),
  title: t.text(),
  ...t.timestamps(),
}));

export type UniqueTableRecord = typeof UniqueTable.outputType;
export const UniqueTable = testDb(
  'uniqueTable',
  (t) => ({
    id: t.identity().primaryKey(),
    one: t.text().unique().primaryKey(),
    two: t.integer().unique(),
    thirdColumn: t.text(),
    fourthColumn: t.integer(),
  }),
  (t) => t.unique(['thirdColumn', 'fourthColumn']),
);

export type MessageRecord = typeof Message.outputType;
export const Message = testDb('message', (t) => ({
  id: t.identity().primaryKey(),
  chatId: t.integer().foreignKey('chat', 'id'),
  authorId: t.integer().foreignKey('user', 'id'),
  text: t.text(),
  meta: t.json().nullable(),
  ...t.timestamps(),
}));

export type SnakeRecord = typeof Snake.outputType;
export type SnakeData = { name: string; tags: string[] };
export const Snake = testDb(
  'snake',
  (t) => ({
    snakeId: t.identity().primaryKey(),
    snakeName: t.text().unique(),
    tailLength: t.integer(),
    snakeData: t.json<SnakeData>().nullable(),
    ...t.timestamps(),
  }),
  undefined,
  { snakeCase: true },
);

const snakeAllColumns = [
  '"snake_id" AS "snakeId"',
  '"snake_name" AS "snakeName"',
  '"tail_length" AS "tailLength"',
  '"snake_data" AS "snakeData"',
  '"created_at" AS "createdAt"',
  '"updated_at" AS "updatedAt"',
];
export const snakeSelectAll = snakeAllColumns.join(', ');
export const snakeSelectAllWithTable = snakeAllColumns
  .map((item) => `"snake".${item}`)
  .join(', ');

export const Post = testDb('post', (t) => ({
  id: t.identity().primaryKey(),
  title: t.text(),
  body: t.text(),
  generatedTsVector: t.tsvector().generated(['title', 'text']).searchIndex(),
  ...t.timestamps(),
}));

export const Tag = testDb('tag', (t) => ({
  tag: t.text().primaryKey(),
}));

export const Product = testDb('product', (t) => ({
  id: t.identity().primaryKey(),
  price: t.decimal(),
}));

export const expectQueryNotMutated = (q: Query) => {
  expectSql(q.toSQL(), `SELECT * FROM "${q.table}"`);
};

export const insert = async <T extends RecordUnknown & { id: number }>(
  table: string,
  record: T,
): Promise<T> => {
  const columns = Object.keys(record);
  const result = await testDb.adapter.query<{ id: number }>(
    `INSERT INTO "${table}"(${columns
      .map((column) => `"${column}"`)
      .join(', ')}) VALUES (${columns
      .map((column) => quote(record[column]))
      .join(', ')}) RETURNING "id"`,
  );

  record.id = result.rows[0].id;
  return record;
};

export const userData = {
  name: 'name',
  password: 'password',
};

export const profileData = {
  bio: 'text',
};

export const chatData = {
  title: 'title',
};

export const messageData = {
  text: 'text',
};

export const snakeData = {
  snakeName: 'Dave',
  tailLength: 5,
};

export const uniqueTableData = {
  one: 'one',
  two: 2,
  thirdColumn: 'three',
  fourthColumn: 4,
};
