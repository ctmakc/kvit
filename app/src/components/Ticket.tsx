import type { ReactNode } from "react";
import { NETWORKS, type Invoice, satsToBch, shortAddr } from "../lib/bch";

export function Ticket({
  inv,
  paid,
  children,
  preview,
}: {
  inv: Invoice;
  paid?: { txid: string; height: number } | null;
  children?: ReactNode;
  preview?: boolean;
}) {
  const bch = satsToBch(BigInt(inv.s));
  const [whole, frac = ""] = bch.split(".");
  const created = inv.t ? new Date(inv.t * 1000) : null;
  return (
    <article className={"ticket" + (paid ? " is-paid" : "") + (preview ? " is-preview" : "")} aria-live="polite">
      <div className="ticket-main">
        <header className="ticket-head">
          <span className="ticket-kicker">{inv.p || "Payee"}</span>
          <span className={"ticket-net net-" + inv.n}>{NETWORKS[inv.n].label}</span>
        </header>
        <p className="ticket-for">{inv.m || "Payment"}</p>
        <p className="ticket-amount">
          <span className="mono">{whole}</span>
          {frac && <span className="mono frac">.{frac}</span>}
          <span className="unit">BCH</span>
        </p>
        {inv.f && (
          <p className="ticket-fiat mono">
            ≈ {inv.f.v} {inv.f.c} <span>at creation</span>
          </p>
        )}
        <dl className="ticket-meta">
          <div>
            <dt>To</dt>
            <dd className="mono" title={inv.a}>
              {shortAddr(inv.a)}
            </dd>
          </div>
          {created && (
            <div>
              <dt>Issued</dt>
              <dd className="mono">{created.toISOString().slice(0, 10)}</dd>
            </div>
          )}
          <div>
            <dt>Ref</dt>
            <dd className="mono">…{inv.s.slice(-3)}</dd>
          </div>
        </dl>
        {children}
      </div>
      <div className="ticket-perf" aria-hidden="true" />
      <aside className="ticket-stub">
        <div className="punch" aria-hidden="true" />
        {paid ? (
          <div className="stub-paid">
            <strong>PAID</strong>
            <span className="mono">{paid.height > 0 ? `block ${paid.height}` : "in mempool"}</span>
            <a className="mono" href={NETWORKS[inv.n].explorerTx + paid.txid} target="_blank" rel="noreferrer">
              tx {paid.txid.slice(0, 8)}…
            </a>
          </div>
        ) : (
          <div className="stub-open">
            <strong>{preview ? "PREVIEW" : "OPEN"}</strong>
            <span>{preview ? "not yet a link" : "watching the chain"}</span>
          </div>
        )}
      </aside>
    </article>
  );
}
