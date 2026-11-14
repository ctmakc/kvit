// The payee's ticket book: every link made on this device, kept in localStorage only.
import { type Invoice, TOKEN_OUT_SATS, decodeInvoice } from "./bch";
import { findPayment } from "./chain";

const KEY = "kvit-book";
const MAX = 300;
const EVT = "kvit-book";

export interface Entry {
  tok: string; // encoded invoice, the part after #/pay/
  at: number; // added, ms
  paid?: { txid: string; height: number };
}

export function loadBook(): Entry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.tok === "string" && decodeInvoice(e.tok)) : [];
  } catch {
    return [];
  }
}

function save(b: Entry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b.slice(0, MAX)));
  } catch {
    /* private mode or full */
  }
  window.dispatchEvent(new Event(EVT));
}

export function addTicket(tok: string) {
  const b = loadBook().filter((e) => e.tok !== tok);
  save([{ tok, at: Date.now() }, ...b]);
}

export function inBook(tok: string): boolean {
  return loadBook().some((e) => e.tok === tok);
}

export function markPaid(tok: string, paid: { txid: string; height: number }) {
  const b = loadBook();
  const e = b.find((x) => x.tok === tok);
  if (!e || (e.paid && e.paid.txid === paid.txid && e.paid.height === paid.height)) return;
  e.paid = { txid: paid.txid, height: paid.height };
  save(b);
}

export function removeTicket(tok: string) {
  save(loadBook().filter((e) => e.tok !== tok));
}

export function clearBook() {
  save([]);
}

export function onBook(cb: () => void): () => void {
  const h = (e: Event) => (e.type === EVT || (e as StorageEvent).key === KEY) && cb();
  window.addEventListener(EVT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVT, h);
    window.removeEventListener("storage", h);
  };
}

/** Ask the chain whether this ticket is paid. */
export function checkTicket(inv: Invoice) {
  const sats = inv.k ? BigInt(inv.x ?? TOKEN_OUT_SATS) : BigInt(inv.s);
  return findPayment(inv.n, inv.a, sats, inv.k ? { category: inv.k.c, amount: BigInt(inv.s) } : undefined);
}
