// Copyright 2017-2021 @polkadot/types authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorageEntryMetadataLatest, StorageEntryTypeLatest, StorageHasher } from '../interfaces/metadata';
import type { AllHashers } from '../interfaces/metadata/definitions';
import type { SiLookupTypeId } from '../interfaces/scaleInfo';
import type { AnyJson, AnyTuple, Codec, InterfaceTypes, IStorageKey, Registry } from '../types';
import type { StorageEntry } from './types';

import { assert, isFunction, isString, isU8a } from '@polkadot/util';

import { getSiName } from '../metadata/util';
import { Bytes } from './Bytes';

interface Decoded {
  key?: Uint8Array | string;
  method?: string;
  section?: string;
}

interface StorageKeyExtra {
  method: string;
  section: string;
}

// hasher type -> [initialHashLength, canDecodeKey]
const HASHER_MAP: Record<keyof typeof AllHashers, [number, boolean]> = {
  // opaque
  Blake2_128: [16, false], // eslint-disable-line camelcase
  Blake2_128Concat: [16, true], // eslint-disable-line camelcase
  Blake2_256: [32, false], // eslint-disable-line camelcase
  Identity: [0, true],
  Twox128: [16, false],
  Twox256: [32, false],
  Twox64Concat: [8, true]
};

export function unwrapStorageSi (type: StorageEntryTypeLatest): SiLookupTypeId {
  return type.isPlain
    ? type.asPlain
    : type.asMap.value;
}

/** @internal */
export function unwrapStorageType (registry: Registry, type: StorageEntryTypeLatest, isOptional?: boolean): keyof InterfaceTypes {
  const outputType = getSiName(registry.lookup, unwrapStorageSi(type));

  return isOptional
    ? `Option<${outputType}>` as keyof InterfaceTypes
    : outputType as keyof InterfaceTypes;
}

/** @internal */
function decodeStorageKey (value?: string | Uint8Array | StorageKey | StorageEntry | [StorageEntry, unknown[]?]): Decoded {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  if (value instanceof StorageKey) {
    return {
      key: value,
      method: value.method,
      section: value.section
    };
  } else if (!value || isString(value) || isU8a(value)) {
    // let Bytes handle these inputs
    return { key: value };
  } else if (isFunction(value)) {
    return {
      key: value(),
      method: value.method,
      section: value.section
    };
  } else if (Array.isArray(value)) {
    const [fn, args = []] = value;

    assert(isFunction(fn), 'Expected function input for key construction');

    if (fn.meta && fn.meta.type.isMap) {
      const map = fn.meta.type.asMap;

      assert(Array.isArray(args) && args.length === map.hashers.length, () => `Expected an array of ${map.hashers.length} values as params to a Map query`);
    }

    return {
      key: fn(...args),
      method: fn.method,
      section: fn.section
    };
  }

  throw new Error(`Unable to convert input ${value as string} to StorageKey`);
}

/** @internal */
function decodeHashers <A extends AnyTuple> (registry: Registry, value: Uint8Array, hashers: [StorageHasher, SiLookupTypeId][]): A {
  // the storage entry is xxhashAsU8a(prefix, 128) + xxhashAsU8a(method, 128), 256 bits total
  let offset = 32;

  return hashers.reduce((result: Codec[], [hasher, type]): Codec[] => {
    const [hashLen, canDecode] = HASHER_MAP[hasher.type as 'Identity'];
    const decoded = canDecode
      ? registry.createType(registry.createLookupType(type) as 'Raw', value.subarray(offset + hashLen))
      : registry.createType('Raw', value.subarray(offset, offset + hashLen));

    offset += hashLen + (canDecode ? decoded.encodedLength : 0);
    result.push(decoded);

    return result;
  }, []) as A;
}

/** @internal */
function decodeArgsFromMeta <A extends AnyTuple> (registry: Registry, value: Uint8Array, meta?: StorageEntryMetadataLatest): A {
  if (!meta || !meta.type.isMap) {
    return [] as unknown as A;
  }

  const { hashers, key } = meta.type.asMap;
  const keys = hashers.length === 1
    ? [key]
    : registry.lookup.getSiType(key).def.asTuple;

  return decodeHashers(registry, value, hashers.map((h, i) => [h, keys[i]]));
}

/** @internal */
function getMeta (value: StorageKey | StorageEntry | [StorageEntry, unknown[]?]): StorageEntryMetadataLatest | undefined {
  if (value instanceof StorageKey) {
    return value.meta;
  } else if (isFunction(value)) {
    return value.meta;
  } else if (Array.isArray(value)) {
    const [fn] = value;

    return fn.meta;
  }

  return undefined;
}

/** @internal */
function getType (registry: Registry, value: StorageKey | StorageEntry | [StorageEntry, unknown[]?]): string {
  if (value instanceof StorageKey) {
    return value.outputType;
  } else if (isFunction(value)) {
    return unwrapStorageType(registry, value.meta.type);
  } else if (Array.isArray(value)) {
    const [fn] = value;

    if (fn.meta) {
      return unwrapStorageType(registry, fn.meta.type);
    }
  }

  // If we have no type set, default to Raw
  return 'Raw';
}

/**
 * @name StorageKey
 * @description
 * A representation of a storage key (typically hashed) in the system. It can be
 * constructed by passing in a raw key or a StorageEntry with (optional) arguments.
 */
export class StorageKey<A extends AnyTuple = AnyTuple> extends Bytes implements IStorageKey<A> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore This is assigned via this.decodeArgsFromMeta()
  private _args: A;

  private _meta?: StorageEntryMetadataLatest;

  private _outputType: string;

  private _method?: string;

  private _section?: string;

  constructor (registry: Registry, value?: string | Uint8Array | StorageKey | StorageEntry | [StorageEntry, unknown[]?], override: Partial<StorageKeyExtra> = {}) {
    const { key, method, section } = decodeStorageKey(value);

    super(registry, key);

    this._outputType = getType(registry, value as StorageKey);

    // decode the args (as applicable based on the key and the hashers, after all init)
    this.setMeta(getMeta(value as StorageKey), override.section || section, override.method || method);
  }

  /**
   * @description Return the decoded arguments (applicable to map with decodable values)
   */
  public get args (): A {
    return this._args;
  }

  /**
   * @description The metadata or `undefined` when not available
   */
  public get meta (): StorageEntryMetadataLatest | undefined {
    return this._meta;
  }

  /**
   * @description The key method or `undefined` when not specified
   */
  public get method (): string | undefined {
    return this._method;
  }

  /**
   * @description The output type
   */
  public get outputType (): string {
    return this._outputType;
  }

  /**
   * @description The key section or `undefined` when not specified
   */
  public get section (): string | undefined {
    return this._section;
  }

  public is (key: IStorageKey<AnyTuple>): key is IStorageKey<A> {
    return key.section === this.section && key.method === this.method;
  }

  /**
   * @description Sets the meta for this key
   */
  public setMeta (meta?: StorageEntryMetadataLatest, section?: string, method?: string): this {
    this._meta = meta;
    this._method = method || this._method;
    this._section = section || this._section;

    if (meta) {
      this._outputType = unwrapStorageType(this.registry, meta.type);
    }

    try {
      this._args = decodeArgsFromMeta(this.registry, this.toU8a(true), this.meta);
    } catch (error) {
      // ignore...
    }

    return this;
  }

  /**
   * @description Returns the Human representation for this type
   */
  public override toHuman (): AnyJson {
    return this._args.length
      ? this._args.map((arg) => arg.toHuman())
      : super.toHuman();
  }

  /**
   * @description Returns the raw type for this
   */
  public override toRawType (): string {
    return 'StorageKey';
  }
}
