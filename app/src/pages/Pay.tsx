import { useCallback, useEffect, useRef, useState } from "react";
import { type BuiltTx, type Invoice, InsufficientFunds, NETWORKS, bip21, decodeInvoice, satsToBch } from "../lib/bch";
import { findPayment, watchAddress, type Payment } from "../lib/chain";
import { preparePayment, scanWallet, signAndSend } from "../lib/wallet";
import { Ticket } from "../components/Ticket";
import { QR } from "../components/QR";
import { useWallet } from "../components/WalletProvider";

type Step =
  | { k: "idle" }
  | { k: "scanning"; n: number }
  | { k: "ready"; built: BuiltTx; balance: bigint }
  | { k: "signing" }
  | { k: "sent"; txid: string }
  | { k: "error"; msg: string };

export function Pay({ token }: { token: string }) {
  const inv = decodeInvoice(token);
  if (!inv) {
    return (
      <main className="narrow">
        <h1 className="hero-title">This link is not a Kvit ticket.</h1>
        <p className="lede">It may have been cut off when it was copied. Ask the sender for the full link.</p>
        <a className="btn-go" href="#/">Make a ticket</a>
      </main>
    );
  }
  return <PayInvoice inv={inv} />;
}

function PayInvoice({ inv }: { inv: Invoice }) {
  const wc = useWallet();
  const sats = BigInt(inv.s);
  const [paid, setPaid] = useState<Payment | null>(null);
  const [chainErr, setChainErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ k: "idle" });
  const [copied, setCopied] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const wantPay = useRef(false);

  const check = useCallback(async () => {
    try {
      const p = await findPayment(inv.n, inv.a, sats);
      setChainErr(null);
      if (p) setPaid(p);
    } catch (e) {
      setChainErr(String((e as Error).message || e));
    }
  }, [inv.n, inv.a, sats]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let dead = false;
    check();
    watchAddress(inv.n, inv.a, check).then(
      (s) => (dead ? s() : (stop = s)),
      (e) => setChainErr(String(e.message || e)),
    );
    return () => {
      dead = true;
      stop?.();
    };
  }, [check, inv.n, inv.a]);

  const prepare = useCallback(async () => {
    if (!wc.manager) return;
    setStep({ k: "scanning", n: 0 });
    try {
      const utxos = await scanWallet(wc.manager, inv.n, (n) => setStep({ k: "scanning", n }));
      const balance = utxos.reduce((s, u) => s + u.value, 0n);
      const built = preparePayment(wc.manager, inv.n, utxos, inv.a, sats);
      setStep({ k: "ready", built, balance });
    } catch (e) {
      if (e instanceof InsufficientFunds)
        setStep({
          k: "error",
          msg: `This wallet holds ${satsToBch(e.have)} ${inv.n === "chip" ? "tBCH" : "BCH"} on ${NETWORKS[inv.n].label}. The ticket needs about ${satsToBch(e.need)} ${inv.n === "chip" ? "tBCH" : "BCH"} including the fee.`,
        });
      else setStep({ k: "error", msg: String((e as Error).message || e) });
    }
  }, [wc.manager, inv.n, inv.a, sats]);

  // connected after pressing "Pay with wallet" → go straight to the scan
  useEffect(() => {
    if (wc.state === "connected" && wantPay.current && step.k === "idle") {
      wantPay.current = false;
      prepare();
    }
  }, [wc.state, step.k, prepare]);

  async function send(built: BuiltTx) {
    if (!wc.manager) return;
    setStep({ k: "signing" });
    abort.current = new AbortController();
    try {
      const prompt = `Pay ${satsToBch(sats)} BCH to ${inv.p || "payee"}${inv.m ? " — " + inv.m : ""}`;
      const txid = await signAndSend(wc.manager, inv.n, built, prompt, abort.current.signal);
      setStep({ k: "sent", txid });
      setPaid((p) => p ?? { txid, height: 0, value: sats });
      setTimeout(check, 1500);
    } catch (e) {
      const err = e as Error;
      setStep({ k: "error", msg: err.name === "AbortError" ? "Cancelled." : err.message || String(e) });
    }
  }

  function copy(what: string, v: string) {
    navigator.clipboard?.writeText(v).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const uri = bip21(inv);
  const connected = wc.state === "connected";

  return (
    <main className="split pay">
      <section className="pane-right first">
        <div className="sticky">
          <Ticket inv={inv} paid={paid}>
            {!paid && (
              <div className="share">
                <QR value={uri} size={176} label="Payment QR for any Bitcoin Cash wallet" />
                <div className="share-actions">
                  <p className="share-title">Scan with any BCH wallet</p>
                  <a className="btn-ink" href={uri}>
                    Open in wallet app
                  </a>
                  <button type="button" className="btn-line" onClick={() => copy("addr", inv.a)}>
                    {copied === "addr" ? "Copied" : "Copy address"}
                  </button>
                  <button type="button" className="btn-line" onClick={() => copy("amt", satsToBch(sats))}>
                    {copied === "amt" ? "Copied" : "Copy exact amount"}
                  </button>
                </div>
              </div>
            )}
          </Ticket>
        </div>
      </section>

      <section className="pane-left">
        {paid ? (
          <>
            <h1 className="hero-title">
              <span className="line">Paid.</span>
            </h1>
            <p className="lede">
              {satsToBch(paid.value)} BCH reached {inv.p || "the payee"}
              {paid.height > 0 ? ` and is confirmed in block ${paid.height}.` : ". It is in the mempool and will confirm with the next block."}
            </p>
            <a className="btn-line wide" href={NETWORKS[inv.n].explorerTx + paid.txid} target="_blank" rel="noreferrer">
              View transaction
            </a>
            <a className="btn-ghost wide" href="#/">
              Make your own ticket
            </a>
          </>
        ) : (
          <>
            <h1 className="hero-title">
              <span className="line">{inv.p || "Someone"} asks for</span>
              <span className="line mono amt">{satsToBch(sats)} BCH</span>
            </h1>
            <p className="lede">
              Pay from any wallet with the QR, or connect a WizardConnect wallet and approve one transaction. This page
              watches {NETWORKS[inv.n].label} live and punches the ticket the moment the payment lands.
            </p>

            <div className="paybox">
              {step.k === "idle" &&
                (connected ? (
                  <button type="button" className="btn-go" onClick={prepare}>
                    Pay with {wc.walletName ?? "connected wallet"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-go"
                    onClick={() => {
                      wantPay.current = true;
                      wc.connect();
                    }}
                  >
                    {wc.state === "connecting" ? "Waiting for wallet…" : "Pay with WizardConnect"}
                  </button>
                ))}
              {step.k === "scanning" && (
                <p className="status mono">
                  <i className="dot" /> Reading wallet balance… {step.n}/40 addresses
                </p>
              )}
              {step.k === "ready" && (
                <div className="confirm">
                  <dl>
                    <div>
                      <dt>Pays</dt>
                      <dd className="mono">{satsToBch(sats)} BCH</dd>
                    </div>
                    <div>
                      <dt>Network fee</dt>
                      <dd className="mono">{step.built.fee.toString()} sats</dd>
                    </div>
                    <div>
                      <dt>Wallet balance</dt>
                      <dd className="mono">{satsToBch(step.balance)} BCH</dd>
                    </div>
                  </dl>
                  <button type="button" className="btn-go" onClick={() => send(step.built)}>
                    Send to wallet for approval
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setStep({ k: "idle" })}>
                    Back
                  </button>
                </div>
              )}
              {step.k === "signing" && (
                <div className="confirm">
                  <p className="status mono">
                    <i className="dot" /> Approve the payment in {wc.walletName ?? "your wallet"}…
                  </p>
                  <button type="button" className="btn-ghost" onClick={() => abort.current?.abort("user")}>
                    Cancel
                  </button>
                </div>
              )}
              {step.k === "sent" && (
                <p className="status mono">
                  <i className="dot go" /> Broadcast {step.txid.slice(0, 12)}… waiting for the chain
                </p>
              )}
              {step.k === "error" && (
                <div className="confirm">
                  <p className="err">{step.msg}</p>
                  <button type="button" className="btn-line" onClick={() => (connected ? prepare() : setStep({ k: "idle" }))}>
                    Try again
                  </button>
                  {connected && (
                    <button type="button" className="btn-ghost" onClick={() => void wc.disconnect().then(() => setStep({ k: "idle" }))}>
                      Use another wallet
                    </button>
                  )}
                </div>
              )}
            </div>
            {chainErr && <p className="hint err">Chain watcher: {chainErr}. Retrying.</p>}
            <p className="fine">
              Exact amount matters: the last digits ({inv.s.slice(-3)}) tell this ticket apart from other payments to the
              same address.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
