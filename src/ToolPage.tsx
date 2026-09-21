import { useEffect, useRef, useState } from "react";
import { call, viewUrl } from "./bridge";
import type { Plugin, Theme } from "./types";

/** A generic tool surface. Its port is bound to an installed package, never a message ID. */
export function ToolPage({ plugin, theme, locale, settings = false, onOpenSettings }: { plugin: Plugin; theme: Theme; locale: string; settings?: boolean; onOpenSettings?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const connection = useRef<MessageChannel | null>(null);
  const served = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === "ember-tool-ready") connect();
    };
    window.addEventListener("message", ready);
    // A page sends its ready message once per document, so a tool whose revision changed
    // without its entry changing would otherwise be left waiting for a port this effect just
    // closed. Asking again is harmless while the page is still loading and reconnects it when
    // it is already there.
    if (frame.current?.contentWindow) connect();
    return () => window.removeEventListener("message", ready);
  }, [plugin.id, plugin.revision]);
  useEffect(() => { connection.current?.port1.postMessage({event: "context", theme, locale, page: settings ? "settings" : "workshop"}); }, [theme,locale,settings]);
  useEffect(() => {
    if (settings) return;
    // The host sees the drop and owns the path; the page only learns that files arrived,
    // and which way the drag is going so a drop zone can light up while dragging.
    const drop = (event: Event) => connection.current?.port1.postMessage({ event: "drop", paths: (event as CustomEvent<string[]>).detail });
    const drag = (event: Event) => connection.current?.port1.postMessage({ event: "drag", state: (event as CustomEvent<string>).detail });
    window.addEventListener("ember-tool-drop", drop);
    window.addEventListener("ember-tool-drag", drag);
    return () => { window.removeEventListener("ember-tool-drop", drop); window.removeEventListener("ember-tool-drag", drag); };
  }, [plugin.id, plugin.revision, settings]);
  useEffect(() => () => { connection.current?.port1.close(); connection.current?.port2.close(); connection.current = null; }, [plugin.id, plugin.revision]);
  useEffect(() => {
    // The page runs in a sandboxed iframe, so the host cannot see what went wrong inside it —
    // not even whether its scripts ran. What it can see is that no request ever arrived, which
    // is the state a broken package or a stuck handshake leaves behind. Saying it here keeps a
    // page that never works from looking like a page with nothing in it.
    const check = setTimeout(() => {
      if (served.current) return;
      setError("工具页面没有响应：插件可能缺少文件或版本过旧。请在插件市场更新或重新安装这个插件，或重启应用。");
    }, 6000);
    return () => clearTimeout(check);
  }, [plugin.id, plugin.revision]);
  function connect() {
    // Never "already connected": a port handed to the document that is still about:blank is
    // lost with it, and the page that arrives afterwards would wait for one forever. Each call
    // hands over a fresh port instead, and the SDK replaces the one it had.
    if (connection.current) {
      connection.current.port1.close();
      connection.current.port2.close();
      connection.current = null;
    }
    const channel = new MessageChannel(); connection.current = channel;
    let active = 0;
    channel.port1.onmessage = async ({ data }) => {
      if (!Number.isSafeInteger(data?.id) || typeof data?.method !== "string") return;
      served.current = true;
      if (active >= 8) { channel.port1.postMessage({ id: data.id, error: "Too many tool requests" }); return; }
      active++;
      try {
        if (data.method === "openSettings") { onOpenSettings?.(); channel.port1.postMessage({id:data.id,value:null}); return; }
        const value = await call("tool_call", { id: plugin.id, method: data.method, params: data.params ?? {} });
        if (connection.current === channel) channel.port1.postMessage({ id: data.id, value });
      } catch (error) {
        if (connection.current === channel) channel.port1.postMessage({ id: data.id, error: String(error) });
      } finally { active--; }
    };
    frame.current?.contentWindow?.postMessage({ type: "ember-tool-connect", theme, locale, page: settings ? "settings" : "workshop" }, "*", [channel.port2]);
  }
  return <section className="tool-page" data-tool-drop={settings ? "disabled" : "enabled"}>
    {error && <p className="warning" role="alert">{error}</p>}
    <iframe title={plugin.name} ref={frame} sandbox="allow-scripts" src={`${viewUrl(`@tool-${plugin.id}`, plugin.entry)}${settings ? '?page=settings' : ''}`} onLoad={() => connect()} onError={() => setError("Unable to load tool / 工具页面加载失败")} />
  </section>;
}
