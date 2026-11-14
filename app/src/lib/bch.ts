// Kvit — BCH core: networks, invoice links, UTXO scan, transaction building.
import {
  binToHex,
  cashAddressToLockingBytecode,
  decodeCashAddress,
  encodeTransaction,
  hashTransaction,
  hexToBin,
  lockingBytecodeToCashAddress,
  publicKeyToP2pkhCashAddress,
  sha256,
  swapEndianness,
  type Input,
  type Output,
  type TransactionCommon,
} from "@bitauth/libauth";

export type NetId = "main" | "chip";

export const NETWORKS: Record<
  NetId,
  { label: string; prefix: "bitcoincash" | "bchtest"; electrum: string[]; explorerTx: string; explorerAddr: string }
> = {
  main: {
    label: "Mainnet",
    prefix: "bitcoincash",
    electrum: ["bch.imaginary.cash", "electrum.imaginary.cash", "bch.loping.net"],
    explorerTx: "https://blockchair.com/bitcoin-cash/transaction/",
    explorerAddr: "https://blockchair.com/bitcoin-cash/address/",
  },
  chip: {
    label: "Chipnet",
    prefix: "bchtest",
    electrum: ["chipnet.imaginary.cash", "chipnet.bch.ninja"],
    explorerTx: "https://chipnet.imaginary.cash/tx/",
    explorerAddr: "https://chipnet.imaginary.cash/address/",
  },
};

export const DUST = 546n;
export const SATS = 100_000_000n;

// ---------- amounts ----------

export function satsToBch(s: bigint): string {
  const neg = s < 0n;
  const v = neg ? -s : s;
  const whole = v / SATS;
  const frac = (v % SATS).toString().padStart(8, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

export function bchToSats(str: string): bigint | null {
  const t = str.trim().replace(",", ".");
  if (!/^\d*(\.\d{0,8})?$/.test(t) || t === "" || t === ".") return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w || "0") * SATS + BigInt((f + "00000000").slice(0, 8));
}

// ---------- addresses ----------

export function normalizeAddress(raw: string, net: NetId): string | null {
  let a = raw.trim();
  if (!a) return null;
  const prefix = NETWORKS[net].prefix;
  if (!a.includes(":")) a = `${prefix}:${a}`;
  a = a.toLowerCase();
  const dec = decodeCashAddress(a);
  if (typeof dec === "string") return null;
  if (dec.prefix !== prefix) return null;
  const lb = cashAddressToLockingBytecode(a);
  if (typeof lb === "string") return null;
  // always pay to the plain (non token-aware) form
  const plain = lockingBytecodeToCashAddress({ bytecode: lb.bytecode, prefix, tokenSupport: false });
  return typeof plain === "string" ? null : plain.address;
}

export function addressNet(raw: string): NetId | null {
  const a = raw.trim().toLowerCase();
  if (a.startsWith("bchtest:")) return "chip";
  if (a.startsWith("bitcoincash:")) return "main";
  return null;
}

export function lockingBytecodeOf(address: string): Uint8Array {
  const r = cashAddressToLockingBytecode(address);
  if (typeof r === "string") throw new Error(r);
  return r.bytecode;
}

export function scriptHashOf(lockingBytecode: Uint8Array): string {
  return binToHex(sha256.hash(lockingBytecode).slice().reverse());
}

export function pubkeyToAddress(pubkey: Uint8Array, net: NetId): string {
  const r = publicKeyToP2pkhCashAddress({ publicKey: pubkey, prefix: NETWORKS[net].prefix });
  return typeof r === "string" ? r : r.address;
}

export function shortAddr(a: string): string {
  const body = a.split(":").pop() ?? a;
  return body.slice(0, 6) + "…" + body.slice(-6);
}

// ---------- invoice links ----------

/** A fungible CashToken an invoice is priced in. */
export interface TokenRef {
  c: string; // category id, hex as shown by explorers
  d: number; // decimals
  y: string; // ticker
}

export interface Invoice {
  v: 1;
  n: NetId;
  a: string; // payee cashaddress
  s: string; // amount in sats (string, exact; tail digits make it unique)
  m: string; // what it is for
  p: string; // payee name
  f?: { v: string; c: string }; // fiat shown at creation, display only
  t: number; // created, unix seconds
  /** Token ticket: `s` is the token amount in base units, `x` the satoshis riding on the token output (its tail is the ticket mark). */
  k?: TokenRef;
  x?: string;
}

export const TOKEN_OUT_SATS = 1000n;

export function unitsToToken(u: bigint, d: number): string {
  if (d === 0) return u.toString();
  const base = 10n ** BigInt(d);
  const neg = u < 0n;
  const v = neg ? -u : u;
  return (neg ? "-" : "") + (v / base).toString() + "." + (v % base).toString().padStart(d, "0");
}

export function tokenToUnits(str: string, d: number): bigint | null {
  const t = str.trim().replace(",", ".");
  const re = d > 0 ? new RegExp(`^\\d*(\\.\\d{0,${d}})?$`) : /^\d+$/;
  if (!re.test(t) || t === "" || t === ".") return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w || "0") * 10n ** BigInt(d) + BigInt((f + "0".repeat(d)).slice(0, d) || "0");
}

/** Amount as the payer reads it: "0.0123 BCH" or "25.00 PUSD". */
export function invoiceAmount(inv: Invoice): { num: string; unit: string } {
  if (inv.k) return { num: unitsToToken(BigInt(inv.s), inv.k.d), unit: inv.k.y };
  return { num: satsToBch(BigInt(inv.s)), unit: inv.n === "chip" ? "tBCH" : "BCH" };
}

/** The last three digits that tell this ticket apart on a shared address. */
export function invoiceMark(inv: Invoice): string {
  return (inv.k ? inv.x ?? "" : inv.s).slice(-3);
}

export function tokenAddress(address: string): string {
  const lb = cashAddressToLockingBytecode(address);
  if (typeof lb === "string") throw new Error(lb);
  const r = lockingBytecodeToCashAddress({ bytecode: lb.bytecode, prefix: lb.prefix, tokenSupport: true });
  if (typeof r === "string") throw new Error(r);
  return r.address;
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeInvoice(inv: Invoice): string {
  return b64urlEncode(JSON.stringify(inv));
}

export function decodeInvoice(token: string): Invoice | null {
  try {
    const o = JSON.parse(b64urlDecode(token));
    if (o.v !== 1 || (o.n !== "main" && o.n !== "chip")) return null;
    if (!normalizeAddress(o.a, o.n)) return null;
    if (!/^\d+$/.test(o.s)) return null;
    let k: TokenRef | undefined;
    let x: string | undefined;
    if (o.k) {
      if (!/^[0-9a-f]{64}$/.test(String(o.k.c)) || !Number.isInteger(o.k.d) || o.k.d < 0 || o.k.d > 18) return null;
      if (!/^\d+$/.test(String(o.x)) || BigInt(o.x) < TOKEN_OUT_SATS || BigInt(o.s) < 1n) return null;
      k = { c: o.k.c, d: o.k.d, y: String(o.k.y ?? "").replace(/[^\w.$-]/g, "").slice(0, 10) || "tokens" };
      x = String(o.x);
    } else if (BigInt(o.s) < DUST) return null;
    return {
      v: 1,
      n: o.n,
      a: normalizeAddress(o.a, o.n)!,
      s: o.s,
      m: String(o.m ?? "").slice(0, 140),
      p: String(o.p ?? "").slice(0, 60),
      f: o.f && typeof o.f.v === "string" ? { v: String(o.f.v).slice(0, 20), c: String(o.f.c).slice(0, 5) } : undefined,
      t: Number(o.t) || 0,
      ...(k ? { k, x } : {}),
    };
  } catch {
    return null;
  }
}

/** Unique tail: the last 3 digits of the satoshi amount identify this invoice on a shared address. */
export function uniqueAmount(base: bigint): bigint {
  const tail = BigInt(1 + Math.floor(Math.random() * 998));
  return (base / 1000n) * 1000n + tail;
}

export function bip21(inv: Invoice): string {
  const q = new URLSearchParams();
  if (inv.k) {
    // CHIP-2023-05 / chip-paypro token request: token-aware address, c = category, f = fungible amount, s = satoshis
    q.set("c", inv.k.c);
    q.set("f", inv.s);
    q.set("s", inv.x ?? TOKEN_OUT_SATS.toString());
    if (inv.m) q.set("message", inv.m);
    if (inv.p) q.set("label", inv.p);
    return `${tokenAddress(inv.a)}?${q.toString().replace(/\+/g, "%20")}`;
  }
  q.set("amount", satsToBch(BigInt(inv.s)));
  if (inv.m) q.set("message", inv.m);
  if (inv.p) q.set("label", inv.p);
  return `${inv.a}?${q.toString().replace(/\+/g, "%20")}`;
}

// ---------- transaction building ----------

export interface Utxo {
  txid: string;
  vout: number;
  value: bigint;
  height: number;
  lockingBytecode: Uint8Array;
  path: "receive" | "change";
  index: number;
  address: string;
  token?: { category: string; amount: bigint; nft: boolean };
}

export interface BuiltTx {
  tx: TransactionCommon;
  hex: string;
  sourceOutputs: (Input & Output)[];
  inputPaths: [number, string, number][];
  fee: bigint;
  change: bigint;
  txid: string;
}

const P2PKH_IN = 148n; // schnorr-signed P2PKH input, upper bound
const P2PKH_OUT = 34n;
const TOKEN_OUT = 34n + 44n; // P2PKH output plus a fungible token prefix (category, bitfield, amount up to 9 bytes)
const TX_OVERHEAD = 10n;

export function estimateSize(nIn: number, nOut: number, nTokenOut = 0): bigint {
  return TX_OVERHEAD + P2PKH_IN * BigInt(nIn) + P2PKH_OUT * BigInt(nOut) + TOKEN_OUT * BigInt(nTokenOut);
}

export class InsufficientFunds extends Error {
  constructor(public have: bigint, public need: bigint) {
    super(`Wallet has ${satsToBch(have)} BCH, needs ${satsToBch(need)} BCH`);
  }
}

export class InsufficientTokens extends Error {
  constructor(public have: bigint, public need: bigint, public token: TokenRef) {
    super(`Wallet has ${unitsToToken(have, token.d)} ${token.y}, needs ${unitsToToken(need, token.d)} ${token.y}`);
  }
}

type TokenOutput = Output & { token?: { category: Uint8Array; amount: bigint } };

/**
 * Pay `amount` sats to `to`, or — with `token` — pay `token.amount` fungible tokens to `to`
 * on an output carrying `amount` sats. Token change and BCH change go to `changeLockingBytecode`.
 */
export function buildPayment(opts: {
  utxos: Utxo[];
  to: string;
  amount: bigint;
  changeLockingBytecode: Uint8Array;
  feePerByte?: bigint;
  token?: { ref: TokenRef; amount: bigint };
}): BuiltTx {
  const feeRate = opts.feePerByte ?? 1n;
  const byConfThenSize = (a: Utxo, b: Utxo) =>
    (a.height > 0 ? 0 : 1) - (b.height > 0 ? 0 : 1) || (b.value > a.value ? 1 : b.value < a.value ? -1 : 0);

  const outputs: TokenOutput[] = [];
  const picked: Utxo[] = [];
  let nTokenOut = 0;
  if (opts.token) {
    const cat = opts.token.ref.c;
    const tokPool = opts.utxos
      .filter((u) => u.token && u.token.category === cat && !u.token.nft)
      .sort((a, b) => (b.token!.amount > a.token!.amount ? 1 : b.token!.amount < a.token!.amount ? -1 : 0));
    let have = 0n;
    for (const u of tokPool) {
      if (have >= opts.token.amount) break;
      picked.push(u);
      have += u.token!.amount;
    }
    if (have < opts.token.amount) {
      throw new InsufficientTokens(tokPool.reduce((s, u) => s + u.token!.amount, 0n), opts.token.amount, opts.token.ref);
    }
    const category = hexToBin(cat);
    outputs.push({ lockingBytecode: lockingBytecodeOf(opts.to), valueSatoshis: opts.amount, token: { category, amount: opts.token.amount } });
    nTokenOut = 1;
    if (have > opts.token.amount) {
      outputs.push({ lockingBytecode: opts.changeLockingBytecode, valueSatoshis: TOKEN_OUT_SATS, token: { category, amount: have - opts.token.amount } });
      nTokenOut = 2;
    }
  } else {
    outputs.push({ lockingBytecode: lockingBytecodeOf(opts.to), valueSatoshis: opts.amount });
  }
  const need = outputs.reduce((s, o) => s + o.valueSatoshis, 0n);
  // token inputs carry sats too; top up with plain BCH coins
  let sum = picked.reduce((s, u) => s + u.value, 0n);
  const pool = opts.utxos.filter((u) => !u.token).sort(byConfThenSize);
  let fee = -1n;
  let change = 0n;
  const settle = () => {
    const feeWithChange = estimateSize(picked.length, outputs.length - nTokenOut + 1, nTokenOut) * feeRate;
    const feeNoChange = estimateSize(picked.length, outputs.length - nTokenOut, nTokenOut) * feeRate;
    if (picked.length && sum >= need + feeWithChange + DUST) {
      fee = feeWithChange;
      change = sum - need - feeWithChange;
      return true;
    }
    if (picked.length && sum >= need + feeNoChange) {
      fee = sum - need; // leftover below dust goes to the miner
      change = 0n;
      return true;
    }
    return false;
  };
  if (!settle()) {
    for (const u of pool) {
      picked.push(u);
      sum += u.value;
      if (settle()) break;
    }
  }
  if (fee < 0n) {
    const total = opts.utxos.reduce((s, u) => s + u.value, 0n);
    throw new InsufficientFunds(total, need + estimateSize(Math.max(picked.length, 1), outputs.length, nTokenOut) * feeRate);
  }
  if (change > 0n) outputs.push({ lockingBytecode: opts.changeLockingBytecode, valueSatoshis: change });
  const inputs: Input[] = picked.map((u) => ({
    outpointTransactionHash: hexToBin(u.txid),
    outpointIndex: u.vout,
    sequenceNumber: 0xffffffff,
    unlockingBytecode: new Uint8Array(),
  }));
  const tx: TransactionCommon = { version: 2, locktime: 0, inputs, outputs };
  const sourceOutputs = picked.map((u, i) => ({
    ...inputs[i],
    lockingBytecode: u.lockingBytecode,
    valueSatoshis: u.value,
    ...(u.token ? { token: { category: hexToBin(u.token.category), amount: u.token.amount } } : {}),
  }));
  const hex = binToHex(encodeTransaction(tx));
  return {
    tx,
    hex,
    sourceOutputs,
    inputPaths: picked.map((u, i) => [i, u.path, u.index]),
    fee,
    change,
    txid: hashTransaction(hexToBin(hex)),
  };
}

export function txidOf(hex: string): string {
  return hashTransaction(hexToBin(hex));
}

export { binToHex, hexToBin, swapEndianness };
