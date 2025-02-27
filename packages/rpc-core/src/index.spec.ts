// Copyright 2017-2021 @polkadot/rpc-core authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ProviderInterface } from '@polkadot/rpc-provider/types';

import { MockProvider } from '@polkadot/rpc-provider/mock';
import { TypeRegistry } from '@polkadot/types/create';
import { isFunction } from '@polkadot/util';

import { RpcCore } from '.';

describe('Api', (): void => {
  const registry = new TypeRegistry();

  it('requires a provider with a send method', (): void => {
    expect(
      () => new RpcCore('234', registry, {} as unknown as ProviderInterface)
    ).toThrow(/Expected Provider/);
  });

  it('allows for the definition of user RPCs', async () => {
    const provider = new MockProvider(registry);
    const rpc = new RpcCore('567', registry, provider, {
      testing: {
        foo: {
          description: 'foo',
          params: [{ name: 'bar', type: 'u32' }],
          type: 'Balance'
        }
      }
    });

    expect(isFunction((rpc as unknown as Record<string, Record<string, boolean>>).testing.foo)).toBe(true);
    expect(rpc.sections.includes('testing')).toBe(true);
    expect(rpc.mapping.get('testing_foo')).toEqual({
      description: 'foo',
      isSubscription: false,
      jsonrpc: 'testing_foo',
      method: 'foo',
      params: [{
        name: 'bar',
        type: 'u32'
      }],
      section: 'testing',
      type: 'Balance'
    });

    await provider.disconnect();
  });
});
