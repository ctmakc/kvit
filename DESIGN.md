# Kvit — DESIGN.md (locked 2026-11-04)

Subject: a BCH invoice is a ticket. Freelancers and small shops hand a client a stub; the client pays; the stub gets punched.
Grounding: cash-register tickets, cloakroom stubs, perforated tear lines, the conductor's hole punch.

## Three directions considered
1. **Cloakroom stub (CHOSEN).** Cool graphite desk `#121419`, the invoice itself is a light paper ticket `#ECEEE8` with a perforated tear line and a round stub. Spline Sans (display + UI) + Fragment Mono (every amount, address, txid). One flat BCH green `#0AC18E` used as the "paid" light. Signature: the conductor punch — when the chain sees the payment a hole is punched through the stub and the stub stamps PAID with the block height. Motion: ticket prints in (clip-path top→bottom), QR modules sweep in diagonally, punch = scale+rotate snap.
2. Ledger book: ruled green-black ledger lines, serif numerals, entries stamped by hand. Rejected — too close to existing "ledger/auditor" rows and slow to read on a phone.
3. Vending display: segmented LED amounts on black, amber digits. Rejected — gimmicky, poor legibility of 40-char addresses.

Ledger check: differs from every row on font (Spline Sans/Fragment Mono unused), signature (punched paper stub), motion (print-in + punch). Closest dark rows (thermal receipt `#1C1916` Azeret Mono, stamp red) differ on bg, font, accent, motion.

## Tokens
- `--desk #121419` · `--desk-2 #1A1D23` · `--line #2A2F38` · `--text #E4E7EB` · `--muted #8B919C`
- `--paper #ECEEE8` · `--paper-ink #15181D` · `--paper-muted #5E646E`
- `--go #0AC18E` (BCH green, ≤3 uses per viewport) · `--go-ink #04694C` (green on paper) · `--warn #F2A541`
- Radius: 14px for ticket + controls, round for the punch only. Borders 1px `--line`, no drop shadows except the ticket's single soft lift.
- Motion: `--ease-out: cubic-bezier(.16,1,.3,1)` 280–700ms; reduced-motion = instant.

## Layout
Mobile: single column, ticket first on pay page. Desktop ≥960: 5/7 split — controls left, ticket right, sticky.
