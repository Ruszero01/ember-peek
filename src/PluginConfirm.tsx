import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Package, Trash2 } from "lucide-react";
import { useT } from "./i18n";

export type PluginAction = { name: string; detail: string; kind: "install" | "uninstall" | "update"; run: (progress: (label: string) => void) => Promise<unknown> };
/** Message keys per action, so the wording stays in the catalogs rather than in a ternary. */
const ACTION = { install: "confirm.install", update: "confirm.update", uninstall: "confirm.uninstall" } as const;
const WORKING = { install: "confirm.working.install", update: "confirm.working.update", uninstall: "confirm.working.uninstall" } as const;
export function PluginConfirm({ action, onClose }: { action: PluginAction; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const title = useId();
  const label = t(ACTION[action.kind]);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { previous?.focus(); }; }, []);
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setError(""); setProgress(t(WORKING[action.kind]));
    try { await action.run(setProgress); onClose(); }
    catch (e) { setError(String(e)); setProgress(""); lock.current = false; }
  }
  return createPortal(<dialog ref={ref} className="plugin-confirm" aria-labelledby={title} onCancel={e => { e.preventDefault(); if (!lock.current) onClose(); }} onKeyDown={e => e.stopPropagation()}>
    <div className={`confirm-icon ${action.kind === "uninstall" ? "danger" : ""}`}>{action.kind === "uninstall" ? <Trash2 size={24} /> : <Package size={24} />}</div>
    <h2 id={title}>{t("confirm.title", { action: label, name: action.name })}</h2>
    <p>{t(action.kind === "uninstall" ? "confirm.uninstallNote" : "confirm.installNote")}</p>
    <div className="confirm-source">{action.detail}</div>
    {progress && <div className="operation-progress" role="status"><LoaderCircle size={16} className="spinner" />{progress}<div className="indeterminate-track" /></div>}
    {error && <p className="warning" role="alert">{error}</p>}
    <footer><button className="secondary-button" autoFocus disabled={!!progress} onClick={onClose}>{t("confirm.cancel")}</button><button className={`confirm-submit ${action.kind === "uninstall" ? "danger" : ""}`} disabled={!!progress} onClick={() => void confirm()}>{progress ? t("confirm.processing") : error ? t("confirm.retry") : t("confirm.submit", { action: label })}</button></footer>
  </dialog>, document.body);
}
