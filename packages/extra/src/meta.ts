import { validateInput, type StandardSchemaV1 } from "./standardschema";

export interface Meta<S extends symbol, V> {
	readonly key: S;
	readonly schema: StandardSchemaV1<V>;
	readonly value: V;
}

export const meta = <S extends symbol, V>(
	key: S,
	schema: StandardSchemaV1<V>,
): ((value: V) => Meta<S, V>) => {
	return (value) => ({
		key,
		schema,
		value,
	});
};

export type InferMeta<S> = S extends Meta<symbol, infer V> ? V : never;

export async function getValue<V>(meta: Meta<symbol, V>) {
	return await validateInput(meta.schema, meta.value);
}

export async function findValue<V = unknown>(
	metas: Meta<symbol, unknown>[],
	key: symbol,
): Promise<V | undefined> {
	const maybeMeta = metas.find((meta) => meta.key === key);

	return maybeMeta ? await getValue(maybeMeta as Meta<symbol, V>) : undefined;
}
