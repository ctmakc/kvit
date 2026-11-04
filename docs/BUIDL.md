## Kvit — payment links for Bitcoin Cash

- **Live demo:** https://kvit-cash.pages.dev
- **Video (53 s):** https://youtu.be/iXSKTpkBw7Y
- **Presentation (Widget Factory template):** https://docs.google.com/presentation/d/1PJADVM7GjKn9ahjaYWb9c3Cs67QG2V_ECQD1o81QHUQ/edit?usp=sharing
- **Source (MIT):** https://github.com/ctmakc/kvit
- **EMBER2026 address:** bitcoincash:zpln0flvp7gcx6qncy6rrrtj8eqnzman3syf09q2eq

Prep build made before the hackathon window. On November 14 the repo is forked and the starting snapshot (demo + code) gets linked in the site banner, as the BLAZE rules ask.

### The problem
Freelancers and small shops get paid by sending a link: Stripe, PayPal, Interac. In BCH the same moment means pasting an address, typing an amount and asking "did it arrive?" in chat.

### How it works
1. The payee makes a ticket: name, BCH address (or connect a wallet and Kvit fills it), amount in USD / CAD / EUR / BCH, what it is for.
2. Kvit gives a link and a QR. The whole ticket lives inside the link: no account, no backend.
3. The client opens it and pays: any BCH wallet by QR (BIP21), or **Pay with WizardConnect**: one scan, one approval.
4. The page watches the chain through public Fulcrum servers and punches the ticket **PAID** the moment the transaction lands, then shows the block height.

### Mainnet track checklist
- Any judge can make a useful mainnet BCH transaction: open the demo, press **"Open the 0.0002 BCH tip-jar ticket"** and pay it (about 5 US cents), or make a $0.10 ticket to your own address.
- WizardConnect integration: Kvit derives receive and change addresses from the shared xpubs (gap 20), selects UTXOs (token UTXOs are skipped), builds the transaction with libauth and sends `sign_transaction_request`. Keys stay in the wallet.
- Top-of-page banner with presentation, source code and the EMBER2026 CashTokens address.
- Tested end to end on chipnet with a real signing WizardConnect wallet; production build tx `4a70a865a2229fbe76ec01ff5316d788ae1ebcae31924dbd1ad0e5a801a315be`.

### Key details
- The last three digits of the satoshi amount identify the ticket, so one address can carry many open tickets and a refreshed page still finds its payment.
- Wrong-network address, short balance and broken links get plain-language messages.

### Tech stack
React 18, Vite, TypeScript, @wizardconnect/react + core + dapp, @bitauth/libauth, @electrum-cash/network (Fulcrum WSS), qrcode-generator, Cloudflare Pages.

### Business potential
Agencies, studios and market stalls already invoice by link. Kvit's core stays free; paid tier = branded ticket pages, recurring tickets and accounting export. Next on the roadmap: PUSD stablecoin tickets so the price holds between invoice and payment.
