// Copyright 2017-2021 @polkadot/types authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { MetadataAll, MetadataLatest, MetadataV9, MetadataV10, MetadataV11, MetadataV12, MetadataV13, MetadataV14 } from '../interfaces/metadata';
import type { AnyJson, Registry } from '../types';

import { assert } from '@polkadot/util';

import { Struct } from '../codec';
import { toV10 } from './v9/toV10';
import { toV11 } from './v10/toV11';
import { toV12 } from './v11/toV12';
import { toV13 } from './v12/toV13';
import { toV14 } from './v13/toV14';
import { toLatest } from './v14/toLatest';
import { MagicNumber } from './MagicNumber';
import { getUniqTypes, toCallsOnly } from './util';

type MetaMapped = MetadataV9 | MetadataV10 | MetadataV11 | MetadataV12 | MetadataV13 | MetadataV14;
type MetaAsX = 'asV9' | 'asV10' | 'asV11' | 'asV12' | 'asV13' | 'asV14';
type MetaVersions = 'latest' | 9 | 10 | 11 | 12 | 13 | 14;

const LATEST_VERSION = 14;

/**
 * @name MetadataVersioned
 * @description
 * The versioned runtime metadata as a decoded structure
 */
export class MetadataVersioned extends Struct {
  readonly #converted = new Map<MetaVersions, MetaMapped>();

  constructor (registry: Registry, value?: unknown) {
    super(registry, {
      magicNumber: MagicNumber,
      metadata: 'MetadataAll'
    }, value as Map<unknown, unknown>);
  }

  #assertVersion = (version: number): boolean => {
    assert(this.version <= version, () => `Cannot convert metadata from version ${this.version} to ${version}`);

    return this.version === version;
  };

  #getVersion = <T extends MetaMapped, F extends MetaMapped>(version: MetaVersions, fromPrev: (registry: Registry, input: F, metaVersion: number) => T): T => {
    const asCurr = `asV${version}` as MetaAsX;
    const asPrev = version === 'latest'
      ? `asV${LATEST_VERSION}` as MetaAsX
      : `asV${version - 1}` as MetaAsX;

    if (version !== 'latest' && this.#assertVersion(version)) {
      return this.#metadata()[asCurr] as T;
    }

    if (!this.#converted.has(version)) {
      this.#converted.set(version, fromPrev(this.registry, this[asPrev] as F, this.version));
    }

    return this.#converted.get(version) as T;
  };

  /**
   * @description the metadata wrapped
   */
  #metadata = (): MetadataAll => {
    return this.get('metadata') as MetadataAll;
  };

  /**
   * @description Returns the wrapped metadata as a limited calls-only (latest) version
   */
  public get asCallsOnly (): MetadataVersioned {
    return new MetadataVersioned(this.registry, {
      magicNumber: this.magicNumber,
      metadata: this.registry.createType('MetadataAll', toCallsOnly(this.registry, this.asLatest), LATEST_VERSION)
    });
  }

  /**
   * @description Returns the wrapped metadata as a V9 object
   */
  public get asV9 (): MetadataV9 {
    this.#assertVersion(9);

    return this.#metadata().asV9;
  }

  /**
   * @description Returns the wrapped values as a V10 object
   */
  public get asV10 (): MetadataV10 {
    return this.#getVersion(10, toV10);
  }

  /**
   * @description Returns the wrapped values as a V11 object
   */
  public get asV11 (): MetadataV11 {
    return this.#getVersion(11, toV11);
  }

  /**
   * @description Returns the wrapped values as a V12 object
   */
  public get asV12 (): MetadataV12 {
    return this.#getVersion(12, toV12);
  }

  /**
   * @description Returns the wrapped values as a V13 object
   */
  public get asV13 (): MetadataV13 {
    return this.#getVersion(13, toV13);
  }

  /**
   * @description Returns the wrapped values as a V14 object
   */
  public get asV14 (): MetadataV14 {
    return this.#getVersion(14, toV14);
  }

  /**
   * @description Returns the wrapped values as a latest version object
   */
  public get asLatest (): MetadataLatest {
    return this.#getVersion('latest', toLatest);
  }

  /**
   * @description The magicNumber for the Metadata (known constant)
   */
  public get magicNumber (): MagicNumber {
    return this.get('magicNumber') as MagicNumber;
  }

  /**
   * @description the metadata version this structure represents
   */
  public get version (): number {
    return this.#metadata().index;
  }

  public getUniqTypes (throwError: boolean): string[] {
    return getUniqTypes(this.registry, this.asLatest, throwError);
  }

  /**
   * @description Converts the Object to JSON, typically used for RPC transfers
   */
  public override toJSON (): Record<string, AnyJson> {
    // HACK(y): ensure that we apply the aliases if we have not done so already, this is
    // needed to ensure we have the correct overrides (which is only applied in toLatest)
    // eslint-disable-next-line no-unused-expressions
    this.asLatest;

    return super.toJSON();
  }
}
