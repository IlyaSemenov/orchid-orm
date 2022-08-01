import { QueryData } from './types';
import { Expression, getRaw, isRaw } from '../common';
import { Query } from '../query';
import { q, quoteFullColumn } from './common';
import { aggregateToSql } from './aggregate';

export const pushSelectSql = (
  sql: string[],
  select: QueryData['select'],
  quotedAs?: string,
) => {
  if (select) {
    const list: string[] = [];
    select.forEach((item) => {
      if (typeof item === 'object') {
        if ('selectAs' in item) {
          const obj = item.selectAs as Record<string, Expression | Query>;
          for (const as in obj) {
            const value = obj[as];
            if (typeof value === 'object') {
              if (isRaw(value)) {
                list.push(`${getRaw(value)} AS ${q(as)}`);
              } else {
                list.push(`(${(value as Query).json().toSql()}) AS ${q(as)}`);
              }
            } else {
              list.push(`${quoteFullColumn(value, quotedAs)} AS ${q(as)}`);
            }
          }
        } else {
          list.push(aggregateToSql(item, quotedAs));
        }
      } else {
        list.push(quoteFullColumn(item, quotedAs));
      }
    });
    sql.push(list.join(', '));
  } else {
    sql.push(`${quotedAs}.*`);
  }
};
