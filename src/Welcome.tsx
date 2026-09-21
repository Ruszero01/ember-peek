import { useEffect, useState } from "react";
import { Check, LoaderCircle, ArrowRight } from "lucide-react";
import { call, desktop, windowAction } from "./bridge";
import { BrandMark } from "./BrandMark";
import { pluginIcon } from "./pluginIcons";
import { useT } from "./i18n";
import type { MarketEntry, MarketList } from "./types";

/** How many plugins to suggest when a source marks none, rather than listing everything. */
const SUGGESTION_LIMIT = 3;

/**
 * The first run. The app is a shell with no preview of its own, so the only thing worth
 * asking on first launch is which plugins to install, and only the basics are worth
 * suggesting: the full list is one click away in the marketplace. Every choice goes
 * through the same download and install path the marketplace uses; this page only picks
 * the ids.
 */
export function Welcome({ onDone }: { onDone: () => Promise<unknown> }) {
  const t = useT();
  const [entries, setEntries] = useState<MarketEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  /** Whether the source suggested anything at all, which decides how an empty page reads. */
  const [suggestions, setSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!desktop) {
      setLoading(false);
      return;
    }
    let disposed = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const result = await call<MarketList>(attempt ? "market_refresh" : "market_list");
        if (disposed) return;
        const installable = result.entries.filter(
          (entry) => !entry.installedVersion,
        );
        // A source that marks nothing has a few entries picked for it, so a fresh install is
        // not looking at an empty page. A source that does mark them is taken at its word:
        // once its suggestions are installed there is nothing to suggest, and filling the page
        // with whatever else the catalog holds would present unrelated plugins as suggestions.
        const marked = result.entries.some((entry) => entry.recommended);
        const offered = marked
          ? installable.filter((entry) => entry.recommended)
          : installable.slice(0, SUGGESTION_LIMIT);
        setEntries(offered);
        setSelected(new Set(offered.map((entry) => entry.id)));
        setSuggestions(marked);
        setWarnings(result.warnings);
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [attempt]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function install() {
    setBusy(true);
    setError("");
    // One failure must not abandon the rest: each plugin is an independent package, and
    // whatever installed stays installed.
    const failures: string[] = [];
    const chosen = entries.filter((entry) => selected.has(entry.id));
    for (const [index, entry] of chosen.entries()) {
      setProgress(
        t("welcome.installing", {
          name: entry.name,
          index: index + 1,
          total: chosen.length,
        }),
      );
      try {
        await call<string>("market_prepare", { id: entry.id });
        await call("market_install", { id: entry.id });
      } catch (e) {
        failures.push(t("welcome.failure", { name: entry.name, error: String(e) }));
      }
    }
    try {
      await answer();
      await onDone();
      if (failures.length) setError(failures.join(t("list.separator")));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  /** Leaving for the marketplace answers the chooser without installing anything. */
  async function browseMarket() {
    await answer();
    await onDone();
  }

  /** The chooser is answered once, whichever way the user leaves it. */
  async function answer() {
    // Nothing to record outside the desktop window, where the chooser is not reachable
    // anyway.
    if (desktop) await call("complete_onboarding");
  }

  /** Answering with "not now" means exactly that: the window gets out of the way instead of
   *  opening the same marketplace the other button already offers. */
  async function later() {
    await answer();
    if (desktop) await windowAction("close");
    else await onDone();
  }

  return (
    <div className="welcome">
      <div className="welcome-heading">
        <BrandMark size={30} />
        <h1>{t("welcome.title")}</h1>
        <p>{t("welcome.note")}</p>
      </div>
      {loading && (
        <p className="quiet-note">
          <LoaderCircle size={16} className="spinner" /> {t("welcome.loading")}
        </p>
      )}
      {warnings.map((warning, index) => (
        <p className="warning" role="alert" key={`${index}-${warning}`}>
          {warning}
        </p>
      ))}
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      {!loading && (warnings.length > 0 || error || !entries.length) && (
        <button className="text-button" disabled={busy || !desktop} onClick={() => setAttempt((n) => n + 1)}>{t("welcome.retry")}</button>
      )}
      {!loading && !entries.length && !warnings.length && (
        <p className="quiet-note">
          {suggestions ? t("welcome.allInstalled") : t("welcome.none")}
        </p>
      )}
      {entries.length > 0 && (
        <div className="welcome-list">
          {entries.map((entry) => {
            const Icon = pluginIcon(entry.icon);
            const on = selected.has(entry.id);
            return (
              <button
                className={`welcome-item ${on ? "selected" : ""}`}
                key={entry.id}
                onClick={() => toggle(entry.id)}
                aria-pressed={on}
              >
                <span className="welcome-check">{on && <Check size={14} />}</span>
                <span className="plugin-icon">
                  <Icon size={24} />
                </span>
                <h2>
                  {entry.name}
                  <span className="plugin-version">v{entry.version}</span>
                </h2>
                <p>{entry.summary}</p>
              </button>
            );
          })}
        </div>
      )}
      <div className="welcome-actions">
        {/* Install what the source suggests, or go pick from the whole catalog: both lead
            into the app, and the marketplace is one click either way. */}
        {entries.length > 0 && (
          <button
            className="primary-button"
            disabled={busy || !selected.size}
            onClick={() => void install()}
          >
            {busy ? (
              <LoaderCircle size={15} className="spinner" />
            ) : (
              <Check size={15} />
            )}
            {busy ? progress || t("welcome.installingShort") : t("welcome.installSelected", { count: selected.size })}
          </button>
        )}
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void browseMarket()}
        >
          {t("welcome.market")}
          <ArrowRight size={15} />
        </button>
      </div>
      {/* The quiet way out, last: nothing installed, nothing opened. */}
      <button
        className="text-button welcome-later"
        disabled={busy}
        onClick={() => void later()}
      >
        {t("welcome.later")}
      </button>
    </div>
  );
}
