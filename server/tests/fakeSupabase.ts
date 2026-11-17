// Chainable stand-in for the supabase-js query builder. It records every call
// so tests can check the query that was built.
type RecordedOp = {
  op: string;
  args: unknown[];
};

export interface RecordedQuery {
  table: string;
  ops: RecordedOp[];
}

type FakeResponse = {
  data?: unknown;
  error?: unknown;
  count?: number;
};

type Responder = (query: RecordedQuery) => FakeResponse;

export function createFakeSupabase(respond: Responder = () => ({ data: [] })) {
  const queries: RecordedQuery[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];

  function createQueryBuilder(table: string) {
    const query: RecordedQuery = { table, ops: [] };
    queries.push(query);

    // A Proxy accepts any builder method, so the fake does not need to list them.
    // Awaiting the builder reads "then", which is when the responder runs.
    const builder: any = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            const response = respond(query);

            const result = {
              data: response.data ?? null,
              error: response.error ?? null,
              count: response.count ?? null,
            };

            return (resolve: (value: unknown) => void) => resolve(result);
          }

          return (...args: unknown[]) => {
            query.ops.push({ op: prop, args });
            return builder;
          };
        },
      }
    );

    return builder;
  }

  async function rpc(fn: string, args: unknown) {
    rpcCalls.push({ fn, args });
    return { data: { application_id: "app-1", created: true }, error: null };
  }

  function findOp(query: RecordedQuery, name: string) {
    return query.ops.find((recorded) => recorded.op === name);
  }

  return {
    client: {
      from: (table: string) => createQueryBuilder(table),
      rpc,
    } as any,
    queries,
    rpcCalls,
    op: findOp,
  };
}
