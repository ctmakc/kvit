import { useEffect, useMemo, useState } from "react";
import {
  type Invoice,
  type NetId,
  DUST,
  TOKEN_OUT_SATS,
  type TokenRef,
  addressNet,
  bchToSats,
  encodeInvoice,
  normalizeAddress,
  satsToBch,
  tokenToUnits,
  unitsToToken,
  uniqueAmount,
} from "../lib/bch";
import { bchPrice } from "../lib/chain";
import { walletAddress } from "../lib/wallet";
import { Ticket } from "../components/Ticket";
import { QR } from "../components/QR";
import { useWallet } from "../components/WalletProvider";
import { TIP_ADDRESS, TOKEN_PRESETS } from "../config";

type Cur = "USD" | "CAD" | "EUR" | "BCH" | `tok:${string}`;
const FIAT = ["USD", "CAD", "EUR"];
const DRAFT_KEY = "kvit-draft";

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

export function Create() {
  const d = loadDraft();
  const wc = useWallet();
  const [net, setNet] = useState<NetId>(d.net === "chip" ? "chip" : "main");
  const [name, setName] = useState<string>(d.name ?? "");
  const [addr, setAddr] = useState<string>(d.addr ?? "");
  const [amount, setAmount] = useState<string>("");
  const [cur, setCur] = useState<Cur>(typeof d.cur === "string" && !d.cur.startsWith("tok:") ? d.cur : "USD");
  const [custom, setCustom] = useState<{ c: string; d: string; y: string }>({ c: "", d: "0", y: "" });
  const [memo, setMemo] = useState<string>("");
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [rateErr, setRateErr] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkSats, setLinkSats] = useState<string | null>(null);

  useEffect(() => {
    bchPrice().then(setRates, () => setRateErr(true));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ net, name, addr, cur }));
    } catch {
      /* private mode */
    }
  }, [net, name, addr, cur]);

  // wallet connected → offer its first receive address
  useEffect(() => {
    if (wc.state === "connected" && wc.manager && !addr) {
      const a = walletAddress(wc.manager, net);
      if (a) setAddr(a);
    }
  }, [wc.state, wc.manager, net, addr]);

  // an address that names its network decides the toggle
  useEffect(() => {
    const n = addressNet(addr);
    if (n && n !== net) setNet(n);
  }, [addr]); // eslint-disable-line react-hooks/exhaustive-deps

  const payee = normalizeAddress(addr, net);
  const token: TokenRef | null = useMemo(() => {
    if (!cur.startsWith("tok:")) return null;
    const id = cur.slice(4);
    if (id !== "custom") {
      const p = TOKEN_PRESETS[net].find((t) => t.c === id);
      return p ? { c: p.c, d: p.d, y: p.y } : null;
    }
    const c = custom.c.trim().toLowerCase();
    const dd = Number(custom.d);
    if (!/^[0-9a-f]{64}$/.test(c) || !Number.isInteger(dd) || dd < 0 || dd > 18) return null;
    return { c, d: dd, y: custom.y.trim().replace(/[^\w.$-]/g, "").slice(0, 10) || "tokens" };
  }, [cur, net, custom]);
  const tokenUnits = token ? tokenToUnits(amount, token.d) : null;
  const baseSats = useMemo(() => {
    if (cur.startsWith("tok:")) return null;
    if (cur === "BCH") return bchToSats(amount);
    const v = Number(amount.replace(",", "."));
    const r = rates?.[cur.toLowerCase()];
    if (!v || !r || v <= 0) return null;
    return BigInt(Math.round((v / r) * 1e8));
  }, [amount, cur, rates]);
  const [tail, setTail] = useState(() => BigInt(1 + Math.floor(Math.random() * 998)));
  const sats = baseSats != null ? (baseSats / 1000n) * 1000n + tail : null;
  // token ticket: the mark rides on the token output's satoshis
  const tokSats = TOKEN_OUT_SATS + tail;
  const amountKey = token ? `${token.c}:${tokenUnits ?? ""}` : (sats ?? 0n).toString();

  useEffect(() => {
    if (link && linkSats !== amountKey) setLink(null);
  }, [amountKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // a preset of the other network cannot stay selected
  useEffect(() => {
    if (cur.startsWith("tok:") && cur !== "tok:custom" && !TOKEN_PRESETS[net].some((t) => "tok:" + t.c === cur)) setCur("USD");
  }, [net]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (link) setLink(null);
  }, [memo, name, addr, net]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!link && linkSats) {
      setTail(BigInt(1 + Math.floor(Math.random() * 998)));
      setLinkSats(null);
    }
  }, [link]); // eslint-disable-line react-hooks/exhaustive-deps

  const tooSmall = !token && sats != null && sats < DUST + 1000n;
  const fiat = FIAT.includes(cur) && amount ? { v: Number(amount.replace(",", ".")).toFixed(2), c: cur } : undefined;
  const ready = !!payee && (token ? tokenUnits != null && tokenUnits > 0n : sats != null && !tooSmall);

  const draft: Invoice = {
    v: 1,
    n: net,
    a: payee ?? (net === "main" ? "bitcoincash:" : "bchtest:"),
    s: (token ? tokenUnits ?? 0n : sats ?? 0n).toString(),
    m: memo,
    p: name,
    f: fiat,
    t: Math.floor(Date.now() / 1000),
    ...(token ? { k: token, x: tokSats.toString() } : {}),
  };

  function create() {
    if (!ready) return;
    const inv: Invoice = { ...draft, a: payee! };
    const url = `${location.origin}${location.pathname}#/pay/${encodeInvoice(inv)}`;
    setLink(url);
    setLinkSats(amountKey);
    setCopied(false);
  }

  function tipJar() {
    const inv: Invoice = {
      v: 1,
      n: "main",
      a: TIP_ADDRESS,
      s: uniqueAmount(20000n).toString(),
      m: "Tip the Kvit jar (judges' demo)",
      p: "Kvit",
      t: Math.floor(Date.now() / 1000),
    };
    location.hash = `#/pay/${encodeInvoice(inv)}`;
  }

  return (
    <main className="split">
      <section className="pane-left">
        <h1 className="hero-title">
          <span className="line">Send a link.</span>
          <span className="line">Get paid in&nbsp;Bitcoin&nbsp;Cash.</span>
        </h1>
        <p className="lede">
          Kvit turns an amount into a payable ticket. Your client opens it, pays from any BCH wallet or with
          WizardConnect, and the ticket punches itself PAID when the chain sees it. No account, no custody, no server
          holding your money.
        </p>

        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="seg" role="radiogroup" aria-label="Network">
            {(["main", "chip"] as NetId[]).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={net === n}
                className={net === n ? "on" : ""}
                onClick={() => {
                  setNet(n);
                  if (addressNet(addr) && addressNet(addr) !== n) setAddr("");
                }}
              >
                {n === "main" ? "Mainnet" : "Chipnet (test)"}
              </button>
            ))}
          </div>

          <label className="field">
            <span>Your name or shop</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Olena — illustration" />
          </label>

          <div className="field">
            <span>
              <label htmlFor="payto">Pay to (your BCH address)</label>
              {wc.state !== "connected" && (
                <button type="button" className="inline-link" onClick={() => wc.connect()}>
                  use my wallet
                </button>
              )}
            </span>
            <input
              id="payto"
              className="mono"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder={net === "main" ? "bitcoincash:q…" : "bchtest:q…"}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!!addr && !payee}
            />
            {!!addr && !payee && <small className="err">That is not a {net === "main" ? "mainnet" : "chipnet"} CashAddress.</small>}
          </div>

          <div className="row">
            <label className="field grow">
              <span>Amount</span>
              <input
                className="mono"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={cur === "BCH" ? "0.05" : token && token.d === 0 ? "100" : "25.00"}
              />
            </label>
            <label className="field cur">
              <span>Currency</span>
              <select value={cur} onChange={(e) => setCur(e.target.value as Cur)}>
                <option>USD</option>
                <option>CAD</option>
                <option>EUR</option>
                <option>BCH</option>
                <optgroup label="CashTokens">
                  {TOKEN_PRESETS[net].map((t) => (
                    <option key={t.c} value={"tok:" + t.c}>
                      {t.label}
                    </option>
                  ))}
                  <option value="tok:custom">Other token…</option>
                </optgroup>
              </select>
            </label>
          </div>
          {cur === "tok:custom" && (
            <>
              <label className="field">
                <span>Token category</span>
                <input
                  className="mono"
                  value={custom.c}
                  onChange={(e) => setCustom({ ...custom, c: e.target.value })}
                  placeholder="64 hex characters"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!!custom.c && !token}
                />
              </label>
              <div className="row">
              <label className="field grow">
                <span>Decimals</span>
                <input className="mono" inputMode="numeric" value={custom.d} onChange={(e) => setCustom({ ...custom, d: e.target.value })} />
              </label>
              <label className="field cur">
                <span>Ticker</span>
                <input value={custom.y} maxLength={10} onChange={(e) => setCustom({ ...custom, y: e.target.value })} placeholder="TKN" />
              </label>
              </div>
            </>
          )}
          <small className="hint mono">
            {token
              ? tokenUnits != null && tokenUnits > 0n
                ? `Token ticket · asks ${unitsToToken(tokenUnits, token.d)} ${token.y} on a ${tokSats} sat output`
                : `Amount in ${token.y}, up to ${token.d} decimals.`
              : cur === "tok:custom"
                ? "Paste the token category (the genesis transaction id)."
                : cur !== "BCH" && rates
              ? `1 BCH = ${rates[cur.toLowerCase()]?.toLocaleString("en-US")} ${cur}` +
                (sats != null ? ` · ticket asks ${satsToBch(sats)} BCH` : "")
              : cur !== "BCH" && rateErr
                ? "Price feed unavailable — enter the amount in BCH."
                : cur !== "BCH"
                  ? "Loading BCH price…"
                  : "Exact BCH amount."}
            {tooSmall && " · too small to send"}
          </small>

          <label className="field">
            <span>What it is for</span>
            <input value={memo} maxLength={140} onChange={(e) => setMemo(e.target.value)} placeholder="Logo design, 2 rounds of edits" />
          </label>

          <button className="btn-go" type="submit" disabled={!ready}>
            Create payment link
          </button>
          <p className="fine">
            The last three digits of the satoshi amount mark this ticket, so several tickets can share one address and
            each still knows when it is paid.
          </p>
        </form>

        <div className="judge">
          <p>Judging? Make a real mainnet payment in two taps:</p>
          <button type="button" className="btn-ghost" onClick={tipJar}>
            Open the 0.0002 BCH tip-jar ticket
          </button>
        </div>
      </section>

      <section className="pane-right">
        <div className="sticky">
          <Ticket inv={draft} preview={!link}>
            {link && (
              <div className="share">
                <QR value={link} size={168} label="QR code of the payment link" />
                <div className="share-actions">
                  <p className="share-title">Link is ready</p>
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() =>
                      navigator.clipboard?.writeText(link).then(() => {
                        setCopied(true);
                      })
                    }
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  {"share" in navigator && (
                    <button
                      type="button"
                      className="btn-line"
                      onClick={() => navigator.share({ title: "Payment request", text: memo || "Payment request", url: link }).catch(() => {})}
                    >
                      Share…
                    </button>
                  )}
                  <a className="btn-line" href={link.slice(link.indexOf("#"))}>
                    Open as payer
                  </a>
                </div>
              </div>
            )}
          </Ticket>
        </div>
      </section>
    </main>
  );
}
