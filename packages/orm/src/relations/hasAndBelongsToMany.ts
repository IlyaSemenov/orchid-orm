import {
  RelationData,
  RelationThunkBase,
  RelationToManyDataForCreate,
} from './relations';
import { Table, TableClass } from '../baseTable';
import {
  _queryCreateFrom,
  _queryCreateMany,
  _queryDelete,
  _queryFindBy,
  _queryFindByOptional,
  _queryHookAfterCreate,
  _queryJoinOn,
  _queryRows,
  _querySelect,
  _queryUpdate,
  _queryWhere,
  CreateCtx,
  CreateData,
  getQueryAs,
  NotFoundError,
  OrchidOrmInternalError,
  Query,
  RelationConfigBase,
  RelationJoinQuery,
  SelectableFromShape,
  toSQLCacheKey,
  UpdateArg,
  UpdateCtx,
  UpdateData,
  VirtualColumn,
  WhereArg,
} from 'pqb';
import {
  ColumnSchemaConfig,
  ColumnsShapeBase,
  ColumnTypeBase,
  EmptyObject,
  MaybeArray,
} from 'orchid-core';
import {
  hasRelationHandleCreate,
  hasRelationHandleUpdate,
  joinQueryChainingHOF,
  NestedInsertManyConnect,
  NestedInsertManyConnectOrCreate,
  NestedInsertManyItems,
  RelJoin,
} from './common/utils';
import { HasManyNestedInsert, HasManyNestedUpdate } from './hasMany';
import { RelationCommonOptions } from './common/options';
import { defaultSchemaConfig } from 'pqb';

export type HasAndBelongsToMany = RelationThunkBase & {
  type: 'hasAndBelongsToMany';
  options: HasAndBelongsToManyOptions;
};

export type HasAndBelongsToManyOptions<
  Columns extends ColumnsShapeBase = ColumnsShapeBase,
  Related extends TableClass = TableClass,
  Scope extends Query = Query,
> = RelationCommonOptions<Related, Scope> &
  (
    | {
        columns: (keyof Columns)[];
        references: string[];
        through: {
          table: string;
          columns: string[];
          references: (keyof InstanceType<Related>['columns'])[];
        };
      }
    | {
        primaryKey: keyof Columns;
        foreignKey: string;
        joinTable: string;
        associationPrimaryKey: string;
        associationForeignKey: keyof InstanceType<Related>['columns'];
      }
  );

export interface HasAndBelongsToManyInfo<
  T extends Table,
  Relation extends HasAndBelongsToMany,
  Name extends string,
  TableQuery extends Query,
  Q extends Query = {
    [K in keyof TableQuery]: K extends 'meta'
      ? TableQuery['meta'] & {
          as: Name;
          hasWhere: true;
        }
      : K extends 'selectable'
      ? SelectableFromShape<TableQuery['shape'], Name>
      : K extends 'join'
      ? RelJoin
      : TableQuery[K];
  },
> extends RelationConfigBase {
  query: Q;
  methodQuery: Q;
  joinQuery: RelationJoinQuery;
  one: false;
  omitForeignKeyInCreate: never;
  optionalDataForCreate: {
    [P in Name]?: RelationToManyDataForCreate<{
      nestedCreateQuery: Q;
      table: Q;
    }>;
  };
  // `hasAndBelongsToMany` relation data available for update. It supports:
  // - `disconnect` to delete join table records for related records found by conditions
  // - `set` to create join table records for related records found by conditions
  // - `delete` to delete join table records and related records found by conditions
  // - `update` to update related records found by conditions with a provided data
  // - `create` to create related records and a join table records
  dataForUpdate: {
    disconnect?: MaybeArray<WhereArg<Q>>;
    set?: MaybeArray<WhereArg<Q>>;
    delete?: MaybeArray<WhereArg<Q>>;
    update?: {
      where: MaybeArray<WhereArg<Q>>;
      data: UpdateData<Q>;
    };
    create?: CreateData<Q>[];
  };
  dataForUpdateOne: EmptyObject;

  params: Relation['options'] extends { columns: string[] }
    ? {
        [Name in Relation['options']['columns'][number]]: T['columns'][Name]['type'];
      }
    : Relation['options'] extends { primaryKey: string }
    ? Record<
        Relation['options']['primaryKey'],
        T['columns'][Relation['options']['primaryKey']]['type']
      >
    : never;
}

type State = {
  relatedTableQuery: Query;
  joinTableQuery: Query;
  primaryKeys: string[];
  foreignKeys: string[];
  throughForeignKeys: string[];
  throughPrimaryKeys: string[];
  foreignKeysFull: string[];
  throughForeignKeysFull: string[];
  throughPrimaryKeysFull: string[];
};

class HasAndBelongsToManyVirtualColumn extends VirtualColumn<ColumnSchemaConfig> {
  private readonly nestedInsert: HasManyNestedInsert;
  private readonly nestedUpdate: HasManyNestedUpdate;

  constructor(
    schema: ColumnSchemaConfig,
    private key: string,
    private state: State,
  ) {
    super(schema);
    this.nestedInsert = nestedInsert(state);
    this.nestedUpdate = nestedUpdate(state);
  }

  create(
    q: Query,
    ctx: CreateCtx,
    item: Record<string, unknown>,
    rowIndex: number,
  ) {
    hasRelationHandleCreate(
      q,
      ctx,
      item,
      rowIndex,
      this.key,
      this.state.primaryKeys,
      this.nestedInsert,
    );
  }

  update(q: Query, _: UpdateCtx, set: Record<string, unknown>) {
    hasRelationHandleUpdate(
      q,
      set,
      this.key,
      this.state.primaryKeys,
      this.nestedUpdate,
    );
  }
}

const removeColumnName = (column: ColumnTypeBase) => {
  if (!column.data.name) return column;

  const cloned = Object.create(column);
  cloned.data = { ...column.data, name: undefined };
  return cloned;
};

export const makeHasAndBelongsToManyMethod = (
  table: Query,
  qb: Query,
  relation: HasAndBelongsToMany,
  relationName: string,
  query: Query,
): RelationData => {
  let primaryKeys: string[];
  let foreignKeys: string[];
  let joinTable: string;
  let throughForeignKeys: string[];
  let throughPrimaryKeys: string[];

  const { options } = relation;
  if ('columns' in options) {
    primaryKeys = options.columns;
    foreignKeys = options.references;
    joinTable = options.through.table;
    throughForeignKeys = options.through.columns;
    throughPrimaryKeys = options.through.references;
  } else {
    primaryKeys = [options.primaryKey];
    foreignKeys = [options.foreignKey];
    joinTable = options.joinTable;
    throughForeignKeys = [options.associationForeignKey];
    throughPrimaryKeys = [options.associationPrimaryKey];
  }

  const foreignKeysFull = foreignKeys.map((key) => `${joinTable}.${key}`);
  const throughForeignKeysFull = throughForeignKeys.map(
    (key) => `${joinTable}.${key}`,
  );

  const foreignTable = getQueryAs(query);
  const throughPrimaryKeysFull = throughPrimaryKeys.map(
    (key) => `${foreignTable}.${key}`,
  );

  const len = primaryKeys.length;
  const throughLen = throughPrimaryKeys.length;

  const baseQuery = Object.create(qb.baseQuery);
  baseQuery.baseQuery = baseQuery;
  baseQuery.table = joinTable;

  const shape: ColumnsShapeBase = {};
  for (let i = 0; i < len; i++) {
    shape[foreignKeys[i]] = removeColumnName(
      table.shape[primaryKeys[i]] as ColumnTypeBase,
    );
  }
  for (let i = 0; i < throughLen; i++) {
    shape[throughForeignKeys[i]] = removeColumnName(
      query.shape[throughPrimaryKeys[i]] as ColumnTypeBase,
    );
  }

  baseQuery.shape = shape;
  baseQuery.q = {
    ...baseQuery.q,
    shape: baseQuery.shape,
  };
  const subQuery = Object.create(baseQuery);

  const state: State = {
    relatedTableQuery: query,
    joinTableQuery: subQuery,
    primaryKeys,
    foreignKeys,
    throughForeignKeys,
    throughPrimaryKeys,
    foreignKeysFull,
    throughForeignKeysFull,
    throughPrimaryKeysFull,
  };

  const joinQuery = (
    joiningQuery: Query,
    tableAs: string,
    foreignAs: string,
  ) => {
    return joiningQuery.whereExists(subQuery, (q) => {
      for (let i = 0; i < throughLen; i++) {
        _queryJoinOn(q, [
          throughForeignKeysFull[i],
          `${foreignAs}.${throughPrimaryKeys[i]}`,
        ]);
      }

      for (let i = 0; i < len; i++) {
        _queryJoinOn(q, [foreignKeysFull[i], `${tableAs}.${primaryKeys[i]}`]);
      }

      return q;
    });
  };

  const obj: Record<string, string> = {};
  for (let i = 0; i < len; i++) {
    obj[foreignKeys[i]] = primaryKeys[i];
  }
  const selectPrimaryKeysAsForeignKeys = [{ selectAs: obj }];

  const reverseJoin: RelationJoinQuery = (baseQuery, joiningQuery) => {
    return joinQuery(
      baseQuery,
      getQueryAs(baseQuery),
      getQueryAs(joiningQuery),
    );
  };

  return {
    returns: 'many',
    method(params: Record<string, unknown>) {
      return query.whereExists(subQuery, (q) => {
        q = q.clone();

        const where: Record<string, unknown> = {};
        for (let i = 0; i < len; i++) {
          where[foreignKeysFull[i]] = params[primaryKeys[i]];
        }

        for (let i = 0; i < throughLen; i++) {
          _queryJoinOn(q, [
            throughForeignKeysFull[i],
            throughPrimaryKeysFull[i],
          ]);
        }

        return _queryWhere(q, [where]);
      });
    },
    virtualColumn: new HasAndBelongsToManyVirtualColumn(
      defaultSchemaConfig,
      relationName,
      state,
    ),
    joinQuery: joinQueryChainingHOF(reverseJoin, (joiningQuery, baseQuery) => {
      const joined = joinQuery(
        joiningQuery,
        getQueryAs(baseQuery),
        getQueryAs(joiningQuery),
      );

      joined.q.joinedShapes = {
        ...joined.q.joinedShapes,
        [(baseQuery.q.as || baseQuery.table) as string]: baseQuery.q.shape,
      };

      return joined;
    }),
    reverseJoin,
    modifyRelatedQuery(relationQuery) {
      const ref = {} as { q: Query };

      _queryHookAfterCreate(relationQuery, [], async (result: unknown[]) => {
        if (result.length > 1) {
          // TODO: currently this relies on `INSERT ... SELECT` that works only for 1 record
          // consider using `WITH` to reuse id of main table for multiple related ids
          throw new OrchidOrmInternalError(
            relationQuery,
            'Creating multiple `hasAndBelongsToMany` records is not yet supported',
          );
        }

        const baseQuery = ref.q.clone();
        baseQuery.q.select = selectPrimaryKeysAsForeignKeys;

        const data: Record<string, unknown> = {};
        for (let i = 0; i < throughLen; i++) {
          data[throughForeignKeys[i]] = (result[0] as Record<string, unknown>)[
            throughPrimaryKeys[i]
          ];
        }

        const createdCount = await _queryCreateFrom(
          subQuery.count(),
          baseQuery as Query & { returnType: 'one' | 'oneOrThrow' },
          data,
        );

        if ((createdCount as unknown as number) === 0) {
          throw new NotFoundError(baseQuery);
        }
      });

      return (q) => {
        ref.q = q;
      };
    },
  };
};

const queryJoinTable = (
  state: State,
  data: Record<string, unknown>[],
  conditions?: MaybeArray<WhereArg<Query>>,
) => {
  const t = state.joinTableQuery.where({
    IN: {
      columns: state.foreignKeys,
      values: data.map((item) => state.primaryKeys.map((key) => item[key])),
    },
  });

  if (conditions) {
    _queryWhere(t, [
      {
        IN: {
          columns: state.throughForeignKeys,
          values: _querySelect(
            state.relatedTableQuery.where(conditionsToWhereArg(conditions)),
            state.throughPrimaryKeys,
          ),
        },
      },
    ]);
  }

  return t;
};

const conditionsToWhereArg = (
  conditions: MaybeArray<WhereArg<Query>>,
): WhereArg<Query> =>
  Array.isArray(conditions) ? { OR: conditions } : conditions;

const insertToJoinTable = (
  state: State,
  joinTableTransaction: Query,
  data: Record<string, unknown>[],
  idsRows: unknown[][],
) => {
  const len = state.primaryKeys.length;
  const throughLen = state.throughPrimaryKeys.length;

  const records: Record<string, unknown>[] = [];
  for (const item of data) {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < len; i++) {
      obj[state.foreignKeys[i]] = item[state.primaryKeys[i]];
    }

    for (const ids of idsRows) {
      const record = { ...obj };
      for (let i = 0; i < throughLen; i++) {
        record[state.throughForeignKeys[i]] = ids[i];
      }
      records.push(record);
    }
  }

  return joinTableTransaction.insertMany(records);
};

const nestedInsert = ({
  relatedTableQuery,
  joinTableQuery,
  primaryKeys,
  foreignKeys,
  throughPrimaryKeys,
  throughForeignKeys,
}: State) => {
  const len = primaryKeys.length;
  const throughLen = primaryKeys.length;

  return (async (_, data) => {
    const t = relatedTableQuery.clone();

    // array to store specific items will be reused
    const items: unknown[] = [];
    for (const item of data) {
      if (item[1].connect) {
        items.push(item);
      }
    }

    let connected: Record<string, unknown>[];
    if (items.length) {
      const queries: Query[] = [];

      for (const [, { connect }] of items as [
        unknown,
        { connect: NestedInsertManyConnect },
      ][]) {
        for (const item of connect) {
          queries.push(
            _queryFindBy(t.select(...throughPrimaryKeys), [item]) as Query,
          );
        }
      }

      connected = (await Promise.all(queries)) as Record<string, unknown[]>[];
    } else {
      connected = [];
    }

    items.length = 0;
    for (const item of data) {
      if (item[1].connectOrCreate) {
        items.push(item);
      }
    }

    let connectOrCreated: (Record<string, unknown> | undefined)[];
    if (items.length) {
      const queries: Query[] = [];

      for (const [, { connectOrCreate }] of items as [
        unknown,
        { connectOrCreate: NestedInsertManyConnectOrCreate },
      ][]) {
        for (const item of connectOrCreate) {
          queries.push(
            _queryFindByOptional(t.select(...throughPrimaryKeys), [
              item.where,
            ]) as Query,
          );
        }
      }

      connectOrCreated = (await Promise.all(queries)) as Record<
        string,
        unknown
      >[];
    } else {
      connectOrCreated = [];
    }

    let connectOrCreateI = 0;
    items.length = 0;
    for (const item of data) {
      if (item[1].connectOrCreate) {
        const length = item[1].connectOrCreate.length;
        connectOrCreateI += length;
        for (let i = length; i > 0; i--) {
          if (!connectOrCreated[connectOrCreateI - i]) {
            items.push(item);
            break;
          }
        }
      } else if (item[1].create) {
        items.push(item);
      }
    }

    connectOrCreateI = 0;
    let created: Record<string, unknown>[];
    if (items.length) {
      const records: Record<string, unknown>[] = [];

      for (const [, { create, connectOrCreate }] of items as [
        unknown,
        NestedInsertManyItems,
      ][]) {
        if (create) {
          records.push(...create);
        }

        if (connectOrCreate) {
          for (const item of connectOrCreate) {
            if (!connectOrCreated[connectOrCreateI++]) {
              records.push(item.create);
            }
          }
        }
      }

      created = await _queryCreateMany(
        t.select(...throughPrimaryKeys),
        records,
      );
    } else {
      created = [];
    }

    const allKeys = data as unknown as [
      selfData: Record<string, unknown>,
      relationKeys: Record<string, unknown>[],
    ][];

    let createI = 0;
    let connectI = 0;
    connectOrCreateI = 0;
    for (let index = 0, len = data.length; index < len; index++) {
      const item = data[index][1] as NestedInsertManyItems;

      if (item.create || item.connectOrCreate) {
        if (item.create) {
          const len = item.create.length;
          allKeys[index][1] = created.slice(createI, createI + len);
          createI += len;
        }
        if (item.connectOrCreate) {
          const arr: Record<string, unknown>[] = [];
          allKeys[index][1] = arr;

          const len = item.connectOrCreate.length;
          for (let i = 0; i < len; i++) {
            const item = connectOrCreated[connectOrCreateI++];
            if (item) {
              arr.push(item);
            } else {
              arr.push(created[createI++]);
            }
          }
        }
      }

      if (item.connect) {
        const len = item.connect.length;
        allKeys[index][1] = connected.slice(connectI, connectI + len);
        connectI += len;
      }
    }

    const records: Record<string, unknown>[] = [];
    for (const [selfData, relationKeys] of allKeys) {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < len; i++) {
        obj[foreignKeys[i]] = selfData[primaryKeys[i]];
      }

      for (const relationData of relationKeys) {
        const record = { ...obj };

        for (let i = 0; i < throughLen; i++) {
          record[throughForeignKeys[i]] = relationData[throughPrimaryKeys[i]];
        }

        records.push(record);
      }
    }

    await joinTableQuery.insertMany(records);
  }) as HasManyNestedInsert;
};

const nestedUpdate = (state: State) => {
  const len = state.primaryKeys.length;
  const throughLen = state.throughPrimaryKeys.length;

  return (async (_, data, params) => {
    if (params.create) {
      const idsRows: unknown[][] = await _queryCreateMany(
        _queryRows(state.relatedTableQuery.select(...state.throughPrimaryKeys)),
        params.create,
      );

      const records: Record<string, unknown>[] = [];
      for (const item of data) {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < len; i++) {
          obj[state.foreignKeys[i]] = item[state.primaryKeys[i]];
        }

        for (const ids of idsRows) {
          const record = { ...obj };

          for (let i = 0; i < throughLen; i++) {
            record[state.throughForeignKeys[i]] = ids[i];
          }

          records.push(record);
        }
      }

      await state.joinTableQuery.createMany(records);
    }

    if (params.update) {
      await _queryUpdate(
        _queryWhere(
          state.relatedTableQuery.whereExists(state.joinTableQuery, (q) => {
            for (let i = 0; i < throughLen; i++) {
              _queryJoinOn(q, [
                state.throughForeignKeysFull[i],
                state.throughPrimaryKeysFull[i],
              ]);
            }

            return _queryWhere(q, [
              {
                IN: {
                  columns: state.foreignKeysFull,
                  values: data.map((item) =>
                    state.primaryKeys.map((key) => item[key]),
                  ),
                },
              },
            ]);
          }),
          [conditionsToWhereArg(params.update.where)],
        ),
        params.update.data as UpdateArg<Query>,
      );
    }

    if (params.disconnect) {
      await _queryDelete(queryJoinTable(state, data, params.disconnect));
    }

    if (params.delete) {
      const j = queryJoinTable(state, data, params.delete);

      const idsRows = await _queryDelete(
        _queryRows(_querySelect(j, state.throughForeignKeys)),
      );

      await _queryDelete(
        state.relatedTableQuery.where({
          IN: {
            columns: state.throughPrimaryKeys,
            values: idsRows,
          },
        }),
      );
    }

    if (params.set) {
      const j = queryJoinTable(state, data);
      await _queryDelete(j);
      delete j.q[toSQLCacheKey];

      const idsRows = await _queryRows(
        _querySelect(
          state.relatedTableQuery.where(conditionsToWhereArg(params.set)),
          state.throughPrimaryKeys,
        ),
      );

      await insertToJoinTable(state, j, data, idsRows);
    }
  }) as HasManyNestedUpdate;
};
