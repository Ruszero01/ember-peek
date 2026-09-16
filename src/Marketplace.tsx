import { useEffect, useState } from "react";
import { Package, Download, RotateCw, Check, LoaderCircle } from "lucide-react";
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

export function Marketplace({
  filter,
  onInstalled,
}: {
  filter: string;
  onInstalled: () => Promise<unknown>;
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
          entries: visible.filter((entry) => !entry.installedVersion),
        },
        {
          title: "已安装",
          entries: visible.filter((entry) => !!entry.installedVersion),
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
            </h2>
            {group.entries.map((entry) => {
              const Icon = pluginIcon(entry.icon);
              return (
                <section className="market-card" key={entry.id}>
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
                      <p>{entry.publisher} · {entry.id}{entry.installedVersion ? ` · 已安装 v${entry.installedVersion}` : ""}</p>
                      <p className="source-path">
                        来源：{sourceLabel(entry.source)}{sourceSize(entry.source)}
                      </p>
                    </PluginDetails>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={
                      !!busy ||
                      (!!entry.installedVersion && !entry.updateAvailable)
                    }
                    onClick={() => setAction({ name: entry.name, kind: entry.updateAvailable ? "update" : "install", detail: `v${entry.version} · ${entry.publisher} · ${sourceLabel(entry.source)}`, run: progress => install(entry, progress) })}
                  >
                    {busy === entry.id ? (
                      <LoaderCircle size={14} className="spinner" />
                    ) : entry.updateAvailable ? (
                      <RotateCw size={14} />
                    ) : entry.installedVersion ? (
                      <Check size={14} />
                    ) : (
                      <Download size={14} />
                    )}
                    {busy === entry.id
                      ? "安装中…"
                      : entry.updateAvailable
                        ? "更新"
                        : entry.installedVersion
                          ? "已安装"
                          : "安装"}
                  </button>
                </section>
              );
            })}
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
