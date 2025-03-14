import type { StandardSchemaV1 } from "./standardschema";

export interface API<I, O> extends Record<string | symbol, unknown> {
  readonly input: StandardSchemaV1<I>;
  readonly output: StandardSchemaV1<O>;
}

export interface Stream<MI, MO, I, O> extends API<I, O> {
  readonly messageIn: StandardSchemaV1<MI>;
  readonly messageOut: StandardSchemaV1<MO>;
}

export type AnyAPI = API<unknown, unknown>;

export function api<I, O>(api: API<I, O>): typeof api {
  return api;
}

export function stream<MI, MO, I, O>(stream: Stream<MI, MO, I, O>): typeof stream {
  return stream;
}

export interface Service extends Record<string, AnyAPI> {}

export function service<Service extends Record<string, AnyAPI>>(service: Service) {
  return service;
}
