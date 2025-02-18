import { AsyncLocalStorage } from 'node:async_hooks';
import { AdapterBase } from './adapter';
import { EmptyObject } from './utils';

// query metadata that is stored only on TS side, not available in runtime
export type QueryMetaBase = {
  as?: string;
  hasSelect?: true;
  hasWhere?: true;
  defaults: EmptyObject;
};

export type QueryInternal = {
  columnsForSelectAll?: string[];
  runtimeDefaultColumns?: string[];
  indexes?: {
    columns: ({ column: string } | { expression: string })[];
    options: { unique?: boolean };
  }[];
  transactionStorage: AsyncLocalStorage<AdapterBase>;
};

export type QueryBaseCommon = {
  meta: QueryMetaBase;
  internal: QueryInternal;
};

export type QueryCommon = QueryBaseCommon;
