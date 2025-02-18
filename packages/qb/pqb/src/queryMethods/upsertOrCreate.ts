import { Query, SetQueryReturnsOne, SetQueryReturnsVoid } from '../query';
import { UpdateData } from './update';
import { CreateData } from './create';
import { WhereResult } from './where';
import { MoreThanOneRowError } from '../errors';
import { isObjectEmpty } from 'orchid-core';

export type UpsertCreateArg<T extends Query> =
  | CreateData<T>
  | (() => CreateData<T>);

export type UpsertData<T extends Query> = {
  update: UpdateData<T>;
  create: UpsertCreateArg<T>;
};

export type UpsertResult<T extends Query> = T['meta']['hasSelect'] extends true
  ? SetQueryReturnsOne<T>
  : SetQueryReturnsVoid<T>;

export type UpsertThis = WhereResult<Query> & {
  returnType: 'one' | 'oneOrThrow';
};

export class QueryUpsertOrCreate {
  upsert<T extends UpsertThis>(this: T, data: UpsertData<T>): UpsertResult<T> {
    return this.clone()._upsert(data);
  }

  _upsert<T extends UpsertThis>(this: T, data: UpsertData<T>): UpsertResult<T> {
    if (!isObjectEmpty(data.update)) {
      this._update<WhereResult<Query>>(data.update);
    }
    return this._orCreate(data.create);
  }

  orCreate<T extends UpsertThis>(
    this: T,
    data: UpsertCreateArg<T>,
  ): UpsertResult<T> {
    return this.clone()._orCreate(data);
  }

  _orCreate<T extends UpsertThis>(
    this: T,
    data: UpsertCreateArg<T>,
  ): UpsertResult<T> {
    this.query.returnType = 'one';
    this.query.wrapInTransaction = true;

    const { handleResult } = this.query;
    let result: unknown;
    let created = false;
    this.query.handleResult = (q, r, s) => {
      return created ? result : handleResult(q, r, s);
    };

    this.query.patchResult = async (queryResult) => {
      if (queryResult.rowCount === 0) {
        if (typeof data === 'function') {
          data = data();
        }

        const inner = (this as Query).create(data as CreateData<Query>);
        const { handleResult } = inner.query;
        inner.query.handleResult = (q, r, s) => {
          queryResult = r;
          const res = handleResult(q, r, s);
          result = res;
          return res;
        };
        await inner;
        created = true;
      } else if (queryResult.rowCount > 1) {
        throw new MoreThanOneRowError(
          this,
          `Only one row was expected to find, found ${queryResult.rowCount} rows.`,
        );
      }
    };
    return this as unknown as UpsertResult<T>;
  }
}
