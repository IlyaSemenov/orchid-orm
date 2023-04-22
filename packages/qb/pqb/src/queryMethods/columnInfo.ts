import { Query, SetQueryReturnsColumnInfo } from '../query';
import { ColumnInfoQueryData } from '../sql';

export type ColumnInfo = {
  defaultValue: unknown;
  type: string;
  maxLength: number | null;
  nullable: boolean;
};

const rowToColumnInfo = (row: unknown): ColumnInfo => {
  const typed = row as {
    column_default: string | null;
    is_nullable: 'YES' | 'NO';
    data_type: string;
    character_maximum_length: number | null;
  };

  return {
    defaultValue: typed.column_default,
    type: typed.data_type,
    maxLength: typed.character_maximum_length,
    nullable: typed.is_nullable === 'YES',
  };
};

export class ColumnInfoMethods {
  columnInfo<
    T extends Query,
    Column extends keyof T['shape'] | undefined = undefined,
  >(this: T, column?: Column): SetQueryReturnsColumnInfo<T, Column> {
    return this.clone()._columnInfo(column);
  }

  _columnInfo<
    T extends Query,
    Column extends keyof T['shape'] | undefined = undefined,
  >(this: T, column?: Column): SetQueryReturnsColumnInfo<T, Column> {
    this.query.type = 'columnInfo';
    this.query.returnType = 'all';

    if (column) {
      (this.query as ColumnInfoQueryData).column = column as string;
    }

    this.query.handleResult = (_, result) => {
      if (column) {
        return rowToColumnInfo(result.rows[0]);
      } else {
        const info: Record<string, ColumnInfo> = {};
        result.rows.forEach((row) => {
          info[(row as { column_name: string }).column_name] =
            rowToColumnInfo(row);
        });
        return info;
      }
    };

    return this as unknown as SetQueryReturnsColumnInfo<T, Column>;
  }
}
