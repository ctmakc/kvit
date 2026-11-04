import { createContext, useContext, type ReactNode } from "react";
import { useWizardConnect, WizardConnectQRDialog, type UseWizardConnectResult } from "@wizardconnect/react";
import { DAPP_ICON, DAPP_NAME } from "../config";

const Ctx = createContext<UseWizardConnectResult | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wc = useWizardConnect({ dappName: DAPP_NAME, dappIcon: DAPP_ICON });
  return (
    <Ctx.Provider value={wc}>
      {children}
      {wc.uri && wc.qrUri && (
        <WizardConnectQRDialog
          show={wc.state === "connecting"}
          onClose={() => void wc.disconnect()}
          uri={wc.uri}
          qrUri={wc.qrUri}
          title="Connect a BCH wallet"
          subtitle="Scan with a WizardConnect wallet, or copy the link into it"
          theme={{
            backdropColor: "rgba(10,11,14,.72)",
            dialogBackground: "#1A1D23",
            headerBackground: "#1A1D23",
            titleColor: "#E4E7EB",
            subtitleColor: "#8B919C",
            qrForeground: "#15181D",
            qrBackground: "#ECEEE8",
            uriRowBackground: "#121419",
            uriTextColor: "#8B919C",
            borderColor: "#2A2F38",
            closeButtonColor: "#8B919C",
            copyButtonColor: "#0AC18E",
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function useWallet(): UseWizardConnectResult {
  const v = useContext(Ctx);
  if (!v) throw new Error("WalletProvider missing");
  return v;
}

export function WalletChip() {
  const wc = useWallet();
  if (wc.state === "connected" || wc.state === "reconnecting")
    return (
      <button type="button" className="chip chip-on" onClick={() => void wc.disconnect()} title="Disconnect wallet">
        <i aria-hidden="true" /> {wc.walletName ?? "Wallet"} <span>· disconnect</span>
      </button>
    );
  return (
    <button type="button" className="chip" onClick={() => wc.connect()}>
      Connect wallet
    </button>
  );
}
