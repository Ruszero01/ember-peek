import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Package, Trash2 } from "lucide-react";

export type PluginAction = { name: string; detail: string; kind: "install" | "uninstall" | "update"; run: (progress: (label: string) => void) => Promise<unknown> };
export function PluginConfirm({ action, onClose }: { action: PluginAction; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const title = useId();
  const label = action.kind === "uninstall" ? "卸载" : action.kind === "update" ? "更新" : "安装";
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { previous?.focus(); }; }, []);
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setError(""); setProgress(`正在${label}…`);
    try { await action.run(setProgress); onClose(); }
    catch (e) { setError(String(e)); setProgress(""); lock.current = false; }
  }
  return createPortal(<dialog ref={ref} className="plugin-confirm" aria-labelledby={title} onCancel={e => { e.preventDefault(); if (!lock.current) onClose(); }} onKeyDown={e => e.stopPropagation()}>
    <div className={`confirm-icon ${action.kind === "uninstall" ? "danger" : ""}`}>{action.kind === "uninstall" ? <Trash2 size={24} /> : <Package size={24} />}</div>
    <h2 id={title}>{label}{action.name}？</h2>
    <p>{action.kind === "uninstall" ? "卸载后将无法使用此插件的预览能力，可随时从市场重新安装。" : "确认后将校验插件包并安装到本机。插件可执行本机程序，请确认来源可信。"}</p>
    <div className="confirm-source">{action.detail}</div>
    {progress && <div className="operation-progress" role="status"><LoaderCircle size={16} className="spinner" />{progress}<div className="indeterminate-track" /></div>}
    {error && <p className="warning" role="alert">{error}</p>}
    <footer><button className="secondary-button" autoFocus disabled={!!progress} onClick={onClose}>取消</button><button className={`confirm-submit ${action.kind === "uninstall" ? "danger" : ""}`} disabled={!!progress} onClick={() => void confirm()}>{progress ? "处理中…" : error ? "重试" : `确认${label}`}</button></footer>
  </dialog>, document.body);
}
