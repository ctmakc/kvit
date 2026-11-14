import { useState } from "react";
import { EMBER_ADDRESS, HACK_DIFF_URL, REPO_URL, SLIDES_URL, SNAPSHOT_CODE_URL, SNAPSHOT_COMMIT, SNAPSHOT_DEMO_URL } from "../config";

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
      <span className="banner-new">
        Code before Nov 14 is pre-hackathon:{" "}
        <a href={SNAPSHOT_CODE_URL} target="_blank" rel="noreferrer">commit <span className="mono">{SNAPSHOT_COMMIT}</span></a>
        {" · "}
        <a href={SNAPSHOT_DEMO_URL} target="_blank" rel="noreferrer">snapshot demo</a>
        . Judged work is Nov 14–22:{" "}
        <a href={HACK_DIFF_URL} target="_blank" rel="noreferrer">what changed</a>
      </span>
    </div>
  );
}
