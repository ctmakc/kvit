import { useEffect, useState } from "react";
import { Banner } from "./components/Banner";
import { WalletChip, WalletProvider } from "./components/WalletProvider";
import { Create } from "./pages/Create";
import { Pay } from "./pages/Pay";

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const on = () => {
      setH(location.hash);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return h;
}

export function App() {
  const h = useHash();
  const pay = h.match(/^#\/pay\/([A-Za-z0-9_-]+)/);
  return (
    <WalletProvider>
      <Banner />
      <header className="top">
        <a className="mark" href="#/" aria-label="Kvit home">
          <svg viewBox="0 0 40 24" aria-hidden="true">
            <path d="M2 2h36v20H2z" className="mk-paper" />
            <circle cx="2" cy="12" r="4" className="mk-desk" />
            <circle cx="38" cy="12" r="4" className="mk-desk" />
            <path d="M27 2v20" className="mk-perf" />
            <circle cx="33" cy="12" r="2.6" className="mk-go" />
          </svg>
          <span>Kvit</span>
        </a>
        <WalletChip />
      </header>
      {pay ? <Pay key={pay[1]} token={pay[1]} /> : <Create />}
      <footer className="foot">
        <div className="foot-how">
          <p>
            <b>How it works.</b> The ticket lives entirely in the link: payee address, exact amount, note. Kvit reads the
            chain through public Fulcrum servers, builds the transaction in your browser and asks your wallet to sign it
            over WizardConnect. Keys never leave the wallet.
          </p>
        </div>
        <div className="foot-row">
          <span className="mono">Kvit · open source · MIT</span>
          <a className="mmix" href="https://mmix.ua/" target="_blank" rel="noopener">
            Development &amp; promotion — <img src="/mmix-logo.png" alt="MMIX — Marketing Mix" width="36" height="35" />
          </a>
        </div>
      </footer>
    </WalletProvider>
  );
}
