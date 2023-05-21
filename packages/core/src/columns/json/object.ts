import {
  constructType,
  DeepPartial,
  JSONType,
  JSONTypeAny,
  toCode,
} from './typeBase';
import { JSONOptional, optional } from './optional';
import { addCode, Code } from '../code';
import { MessageParam } from '../commonMethods';
import { singleQuote } from '../../utils';

// base type for JSON object shape
export type JSONObjectShape = Record<string, JSONTypeAny>;

// JSON object mode
// `strip` is a default, remove unknown properties
// `passthrough` will preserve unknown properties
// `strict` will throw error when meet unknown properties
export type UnknownKeysParam = 'passthrough' | 'strict' | 'strip';

// make all object properties to be optional
type FullyPartial<T extends JSONObjectShape> = {
  [K in keyof T]: JSONOptional<T[K]>;
};

// make the given object properties to be optional
type PartiallyPartial<T extends JSONObjectShape, P extends keyof T> = {
  [K in keyof T]: K extends P ? JSONOptional<T[K]> : T[K];
};

// not sure why is this needed, copied from Zod
export type identity<T> = T;

// not sure why is this needed, copied from Zod
export type flatten<T extends object> = identity<{ [k in keyof T]: T[k] }>;

// get the keys of object properties that can be undefined
type optionalKeys<T extends object> = {
  [k in keyof T]: undefined extends T[k] ? k : never;
}[keyof T];

// get the keys of object properties that cannot be undefined
type requiredKeys<T extends object> = {
  [k in keyof T]: undefined extends T[k] ? never : k;
}[keyof T];

// not sure why is this needed, copied from Zod
export type addQuestionMarks<T extends object> = Partial<
  Pick<T, optionalKeys<T>>
> &
  Pick<T, requiredKeys<T>>;

// not sure why is this needed, copied from Zod
export type baseObjectOutputType<Shape extends JSONObjectShape> = flatten<
  addQuestionMarks<{
    [k in keyof Shape]: Shape[k]['type'];
  }>
>;

// get the output type of JSON object shape
// when Catchall is JSONTypeAny, resulting type will have { [K: string]: any } signature
type ObjectOutputType<
  Shape extends JSONObjectShape,
  Catchall extends JSONTypeAny,
> = JSONTypeAny extends Catchall
  ? baseObjectOutputType<Shape>
  : flatten<baseObjectOutputType<Shape> & { [k: string]: Catchall['type'] }>;

// strict equal of two types
export type IsEqual<T, U> = (<G>() => G extends T ? 1 : 2) extends <
  G,
>() => G extends U ? 1 : 2
  ? true
  : false;

type Filter<KeyType, ExcludeType> = IsEqual<KeyType, ExcludeType> extends true
  ? never
  : KeyType extends ExcludeType
  ? never
  : KeyType;

export type Except<ObjectType, KeysType extends keyof ObjectType> = {
  [KeyType in keyof ObjectType as Filter<
    KeyType,
    KeysType
  >]: ObjectType[KeyType];
};

export type Merge<FirstType, SecondType> = Except<
  FirstType,
  Extract<keyof FirstType, keyof SecondType>
> &
  SecondType;

export interface JSONObject<
  T extends JSONObjectShape,
  UnknownKeys extends UnknownKeysParam = 'strip',
  Catchall extends JSONTypeAny = JSONTypeAny,
  Output = ObjectOutputType<T, Catchall>,
> extends JSONType<Output, 'object'> {
  shape: T;
  unknownKeys: UnknownKeys;
  catchAllType: Catchall;
  extend<S extends JSONObjectShape>(
    shape: S,
  ): JSONObject<Merge<T, S>, UnknownKeys, Catchall>;
  merge<
    S extends JSONObjectShape,
    U extends UnknownKeysParam,
    C extends JSONTypeAny,
  >(
    obj: JSONObject<S, U, C>,
  ): JSONObject<Merge<T, S>, U, C>;
  pick<K extends keyof T>(
    ...arr: K[]
  ): JSONObject<Pick<T, K>, UnknownKeys, Catchall>;
  omit<K extends keyof T>(
    ...arr: K[]
  ): JSONObject<Omit<T, K>, UnknownKeys, Catchall>;
  partial(): JSONObject<FullyPartial<T>, UnknownKeys, Catchall>;
  partial<P extends keyof T>(
    ...arr: P[]
  ): JSONObject<PartiallyPartial<T, P>, UnknownKeys, Catchall>;
  deepPartial(): JSONObject<
    { [k in keyof T]: JSONOptional<DeepPartial<T[k]>> },
    UnknownKeys,
    Catchall
  >;
  passthrough(): JSONObject<T, 'passthrough', Catchall>;
  strict(params?: MessageParam): JSONObject<T, 'strict', Catchall>;
  strip(): JSONObject<T, 'strip', Catchall>;
  catchAll<C extends JSONTypeAny>(type: C): JSONObject<T, UnknownKeys, C>;
}

export const object = <
  T extends JSONObjectShape,
  UnknownKeys extends UnknownKeysParam = 'strip',
  Catchall extends JSONTypeAny = JSONTypeAny,
>(
  shape: T,
): JSONObject<T, UnknownKeys, Catchall> => {
  return constructType<JSONObject<T, UnknownKeys, Catchall>>({
    dataType: 'object' as const,
    shape,
    unknownKeys: 'strip' as UnknownKeys,
    catchAllType: undefined as unknown as Catchall,
    toCode(this: JSONObject<JSONObjectShape, UnknownKeysParam>, t: string) {
      const { shape } = this;
      const code: Code[] = [
        `${t}.object({`,
        Object.keys(shape).map((key) => `${key}: ${shape[key].toCode(t)},`),
        '})',
      ];

      if (this.unknownKeys === 'passthrough') {
        addCode(code, '.passthrough()');
      } else if (this.unknownKeys === 'strict') {
        const error = this.data.errors?.strict;
        addCode(code, `.strict(${error ? singleQuote(error) : ''})`);
      }

      if (this.catchAllType) {
        addCode(code, `.catchAll(${this.catchAllType.toCode(t)})`);
      }

      return toCode(this, t, code);
    },
    extend<S extends JSONObjectShape>(add: S) {
      return object<Merge<T, S>, UnknownKeys, Catchall>(
        Object.assign({ ...this.shape }, add),
      );
    },
    merge<
      S extends JSONObjectShape,
      U extends UnknownKeysParam,
      C extends JSONTypeAny,
    >(obj: JSONObject<S, U, C>) {
      return object<Merge<T, S>, U, C>(
        Object.assign({ ...this.shape }, obj.shape),
      );
    },
    pick<K extends keyof T>(...arr: K[]) {
      const picked = {} as Pick<T, K>;
      arr.forEach((key) => (picked[key] = this.shape[key]));
      return object<Pick<T, K>, UnknownKeys, Catchall>(picked);
    },
    omit<K extends keyof T>(...arr: K[]) {
      const picked = {} as Omit<T, K>;
      for (const key in this.shape) {
        if (!arr.includes(key as unknown as K)) {
          (picked as T)[key] = this.shape[key];
        }
      }
      return object<Omit<T, K>, UnknownKeys, Catchall>(picked);
    },
    partial<P extends keyof T>(...arr: P[]) {
      const mapped = { ...this.shape };

      if (arr.length) {
        arr.forEach((key) => {
          mapped[key] = mapped[key].optional();
        });
      } else {
        for (const key in mapped) {
          mapped[key] = mapped[key].optional();
        }
      }

      return object<typeof mapped, UnknownKeys, Catchall>(mapped);
    },
    deepPartial(this: JSONObject<T, UnknownKeys, Catchall>) {
      const newShape: JSONObjectShape = {};

      for (const key in this.shape) {
        newShape[key] = optional(this.shape[key].deepPartial());
      }

      return {
        ...this,
        shape: newShape,
      };
    },
    passthrough(this: JSONObject<T, UnknownKeys, Catchall>) {
      return {
        ...this,
        unknownKeys: 'passthrough',
      } as JSONObject<T, 'passthrough', Catchall>;
    },
    strict(this: JSONObject<T, UnknownKeys, Catchall>, params?: MessageParam) {
      return {
        ...this,
        unknownKeys: 'strict',
        data: {
          ...this.data,
          errors: {
            ...this.data.errors,
            strict: typeof params === 'string' ? params : params?.message,
          },
        },
      } as JSONObject<T, 'strict', Catchall>;
    },
    strip(this: JSONObject<T, UnknownKeys, Catchall>) {
      return {
        ...this,
        unknownKeys: 'strip',
      } as JSONObject<T, 'strip', Catchall>;
    },
    catchAll<C extends JSONTypeAny>(
      this: JSONObject<T, UnknownKeys, C>,
      type: C,
    ) {
      return {
        ...this,
        catchAllType: type,
      };
    },
  });
};
