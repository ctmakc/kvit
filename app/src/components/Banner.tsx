import { useState } from "react";
import { EMBER_ADDRESS, REPO_URL, SLIDES_URL } from "../config";

export function Banner() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="banner" role="note">
      <span className="banner-tag">BCH BLAZE 2026</span>
      <a href={SLIDES_URL} target="_blank" rel="noreferrer">Presentation</a>
      <a href={REPO_URL} target="_blank" rel="noreferrer">Source code</a>
      <button
        type="button"
        className="banner-ember"
        title={EMBER_ADDRESS}
        onClick={() => {
          navigator.clipboard?.writeText(EMBER_ADDRESS).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        EMBER2026 votes: <span className="mono">{EMBER_ADDRESS.slice(12, 18)}…{EMBER_ADDRESS.slice(-5)}</span>
        <em>{copied ? "copied" : "copy"}</em>
      </button>
      <span className="banner-new">Built new during the hackathon (Nov 2026), no prior version.</span>
    </div>
  );
}
