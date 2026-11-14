// Chipnet only: mint a fungible test CashToken ("KVT", 2 decimals) from the Kvit test wallet.
// Usage: node scripts/mint-token.mjs [amount=1000000]   (seed from ~/.config/agent-secrets/BCH_KVIT.env)
import * as L from '@bitauth/libauth';
import fs from 'fs';
import { ElectrumClient } from '@electrum-cash/network';
import { ElectrumWebSocket } from '@electrum-cash/web-socket';

const env = fs.readFileSync(process.env.HOME + '/.config/agent-secrets/BCH_KVIT.env', 'utf8');
const seed = L.hexToBin(env.match(/BCH_KVIT_TEST_SEED_HEX=(\w+)/)[1]);
const node = (p) => L.deriveHdPath(L.deriveHdPrivateNodeFromSeed(seed), p);
const key = (p) => node(p).privateKey;
const addrOf = (k, tokenSupport = false) => {
  const lb = L.cashAddressToLockingBytecode(L.privateKeyToP2pkhCashAddress({ privateKey: k, prefix: 'bchtest' }).address).bytecode;
  return { lb, addr: L.lockingBytecodeToCashAddress({ bytecode: lb, prefix: 'bchtest', tokenSupport }).address };
};
const amount = BigInt(process.argv[2] ?? '1000000');
const srcKey = key("m/44'/145'/0'/1/0");
const src = addrOf(srcKey);
const dst = addrOf(key("m/44'/145'/0'/0/0"), true);

const c = new ElectrumClient('kvit', '1.4.3', new ElectrumWebSocket('chipnet.imaginary.cash', { port: 50004, encrypted: true, timeoutInMilliSeconds: 8000 }));
await c.connect();
const sh = L.binToHex(L.sha256.hash(src.lb).slice().reverse());
const utxos = (await c.request('blockchain.scripthash.listunspent', sh, 'include_tokens')).filter((u) => !u.token_data);
const compiler = L.walletTemplateToCompilerBch(L.walletTemplateP2pkhNonHd);
let u = utxos.find((x) => x.tx_pos === 0);
if (!u) {
  // genesis needs an input spending output #0: consolidate into one self-payment first
  const v = utxos[0];
  if (!v) { console.log('no BCH on', src.addr); process.exit(1); }
  const s = L.generateTransaction({ version: 2, locktime: 0,
    inputs: [{ outpointIndex: v.tx_pos, outpointTransactionHash: L.hexToBin(v.tx_hash), sequenceNumber: 0xffffffff,
      unlockingBytecode: { compiler, data: { keys: { privateKeys: { key: srcKey } } }, script: 'unlock', valueSatoshis: BigInt(v.value) } }],
    outputs: [{ lockingBytecode: src.lb, valueSatoshis: BigInt(v.value) - 300n }] });
  if (!s.success) { console.log(JSON.stringify(s.errors).slice(0, 500)); process.exit(1); }
  const h = L.binToHex(L.encodeTransaction(s.transaction));
  const id = await c.request('blockchain.transaction.broadcast', h);
  if (id instanceof Error) { console.log('prep ERR', id.message); process.exit(1); }
  console.log('prep', id);
  u = { tx_hash: id, tx_pos: 0, value: v.value - 300 };
}
const tokenSats = 1000n, fee = 600n;
const g = L.generateTransaction({
  version: 2, locktime: 0,
  inputs: [{ outpointIndex: 0, outpointTransactionHash: L.hexToBin(u.tx_hash), sequenceNumber: 0xffffffff,
    unlockingBytecode: { compiler, data: { keys: { privateKeys: { key: srcKey } } }, script: 'unlock', valueSatoshis: BigInt(u.value) } }],
  outputs: [
    { lockingBytecode: dst.lb, valueSatoshis: tokenSats, token: { category: L.hexToBin(u.tx_hash), amount } },
    { lockingBytecode: src.lb, valueSatoshis: BigInt(u.value) - tokenSats - fee },
  ],
});
if (!g.success) { console.log(JSON.stringify(g.errors).slice(0, 500)); process.exit(1); }
const hex = L.binToHex(L.encodeTransaction(g.transaction));
const r = await c.request('blockchain.transaction.broadcast', hex);
console.log('broadcast', r instanceof Error ? 'ERR ' + r.message : r);
console.log('category', u.tx_hash, 'amount', amount.toString(), 'to', dst.addr);
process.exit(0);
