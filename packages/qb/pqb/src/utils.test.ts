import { assertType } from './test-utils/test-utils';
import {
  makeRegexToFindInSql,
  pushOrNewArray,
  pushOrNewArrayToObject,
  quoteObjectKey,
  singleQuote,
} from './utils';
import { MaybeArray, SetOptional, SomeIsTrue } from '../../common/src/utils';

describe('utils', () => {
  describe('SomeIsTrue', () => {
    it('should be true if some is true', () => {
      assertType<SomeIsTrue<[false, false, true, false]>, true>();
    });

    it('should be false if none is true', () => {
      assertType<SomeIsTrue<[false, false, false]>, false>();
    });

    it('should be false if types array is empty', () => {
      assertType<SomeIsTrue<[]>, false>();
    });
  });

  describe('MaybeArray', () => {
    it('should turn a type into union of T | T[]', () => {
      assertType<MaybeArray<number>, number | number[]>();
    });
  });

  describe('SetOptional', () => {
    it('should make specified keys optional', () => {
      assertType<
        SetOptional<{ a: number; b: string; c: boolean }, 'b' | 'c'>,
        {
          a: number;
          b?: string;
          c?: boolean;
        }
      >();
    });
  });

  describe('makeRegexToFindWordInSql', () => {
    it('should return a proper regex', () => {
      const regex = makeRegexToFindInSql('\\bupdatedAt\\b');

      expect('koupdatedAtko'.match(regex)).toBe(null);
      expect('updatedAtko'.match(regex)).toBe(null);
      expect('koupdatedAt'.match(regex)).toBe(null);
      expect('updatedAt'.match(regex)).toEqual(['updatedAt']);
      expect(' updatedAt '.match(regex)).toEqual(['updatedAt']);
      expect("'updatedAt'".match(regex)).toEqual(null);
    });
  });

  describe('pushOrNewArrayToObject', () => {
    it('should define new array with value when object has no array by provided key', () => {
      const obj: { ko?: number[] } = {};

      pushOrNewArrayToObject(obj, 'ko', 123);

      expect(obj).toEqual({
        ko: [123],
      });
    });

    it('should push value to array when obj has array by provided key', () => {
      const obj = { ko: [] as number[] };

      pushOrNewArrayToObject(obj, 'ko', 123);

      expect(obj).toEqual({
        ko: [123],
      });
    });
  });

  describe('pushOrNewArray', () => {
    it('should return new array with value when array is not provided', () => {
      const arr: number[] | undefined = undefined;

      expect(pushOrNewArray(arr, 123)).toEqual([123]);
    });

    it('should push value to array when array is provided', () => {
      const arr: number[] | undefined = [];

      expect(pushOrNewArray(arr, 123)).toEqual([123]);
    });
  });

  describe('singleQuote', () => {
    it('should put string into single quotes, escape single quotes and backslashes', () => {
      expect(singleQuote(`ko`)).toBe(`'ko'`);
      expect(singleQuote(`k'o`)).toBe(`'k\\'o'`);
      expect(singleQuote(`k\\'o`)).toBe(`'k\\\\\\'o'`);
    });
  });

  describe('quoteObjectKey', () => {
    it('should leave simple key unquoted', () => {
      expect(quoteObjectKey('Abc123')).toBe('Abc123');
      expect(quoteObjectKey('_')).toBe('_');
    });

    it('should surround a key with special characters with single quotes', () => {
      expect(quoteObjectKey('123')).toBe(`'123'`);
      expect(quoteObjectKey('&')).toBe(`'&'`);
    });
  });
});
