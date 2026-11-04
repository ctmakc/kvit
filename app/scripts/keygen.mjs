import * as L from '@bitauth/libauth';
import fs from 'fs';
const f = process.env.HOME + '/.config/agent-secrets/BCH_KVIT.env';
let env = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
if (!/BCH_KVIT_TEST_SEED_HEX=/.test(env)) {
  const seed = L.binToHex(crypto.getRandomValues(new Uint8Array(32)));
  env += `# Kvit chipnet test wallet (agent, BCH BLAZE 2026) - test coins only\nBCH_KVIT_TEST_SEED_HEX=${seed}\n`;
}
if (!/BCH_KVIT_DONATION_MNEMONIC=/.test(env)) {
  const m = L.generateBip39Mnemonic();
  env += `# Kvit mainnet donation wallet (EMBER2026 CashTokens for community vote). BIP39, path m/44'/145'/0'/0/0, import into Electron Cash / Paytaca / Selene\nBCH_KVIT_DONATION_MNEMONIC="${m}"\n`;
}
fs.writeFileSync(f, env, { mode: 0o600 });
const seedHex = env.match(/BCH_KVIT_TEST_SEED_HEX=(\w+)/)[1];
const node = L.deriveHdPath(L.deriveHdPrivateNodeFromSeed(L.hexToBin(seedHex)), "m/44'/145'/0'/0/0");
console.log('chipnet test receive:', L.privateKeyToP2pkhCashAddress({ privateKey: node.privateKey, prefix: 'bchtest' }).address);
const mn = env.match(/BCH_KVIT_DONATION_MNEMONIC="([^"]+)"/)[1];
const dn = L.deriveHdPath(L.deriveHdPrivateNodeFromSeed(L.deriveSeedFromBip39Mnemonic(mn)), "m/44'/145'/0'/0/0");
console.log('donation token-aware:', L.privateKeyToP2pkhCashAddress({ privateKey: dn.privateKey, prefix: 'bitcoincash', tokenSupport: true }).address);
console.log('donation plain:', L.privateKeyToP2pkhCashAddress({ privateKey: dn.privateKey, prefix: 'bitcoincash' }).address);
