import { useEffect, useMemo, useRef, useState } from "react";
import { type Invoice, NETWORKS, decodeInvoice, invoiceAmount, invoiceMark, unitsToToken } from "../lib/bch";
import { type Entry, checkTicket, clearBook, loadBook, markPaid, onBook, removeTicket } from "../lib/book";

type St = "checking" | "open" | "err";

function useBook(): Entry[] {
  const [b, setB] = useState<Entry[]>(loadBook);
  useEffect(() => onBook(() => setB(loadBook())), []);
  return b;
}

export function useBookCount(): number {
  return useBook().length;
}

function linkOf(tok: string) {
  return `${location.origin}${location.pathname}#/pay/${tok}`;
}

function unitKey(inv: Invoice) {
  return inv.k ? `${inv.n}:${inv.k.c}` : `${inv.n}:bch`;
}

function csv(rows: { e: Entry; inv: Invoice }[]) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ["issued", "network", "payee", "for", "amount", "unit", "fiat_at_creation", "ref", "status", "txid", "block", "link"];
  const lines = rows.map(({ e, inv }) => {
    const a = invoiceAmount(inv);
    return [
      new Date(inv.t * 1000).toISOString(),
      NETWORKS[inv.n].label,
      inv.p,
      inv.m,
      a.num,
      a.unit,
      inv.f ? `${inv.f.v} ${inv.f.c}` : "",
      invoiceMark(inv),
      e.paid ? "paid" : "open",
      e.paid?.txid ?? "",
      e.paid ? (e.paid.height > 0 ? String(e.paid.height) : "mempool") : "",
      linkOf(e.tok),
    ]
      .map(q)
      .join(",");
  });
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

export function Tickets() {
  const book = useBook();
  const rows = useMemo(() => book.map((e) => ({ e, inv: decodeInvoice(e.tok)! })).filter((r) => r.inv), [book]);
  const [st, setSt] = useState<Record<string, St>>({});
  const [fresh, setFresh] = useState<Set<string>>(new Set()); // punched while this page is open
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const run = useRef(0);

  async function checkAll() {
    const id = ++run.current;
    const todo = loadBook().filter((e) => !e.paid || e.paid.height <= 0); // mempool payments come back for their block
    setSt((s) => ({ ...s, ...Object.fromEntries(todo.map((e) => [e.tok, "checking" as St])) }));
    let i = 0;
    const worker = async () => {
      while (i < todo.length && id === run.current) {
        const e = todo[i++];
        const inv = decodeInvoice(e.tok);
        if (!inv) continue;
        try {
          const p = await checkTicket(inv);
          if (p) {
            markPaid(e.tok, p);
            if (!e.paid) setFresh((f) => new Set(f).add(e.tok));
          }
          setSt((s) => ({ ...s, [e.tok]: "open" }));
        } catch {
          setSt((s) => ({ ...s, [e.tok]: "err" }));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  useEffect(() => {
    checkAll();
    const t = setInterval(checkAll, 60000);
    return () => {
      run.current++;
      clearInterval(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // totals per network + currency
  const totals = useMemo(() => {
    const m = new Map<string, { unit: string; d: number; net: string; paid: bigint; open: bigint; nPaid: number; nOpen: number }>();
    for (const { e, inv } of rows) {
      const k = unitKey(inv);
      const u = invoiceAmount(inv).unit;
      const t = m.get(k) ?? { unit: u, d: inv.k ? inv.k.d : 8, net: NETWORKS[inv.n].label, paid: 0n, open: 0n, nPaid: 0, nOpen: 0 };
      if (e.paid) {
        t.paid += BigInt(inv.s);
        t.nPaid++;
      } else {
        t.open += BigInt(inv.s);
        t.nOpen++;
      }
      m.set(k, t);
    }
    return [...m.values()];
  }, [rows]);

  const checking = Object.values(st).includes("checking");

  function exportCsv() {
    const blob = new Blob([csv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kvit-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <main className="book">
      <header className="book-head">
        <h1 className="hero-title">
          <span className="line">Ticket book.</span>
        </h1>
        <p className="lede">
          Every link you made on this device. Kvit asks the chain about each open ticket and punches the ones that got
          paid. The book stays in this browser; nothing is uploaded.
        </p>
      </header>

      {rows.length > 0 && (
        <section className="book-side" aria-label="Totals and export">
            <dl className="totals">
              {totals.map((t) => (
                <div key={t.net + t.unit}>
                  <dt>
                    {t.unit} <span>{t.net}</span>
                  </dt>
                  <dd>
                    <span className="mono t-paid">{unitsToToken(t.paid, t.d)}</span> paid · {t.nPaid}
                  </dd>
                  <dd>
                    <span className="mono">{unitsToToken(t.open, t.d)}</span> open · {t.nOpen}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="book-actions">
              <button type="button" className="btn-go" onClick={exportCsv}>
                Export CSV
              </button>
              <button type="button" className="btn-ghost" onClick={checkAll} disabled={checking}>
                {checking ? "Checking the chain…" : "Check again"}
              </button>
            </div>
            <div className="book-clear">
              {confirmClear ? (
                <p>
                  Remove all {rows.length} tickets from this device? Payers keep their links.{" "}
                  <button type="button" className="inline-link" onClick={() => (clearBook(), setConfirmClear(false))}>
                    Remove all
                  </button>{" "}
                  <button type="button" className="inline-link muted" onClick={() => setConfirmClear(false)}>
                    Keep
                  </button>
                </p>
              ) : (
                <button type="button" className="inline-link muted" onClick={() => setConfirmClear(true)}>
                  Clear the book
                </button>
              )}
            </div>
        </section>
      )}

      <section className="book-list" aria-label="Tickets">
        {rows.length === 0 ? (
          <div className="book-empty">
            <p>No tickets yet. Links you create here land in the book.</p>
            <a className="btn-go" href="#/">
              Make a ticket
            </a>
          </div>
        ) : (
          <ol className="stubs">
            {rows.map(({ e, inv }, i) => {
              const a = invoiceAmount(inv);
              const [w, f = ""] = a.num.split(".");
              const s = st[e.tok];
              return (
                <li key={e.tok} className={"stub" + (e.paid ? " is-paid" : "") + (fresh.has(e.tok) ? " just" : "")} style={{ ["--i" as string]: Math.min(i, 12) }}>
                  <span className="punch" aria-hidden="true" />
                  <a className="stub-body" href={`#/pay/${e.tok}`}>
                    <span className="stub-for">{inv.m || "Payment"}</span>
                    <span className="stub-sub mono">
                      {new Date(inv.t * 1000).toISOString().slice(0, 10)} · {NETWORKS[inv.n].label} · …{invoiceMark(inv)}
                    </span>
                    <span className="stub-amt">
                      <span className="mono">{w}</span>
                      {f && <span className="mono frac">.{f}</span>}
                      <span className="unit">{a.unit}</span>
                    </span>
                    <span className={"stub-st" + (e.paid ? " paid" : "")}>
                      {e.paid
                        ? `PAID · ${e.paid.height > 0 ? "block " + e.paid.height : "in mempool"}`
                        : s === "checking"
                          ? "checking…"
                          : s === "err"
                            ? "chain unreachable"
                            : "OPEN"}
                    </span>
                  </a>
                  <span className="stub-tools">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(linkOf(e.tok)).then(() => setCopied(e.tok))}
                      aria-label="Copy payment link"
                    >
                      {copied === e.tok ? "Copied" : "Copy link"}
                    </button>
                    <button type="button" onClick={() => removeTicket(e.tok)} aria-label="Remove from the book">
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
