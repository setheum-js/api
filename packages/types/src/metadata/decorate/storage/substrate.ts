// Copyright 2017-2021 @polkadot/types authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { StorageEntry } from '../../../primitive/types';
import type { Registry } from '../../../types';

import { createRuntimeFunction } from './util';

type Creator = (registry: Registry) => StorageEntry;

export const substrate: Record<string, Creator> = {
  changesTrieConfig: createRuntimeFunction('Substrate', 'changesTrieConfig', ':changes_trie', {
    docs: ' Changes trie configuration is stored under this key.',
    type: 'u32'
  }),
  childStorageKeyPrefix: createRuntimeFunction('Substrate', 'childStorageKeyPrefix', ':child_storage:', {
    docs: ' Prefix of child storage keys.',
    type: 'u32'
  }),
  code: createRuntimeFunction('Substrate', 'code', ':code', {
    docs: ' Wasm code of the runtime.',
    type: 'Bytes'
  }),
  extrinsicIndex: createRuntimeFunction('Substrate', 'extrinsicIndex', ':extrinsic_index', {
    docs: ' Current extrinsic index (u32) is stored under this key.',
    type: 'u32'
  }),
  heapPages: createRuntimeFunction('Substrate', 'heapPages', ':heappages', {
    docs: ' Number of wasm linear memory pages required for execution of the runtime.',
    type: 'u64'
  })
};
