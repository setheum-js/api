// Copyright 2017-2021 @polkadot/types authors & contributors
// SPDX-License-Identifier: Apache-2.0

import substrateData from '@polkadot/types-support/metadata/v10/substrate-hex';
import substrateJson from '@polkadot/types-support/metadata/v10/substrate-json.json';

import { testMeta } from '../util/testUtil';

testMeta(10, {
  substrate: {
    compare: substrateJson as Record<string, unknown>,
    data: substrateData
  }
}, false);
