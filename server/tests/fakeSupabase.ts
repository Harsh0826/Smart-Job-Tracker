/** Minimal chainable stand-in for the supabase-js query builder; records every call. */
export interface RecordedQuery {
  table: string;
  ops: { op: string; args: unknown[] }[];
}

type Responder = (q: RecordedQuery) => { data?: unknown; error?: unknown; count?: number };

export function createFakeSupabase(respond: Responder = () => ({ data: [] })) {
  const queries: RecordedQuery[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];

  function builder(table: string) {
    const q: RecordedQuery = { table, ops: [] };
    queries.push(q);
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const r = respond(q);
            return (resolve: (v: unknown) => void) => resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
          }
          return (...args: unknown[]) => {
            q.ops.push({ op: prop, args });
            return proxy;
          };
        },
      }
    );
    return proxy;
  }

  return {
    client: {
      from: (table: string) => builder(table),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: { application_id: "app-1", created: true }, error: null };
      },
    } as any,
    queries,
    rpcCalls,
    op(q: RecordedQuery, name: string) {
      return q.ops.find((o) => o.op === name);
    },
  };
}
