// Kvit — talks to public Fulcrum (Electrum Cash) servers over WSS. No backend of our own.
import { ElectrumClient } from "@electrum-cash/network";
import { ElectrumWebSocket } from "@electrum-cash/web-socket";
import { binToHex, decodeTransaction, hexToBin } from "@bitauth/libauth";
import { NETWORKS, type NetId, lockingBytecodeOf, scriptHashOf, txidOf } from "./bch";

type Client = ElectrumClient<any>;
const clients: Partial<Record<NetId, Promise<Client>>> = {};

async function open(net: NetId): Promise<Client> {
  let last: unknown;
  for (const host of NETWORKS[net].electrum) {
    try {
      const c = new ElectrumClient("Kvit", "1.4.3", new ElectrumWebSocket(host, { port: 50004, encrypted: true, timeoutInMilliSeconds: 8000 })) as Client;
      await c.connect();
      return c;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`No ${NETWORKS[net].label} server reachable: ${String((last as Error)?.message ?? last)}`);
}

export function client(net: NetId): Promise<Client> {
  if (!clients[net]) {
    clients[net] = open(net).catch((e) => {
      delete clients[net];
      throw e;
    });
  }
  return clients[net]!;
}

async function req<T = any>(net: NetId, method: string, ...params: unknown[]): Promise<T> {
  const c = await client(net);
  const r = await c.request(method, ...(params as any[]));
  if (r instanceof Error) throw r;
  if (r && typeof r === "object" && "message" in (r as any) && "code" in (r as any)) throw new Error((r as any).message);
  return r as T;
}

export interface RawUnspent {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
  token_data?: unknown;
}

export async function listUnspent(net: NetId, address: string): Promise<RawUnspent[]> {
  const sh = scriptHashOf(lockingBytecodeOf(address));
  const r = await req<RawUnspent[]>(net, "blockchain.scripthash.listunspent", sh, "include_tokens");
  return (r || []).filter((u) => !u.token_data);
}

export async function history(net: NetId, address: string): Promise<{ tx_hash: string; height: number }[]> {
  const sh = scriptHashOf(lockingBytecodeOf(address));
  return (await req(net, "blockchain.scripthash.get_history", sh)) || [];
}

const txCache = new Map<string, string>();
export async function rawTx(net: NetId, txid: string): Promise<string> {
  const k = net + txid;
  if (!txCache.has(k)) txCache.set(k, await req<string>(net, "blockchain.transaction.get", txid));
  return txCache.get(k)!;
}

export async function broadcast(net: NetId, hex: string): Promise<string> {
  try {
    return await req<string>(net, "blockchain.transaction.broadcast", hex);
  } catch (e) {
    const msg = String((e as Error).message || e);
    // the wallet may have broadcast it already
    if (/already|txn-mempool-conflict|known/i.test(msg)) return txidOf(hex);
    throw e;
  }
}

export interface Payment {
  txid: string;
  height: number;
  value: bigint;
}

/** Find a transaction that pays exactly `sats` to `address`. */
export async function findPayment(net: NetId, address: string, sats: bigint): Promise<Payment | null> {
  const lb = binToHex(lockingBytecodeOf(address));
  const h = await history(net, address);
  // newest first: mempool (height <= 0) then highest block
  const ordered = [...h].sort((a, b) => (a.height <= 0 ? 1e12 : a.height) - (b.height <= 0 ? 1e12 : b.height)).reverse();
  for (const item of ordered.slice(0, 40)) {
    const tx = decodeTransaction(hexToBin(await rawTx(net, item.tx_hash)));
    if (typeof tx === "string") continue;
    for (const o of tx.outputs) {
      if (o.valueSatoshis === sats && binToHex(o.lockingBytecode) === lb) {
        return { txid: item.tx_hash, height: item.height, value: o.valueSatoshis };
      }
    }
  }
  return null;
}

/** Calls `cb` whenever the address status changes. Returns an unsubscribe function. */
export async function watchAddress(net: NetId, address: string, cb: () => void): Promise<() => void> {
  const c = await client(net);
  const sh = scriptHashOf(lockingBytecodeOf(address));
  const handler = (n: { method: string; params: unknown[] }) => {
    if (n.method === "blockchain.scripthash.subscribe" && n.params?.[0] === sh) cb();
  };
  c.on("notification", handler as any);
  await c.subscribe("blockchain.scripthash.subscribe", sh);
  const poll = setInterval(cb, 15000); // belt and braces if a notification is missed
  return () => {
    clearInterval(poll);
    c.off("notification", handler as any);
    c.unsubscribe("blockchain.scripthash.subscribe", sh).catch(() => {});
  };
}

export async function tipHeight(net: NetId): Promise<number> {
  const t = await req<{ height: number }>(net, "blockchain.headers.get_tip");
  return t.height;
}

let rateCache: { at: number; v: Record<string, number> } | null = null;
/** BCH price in fiat (display and invoice creation only). */
export async function bchPrice(): Promise<Record<string, number>> {
  if (rateCache && Date.now() - rateCache.at < 120_000) return rateCache.v;
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd,cad,eur");
  if (!r.ok) throw new Error("price " + r.status);
  const j = await r.json();
  rateCache = { at: Date.now(), v: j["bitcoin-cash"] };
  return rateCache.v;
}
