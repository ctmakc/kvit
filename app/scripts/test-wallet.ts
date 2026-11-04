// Chipnet test wallet for Kvit: a real WizardConnect wallet that signs.
// Usage: npx tsx scripts/test-wallet.ts "<wiz://...>"   (seed from ~/.config/agent-secrets/BCH_KVIT.env)
import fs from "node:fs";
import { WalletConnectionManager, type WalletAdapter, DerivationPath } from "@wizardconnect/wallet";
import { generateKeyExchangeCredentials, hexToBin, toBigInt } from "@wizardconnect/core";
import {
  binToHex,
  decodeTransaction,
  deriveHdPath,
  deriveHdPrivateNodeChild,
  deriveHdPrivateNodeFromSeed,
  deriveHdPublicNode,
  encodeHdPublicKey,
  encodeTransaction,
  generateTransaction,
  secp256k1,
  walletTemplateP2pkhNonHd,
  walletTemplateToCompilerBch,
  type HdPrivateNodeValid,
} from "@bitauth/libauth";

const env = fs.readFileSync(process.env.HOME + "/.config/agent-secrets/BCH_KVIT.env", "utf8");
const seed = hexToBin(env.match(/BCH_KVIT_TEST_SEED_HEX=(\w+)/)![1]);
const master = deriveHdPrivateNodeFromSeed(seed) as HdPrivateNodeValid;
const chain = (p: number) => deriveHdPath(master, `m/44'/145'/0'/${p}`) as HdPrivateNodeValid;
const chains: Record<number, HdPrivateNodeValid> = { 0: chain(0), 1: chain(1), 7: chain(7) };
const nameToChild: Record<string, number> = { receive: 0, change: 1, defi: 7 };
const relayKey = hexToBin(generateKeyExchangeCredentials().privateKey);
const compiler = walletTemplateToCompilerBch(walletTemplateP2pkhNonHd);
const autoReject = process.argv.includes("--reject");

const adapter: WalletAdapter = {
  walletName: "Kvit chipnet test wallet",
  walletIcon: "",
  getRelayPrivateKey: () => relayKey,
  getPublicKey(path: DerivationPath, index: bigint) {
    const child = deriveHdPrivateNodeChild(chains[path as number], Number(index)) as HdPrivateNodeValid;
    return secp256k1.derivePublicKeyCompressed(child.privateKey) as Uint8Array;
  },
  getXpub(path: DerivationPath) {
    const r = encodeHdPublicKey({ node: deriveHdPublicNode(chains[path as number]), network: "mainnet" });
    return (r as any).hdPublicKey;
  },
  async signTransaction(request: any) {
    const t = request.transaction;
    const txRaw = typeof t.transaction === "string" ? decodeTransaction(hexToBin(t.transaction)) : t.transaction;
    if (typeof txRaw === "string") throw new Error(txRaw);
    const src = t.sourceOutputs;
    const inputs = txRaw.inputs.map((inp: any, i: number) => {
      const p = request.inputPaths.find((x: any) => x[0] === i);
      if (!p) throw new Error("no path for input " + i);
      const node = deriveHdPrivateNodeChild(chains[nameToChild[p[1]]], Number(p[2])) as HdPrivateNodeValid;
      return {
        outpointIndex: inp.outpointIndex,
        outpointTransactionHash: inp.outpointTransactionHash,
        sequenceNumber: inp.sequenceNumber,
        unlockingBytecode: {
          compiler,
          data: { keys: { privateKeys: { key: node.privateKey } } },
          script: "unlock",
          valueSatoshis: toBigInt(src[i].valueSatoshis),
        },
      };
    });
    const g = generateTransaction({ version: txRaw.version, locktime: txRaw.locktime, inputs, outputs: txRaw.outputs });
    if (!g.success) throw new Error(JSON.stringify(g.errors).slice(0, 400));
    console.log("signed", txRaw.inputs.length, "inputs;", "prompt:", t.userPrompt);
    return { signedTransactionHex: binToHex(encodeTransaction(g.transaction)) } as any;
  },
};

const uri = process.argv[2];
if (!uri?.toLowerCase().startsWith("wiz://")) {
  console.log("xpub receive:", adapter.getXpub(DerivationPath.Receive));
  process.exit(0);
}
const mgr = new WalletConnectionManager(adapter);
mgr.on("connectionStatusChanged", (_id: string, s: any) => console.log("relay:", s.status));
mgr.on("pendingSignRequest", async (req: any) => {
  console.log("sign request seq", req.request.sequence);
  try {
    if (autoReject) throw new Error("User rejected");
    const r = await adapter.signTransaction(req.request);
    await mgr.sendSignResponse(req.connectionId, req.request.sequence, (r as any).signedTransactionHex);
    console.log("response sent");
    setTimeout(() => process.exit(0), 4000);
  } catch (e) {
    console.log("sign error", (e as Error).message);
    await mgr.sendSignError(req.connectionId, req.request.sequence, (e as Error).message);
    setTimeout(() => process.exit(0), 3000);
  }
});
mgr.connect(uri);
setTimeout(() => {
  console.log("timeout");
  process.exit(2);
}, 240000);
