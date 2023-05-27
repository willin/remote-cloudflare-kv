import { ReadableStream } from 'node:stream/web';

const MIN_CACHE_TTL = 60; /* 60s */
const MIN_EXPIRATION = -2147483648; /* Minimum signed 32-bit integer */
const MAX_EXPIRATION = 2147483647; /* Maximum signed 32-bit integer */
const MAX_LIST_KEYS = 1000;
const MAX_KEY_SIZE = 512; /* 512B */
const MAX_VALUE_SIZE = 25 * 1024 * 1024; /* 25MiB */
const MAX_METADATA_SIZE = 1024; /* 1KiB */

export type KVOptions = {
  api_email?: string;
  api_key?: string;
  api_token?: string;
  account_id: string;
  namespace_id: string;
};

type Method = 'GET' | 'PUT' | 'DELETE';
export type KVGetValueType = 'text' | 'json' | 'arrayBuffer' | 'stream';
export type KVGetOptions<Type extends KVGetValueType = KVGetValueType> = {
  type: Type;
  cacheTtl?: number;
};
export type KVValue<Value> = Promise<Value | null>;
export type KVValueMeta<Value, Meta> = Promise<{
  value: Value | null;
  metadata: Meta | null;
}>;
export type KVPutValueType = string | ArrayBuffer | ArrayBufferView | ReadableStream;
export interface KVPutOptions<Meta = unknown> {
  expiration?: string | number;
  expirationTtl?: string | number;
  metadata?: Meta;
}
export interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}
export interface StoredKey {
  name: string;
}
export interface StoredMeta<Meta = unknown> {
  /** Unix timestamp in seconds when this key expires */
  expiration?: number;
  /** Arbitrary JSON-serializable object */
  metadata?: Meta;
}
export type StoredKeyMeta<Meta = unknown> = StoredKey & StoredMeta<Meta>;
export interface KVListResult<Meta = unknown> {
  keys: StoredKeyMeta<Meta>[];
  cursor: string;
  list_complete: boolean;
}

const keyTypeError = " on 'KvNamespace': parameter 1 is not of type 'string'.";
const textEncoder = new TextEncoder();

function throwKVError(method: Method, status: number, message: string): void {
  throw new Error(`KV ${method} failed: ${status} ${message}`);
}

function validateKey(method: Method, key: string): void {
  // Check key name is allowed
  if (key === '') throw new TypeError('Key name cannot be empty.');
  if (key === '.') throw new TypeError('"." is not allowed as a key name.');
  if (key === '..') throw new TypeError('".." is not allowed as a key name.');
  // Check key isn't too long
  const keyLength = textEncoder.encode(key).byteLength;
  if (keyLength > MAX_KEY_SIZE) {
    throwKVError(method, 414, `UTF-8 encoded length of ${keyLength} exceeds key length limit of ${MAX_KEY_SIZE}.`);
  }
}

const getValueTypes = new Set(['text', 'json', 'arrayBuffer', 'stream']);

/**
 * Normalises type, ignoring cacheTtl as there is only one "edge location":
 * the user's computer
 */
function validateGetOptions(options?: KVGetValueType | Partial<KVGetOptions>): KVGetValueType {
  const string = typeof options === 'string';
  const type = string ? options : options?.type ?? 'text';
  const cacheTtl = string ? undefined : options?.cacheTtl;
  if (cacheTtl && (Number.isNaN(cacheTtl) || cacheTtl < MIN_CACHE_TTL)) {
    throwKVError('GET', 400, `Invalid cache_ttl of ${cacheTtl}. Cache TTL must be at least ${MIN_CACHE_TTL}.`);
  }
  if (!getValueTypes.has(type)) {
    throw new TypeError('Unknown response type. Possible types are "text", "arrayBuffer", "json", and "stream".');
  }
  return type;
}

/** Returns value as an integer or undefined if it isn't one */
function normaliseInt(value: string | number | undefined): number | undefined {
  switch (typeof value) {
    case 'number':
      return Math.round(value);
    case 'string':
      return parseInt(value, 10);
    default:
  }
}

export default class CloudflareKV {
  #headers: Record<string, string> = {
    'content-type': 'application/json'
  };

  #baseUrl =
    'https://api.cloudflare.com/client/v4/accounts/{account_identifier}/storage/kv/namespaces/{namespace_identifier}';

  /* eslint-disable @typescript-eslint/ban-ts-comment */
  constructor(options: KVOptions) {
    if (!options.account_id || !options.namespace_id) {
      throw new Error('Missing account_id or namespace_id');
    }
    this.#baseUrl = this.#baseUrl
      .replace('{account_identifier}', options.account_id)
      .replace('{namespace_identifier}', options.namespace_id);
    if (!options.api_email && !options.api_key && !options.api_token) {
      throw new Error('Missing api_email, api_key or api_token');
    }
    if (options.api_email && options.api_key) {
      this.#headers['x-api-email'] = options.api_email;
      this.#headers['x-auth-key'] = options.api_key;
    }
    if (options.api_token) {
      this.#headers.authorization = `Bearer ${options.api_token}`;
    }
  }

  /**
   * Read key-value pair
   * Returns the value associated with the given key in the given namespace.
   * Use URL-encoding to use special characters (e.g. :, !, %) in the key name.
   * If the KV-pair is set to expire at some point, the expiration time as measured
   * in seconds since the UNIX epoch will be returned in the "Expiration" response header.
   * @param {string} key
   * @param options does not support `cacheTtl`
   * @returns
   */
  get(key: string, options?: 'text' | Partial<KVGetOptions<'text'>>): KVValue<string>;

  get<Value = unknown>(key: string, options: 'json' | KVGetOptions<'json'>): KVValue<Value>;

  get(key: string, options: 'arrayBuffer' | KVGetOptions<'arrayBuffer'>): KVValue<ArrayBuffer>;

  get(key: string, options: 'stream' | KVGetOptions<'stream'>): KVValue<ReadableStream<Uint8Array>>;

  async get<Value = unknown>(
    key: string,
    options?: KVGetValueType | Partial<KVGetOptions>

    // @ts-ignore
  ): KVValue<KVPutValueType | Value> {
    if (typeof key !== 'string') {
      throw new TypeError(`Failed to execute 'get'${keyTypeError}`);
    }
    // Validate key and options
    validateKey('GET', key);
    const type = validateGetOptions(options);

    const res = await fetch(`${this.#baseUrl}/values/${key}`, { headers: this.#headers });
    if (res.status === 404) return null;
    switch (type) {
      case 'text': {
        return res.text();
      }
      case 'json': {
        return res.json() as KVValue<Value>;
      }
      case 'arrayBuffer': {
        return res.arrayBuffer();
      }
      case 'stream':
      default: {
        return res.body as unknown as KVPutValueType;
      }
    }
  }

  getWithMetadata<Metadata = unknown>(
    key: string,
    options?: 'text' | Partial<KVGetOptions<'text'>>
  ): KVValueMeta<string, Metadata>;

  getWithMetadata<Value = unknown, Metadata = unknown>(
    key: string,
    options: 'json' | KVGetOptions<'json'>
  ): KVValueMeta<Value, Metadata>;

  getWithMetadata<Metadata = unknown>(
    key: string,
    options: 'arrayBuffer' | KVGetOptions<'arrayBuffer'>
  ): KVValueMeta<ArrayBuffer, Metadata>;

  getWithMetadata<Metadata = unknown>(
    key: string,
    options: 'stream' | KVGetOptions<'stream'>
  ): KVValueMeta<ReadableStream<Uint8Array>, Metadata>;

  async getWithMetadata<Value = unknown, Metadata = unknown>(
    key: string,
    options?: KVGetValueType | Partial<KVGetOptions>
    // @ts-ignore
  ): KVValueMeta<KVPutValueType | Value, Metadata> {
    // @ts-ignore
    const value = await this.get(key, options);
    if (value === null) return { value, metadata: null };
    const metadata = await fetch(`${this.#baseUrl}/metadata/${key}`, { headers: this.#headers })
      .then((res) => res.json())
      .then(({ result }: { result: Metadata }) => result);
    return { value, metadata };
  }

  async delete(key: string): Promise<void> {
    if (typeof key !== 'string') {
      throw new TypeError(`Failed to execute 'delete'${keyTypeError}`);
    }

    validateKey('DELETE', key);
    await fetch(`${this.#baseUrl}/values/${key}`, { method: 'DELETE', headers: this.#headers });
  }

  /* eslint-disable @typescript-eslint/restrict-template-expressions */
  async put<Meta = unknown>(key: string, value: KVPutValueType, options: KVPutOptions<Meta> = {}): Promise<void> {
    if (typeof key !== 'string') {
      throw new TypeError(`Failed to execute 'put'${keyTypeError}`);
    }

    validateKey('PUT', key);

    let stored: string;
    if (typeof value === 'string') {
      stored = value;
    } else if (typeof value === 'object') {
      stored = JSON.stringify(value);
    } else {
      throw new TypeError(
        'KV put() accepts only strings as values (ArrayBuffers, ArrayBufferViews, and ReadableStreams not support).'
      );
    }

    // Normalise and validate expiration
    const now = normaliseInt(new Date().getTime() / 1000) as number;
    let expiration = normaliseInt(options.expiration);
    const expirationTtl = normaliseInt(options.expirationTtl);
    if (expirationTtl) {
      if (expirationTtl < MIN_EXPIRATION || expirationTtl > MAX_EXPIRATION) {
        // Workers throws like this without the extra sugar when the value is out of bounds,
        // and throws before checking the value itself.
        throw new TypeError(`Value out of range. Must be between ${MIN_EXPIRATION} and ${MAX_EXPIRATION} (inclusive).`);
      }
      if (Number.isNaN(expirationTtl) || expirationTtl <= 0) {
        throwKVError(
          'PUT',
          400,
          `Invalid expiration_ttl of ${options.expirationTtl}. Please specify integer greater than 0.`
        );
      }
      if (expirationTtl < MIN_CACHE_TTL) {
        throwKVError(
          'PUT',
          400,
          `Invalid expiration_ttl of ${options.expirationTtl}. Expiration TTL must be at least ${MIN_CACHE_TTL}.`
        );
      }
      expiration = now + expirationTtl;
    } else if (expiration !== undefined) {
      if (expiration < MIN_EXPIRATION || expiration > MAX_EXPIRATION) {
        // Workers throws like this without the extra sugar when the value
        // is out of bounds, and throws before checking the value itself.
        throw new TypeError(`Value out of range. Must be between ${MIN_EXPIRATION} and ${MAX_EXPIRATION} (inclusive).`);
      }
      if (Number.isNaN(expiration) || expiration <= now) {
        throwKVError(
          'PUT',
          400,
          `Invalid expiration of ${options.expiration}. Please specify integer greater than the current number of seconds since the UNIX epoch.`
        );
      }
      if (expiration < now + MIN_CACHE_TTL) {
        throwKVError(
          'PUT',
          400,
          `Invalid expiration of ${options.expiration}. Expiration times must be at least ${MIN_CACHE_TTL} seconds in the future.`
        );
      }
    }

    // Validate value and metadata size
    if (stored.length > MAX_VALUE_SIZE) {
      throwKVError('PUT', 413, `Value length of ${stored.length} exceeds limit of ${MAX_VALUE_SIZE}.`);
    }
    const metadataLength = options.metadata && JSON.stringify(options.metadata).length;
    if (metadataLength && metadataLength > MAX_METADATA_SIZE) {
      throwKVError('PUT', 413, `Metadata length of ${metadataLength} exceeds limit of ${MAX_METADATA_SIZE}.`);
    }

    // Store value with expiration and metadata
    await fetch(`${this.#baseUrl}/bulk`, {
      method: 'PUT',
      headers: this.#headers,
      body: JSON.stringify([
        {
          expiration,
          expiration_ttl: expirationTtl,
          key,
          value: stored,
          metadata: options.metadata
        }
      ])
    });
  }

  async list<Meta = unknown>({ prefix = '', limit = MAX_LIST_KEYS, cursor }: KVListOptions = {}): Promise<
    KVListResult<Meta>
  > {
    // Validate options
    if (Number.isNaN(limit) || limit < 1) {
      throwKVError('GET', 400, `Invalid key_count_limit of ${limit}. Please specify an integer greater than 0.`);
    }
    if (limit > MAX_LIST_KEYS) {
      throwKVError(
        'GET',
        400,
        `Invalid key_count_limit of ${limit}. Please specify an integer less than ${MAX_LIST_KEYS}.`
      );
    }
    const targetUrl = new URL(`${this.#baseUrl}/keys`);
    if (prefix) targetUrl.searchParams.append('prefix', prefix);
    if (limit) targetUrl.searchParams.append('limit', `${limit}`);
    if (cursor) targetUrl.searchParams.append('cursor', cursor);
    const res: unknown = await fetch(targetUrl, { headers: this.#headers }).then((r) => r.json());
    // eslint-disable-next-line
    const { result: keys, result_info: info }: { result: StoredKeyMeta<Meta>[]; result_info: { cursor: string } } =
      res as any;
    return { keys, cursor: info.cursor, list_complete: keys.length < limit };
  }
}
