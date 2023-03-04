import { db } from './test-utils/test-db';
import { profileData, toLine, userData } from './test-utils/test-utils';
import { Client } from 'pg';
import { noop } from 'orchid-core';

describe('transaction', () => {
  afterAll(db.$close);

  it('should have override transaction method which implicitly connects tables with a single transaction', async () => {
    const spy = jest.spyOn(Client.prototype, 'query');

    await db
      .$transaction(async (db) => {
        await db.user.create(userData);
        await db.profile.create(profileData);
        throw new Error('Throw error to rollback');
      })
      .catch(noop);

    expect(
      spy.mock.calls.map(
        (call) => (call[0] as unknown as { text: string }).text,
      ),
    ).toEqual([
      'BEGIN',
      toLine(`
        INSERT INTO "user"("name", "password", "updatedAt", "createdAt")
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `),
      toLine(`
        INSERT INTO "profile"("bio", "updatedAt", "createdAt")
        VALUES ($1, $2, $3)
        RETURNING *
      `),
      'ROLLBACK',
    ]);
  });

  it('should throw error if argument is forgotten', async () => {
    expect(() =>
      db.$transaction(async () => {
        // noop
      }),
    ).toThrow('Argument of $transaction callback should be used');
  });
});
