import { validate } from "./ssch";
import type { Meta, StandardSchemaV1 } from "./types";

export interface DataStore {
	get(key: unknown): unknown;
	set(key: unknown, value: unknown): unknown | undefined;
}

export type AccessorSource = DataStore | Meta.MetaContainer | Meta.Meta[];

interface BaseAccessor<T> {
	readonly key: symbol;
	readonly schema: StandardSchemaV1<T>;
}

export interface Accessor<T> extends BaseAccessor<T> {
	get(source: AccessorSource): T;
	find(source: AccessorSource): T | undefined;
	set(source: DataStore, value: T): void;
	preset(value: T): [symbol, T];
}

export interface AccessorWithDefault<T> extends BaseAccessor<T> {
	readonly defaultValue: T;
	get(source: AccessorSource): T;
	find(source: AccessorSource): T;
	set(source: DataStore, value: T): void;
	preset(value: T): [symbol, T];
}

function isDataStore(source: AccessorSource): source is DataStore {
	return "get" in source && "set" in source;
}

function isMetaArray(source: AccessorSource): source is Meta.Meta[] {
	return Array.isArray(source);
}

function extractFromSource<T>(
	source: AccessorSource,
	key: symbol,
	schema: StandardSchemaV1<T>,
): T | undefined {
	if (isDataStore(source)) {
		const value = source.get(key);
		return value === undefined ? undefined : validate(schema, value);
	}

	if (isMetaArray(source)) {
		const meta = source.find((m) => m.key === key);
		return meta ? validate(schema, meta.value) : undefined;
	}

	// Meta.MetaContainer
	const metas = source.metas ?? [];
	const meta = metas.find((m) => m.key === key);
	return meta ? validate(schema, meta.value) : undefined;
}

class AccessorImpl<T> implements Accessor<T> {
	public readonly key: symbol;
	public readonly schema: StandardSchemaV1<T>;

	constructor(key: string | symbol, schema: StandardSchemaV1<T>) {
		this.key = typeof key === "string" ? Symbol(key) : key;
		this.schema = schema;
	}

	get(source: AccessorSource): T {
		const value = extractFromSource(source, this.key, this.schema);
		if (value === undefined) {
			throw new Error(`Value not found for key: ${this.key.toString()}`);
		}
		return value;
	}

	find(source: AccessorSource): T | undefined {
		return extractFromSource(source, this.key, this.schema);
	}

	set(source: DataStore, value: T): void {
		if (!isDataStore(source)) {
			throw new Error("set() can only be used with DataStore");
		}
		const validated = validate(this.schema, value);
		source.set(this.key, validated);
	}

	preset(value: T): [symbol, T] {
		const validated = validate(this.schema, value);
		return [this.key, validated];
	}
}

class AccessorWithDefaultImpl<T> implements AccessorWithDefault<T> {
	public readonly key: symbol;
	public readonly schema: StandardSchemaV1<T>;
	public readonly defaultValue: T;

	constructor(
		key: string | symbol,
		schema: StandardSchemaV1<T>,
		defaultValue: T,
	) {
		this.key = typeof key === "string" ? Symbol(key) : key;
		this.schema = schema;
		this.defaultValue = validate(schema, defaultValue);
	}

	get(source: AccessorSource): T {
		const value = extractFromSource(source, this.key, this.schema);
		return value ?? this.defaultValue;
	}

	find(source: AccessorSource): T {
		const value = extractFromSource(source, this.key, this.schema);
		return value ?? this.defaultValue;
	}

	set(source: DataStore, value: T): void {
		if (!isDataStore(source)) {
			throw new Error("set() can only be used with DataStore");
		}
		const validated = validate(this.schema, value);
		source.set(this.key, validated);
	}

	preset(value: T): [symbol, T] {
		const validated = validate(this.schema, value);
		return [this.key, validated];
	}
}

// Factory function overloads
export function accessor<T>(
	key: string | symbol,
	schema: StandardSchemaV1<T>,
): Accessor<T>;

export function accessor<T>(
	key: string | symbol,
	schema: StandardSchemaV1<T>,
	defaultValue: T,
): AccessorWithDefault<T>;

export function accessor<T>(
	key: string | symbol,
	schema: StandardSchemaV1<T>,
	defaultValue?: T,
): Accessor<T> | AccessorWithDefault<T> {
	if (defaultValue !== undefined) {
		return new AccessorWithDefaultImpl(key, schema, defaultValue);
	}
	return new AccessorImpl(key, schema);
}
