# Query methods

Table interface (returned from `db(table, () => schema)` or `db.table` when using ORM) has lots of query methods.

Each query method does **not** mutate the query chain, so calling it conditionally won't have an effect:

```ts
let query = Table.select('id', 'name')

// WRONG: won't have effect
if (params.name) {
  query.where({ name: params.name })
}

// CORRECT: reassign `query` variable
if (params.name) {
  query = query.where({ name: params.name })
}

const results = await query
```

Each query method has a mutating pair starting with `_`:
```ts
const query = Table.select('id', 'name')

// Calling mutating method `_where`:
if (params.name) {
  query._where({ name: params.name })
}

const results = await query
```

Mutating methods started with `_` are used internally, however, their use is not recommended because it would be easier to make mistakes, code will be less obvious.

## querying multiple records, single, arrays, values

Query methods are building blocks for a query chain, and when a query is a ready use `await` to get all records:
```ts
const records: { id: number, name: string }[] = await Table.select('id', 'name')
```

`.take()` to get only one record, it will add `LIMIT 1` to the query and will throw `NotFoundError` when not found.

`.find(id)` and `.findBy(conditions)` also returns one record.

```ts
import { NotFoundError } from 'pqb'

try {
  // take one record:
  const takenRecord = await Table.take()

  const foundById = await Table.find(1)

  const foundByConditions = await Table.findBy({ email: 'some@email.com' })
} catch (err) {
  if (err instanceof NotFoundError) {
    // handle error
  }
}
```

`.takeOptional()` to get one record or `undefined` when not found.

`.findOptional(id)` and `.findByOptional(conditions)` also returns one record or `undefined`.

```ts
const recordOrUndefined = await Table.takeOptional()
```

`.rows` returns an array of rows without field names:
```ts
const rows = await Table.rows()
rows.forEach((row) => {
  row.forEach((value) => {
    // ...
  })
})
```

`.pluck` returns an array of values:
```ts
const ids = await Table.select('id').pluck()
// ids are an array of all users' id
```

`.get` returns a single value, it will add `LIMIT 1` to the query, and accepts a column name or a raw expression.
It will throw `NotFoundError` when not found.
```ts
import { NumberColumn } from 'pqb'

const firstName: string = await Table.get('name')

const rawResult: number = await Table.get(Table.raw((t) => t.integer(), '1 + 1'))
```

`.getOptional` returns a single value or undefined when not found:
```ts
const firstName: string | undefined = await Table.getOptional('name')
```

`.exec` won't parse the response at all, and returns undefined:
```ts
const nothing = await Table.take().exec()
```

`.all` is a default behavior, that returns an array of objects:
```ts
const records = Table
  .take() // .take() will be overridden by .all()
  .all()
```

## raw

When there is a need to use a piece of raw SQL, use the `raw` method.

When it is needed to select a value with raw SQL, the first argument is a callback with type.
The inferred type will be used for the query result.

```ts
const result: { num: number }[] = await Table.select({
  num: Table.raw((t) => t.integer(), '1 + 2'),
})
```

When you need to have variables inside a SQL query, name them in the format `$name` and provide an object with values:

```ts
const result: { num: number }[] = await Table.select({
  num: Table.raw((t) => t.integer(), '$a + $b', {
    a: 1,
    b: 2,
  }),
})
```

Inserting values directly into the query is not correct, as it opens the door for possible SQL injections:

```ts
// request params values may contain SQL injections:
const { a, b } = req.params

await Table.select({
  // do NOT do it this way:
  value: Table.raw((t) => t.integer(), `${a} + ${b}`),
})
```

When using raw SQL in a `where` statement or in any other place which does not affect the query result, omit the first type argument, and provide only SQL:

```ts
const result = await Table.where(Table.raw('someColumn = $value', { value: 123 }))
```

## select

Takes a list of columns to be selected, and by default, the query builder will select all columns of the table.

Pass an object to select columns with aliases. Keys of the object are column aliases, value can be a column name, sub-query, or raw expression.

```ts
// select columns of the table:
Table.select('id', 'name', { idAlias: 'id' })

// accepts columns with table names:
Table.select('user.id', 'user.name', { nameAlias: 'user.name' })

// table name may refer to the current table or a joined table:
Table
  .join(Message, 'authorId', 'id')
  .select('user.name', 'message.text', { textAlias: 'message.text' })

// select value from the sub-query,
// this sub-query should return a single record and a single column:
Table.select({
  subQueryResult: OtherTable.select('column').take(),
})

// select raw SQL value, the first argument of `raw` is a column type, it is used for return type of the query
Table.select({
  raw: Table.raw((t) => t.integer(), '1 + 2'),
})

// same raw SQL query as above, but raw value is returned from a callback
Table.select({
  raw: (q) => q.raw((t) => t.integer(), '1 + 2'),
})
```

When you use the ORM and defined relations, `select` can also accept callbacks with related table queries:

```ts
await db.author.select({
  allBooks: (q) => q.books,
  firstBook: (q) => q.books.order({ createdAt: 'ASC' }).take(),
  booksCount: (q) => q.books.count(),
})
```

## selectAll

When querying the table or creating records, all columns are selected by default,
but updating and deleting queries are returning affected row counts by default.

Use `selectAll` to select all columns. If the `.select` method was applied before it will be discarded.

```ts
const selectFull = await Table
  .select('id', 'name') // discarded by `selectAll`
  .selectAll()

const updatedFull = await Table
  .selectAll()
  .where(conditions)
  .update(data)

const deletedFull = await Table
  .selectAll()
  .where(conditions)
  .delete()
```

## distinct

Adds a `DISTINCT` keyword to `SELECT`:

```ts
Table.distinct().select('name')
```

Can accept column names or raw expressions to place it to `DISTINCT ON (...)`:

```ts
// Distinct on the name and raw SQL
Table.distinct('name', Table.raw('raw sql')).select('id', 'name')
```

## as

Sets table alias:
```ts
Table.as('u').select('u.name')

// Can be used in the join:
Table.join(Profile.as('p'), 'p.userId', 'user.id')
```

## from

Set the `FROM` value, by default the table name is used.
```ts
// accepts sub-query:
Table.from(OtherTable.select('foo', 'bar'))

// accepts raw query:
Table.from(Table.raw('raw sql expression'))

// accepts alias of `WITH` expression:
q.with('foo', OtherTable.select('id', 'name'))
  .from('foo');
```

Optionally takes a second argument of type `{ only?: boolean }`, (see `FROM ONLY` in Postgres docs, this is related to table inheritance).

```ts
Table.from(
  OtherTable.select('foo', 'bar'),
  {
    only: true,
  }
)
```

## offset

Adds an offset clause to the query.
```ts
Table.offset(10)
```

## limit

Adds a limit clause to the query.
```ts
Table.limit(10)
```

## truncate

Truncates the specified table.

```ts
// simply truncate
await Table.truncate()

// restart autoincrementing columns:
await Table.truncate({ restartIdentity: true })

// truncate also dependant tables:
await Table.truncate({ cascade: true })
```

## clone

Clones the current query chain, useful for re-using partial query snippets in other queries without mutating the original.

Used under the hood, and not really needed on the app side.

## join

Several methods are provided that assist in building joins, and they all take the same arguments:

| method         | SQL join type    | description                                                                            |
|----------------|------------------|----------------------------------------------------------------------------------------|
| join           | JOIN             | returns rows when there is a match in both tables.                                     |
| innerJoin      | INNER JOIN       | equals to join.                                                                        |
| leftJoin       | LEFT JOIN        | returns all rows from the left table, even if there are no matches in the right table. |
| leftOuterJoin  | LEFT OUTER JOIN  | equals to leftJoin.                                                                    |
| rightJoin      | RIGHT JOIN       | returns all rows from the right table, even if there are no matches in the left table. |
| rightOuterJoin | RIGHT OUTER JOIN | equals to rightJoin.                                                                   |
| fullOuterJoin  | FULL OUTER JOIN  | combines the results of both left and right outer joins.                               |

```ts
// Our main table is the User
const User = db('user', (t) => ({
  id: t.identity().primaryKey(),
  name: t.text(3, 100),
}))

// User has many messages, each message has a "userId" column
const Message = db('message', (t) => ({
  userId: t.integer(),
  text: t.text(1, 1000),
}))

User
  // Join message where authorId = id:
  .join(Message, 'userId', 'id')
  // after joining a table, we can use it in `where` conditions:
  .where({ 'message.text': { startsWith: 'Hi' } })
  .select(
    'name', // name is User column, table name may be omitted
    'message.text', // text is the Message column, and the table name is required
  )

// Table names can be provided for clarity:
User.join(Message, 'message.userId', 'user.id')

// Message can have table alias:
User
  .join(Message.as('msg'), 'msg.userId', 'user.id')
  .select(
    'name',
    'msg.text',
  )

// Custom comparison operator can be provided:
User.join(Message, 'userId', '!=', 'id')

// with table names:
User.join(Message, 'message.userId', '!=', 'user.id')

// can accept raw expression:
User.join(Message, User.raw('"message"."userId" = "user"."id"'))

// one of the columns or both can be raw expressions:
User.join(Message, User.raw('left raw expression'), User.raw('rigth raw expression'))

// with operator:
User.join(Message, User.raw('left raw expression'), '!=', User.raw('rigth raw expression'))

// can accept objects where keys are joined table columns and values are main table columns:
User.join(Message, {
  userId: 'id',

  // with table names:
  'message.userId': 'user.id',

  // value can be a raw expression:
  userId: User.raw('SQL expression'),
})

// join all records without conditions
User.join(Message, true)
```

`.join` and other join methods can accept a callback with a special query builder:

```ts
User.join(Message, (q) =>
  // left column is the Message column, right column is the User column
  q.on('userId', 'id')
)

User.join(Message, (q) =>
  // table names can be provided:
  q.on('message.userId', 'user.id')
)

User.join(Message, (q) =>
  // operator can be specified:
  q.on('userId', '!=', 'id')
)

User.join(Message, (q) =>
  // operator can be specified with table names as well:
  q.on('message.userId', '!=', 'user.id')
)

User.join(Message, (q) =>
  // `.orOn` takes the same arguments as `.on` and acts like `.or`:
  q
    .on('userId', 'id') // where message.userId = user.id
    .orOn('text', 'name') // or message.text = user.name
)
```

Join query builder supports all `where` methods: `.where`, `.whereIn`, `.whereExists`, and all `.or`, `.not`, and `.orNot` forms.

Column names in the where conditions are applied for the joined table, but you can specify a table name to add a condition for the main table.

```ts
User.join(Message, (q) =>
  q
    .on('userId', 'id')
    .where({
      // not prefixed column name is for joined table:
      text: { startsWith: 'hello' },
      // specify a table name to set condition on the main table:
      'user.name': 'Bob',
    })
    // id is a column of a joined table Message
    .whereIn('id', [1, 2, 3])
    // condition for id of a user
    .whereIn('user.id', [4, 5, 6])
)
```

The query above will generate the following SQL (simplified):

```sql
SELECT * FROM "user"
JOIN "message"
  ON "message"."userId" = "user"."id"
 AND "message"."text" ILIKE 'hello%'
 AND "user"."name" = 'Bob'
 AND "message"."id" IN (1, 2, 3)
 AND "user"."id" IN (4, 5, 6)
```

The join argument can be a query with `select`, `where`, and other methods. In such case, it will be handled as a sub query:

```ts
User.join(
  Message
    .select('id', 'userId', 'text')
    .where({ text: { startsWith: 'Hi' } })
    .as('t'),
  'userId',
  'id',
)
```

It will produce such SQL:

```sql
SELECT * FROM "user"
JOIN (
  SELECT "t"."id", "t"."userId", "t"."text"
  FROM "message" AS "t"
) "t" ON "t"."userId" = "user"."id"
```

## group

The `GROUP BY` SQL statement, it is accepting column names or raw expressions.

`group` is useful when aggregating values.

```ts
// Select the category and sum of prices grouped by the category
const results = Product
  .select('category')
  .selectSum('price', { as: 'sumPrice' })
  .group('category')
```

## order

Adds an order by clause to the query.

Takes one or more arguments, each argument can be a column name, an object, or a raw expression.

```ts
Table.order('id', 'name') // ASC by default

Table.order({
  id: 'ASC', // or DESC

  // to set nulls order:
  name: 'ASC NULLS FIRST',
  age: 'DESC NULLS LAST',
})

// order by raw expression:
Table.order(Table.raw('raw sql'))
```

`order` can refer to the values returned from `select` sub-queries (unlike `where` which cannot).
So you can select a count of related records and order by it.

For example, `comment` has many `likes`.
We are selecting few columns of `comment`, selecting `likesCount` by a sub-query in a select, and ordering comments by likes count:

```ts
db.comment.select(
  'title', 'content',
  {
    likesCount: (q) => q.likes.count(),
  },
).order({
  likesCount: 'DESC',
})
```

## having, havingOr

Adds a `HAVING` clause to the query.

`.having` takes aggregate function names as keys, see all functions in [aggregate functions](#aggregate-functions) section.

If the value of a function is a primitive, it's treated as `*`:

```ts
Table.having({
  count: 5,
})
```

```sql
SELECT * FROM "table"
HAVING count(*) = 5
```

If the value of the function is an object, the key is a column name to pass to the function and the value is for the equality check:

```ts
Table.having({
  count: {
    id: 5,
  },
})
```

```sql
SELECT * FROM "table"
HAVING count(id) = 5
```

The value of a function can be an object
where keys are column operators (see [column operators](#column-operators) section for full list)
and values are values to compare with.

```ts
Table.having({
  sum: {
    price: {
      gt: 10,
      lt: 20,
    }
  }
})
```

```sql
SELECT * FROM "table"
HAVING sum(price) > 10 AND sum(price) < 20
```

The `distinct` option is for the `DISTINCT` keyword in the aggregation function:

```ts
// 
Table.having({
  count: {
    column: {
      equals: 10,
      distinct: true,
    }
  }
})
```

```sql
SELECT * FROM "table"
HAVING count(DISTINCT column) = 10
```

The `order` option is for `ORDER` in the aggregation function, see [order](#order) for value spec.

```ts
Table.having({
  count: {
    column: {
      equals: 10,
      order: {
        id: 'ASC',
      }
    }
  }
})
```

```sql
SELECT * FROM "table"
HAVING count(column ORDER BY id ASC) = 10
```

`filter` is for the `FILTER` clause to apply to the aggregation function.

`filterOr` is for `OR` logic in the filter, it takes an array of conditions.

```ts
Table.having({
  count: {
    column: {
      equals: 10,
      filter: {
        id: {
          lt: 10,
        },
      },
      filterOr: [
        {
          id: {
            equals: 15,
          },
        },
        {
          id: {
            gt: 20,
          }
        }
      ]
    }
  }
})
```

```sql
SELECT * FROM "table"
HAVING
                count(column) FILTER (
            WHERE id < 10 OR id = 15 OR id > 20
            ) = 10
```

The `withinGroup` option is for the `WITHIN GROUP` SQL statement.

```ts
Table.having({
  count: {
    column: {
      equals: 10,
      withingGroup: true,
      order: {
        name: 'ASC'
      },
    }
  }
})
```

```sql
SELECT * FROM "table"
HAVING count(column) WITHIN GROUP (ORDER name ASC) = 10
```

The `.having` method supports raw SQL:

```ts
Table.having(Table.raw('raw SQL'))
```

`.havingOr` takes the same arguments as `.having`, but joins them with `OR`:

```ts
Table.havingOr({ count: 1 }, { count: 2 })
```

```sql
SELECT * FROM "table"
HAVING count(*) = 1 OR count(*) = 2
```

## log

Override the `log` option, which can also be set in `createDb` or when creating a table instance:

```ts
// turn log on for this query:
await Table.all().log(true)
await Table.all().log() // no argument for true

// turn log off for this query:
await Table.all().log(false)
```

## clear

Clears the specified operator from the query, and accepts one or more string keys.

The clear key can be one of the following:

- with
- select
- where
- union
- using
- join
- group
- order
- having
- limit
- offset
- counters: removes increment and decrement

Note that currently, it does not affect on resulting TypeScript type, it may be improved in the future.

```ts
// Clears select statement but the resulting type still has the `id` column selected.
Table.select('id').clear('id')
```

## merge

Merge two queries into one, with a decent type safety:

```ts
const query1 = Table.select('id').where({ id: 1 })
const query2 = Table.select('name').where({ name: 'name' })

// result has a proper type { id: number, name: string }
const result = await query1.merge(query2).take()
```

Main info such as table name, and column types, will not be overridden by `.merge(query)`,
but all other query data will be merged if possible (`select`, `where`, `join`, `with`, and many others),
or will be used from provided query argument if not possible to merge (`as`, `onConflict`, returning one or many).

## toSql

Call `toSql` on a query to get an object with a `text` SQL string and a `values` array of binding values:

```ts
const sql = Table.select('id', 'name').where({ name: 'name' }).toSql()

expect(sql.text).toBe('SELECT "table"."id", "table"."name" FROM "table" WHERE "table"."name" = $1')
expect(sql.values).toEqual(['name'])
```

`toSql` is called internally when awaiting a query.

It is caching the result. Not mutating query methods are resetting the cache, but need to be careful with mutating methods that start with `_` - they won't reset the cache, which may lead to unwanted results.

`toSql` optionally accepts such parameters:

```ts
type ToSqlOptions = {
  clearCache?: true
  values?: []
}
```
