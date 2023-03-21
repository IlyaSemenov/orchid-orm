import { ColumnData, ColumnType, ForeignKey } from './columnType';
import { TableData } from './columnTypes';
import {
  addCode,
  Code,
  columnChainToCode,
  columnDefaultArgumentToCode,
  columnErrorMessagesToCode,
  ColumnsShapeBase,
  ColumnTypeBase,
  isRaw,
  objectHasValues,
  quoteObjectKey,
  RawExpression,
  rawToCode,
  singleQuote,
  singleQuoteArray,
  toArray,
} from 'orchid-core';

const isDefaultTimeStamp = (item: ColumnTypeBase) => {
  if (item.dataType !== 'timestamp') return false;

  const def = item.data.default;
  return def && isRaw(def) && def.__raw === 'now()';
};

const combineCodeElements = (input: Code): Code => {
  if (typeof input === 'string') return input;

  const output: Code = [];
  let i = -1;

  for (const item of input) {
    if (typeof item === 'string') {
      if (typeof output[i] === 'string') {
        output[i] += item;
      } else {
        output[++i] = item;
      }
    } else {
      output[++i] = combineCodeElements(item);
    }
  }

  return output;
};

export const columnsShapeToCode = (
  shape: ColumnsShapeBase,
  tableData: TableData,
  t: string,
): Code[] => {
  const hasTimestamps =
    'createdAt' in shape &&
    isDefaultTimeStamp(shape.createdAt) &&
    'updatedAt' in shape &&
    isDefaultTimeStamp(shape.updatedAt);

  const code: Code = [];

  for (const key in shape) {
    if (hasTimestamps && (key === 'createdAt' || key === 'updatedAt')) continue;

    code.push(
      ...combineCodeElements([
        `${quoteObjectKey(key)}: `,
        ...toArray(shape[key].toCode(t)),
        ',',
      ]),
    );
  }

  if (hasTimestamps) {
    code.push(`...${t}.timestamps(),`);
  }

  const { primaryKey, indexes, foreignKeys } = tableData;
  if (primaryKey) {
    code.push(primaryKeyToCode(primaryKey, t));
  }

  for (const index of indexes) {
    code.push(...indexToCode(index, t));
  }

  for (const foreignKey of foreignKeys) {
    code.push(...foreignKeyToCode(foreignKey, t));
  }

  return code;
};

export const primaryKeyToCode = (
  primaryKey: TableData.PrimaryKey,
  t: string,
): string => {
  const name = primaryKey.options?.name;

  return `...${t}.primaryKey([${primaryKey.columns
    .map(singleQuote)
    .join(', ')}]${name ? `, { name: ${singleQuote(name)} }` : ''}),`;
};

export const indexToCode = (index: TableData.Index, t: string): Code[] => {
  const code: Code[] = [];

  code.push(`...${t}.index(`);

  const columnsMultiline = index.columns.some((column) => {
    for (const key in column) {
      if (key !== 'column' && column[key as keyof typeof column] !== undefined)
        return true;
    }
    return false;
  });
  if (columnsMultiline) {
    const objects: Code[] = [];

    for (const column of index.columns) {
      const expr = 'column' in column ? column.column : column.expression;

      let hasOptions = false;
      for (const key in column) {
        if (key !== 'column' && key !== 'expression') {
          hasOptions = true;
        }
      }

      if (!hasOptions) {
        objects.push(`${singleQuote(expr)},`);
      } else {
        const props: Code[] = [
          `${'column' in column ? 'column' : 'expression'}: ${singleQuote(
            expr,
          )},`,
        ];
        if (column.collate !== undefined) {
          props.push(`collate: ${singleQuote(column.collate)},`);
        }
        if (column.opclass !== undefined) {
          props.push(`opclass: ${singleQuote(column.opclass)},`);
        }
        if (column.order !== undefined) {
          props.push(`order: ${singleQuote(column.order)},`);
        }

        objects.push('{', props, '},');
      }
    }

    code.push(['[', objects, ']']);
  } else {
    addCode(
      code,
      `[${index.columns
        .map((it) => singleQuote((it as { column: string }).column))
        .join(', ')}]`,
    );
  }

  const hasOptions = objectHasValues(index.options);
  if (hasOptions) {
    if (columnsMultiline) {
      const columns = code[code.length - 1] as string[];
      columns[columns.length - 1] += ',';
      code.push(['{']);
    } else {
      addCode(code, ', {');
    }

    const options: string[] = [];
    for (const key in index.options) {
      const value = index.options[key as keyof typeof index.options];
      if (value === null || value === undefined) continue;

      options.push(
        `${key}: ${
          typeof value === 'object'
            ? singleQuoteArray(value)
            : typeof value === 'string'
            ? singleQuote(value)
            : value
        },`,
      );
    }

    if (columnsMultiline) {
      code.push([options, '},']);
    } else {
      code.push(options);
      addCode(code, '}');
    }
  }

  if (columnsMultiline) {
    code.push('),');
  } else {
    addCode(code, '),');
  }

  return code;
};

export const foreignKeyToCode = (
  foreignKey: TableData.ForeignKey,
  t: string,
): Code[] => {
  return [`...${t}.foreignKey(`, foreignKeyArgsToCode(foreignKey), '),'];
};

export const foreignKeyArgsToCode = (
  foreignKey: TableData.ForeignKey,
): Code[] => {
  const args: Code[] = [];

  args.push(`${singleQuoteArray(foreignKey.columns)},`);

  args.push(
    `${
      typeof foreignKey.fnOrTable === 'string'
        ? singleQuote(foreignKey.fnOrTable)
        : foreignKey.fnOrTable.toString()
    },`,
  );

  args.push(`${singleQuoteArray(foreignKey.foreignColumns)},`);

  const { options } = foreignKey;
  if (objectHasValues(foreignKey.options)) {
    const lines: string[] = [];
    for (const key in foreignKey.options) {
      const value = options[key as keyof typeof options];
      if (value) lines.push(`${key}: ${singleQuote(value)},`);
    }
    args.push('{', lines, '},');
  }

  return args;
};

export const columnForeignKeysToCode = (
  foreignKeys: ForeignKey<string, string[]>[],
): Code[] => {
  const code: Code[] = [];
  for (const foreignKey of foreignKeys) {
    addCode(code, `.foreignKey(`);
    for (const part of foreignKeyArgumentToCode(foreignKey)) {
      addCode(code, part);
    }
    addCode(code, ')');
  }
  return code;
};

export const foreignKeyArgumentToCode = (
  foreignKey: ForeignKey<string, string[]>,
): Code[] => {
  const code: Code = [];

  if ('fn' in foreignKey) {
    code.push(foreignKey.fn.toString());
  } else {
    code.push(singleQuote(foreignKey.table));
  }
  addCode(code, `, ${singleQuote(foreignKey.columns[0])}`);

  const hasOptions =
    foreignKey.name ||
    foreignKey.match ||
    foreignKey.onUpdate ||
    foreignKey.onDelete;

  if (hasOptions) {
    const arr: string[] = [];

    if (foreignKey.name) arr.push(`name: ${singleQuote(foreignKey.name)},`);
    if (foreignKey.match) arr.push(`match: ${singleQuote(foreignKey.match)},`);
    if (foreignKey.onUpdate)
      arr.push(`onUpdate: ${singleQuote(foreignKey.onUpdate)},`);
    if (foreignKey.onDelete)
      arr.push(`onDelete: ${singleQuote(foreignKey.onDelete)},`);

    addCode(code, ', {');
    code.push(arr);
    addCode(code, '}');
  }

  return code;
};

export const columnIndexesToCode = (
  indexes: Exclude<ColumnData['indexes'], undefined>,
): Code[] => {
  const code: Code[] = [];
  for (const index of indexes) {
    addCode(code, `.${index.unique ? 'unique' : 'index'}(`);

    const arr: string[] = [];

    if (index.collate) arr.push(`collate: ${singleQuote(index.collate)},`);
    if (index.opclass) arr.push(`opclass: ${singleQuote(index.opclass)},`);
    if (index.order) arr.push(`order: ${singleQuote(index.order)},`);
    if (index.name) arr.push(`name: ${singleQuote(index.name)},`);
    if (index.using) arr.push(`using: ${singleQuote(index.using)},`);
    if (index.include)
      arr.push(
        `include: ${
          typeof index.include === 'string'
            ? singleQuote(index.include)
            : `[${index.include.map(singleQuote).join(', ')}]`
        },`,
      );
    if (index.with) arr.push(`with: ${singleQuote(index.with)},`);
    if (index.tablespace)
      arr.push(`tablespace: ${singleQuote(index.tablespace)},`);
    if (index.where) arr.push(`where: ${singleQuote(index.where)},`);

    if (arr.length) {
      addCode(code, '{');
      addCode(code, arr);
      addCode(code, '}');
    }

    addCode(code, ')');
  }
  return code;
};

export const columnCheckToCode = (t: string, check: RawExpression): string => {
  return `.check(${rawToCode(t, check)})`;
};

export const columnCode = (type: ColumnType, t: string, code: Code): Code => {
  code = toArray(code);

  let prepend = `${t}.`;
  if (type.data.name) {
    prepend += `name(${singleQuote(type.data.name)}).`;
  }

  if (typeof code[0] === 'string') {
    code[0] = `${prepend}${code[0]}`;
  } else {
    code[0].unshift(prepend);
  }

  if (type.data.isPrimaryKey) addCode(code, '.primaryKey()');

  if (type.data.foreignKeys) {
    for (const part of columnForeignKeysToCode(type.data.foreignKeys)) {
      addCode(code, part);
    }
  }

  if (type.data.isHidden) addCode(code, '.hidden()');

  if (type.data.isNullable) addCode(code, '.nullable()');

  if (type.encodeFn) addCode(code, `.encode(${type.encodeFn.toString()})`);

  if (type.parseFn && !('hideFromCode' in type.parseFn))
    addCode(code, `.parse(${type.parseFn.toString()})`);

  if (type.data.as) addCode(code, `.as(${type.data.as.toCode(t)})`);

  if (type.data.default) {
    addCode(
      code,
      `.default(${columnDefaultArgumentToCode(t, type.data.default)})`,
    );
  }

  if (type.data.indexes) {
    for (const part of columnIndexesToCode(type.data.indexes)) {
      addCode(code, part);
    }
  }

  if (type.data.comment)
    addCode(code, `.comment(${singleQuote(type.data.comment)})`);

  if (type.data.check) {
    addCode(code, columnCheckToCode(t, type.data.check));
  }

  if (type.data.errors) {
    for (const part of columnErrorMessagesToCode(type.data.errors)) {
      addCode(code, part);
    }
  }

  const { validationDefault } = type.data;
  if (validationDefault) {
    addCode(
      code,
      `.validationDefault(${
        typeof validationDefault === 'function'
          ? validationDefault.toString()
          : typeof validationDefault === 'string'
          ? singleQuote(validationDefault)
          : JSON.stringify(validationDefault)
      })`,
    );
  }

  if (type.data.compression)
    addCode(code, `.compression(${singleQuote(type.data.compression)})`);

  if (type.data.collate)
    addCode(code, `.collate(${singleQuote(type.data.collate)})`);

  if (type.data.modifyQuery)
    addCode(code, `.modifyQuery(${type.data.modifyQuery.toString()})`);

  return columnChainToCode(type.chain, t, code);
};
