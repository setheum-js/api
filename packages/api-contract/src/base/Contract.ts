// Copyright 2017-2021 @polkadot/api-contract authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import type { ApiTypes, DecorateMethod } from '@polkadot/api/types';
import type { Bytes } from '@polkadot/types';
import type { AccountId, EventRecord, Weight } from '@polkadot/types/interfaces';
import type { AnyJson, ISubmittableResult } from '@polkadot/types/types';
import type { AbiMessage, ContractCallOutcome, ContractOptions, DecodedEvent } from '../types';
import type { ContractCallResult, ContractCallSend, ContractQuery, ContractTx, MapMessageQuery, MapMessageTx } from './types';

import { map } from 'rxjs';

import { SubmittableResult } from '@polkadot/api';
import { ApiBase } from '@polkadot/api/base';
import { assert, BN, BN_HUNDRED, BN_ONE, BN_ZERO, bnToBn, isFunction, isUndefined, logger } from '@polkadot/util';

import { Abi } from '../Abi';
import { applyOnEvent, extractOptions, isOptions } from '../util';
import { Base } from './Base';

// As per Rust, 5 * GAS_PER_SEC
const MAX_CALL_GAS = new BN(5_000_000_000_000).isub(BN_ONE);
const ERROR_NO_CALL = 'Your node does not expose the contracts.call RPC. This is most probably due to a runtime configuration.';

const l = logger('Contract');

function createQuery <ApiType extends ApiTypes> (fn: (origin: string | AccountId | Uint8Array, options: ContractOptions, params: unknown[]) => ContractCallResult<ApiType, ContractCallOutcome>): ContractQuery<ApiType> {
  return (origin: string | AccountId | Uint8Array, options: bigint | string | number | BN | ContractOptions, ...params: unknown[]): ContractCallResult<ApiType, ContractCallOutcome> =>
    isOptions(options)
      ? fn(origin, options, params)
      : fn(origin, ...extractOptions(options, params));
}

function createTx <ApiType extends ApiTypes> (fn: (options: ContractOptions, params: unknown[]) => SubmittableExtrinsic<ApiType>): ContractTx<ApiType> {
  return (options: bigint | string | number | BN | ContractOptions, ...params: unknown[]): SubmittableExtrinsic<ApiType> =>
    isOptions(options)
      ? fn(options, params)
      : fn(...extractOptions(options, params));
}

export class ContractSubmittableResult extends SubmittableResult {
  public readonly contractEvents?: DecodedEvent[];

  constructor (result: ISubmittableResult, contractEvents?: DecodedEvent[]) {
    super(result);

    this.contractEvents = contractEvents;
  }
}

export class Contract<ApiType extends ApiTypes> extends Base<ApiType> {
  /**
   * @description The on-chain address for this contract
   */
  public readonly address: AccountId;

  readonly #query: MapMessageQuery<ApiType> = {};

  readonly #tx: MapMessageTx<ApiType> = {};

  constructor (api: ApiBase<ApiType>, abi: AnyJson | Abi, address: string | AccountId, decorateMethod: DecorateMethod<ApiType>) {
    super(api, abi, decorateMethod);

    this.address = this.registry.createType('AccountId', address);

    this.abi.messages.forEach((m): void => {
      if (isUndefined(this.#tx[m.method])) {
        this.#tx[m.method] = createTx((o, p) => this.#exec(m, o, p));
      }

      if (isUndefined(this.#query[m.method])) {
        this.#query[m.method] = createQuery((f, o, p) => this.#read(m, o, p).send(f));
      }
    });
  }

  public get hasRpcContractsCall (): boolean {
    return isFunction(this.api.rx.rpc.contracts?.call);
  }

  public get query (): MapMessageQuery<ApiType> {
    assert(this.hasRpcContractsCall, ERROR_NO_CALL);

    return this.#query;
  }

  public get tx (): MapMessageTx<ApiType> {
    return this.#tx;
  }

  #getGas = (_gasLimit: bigint | BN | string | number, isCall = false): BN => {
    const gasLimit = bnToBn(_gasLimit);

    return gasLimit.lte(BN_ZERO)
      ? isCall
        ? MAX_CALL_GAS
        : (this.api.consts.system.blockWeights
          ? this.api.consts.system.blockWeights.maxBlock
          : this.api.consts.system.maximumBlockWeight as Weight
        ).muln(64).div(BN_HUNDRED)
      : gasLimit;
  };

  #exec = (messageOrId: AbiMessage | string | number, { gasLimit = BN_ZERO, value = BN_ZERO }: ContractOptions, params: unknown[]): SubmittableExtrinsic<ApiType> => {
    return this.api.tx.contracts
      .call(
        this.address,
        value,
        this.#getGas(gasLimit),
        this.abi.findMessage(messageOrId).toU8a(params)
      )
      .withResultTransform((result: ISubmittableResult) =>
        // ContractEmitted is the current generation, ContractExecution is the previous generation
        new ContractSubmittableResult(result, applyOnEvent(result, ['ContractEmitted', 'ContractExecution'], (records: EventRecord[]) =>
          records
            .map(({ event: { data: [, data] } }): DecodedEvent | null => {
              try {
                return this.abi.decodeEvent(data as Bytes);
              } catch (error) {
                l.error(`Unable to decode contract event: ${(error as Error).message}`);

                return null;
              }
            })
            .filter((decoded): decoded is DecodedEvent => !!decoded)
        ))
      );
  };

  #read = (messageOrId: AbiMessage | string | number, { gasLimit = BN_ZERO, value = BN_ZERO }: ContractOptions, params: unknown[]): ContractCallSend<ApiType> => {
    assert(this.hasRpcContractsCall, ERROR_NO_CALL);

    const message = this.abi.findMessage(messageOrId);

    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      send: this._decorateMethod((origin: string | AccountId | Uint8Array) =>
        this.api.rx.rpc.contracts
          .call({
            dest: this.address,
            gasLimit: this.#getGas(gasLimit, true),
            inputData: message.toU8a(params),
            origin,
            value
          })
          .pipe(
            map(({ debugMessage, gasConsumed, gasRequired, result }): ContractCallOutcome => ({
              debugMessage,
              gasConsumed,
              gasRequired: gasRequired && !gasRequired.isZero()
                ? gasRequired
                : gasConsumed,
              output: result.isOk && message.returnType
                ? this.abi.registry.createTypeUnsafe(message.returnType.lookupName || message.returnType.type, [result.asOk.data.toU8a(true)], { isPedantic: true })
                : null,
              result
            }))
          )
      )
    };
  };
}
