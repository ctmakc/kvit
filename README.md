# Kvit — payment links for Bitcoin Cash

**Live demo: https://kvit-cash.pages.dev** · Presentation (BCH BLAZE Widget Factory template): [Google Slides](https://docs.google.com/presentation/d/1PJADVM7GjKn9ahjaYWb9c3Cs67QG2V_ECQD1o81QHUQ/edit?usp=sharing) · [PDF](docs/kvit-widget-factory.pdf)

EMBER2026 community-choice address (CashTokens): `bitcoincash:zpln0flvp7gcx6qncy6rrrtj8eqnzman3syf09q2eq`

Built from scratch for **BCH BLAZE 2026** (November 2026). There is no earlier version of this project.

---

Freelancers and small shops get paid by sending a link. Kvit gives Bitcoin Cash that same link.

1. **Make a ticket.** Your name, your BCH address (or connect your wallet and Kvit fills it), an amount in USD / CAD / EUR / BCH, what it is for. You get a link and a QR.
2. **Your client opens it** and pays: scan the QR with any BCH wallet (BIP21), or press **Pay with WizardConnect**, scan once, approve one transaction in the wallet.
3. **The ticket punches itself PAID** the moment the transaction reaches the mempool, then shows the block height once it confirms. Anyone holding the link sees the same receipt.

No account, no backend, no custody. The ticket lives entirely inside the link.

## Try it as a judge (mainnet, about 5 US cents)

Open https://kvit-cash.pages.dev and press **"Open the 0.0002 BCH tip-jar ticket"**. Pay it with any mainnet wallet (QR) or with a WizardConnect wallet. The ticket flips to PAID within a second of the broadcast.

To try your own ticket: switch to **Mainnet**, paste your address, set $0.10, create the link and open it on your phone.

## How it works

| Piece | What it does |
|---|---|
| `app/src/lib/bch.ts` | Invoice format (base64url JSON in the URL hash), CashAddress checks, BIP21, coin selection and unsigned transaction building with libauth |
| `app/src/lib/chain.ts` | Talks to public Fulcrum servers over WSS (`@electrum-cash/network`): UTXOs, history, address subscription, broadcast |
| `app/src/lib/wallet.ts` | WizardConnect payer flow: derives the wallet's receive and change addresses from the shared xpubs (gap 20), scans UTXOs, builds the payment, sends `sign_transaction_request`, broadcasts the signed transaction |
| `app/src/pages/Pay.tsx` | Payer page: QR for any wallet, WizardConnect pay button, live watcher |
| `app/scripts/test-wallet.ts` | A real signing WizardConnect wallet for chipnet (libauth P2PKH), used for end-to-end tests |

**Matching a payment to a ticket.** The last three digits of the satoshi amount are random per ticket. The watcher looks for an output that pays exactly that amount to the payee address, so one address can carry many open tickets and a refreshed page still knows it was paid.

**Keys never leave the wallet.** WizardConnect shares only xpubs. Kvit builds the transaction, the wallet signs it.

**Tokens are safe.** UTXOs carrying CashTokens are skipped during coin selection.

## Tested end to end on chipnet

Real WizardConnect relay, real signing wallet, real chipnet transactions:

- `e0d49f5c522db55f653e046c723adeed468327e54f8545e6e58215cb26223f8a` (local build)
- `4a70a865…` (production build on kvit-cash.pages.dev)

Insufficient-funds, wrong-network address and broken-link states are handled in the UI.

## Run locally

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in app/dist
```

Chipnet test wallet (needs a seed in `BCH_KVIT_TEST_SEED_HEX`):

```bash
npx tsx scripts/test-wallet.ts "wiz://?p=…&s=…"   # paste the URI from the Connect dialog
```

Free chipnet coins: https://chipnet.bch.ninja (proof of work, no sign-up).

## Stack

React 18 + Vite + TypeScript, `@wizardconnect/react` / `core` / `dapp`, `@bitauth/libauth`, `@electrum-cash/network`, `qrcode-generator`. Hosted as a static site on Cloudflare Pages.

## Roadmap

- PUSD (ParyonUSD) tickets so the price holds between invoice and payment
- Recurring tickets and a paid/unpaid list for the payee
- One-script shop widget
- Branded pages and accounting export for agencies (paid tier)

## License

MIT. WizardConnect packages are LGPL-3.0-or-later and are used unmodified as npm dependencies.
