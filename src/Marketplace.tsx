import { useEffect, useState } from "react";
import { Package, Download, RotateCw, Check, LoaderCircle } from "lucide-react";
import { call, desktop } from "./bridge";
import { PluginDetails } from "./PluginDetails";
import { PluginConfirm, type PluginAction } from "./PluginConfirm";
import { pluginIcon } from "./pluginIcons";

type Source =
  | { kind: "local"; location: string }
  | {
      kind: "remote";
      name: string;
      catalog: string;
      urls: string[];
      sha256: string;
      size: number;
    };

type Entry = {
  source: Source;
  id: string;
  name: string;
  version: string;
  extensions: string[];
  icon?: string;
  summary: string;
  publisher: string;
  installedVersion: string | null;
  updateAvailable: boolean;
};

type MarketList = { entries: Entry[]; warnings: string[] };

/** Where an entry comes from, spelled for the details panel and the confirm dialog. */
function sourceLabel(source: Source) {
  return source.kind === "local" ? source.location : source.urls[0];
}

function sourceSize(source: Source) {
  return source.kind === "local"
    ? ""
    : ` · ${(source.size / 1024 / 1024).toFixed(1)} MiB`;
}

export function Marketplace({
  filter,
  onInstalled,
}: {
  filter: string;
  onInstalled: () => Promise<unknown>;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
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
    entry: Entry,
    progress: (label: string) => void,
  ) {
    setBusy(entry.id);
    setError("");
    try {
      progress(
        entry.source.kind === "remote"
          ? "正在下载并校验插件包…"
          : "正在读取并校验本地插件包…",
      );
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
  const anyRemote = entries.some((entry) => entry.source.kind === "remote");
  return (
    <>
      {action && <PluginConfirm action={action} onClose={() => setAction(null)} />}
      <div className="market-source"><Package size={16} /><div><strong>{anyRemote ? "插件市场" : "本地插件市场"}</strong><span>{anyRemote ? "内置插件随应用提供，远程来源的插件下载后校验安装" : "从本地目录获取 · 安装后即可使用"}</span></div><span className="source-badge">{anyRemote ? "本地 + 远程" : "本地源"}</span></div>
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
                        {entry.source.kind === "remote" ? `（${entry.source.name}）` : ""}
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
                : "市场暂无插件，请先运行开发命令构建市场。"}
          </p>
        </div>
      )}
    </>
  );
}
