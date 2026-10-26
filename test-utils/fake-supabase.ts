/**
 * A tiny stand-in for the Supabase query builder. Every chained call is
 * recorded; awaiting the chain asks `respond` for the result. No network.
 */
export interface FakeQuery {
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
}

export interface FakeResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export type Responder = (query: FakeQuery) => FakeResult;

export function createFakeSupabase(respond: Responder = () => ({ data: [], error: null })) {
  const queries: FakeQuery[] = [];

  function chain(query: FakeQuery): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (r: FakeResult) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve()
                .then(() => respond(query))
                .then(resolve, reject);
          }
          return (...args: unknown[]) => {
            query.ops.push({ method: String(prop), args });
            return chain(query);
          };
        },
      },
    );
  }

  const client = {
    from(table: string) {
      const query: FakeQuery = { table, ops: [] };
      queries.push(query);
      return chain(query);
    },
  };

  return { client, queries };
}

/** Arguments of the first call to `method` in a query, if any. */
export function argsOf(query: FakeQuery, method: string): unknown[] | undefined {
  return query.ops.find((op) => op.method === method)?.args;
}

export function hasOp(query: FakeQuery, method: string): boolean {
  return query.ops.some((op) => op.method === method);
}
