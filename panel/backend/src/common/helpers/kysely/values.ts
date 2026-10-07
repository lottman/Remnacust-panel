import { AliasedRawBuilder, RawBuilder, sql } from 'kysely';

type Unwrap<T> = T extends RawBuilder<infer U> ? U : T;
type UnwrapRecord<R> = { [K in keyof R]: Unwrap<R[K]> };

export function values<R extends Record<string, unknown>, A extends string>(
    records: R[],
    alias: A,
): AliasedRawBuilder<UnwrapRecord<R>, A> {
    const keys = Object.keys(records[0]) as (keyof R)[];

    const rows = sql.join(records.map((r) => sql`(${sql.join(keys.map((k) => r[k]))})`));

    const wrappedAlias = sql.ref(alias);
    const wrappedColumns = sql.join(keys.map((k) => sql.ref(String(k))));
    const aliasSql = sql`${wrappedAlias}(${wrappedColumns})`;

    return sql<UnwrapRecord<R>>`(values ${rows})`.as<A>(aliasSql);
}
