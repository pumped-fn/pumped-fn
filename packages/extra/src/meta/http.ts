import { z } from "zod";
import { findValue, meta, type InferMeta, type Meta } from "../meta";

export const headerSymbol = Symbol.for("@pumped-fn.header");
export const header = meta(headerSymbol, z.record(z.string(), z.string()));

export const methodSymbol = Symbol.for("@pumped-fn.method");
export const method = meta(
  methodSymbol,
  z.union([z.literal("GET"), z.literal("POST"), z.literal("PUT"), z.literal("DELETE")]),
);

export const prefixSymbol = Symbol.for("@pumped-fn.prefix");
export const prefix = meta(prefixSymbol, z.string().startsWith("/"));

export const http = {
  header,
  method,
  prefix,
};

export const getHeader = async (
  meta: Meta<symbol, unknown>[],
): Promise<InferMeta<ReturnType<typeof header>> | undefined> => {
  return await findValue<InferMeta<ReturnType<typeof header>>>(meta, headerSymbol);
};

export const getMethod = async (
  meta: Meta<symbol, unknown>[],
): Promise<InferMeta<ReturnType<typeof method>> | undefined> => {
  return await findValue<InferMeta<ReturnType<typeof method>>>(meta, methodSymbol);
};

export const getPrefix = async (
  meta: Meta<symbol, unknown>[],
): Promise<InferMeta<ReturnType<typeof prefix>> | undefined> => {
  return await findValue<InferMeta<ReturnType<typeof prefix>>>(meta, prefixSymbol);
};
