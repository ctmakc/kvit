# Kvit — payment links for Bitcoin Cash

**Live demo: https://kvit-cash.pages.dev** · Video (53 s): https://youtu.be/iXSKTpkBw7Y · BLAZE video (59 s, token tickets + ticket book): https://youtu.be/BDpq3GY_Y74 · Presentation (BCH BLAZE Widget Factory template): [Google Slides](https://docs.google.com/presentation/d/1PJADVM7GjKn9ahjaYWb9c3Cs67QG2V_ECQD1o81QHUQ/edit?usp=sharing) · [PDF](docs/kvit-widget-factory.pdf)

EMBER2026 community-choice address (CashTokens): `bitcoincash:zpln0flvp7gcx6qncy6rrrtj8eqnzman3syf09q2eq`

> **BCH BLAZE 2026 fork rule.** Code before November 14 is pre-hackathon work: commit [`bec7d02`](https://github.com/ctmakc/kvit/tree/bec7d02f5e2bd85c23240fcf7cd3d06d65a55629) (tag `pre-blaze-1114`), frozen demo at https://pre-blaze.kvit-cash.pages.dev. Work that counts for judging is November 14–22 on branch [`blaze-1114`](https://github.com/ctmakc/kvit/tree/blaze-1114): [diff since the snapshot](https://github.com/ctmakc/kvit/compare/bec7d02...blaze-1114).

---

Freelancers and small shops get paid by sending a link. Kvit gives Bitcoin Cash that same link.

1. **Make a ticket.** Your name, your BCH address (or connect your wallet and Kvit fills it), an amount in USD / CAD / EUR / BCH, or in a CashToken (PUSD on mainnet), what it is for. You get a link and a QR.
2. **Your client opens it** and pays: scan the QR with any BCH wallet (BIP21), or press **Pay with WizardConnect**, scan once, approve one transaction in the wallet.
3. **The ticket punches itself PAID** the moment the transaction reaches the mempool, then shows the block height once it confirms. Anyone holding the link sees the same receipt.

No account, no backend, no custody. The ticket lives entirely inside the link.

## Built during BLAZE (Nov 14–22)

Video of both features on chipnet with a real signing WizardConnect wallet (59 s): https://youtu.be/BDpq3GY_Y74 (script: `video/record_blaze.py`).

- **Token tickets (Nov 14).** A ticket can be priced in any fungible CashToken. Mainnet offers PUSD (ParyonUSD), so the price holds between invoice and payment; chipnet offers KVT, a test token minted for the demo; any other category can be entered by hand. The payer's wallet pays the exact token amount over WizardConnect, Kvit adds token change and BCH change, and the ticket punches PAID when that token output lands. The QR follows the CashTokens payment-URI draft (CHIP-2023-05: token-aware address, `c`, `f`, `s`). Chipnet proof: `68268841d36198aec12a198276f0b63597b2fb6dde1f2b4614a089aec61a0a67` (12.34 KVT).
- **Ticket book (Nov 14).** `#/tickets` keeps every ticket the payee created on this device (browser storage only, no server), rechecks open ones against the chain every minute, punches the stub PAID with the block height, totals paid and open amounts per network and currency, and exports the lot as CSV for bookkeeping. Chipnet proof: a ticket paid while the book was open, tx `ba86c25f29c347a71d7ffb89b645ab63e8128ca076b8a8f9c3d7a5f40d006505`.

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

**Token tickets.** For a token ticket `s` holds the token amount and `x` the satoshis riding on the token output; the last three digits of `x` mark the ticket, so the token price stays round (25.00 PUSD). The watcher matches category, token amount, satoshis and address. Coin selection spends only fungible coins of the ticket's category, never NFTs, and returns token change to the payer.

**Tokens are safe on BCH tickets.** A plain BCH ticket never spends a coin that carries tokens.

## Tested end to end on chipnet

Real WizardConnect relay, real signing wallet, real chipnet transactions:

- `e0d49f5c522db55f653e046c723adeed468327e54f8545e6e58215cb26223f8a` (local build)
- `4a70a865a2229fbe76ec01ff5316d788ae1ebcae31924dbd1ad0e5a801a315be` (production build on kvit-cash.pages.dev)
- `68268841d36198aec12a198276f0b63597b2fb6dde1f2b4614a089aec61a0a67` (token ticket, 12.34 KVT, Nov 14)
- `ea268df2…` (token ticket, 7.50 KVT, Nov 14) and `76c5975a…` (tBCH regression after the builder rewrite)

`app/scripts/mint-token.mjs` mints the KVT test token from the test wallet (chipnet only).

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

- Recurring tickets and a paid/unpaid list for the payee
- One-script shop widget
- Branded pages and accounting export for agencies (paid tier)

## License

MIT. WizardConnect packages are LGPL-3.0-or-later and are used unmodified as npm dependencies.
