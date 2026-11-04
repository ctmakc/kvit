// Kvit — pays an invoice from a WizardConnect wallet.
import type { DappConnectionManager } from "@wizardconnect/dapp";
import { binToHex, stringify } from "@bitauth/libauth";
import {
  type BuiltTx,
  type NetId,
  type Utxo,
  buildPayment,
  lockingBytecodeOf,
  pubkeyToAddress,
  txidOf,
} from "./bch";
import { broadcast, listUnspent } from "./chain";

const PATHS = [
  { name: "receive" as const, child: 0 },
  { name: "change" as const, child: 1 },
];
const GAP = 20;

export function walletAddress(mgr: DappConnectionManager, net: NetId, child = 0, index = 0): string | null {
  const pk = mgr.getPubkey(child, BigInt(index));
  return pk ? pubkeyToAddress(pk, net) : null;
}

/** Scan the wallet's receive and change chains (gap 20) for spendable BCH. */
export async function scanWallet(mgr: DappConnectionManager, net: NetId, onProgress?: (n: number) => void): Promise<Utxo[]> {
  const out: Utxo[] = [];
  let done = 0;
  for (const p of PATHS) {
    const batch: Promise<void>[] = [];
    for (let i = 0; i < GAP; i++) {
      const pk = mgr.getPubkey(p.child, BigInt(i));
      if (!pk) continue;
      const address = pubkeyToAddress(pk, net);
      batch.push(
        listUnspent(net, address).then((us) => {
          for (const u of us) {
            out.push({
              txid: u.tx_hash,
              vout: u.tx_pos,
              value: BigInt(u.value),
              height: u.height,
              lockingBytecode: lockingBytecodeOf(address),
              path: p.name,
              index: i,
              address,
            });
          }
          onProgress?.(++done);
        }),
      );
    }
    await Promise.all(batch);
  }
  return out;
}

export function changeLockingBytecode(mgr: DappConnectionManager, net: NetId): Uint8Array {
  // a fresh-ish change address; index 0 keeps it simple and recoverable by any HD wallet
  const pk = mgr.getPubkey(1, 0n) ?? mgr.getPubkey(0, 0n);
  if (!pk) throw new Error("Wallet did not share keys");
  return lockingBytecodeOf(pubkeyToAddress(pk, net));
}

export function preparePayment(mgr: DappConnectionManager, net: NetId, utxos: Utxo[], to: string, amount: bigint): BuiltTx {
  return buildPayment({ utxos, to, amount, changeLockingBytecode: changeLockingBytecode(mgr, net) });
}

/** Ask the wallet to sign, then broadcast ourselves (the wallet may also broadcast; duplicates are fine). */
export async function signAndSend(
  mgr: DappConnectionManager,
  net: NetId,
  built: BuiltTx,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await mgr.signTransaction(
    {
      transaction: {
        transaction: built.hex,
        // relay JSON cannot carry bigint/Uint8Array: libauth extended-JSON markers, as WizardConnect expects
        sourceOutputs: JSON.parse(stringify(built.sourceOutputs)),
        userPrompt: prompt,
        broadcast: false,
      },
      inputPaths: built.inputPaths,
    },
    { signal },
  );
  if ((res as any).error) throw new Error((res as any).error);
  const signed = typeof res.signedTransaction === "string" ? res.signedTransaction : binToHex(res.signedTransaction as any);
  if (!signed) throw new Error("Wallet returned no transaction");
  await broadcast(net, signed);
  return txidOf(signed);
}
