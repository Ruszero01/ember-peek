import { useEffect, useState } from "react";
import { Package, Check, LoaderCircle, ArrowRight } from "lucide-react";
import { call, desktop } from "./bridge";
import { BrandMark } from "./BrandMark";
import { pluginIcon } from "./pluginIcons";
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
  const [entries, setEntries] = useState<MarketEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktop) {
      setLoading(false);
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const result = await call<MarketList>("market_list");
        if (disposed) return;
        const installable = result.entries.filter(
          (entry) => !entry.installedVersion,
        );
        const suggested = installable.filter((entry) => entry.recommended);
        const offered = suggested.length
          ? suggested
          : installable.slice(0, SUGGESTION_LIMIT);
        setEntries(offered);
        setSelected(new Set(offered.map((entry) => entry.id)));
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
  }, []);

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
      setProgress(`正在安装 ${entry.name}（${index + 1}/${chosen.length}）…`);
      try {
        const path = await call<string>("market_prepare", { id: entry.id });
        await call("install_plugin", { path });
      } catch (e) {
        failures.push(`${entry.name}：${e}`);
      }
    }
    try {
      await finish();
      if (failures.length) setError(failures.join("；"));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function finish() {
    // Nothing to record outside the desktop window, where the chooser is not reachable
    // anyway.
    if (desktop) await call("complete_onboarding");
    await onDone();
  }

  return (
    <div className="welcome">
      <div className="welcome-heading">
        <BrandMark size={30} />
        <h1>欢迎使用 Ember Peek</h1>
        <p>选择要安装的插件，装好后即可预览对应文件；之后随时可以在“插件市场”里增减。</p>
      </div>
      {loading && (
        <p className="quiet-note">
          <LoaderCircle size={16} className="spinner" /> 正在获取插件列表…
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
      {!loading && !entries.length && !warnings.length && (
        <div className="card empty-plugins">
          <Package size={28} />
          <p>暂时没有可安装的插件，稍后可以在“插件市场”里再看看。</p>
        </div>
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
          {busy ? progress || "正在安装…" : `安装所选（${selected.size}）`}
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void finish()}
        >
          稍后再说
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
