import { useState } from "react";
import { call } from "./bridge";
import { t } from "./i18n";
import { APP_VERSION } from "./version";

type Update = { version: string; available: boolean; url: string; source: string };

export function AboutUpdates() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Update | null>(null);
  const [error, setError] = useState(false);
  async function check() {
    setBusy(true);
    setError(false);
    setResult(null);
    try { setResult(await call<Update>("check_update")); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div className="about-updates">
    <div className="about-update-row">
    <span>{t("about.currentVersion", { version: APP_VERSION })}</span>
    <div className="about-update-actions">
      <button className="secondary-button" disabled={busy} onClick={check}>{t(busy ? "about.updateChecking" : "about.checkUpdate")}</button>
      {result?.available && <button className="primary-button" onClick={async () => {
        try { await call("open_update", { url: result.url }); } catch { setError(true); }
      }}>{t("about.downloadUpdate", { version: result.version })}</button>}
    </div>
    </div>
    {(error || result) && <p role="status" aria-live="polite">{error ? t("about.updateFailed") : t(result!.available ? "about.updateAvailable" : "about.upToDate", { version: result!.version })}</p>}
  </div>;
}
