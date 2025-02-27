// Copyright 2017-2021 @polkadot/types authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { EcdsaSignature, Ed25519Signature, ExtrinsicEra, ExtrinsicSignature, Sr25519Signature } from '../../interfaces/extrinsics';
import type { Address, AssetId, Balance, Call, Index } from '../../interfaces/runtime';
import type { ExtrinsicPayloadValue, IExtrinsicSignature, IKeyringPair, Registry, SignatureOptions } from '../../types';
import type { ExtrinsicSignatureOptions } from '../types';

import { assert, isU8a, stringify, u8aConcat, u8aToHex } from '@polkadot/util';

import { Compact } from '../../codec/Compact';
import { Enum } from '../../codec/Enum';
import { Option } from '../../codec/Option';
import { Struct } from '../../codec/Struct';
import { EMPTY_U8A, IMMORTAL_ERA } from '../constants';
import { GenericExtrinsicPayloadV4 } from './ExtrinsicPayload';

const FAKE_NONE = new Uint8Array();
const FAKE_SOME = new Uint8Array([1]);

function toAddress (registry: Registry, address: Address | Uint8Array | string): Address {
  return registry.createType('Address', isU8a(address) ? u8aToHex(address) : address);
}

/**
 * @name GenericExtrinsicSignatureV4
 * @description
 * A container for the [[Signature]] associated with a specific [[Extrinsic]]
 */
export class GenericExtrinsicSignatureV4 extends Struct implements IExtrinsicSignature {
  #fakePrefix: Uint8Array;

  constructor (registry: Registry, value?: GenericExtrinsicSignatureV4 | Uint8Array, { isSigned }: ExtrinsicSignatureOptions = {}) {
    super(registry, {
      signer: 'Address',
      // eslint-disable-next-line sort-keys
      signature: 'ExtrinsicSignature',
      ...registry.getSignedExtensionTypes()
    }, GenericExtrinsicSignatureV4.decodeExtrinsicSignature(value, isSigned));

    this.#fakePrefix = registry.createType('ExtrinsicSignature') instanceof Enum
      ? FAKE_SOME
      : FAKE_NONE;
  }

  /** @internal */
  public static decodeExtrinsicSignature (value?: GenericExtrinsicSignatureV4 | Uint8Array, isSigned = false): GenericExtrinsicSignatureV4 | Uint8Array {
    if (!value) {
      return EMPTY_U8A;
    } else if (value instanceof GenericExtrinsicSignatureV4) {
      return value;
    }

    return isSigned
      ? value
      : EMPTY_U8A;
  }

  /**
   * @description The length of the value when encoded as a Uint8Array
   */
  public override get encodedLength (): number {
    return this.isSigned
      ? super.encodedLength
      : 0;
  }

  /**
   * @description `true` if the signature is valid
   */
  public get isSigned (): boolean {
    return !this.signature.isEmpty;
  }

  /**
   * @description The [[ExtrinsicEra]] (mortal or immortal) this signature applies to
   */
  public get era (): ExtrinsicEra {
    return this.get('era') as ExtrinsicEra;
  }

  /**
   * @description The [[Index]] for the signature
   */
  public get nonce (): Compact<Index> {
    return this.get('nonce') as Compact<Index>;
  }

  /**
   * @description The actual [[EcdsaSignature]], [[Ed25519Signature]] or [[Sr25519Signature]]
   */
  public get signature (): EcdsaSignature | Ed25519Signature | Sr25519Signature {
    // the second case here is when we don't have an enum signature, treat as raw
    return (this.multiSignature.value || this.multiSignature) as Sr25519Signature;
  }

  /**
   * @description The raw [[ExtrinsicSignature]]
   */
  public get multiSignature (): ExtrinsicSignature {
    return this.get('signature') as ExtrinsicSignature;
  }

  /**
   * @description The [[Address]] that signed
   */
  public get signer (): Address {
    return this.get('signer') as Address;
  }

  /**
   * @description The [[Balance]] tip
   */
  public get tip (): Compact<Balance> {
    return this.get('tip') as Compact<Balance>;
  }

  /**
   * @description
   * The (optional) asset id for this signature for chains that support transaction fees in assets
   */
  public get assetId (): Option<AssetId> {
    return this.get('assetId') as Option<AssetId>;
  }

  protected _injectSignature (signer: Address, signature: ExtrinsicSignature, { assetId, era, nonce, tip }: GenericExtrinsicPayloadV4): IExtrinsicSignature {
    this.set('era', era);
    this.set('nonce', nonce);
    this.set('signer', signer);
    this.set('signature', signature);
    this.set('tip', tip);
    this.set('assetId', assetId);

    return this;
  }

  /**
   * @description Adds a raw signature
   */
  public addSignature (signer: Address | Uint8Array | string, signature: Uint8Array | string, payload: ExtrinsicPayloadValue | Uint8Array | string): IExtrinsicSignature {
    return this._injectSignature(
      toAddress(this.registry, signer),
      this.registry.createType('ExtrinsicSignature', signature),
      new GenericExtrinsicPayloadV4(this.registry, payload)
    );
  }

  /**
   * @description Creates a payload from the supplied options
   */
  public createPayload (method: Call, { assetId, blockHash, era, genesisHash, nonce, runtimeVersion: { specVersion, transactionVersion }, tip }: SignatureOptions): GenericExtrinsicPayloadV4 {
    return new GenericExtrinsicPayloadV4(this.registry, {
      assetId,
      blockHash,
      era: era || IMMORTAL_ERA,
      genesisHash,
      method: method.toHex(),
      nonce,
      specVersion,
      tip: tip || 0,
      transactionVersion: transactionVersion || 0
    });
  }

  /**
   * @description Generate a payload and applies the signature from a keypair
   */
  public sign (method: Call, account: IKeyringPair, options: SignatureOptions): IExtrinsicSignature {
    assert(account && account.addressRaw, () => `Expected a valid keypair for signing, found ${stringify(account)}`);

    const signer = toAddress(this.registry, account.addressRaw);
    const payload = this.createPayload(method, options);
    const signature = this.registry.createType('ExtrinsicSignature', payload.sign(account));

    return this._injectSignature(signer, signature, payload);
  }

  /**
   * @description Generate a payload and applies a fake signature
   */
  public signFake (method: Call, address: Address | Uint8Array | string, options: SignatureOptions): IExtrinsicSignature {
    assert(address, () => `Expected a valid address for signing, found ${stringify(address)}`);

    const signer = toAddress(this.registry, address);
    const payload = this.createPayload(method, options);
    const signature = this.registry.createType('ExtrinsicSignature', u8aConcat(this.#fakePrefix, new Uint8Array(64).fill(0x42)));

    return this._injectSignature(signer, signature, payload);
  }

  /**
   * @description Encodes the value as a Uint8Array as per the SCALE specifications
   * @param isBare true when the value has none of the type-specific prefixes (internal)
   */
  public override toU8a (isBare?: boolean): Uint8Array {
    return this.isSigned
      ? super.toU8a(isBare)
      : EMPTY_U8A;
  }
}
