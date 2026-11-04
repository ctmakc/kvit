import * as L from '@bitauth/libauth'; import fs from 'fs';
const env = fs.readFileSync(process.env.HOME + '/.config/agent-secrets/BCH_KVIT.env', 'utf8');
const seed = L.hexToBin(env.match(/BCH_KVIT_TEST_SEED_HEX=(\w+)/)[1]);
const [chain='0', idx='0'] = process.argv.slice(2);
const n = L.deriveHdPath(L.deriveHdPrivateNodeFromSeed(seed), `m/44'/145'/0'/${chain}/${idx}`);
console.log(L.privateKeyToP2pkhCashAddress({ privateKey: n.privateKey, prefix: 'bchtest' }).address);
