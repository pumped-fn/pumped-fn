import type { AnyAPI, Service } from "./types";
import { type Executor, provide } from "@pumped-fn/core";
import type { StandardSchemaV1 } from "./standardschema";

type RequestBuilder = <A extends AnyAPI>(
  id: string,
  def: AnyAPI,
  params: unknown,
) => Promise<StandardSchemaV1.InferOutput<A["output"]>>;

export const clientProvider =
  <S extends Service>(def: S, requestBuilder: RequestBuilder) =>
  async <K extends keyof S, I extends StandardSchemaV1.InferInput<S[K]["input"]>>(
    key: K,
    ...params: I extends undefined ? [] : [I]
  ): Promise<StandardSchemaV1.InferOutput<S[K]["output"]>> => {
    console.log(params);
    return await requestBuilder(key as string, def[key], params.at(0));
  };

export function buildClient<S extends Service>(def: S, requestBuilder: RequestBuilder | Executor<RequestBuilder>) {
  if (typeof requestBuilder === "function") {
    return provide(() => clientProvider(def, requestBuilder));
  }

  return provide([requestBuilder], async ([requestBuilder]) => {
    return clientProvider(def, requestBuilder);
  });
}

export function defineRequestBuilder(def: RequestBuilder): RequestBuilder {
  return def;
}
