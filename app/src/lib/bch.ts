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

export interface Invoice {
  v: 1;
  n: NetId;
  a: string; // payee cashaddress
  s: string; // amount in sats (string, exact; tail digits make it unique)
  m: string; // what it is for
  p: string; // payee name
  f?: { v: string; c: string }; // fiat shown at creation, display only
  t: number; // created, unix seconds
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
    if (!/^\d+$/.test(o.s) || BigInt(o.s) < DUST) return null;
    return {
      v: 1,
      n: o.n,
      a: normalizeAddress(o.a, o.n)!,
      s: o.s,
      m: String(o.m ?? "").slice(0, 140),
      p: String(o.p ?? "").slice(0, 60),
      f: o.f && typeof o.f.v === "string" ? { v: String(o.f.v).slice(0, 20), c: String(o.f.c).slice(0, 5) } : undefined,
      t: Number(o.t) || 0,
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
const TX_OVERHEAD = 10n;

export function estimateSize(nIn: number, nOut: number): bigint {
  return TX_OVERHEAD + P2PKH_IN * BigInt(nIn) + P2PKH_OUT * BigInt(nOut);
}

export class InsufficientFunds extends Error {
  constructor(public have: bigint, public need: bigint) {
    super(`Wallet has ${satsToBch(have)} BCH, needs ${satsToBch(need)} BCH`);
  }
}

export function buildPayment(opts: {
  utxos: Utxo[];
  to: string;
  amount: bigint;
  changeLockingBytecode: Uint8Array;
  feePerByte?: bigint;
}): BuiltTx {
  const feeRate = opts.feePerByte ?? 1n;
  // confirmed first, then larger first
  const pool = [...opts.utxos].sort((a, b) =>
    (a.height > 0 ? 0 : 1) - (b.height > 0 ? 0 : 1) || (b.value > a.value ? 1 : b.value < a.value ? -1 : 0),
  );
  const picked: Utxo[] = [];
  let sum = 0n;
  let fee = -1n;
  let change = 0n;
  for (const u of pool) {
    picked.push(u);
    sum += u.value;
    const feeWithChange = estimateSize(picked.length, 2) * feeRate;
    const feeNoChange = estimateSize(picked.length, 1) * feeRate;
    if (sum >= opts.amount + feeWithChange + DUST) {
      fee = feeWithChange;
      change = sum - opts.amount - feeWithChange;
      break;
    }
    if (sum >= opts.amount + feeNoChange) {
      fee = sum - opts.amount; // leftover below dust goes to the miner
      change = 0n;
      break;
    }
  }
  if (fee < 0n) {
    const total = pool.reduce((s, u) => s + u.value, 0n);
    throw new InsufficientFunds(total, opts.amount + estimateSize(Math.max(pool.length, 1), 1) * feeRate);
  }
  const outputs: Output[] = [{ lockingBytecode: lockingBytecodeOf(opts.to), valueSatoshis: opts.amount }];
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
