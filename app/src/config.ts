export const REPO_URL = "https://github.com/ctmakc/kvit";
/** BLAZE fork rule: everything up to this commit was made before the Nov 14 start. */
export const SNAPSHOT_COMMIT = "bec7d02";
export const SNAPSHOT_CODE_URL = "https://github.com/ctmakc/kvit/tree/bec7d02f5e2bd85c23240fcf7cd3d06d65a55629";
export const SNAPSHOT_DEMO_URL = "https://pre-blaze.kvit-cash.pages.dev";
export const HACK_DIFF_URL = "https://github.com/ctmakc/kvit/compare/bec7d02...blaze-1114";
export const SLIDES_URL = "https://docs.google.com/presentation/d/1PJADVM7GjKn9ahjaYWb9c3Cs67QG2V_ECQD1o81QHUQ/edit?usp=sharing";
/** CashTokens (token-aware) address for EMBER2026 community-choice donations. */
export const EMBER_ADDRESS = "bitcoincash:zpln0flvp7gcx6qncy6rrrtj8eqnzman3syf09q2eq";
/** Same wallet, plain form: the demo tip jar on mainnet. */
export const TIP_ADDRESS = "bitcoincash:qpln0flvp7gcx6qncy6rrrtj8eqnzman3srrumwvxn";
export const DAPP_NAME = "Kvit";
export const DAPP_ICON = "https://kvit-cash.pages.dev/favicon.svg";
/** Fungible CashTokens offered as ticket currencies. PUSD: ParyonUSD (BLAZE sponsor), category and decimals as published by bchblaze.cash. */
export const TOKEN_PRESETS: Record<"main" | "chip", { c: string; d: number; y: string; label: string }[]> = {
  main: [{ c: "2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544", d: 2, y: "PUSD", label: "PUSD (ParyonUSD)" }],
  chip: [{ c: "9310e72062ad6e01c3fb5b0b8c8c5c3b7012113682fe30b5dbd863b91d5bd379", d: 2, y: "KVT", label: "KVT (Kvit test token)" }],
};
