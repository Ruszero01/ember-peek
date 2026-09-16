import { useEffect, useState } from "react";
import { Package, Download, RotateCw, LoaderCircle } from "lucide-react";
import { call, desktop } from "./bridge";
import { PluginDetails } from "./PluginDetails";
import { PluginConfirm, type PluginAction } from "./PluginConfirm";
import { pluginIcon } from "./pluginIcons";
import type { MarketEntry, MarketList, MarketSource } from "./types";

/** Where an entry comes from, spelled for the details panel and the confirm dialog. */
function sourceLabel(source: MarketSource) {
  return `${source.name} · ${source.urls[0]}`;
}

function sourceSize(source: MarketSource) {
  return ` · ${(source.size / 1024 / 1024).toFixed(1)} MiB`;
}

/** One installed plugin as a chip.
 *
 *  The market is for finding plugins; reading, reordering and removing installed ones
 *  happens in the plugin manager, which lists them in full. So this keeps identity and the
 *  single action that belongs here — an update that is actually waiting — and leaves
 *  publisher, source and file types out of the way. */
function InstalledChip({
  entry,
  busy,
  onUpdate,
}: {
  entry: MarketEntry;
  busy: boolean;
  onUpdate: () => void;
}) {
  const Icon = pluginIcon(entry.icon);
  return (
    <div
      className={`installed-chip${entry.updateAvailable ? " has-update" : ""}`}
      title={`${entry.publisher} · ${entry.id}`}
    >
      <span className="plugin-icon">
        <Icon size={16} />
      </span>
      <span className="installed-chip-text">
        <strong>{entry.name}</strong>
        {/* The version stays short so a real plugin name is never the part that gets
            truncated; what the update moves away from is in the button's tooltip, and the
            confirm dialog repeats it before anything is installed. */}
        <span>v{entry.version}</span>
      </span>
      {entry.updateAvailable && (
        <button
          className="chip-update"
          disabled={busy}
          title={`从 v${entry.installedVersion} 更新到 v${entry.version}`}
          onClick={onUpdate}
        >
          {busy ? (
            <LoaderCircle size={12} className="spinner" />
          ) : (
            <RotateCw size={12} />
          )}
          更新
        </button>
      )}
    </div>
  );
}

/** One plugin the source offers, as a full card: this is what the page is for, and the
 *  summary, file types and origin are what a decision to install rests on. */
function AvailableCard({
  entry,
  busy,
  onInstall,
}: {
  entry: MarketEntry;
  busy: boolean;
  onInstall: () => void;
}) {
  const Icon = pluginIcon(entry.icon);
  return (
    <section className="market-card">
      <span className="plugin-icon">
        <Icon size={23} />
      </span>
      <div className="plugin-detail">
        <h2>
          {entry.name}
          <span className="plugin-version">v{entry.version}</span>
        </h2>
        <p>{entry.summary}</p>
        <PluginDetails extensions={entry.extensions}>
          <p>{entry.publisher} · {entry.id}</p>
          <p className="source-path">
            来源：{sourceLabel(entry.source)}{sourceSize(entry.source)}
          </p>
        </PluginDetails>
      </div>
      <button className="secondary-button" disabled={busy} onClick={onInstall}>
        {busy ? (
          <LoaderCircle size={14} className="spinner" />
        ) : (
          <Download size={14} />
        )}
        {busy ? "安装中…" : "安装"}
      </button>
    </section>
  );
}

export function Marketplace({
  filter,
  onInstalled,
  onManage,
}: {
  filter: string;
  onInstalled: () => Promise<unknown>;
  onManage?: () => void;
}) {
  const [entries, setEntries] = useState<MarketEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [action, setAction] = useState<PluginAction | null>(null);
  async function refresh() {
    const result = await call<MarketList>("market_list");
    setEntries(result.entries);
    setWarnings(result.warnings);
    setError("");
  }
  useEffect(() => {
    if (!desktop) {
      setLoading(false);
      return;
    }
    let disposed = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await call<MarketList>("market_list");
        if (!disposed) {
          setEntries(result.entries);
          setWarnings(result.warnings);
          setLoadError("");
        }
      } catch (error) {
        if (!disposed) setLoadError(String(error));
      } finally {
        if (!disposed) {
          setLoading(false);
          timer = setTimeout(poll, 2000);
        }
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);
  async function install(
    entry: MarketEntry,
    progress: (label: string) => void,
  ) {
    setBusy(entry.id);
    setError("");
    try {
      progress("正在下载并校验插件包…");
      const path = await call<string>("market_prepare", { id: entry.id });
      progress("正在安装插件…");
      await call("install_plugin", { path });
      progress("正在刷新插件列表…");
      await onInstalled();
      await refresh();
    } catch (error) {
      throw error;
    } finally {
      setBusy("");
    }
  }
  const visible = entries.filter((entry) =>
    `${entry.name} ${entry.summary} ${entry.extensions.join(" ")}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  // Every plugin comes from a source; naming the one in use is more useful than saying
  // that it is remote.
  const sourceNames = [...new Set(entries.map((entry) => entry.source.name))];
  return (
    <>
      {action && <PluginConfirm action={action} onClose={() => setAction(null)} />}
      <div className="market-source"><Package size={16} /><strong>插件市场</strong><span className="source-badge">{sourceNames.length === 1 ? sourceNames[0] : `${sourceNames.length} 个来源`}</span></div>
      {(error || loadError) && (
        <p className="warning" role="alert">
          {error || loadError}
        </p>
      )}
      {/* A source that could not be read is reported here: a market quietly missing
          the entries it was configured with is worse than a visible warning. */}
      {warnings.map((warning, index) => (
        <p className="warning" role="alert" key={`${index}-${warning}`}>
          {warning}
        </p>
      ))}
      {loading && (
        <p className="quiet-note">
          <LoaderCircle size={16} className="spinner" /> 正在读取市场…
        </p>
      )}
      {[
        {
          title: "未安装",
          installed: false,
          entries: visible.filter((entry) => !entry.installedVersion),
        },
        {
          title: "已安装",
          installed: true,
          // An update is the only thing in this group that asks for action, so those chips
          // come first and the rest keep the catalog's order. Nothing sits behind a fold:
          // with dozens of plugins installed, the ones needing attention would be exactly
          // the ones a fold could hide.
          entries: visible
            .filter((entry) => !!entry.installedVersion)
            .sort(
              (a, b) =>
                (b.updateAvailable ? 1 : 0) - (a.updateAvailable ? 1 : 0),
            ),
        },
      ]
        .filter((group) => group.entries.length > 0)
        .map((group) => (
          <section
            className="market-group"
            key={group.title}
            aria-label={group.title}
          >
            <h2 className="market-group-title">
              {group.title}
              <span>{group.entries.length}</span>
              {group.installed && onManage && (
                <button className="text-button group-manage" onClick={onManage}>
                  在插件管理中启用或卸载
                </button>
              )}
            </h2>
            {group.installed ? (
              <div className="installed-chips">
                {group.entries.map((entry) => (
                  <InstalledChip
                    key={entry.id}
                    entry={entry}
                    busy={busy === entry.id}
                    onUpdate={() =>
                      setAction({
                        name: entry.name,
                        kind: "update",
                        detail: `v${entry.version} · ${entry.publisher} · ${sourceLabel(entry.source)}`,
                        run: (progress) => install(entry, progress),
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              group.entries.map((entry) => (
                <AvailableCard
                  key={entry.id}
                  entry={entry}
                  busy={busy === entry.id}
                  onInstall={() =>
                    setAction({
                      name: entry.name,
                      kind: "install",
                      detail: `v${entry.version} · ${entry.publisher} · ${sourceLabel(entry.source)}`,
                      run: (progress) => install(entry, progress),
                    })
                  }
                />
              ))
            )}
          </section>
        ))}
      {!loading && !error && !loadError && !visible.length && (
        <div className="card empty-plugins">
          <Package size={28} />
          <p>
            {!desktop
              ? "请在桌面窗口中浏览和安装插件"
              : filter
                ? "没有匹配的插件"
                : "暂时没有可安装的插件，请稍后重试。"}
          </p>
        </div>
      )}
    </>
  );
}
