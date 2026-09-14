import { useEffect, useState } from "react";
import { Package, Download, RotateCw, Check, LoaderCircle } from "lucide-react";
import { call, desktop } from "./bridge";
import { PluginDetails } from "./PluginDetails";
import { PluginConfirm, type PluginAction } from "./PluginConfirm";
import { pluginIcon } from "./pluginIcons";

type Entry = {
  source: { kind: "local"; location: string };
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

export function Marketplace({
  filter,
  onInstalled,
}: {
  filter: string;
  onInstalled: () => Promise<unknown>;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [action, setAction] = useState<PluginAction | null>(null);
  async function refresh() {
    const result = await call<Entry[]>("market_list");
    setEntries(result);
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
        const result = await call<Entry[]>("market_list");
        if (!disposed) {
          setEntries(result);
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
  async function install(id: string, progress: (label: string) => void) {
    setBusy(id);
    setError("");
    try {
      progress("正在读取并校验本地插件包…");
      const path = await call<string>("market_prepare", { id });
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
  return (
    <>
      {action && <PluginConfirm action={action} onClose={() => setAction(null)} />}
      <div className="market-source"><Package size={16} /><div><strong>本地插件市场</strong><span>从本地目录获取 · 安装后即可使用</span></div><span className="source-badge">本地源</span></div>
      {(error || loadError) && (
        <p className="warning" role="alert">
          {error || loadError}
        </p>
      )}
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
                      <p className="source-path">来源：{entry.source.location}</p>
                    </PluginDetails>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={
                      !!busy ||
                      (!!entry.installedVersion && !entry.updateAvailable)
                    }
                    onClick={() => setAction({ name: entry.name, kind: entry.updateAvailable ? "update" : "install", detail: `v${entry.version} · ${entry.publisher} · ${entry.source.location}`, run: progress => install(entry.id, progress) })}
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
