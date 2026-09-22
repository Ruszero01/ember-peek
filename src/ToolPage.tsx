import { useEffect, useRef, useState } from "react";
import { call, viewUrl } from "./bridge";
import type { Plugin, Theme } from "./types";

/** A generic tool surface. Its port is bound to an installed package, never a message ID. */
export function ToolPage({ plugin, theme, locale, settings = false, onOpenSettings }: { plugin: Plugin; theme: Theme; locale: string; settings?: boolean; onOpenSettings?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const connection = useRef<{ channel: MessageChannel; documentId: string; attempt: number } | null>(null);
  const served = useRef(false);
  const context = useRef({ theme, locale, settings, onOpenSettings });
  context.current = { theme, locale, settings, onOpenSettings };
  const [error, setError] = useState("");
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "ember-tool-ready") return;
      connect(
        typeof event.data.documentId === "string" ? event.data.documentId : "legacy",
        Number.isSafeInteger(event.data.attempt) ? event.data.attempt : 0,
      );
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [plugin.id, plugin.revision]);
  useEffect(() => { connection.current?.channel.port1.postMessage({event: "context", theme, locale, page: settings ? "settings" : "workshop"}); }, [theme,locale,settings]);
  useEffect(() => {
    if (settings) return;
    // The host sees the drop and owns the path; the page only learns that files arrived,
    // and which way the drag is going so a drop zone can light up while dragging.
    const drop = (event: Event) => connection.current?.channel.port1.postMessage({ event: "drop", paths: (event as CustomEvent<string[]>).detail });
    const drag = (event: Event) => connection.current?.channel.port1.postMessage({ event: "drag", state: (event as CustomEvent<string>).detail });
    window.addEventListener("ember-tool-drop", drop);
    window.addEventListener("ember-tool-drag", drag);
    return () => { window.removeEventListener("ember-tool-drop", drop); window.removeEventListener("ember-tool-drag", drag); };
  }, [plugin.id, plugin.revision, settings]);
  useEffect(() => () => {
    connection.current?.channel.port1.postMessage({ event: "disconnect", error: "Tool page closed" });
    connection.current?.channel.port1.close(); connection.current?.channel.port2.close(); connection.current = null;
  }, [plugin.id, plugin.revision]);
  useEffect(() => {
    // The page runs in a sandboxed iframe, so the host cannot see what went wrong inside it —
    // not even whether its scripts ran. What it can see is that no request ever arrived, which
    // is the state a broken package or a stuck handshake leaves behind. Saying it here keeps a
    // page that never works from looking like a page with nothing in it.
    served.current = false;
    setError("");
    const check = setTimeout(() => {
      if (served.current) return;
      setError("工具页面没有响应：插件可能缺少文件或版本过旧。请在插件市场更新或重新安装这个插件，或重启应用。");
    }, 6000);
    return () => clearTimeout(check);
  }, [plugin.id, plugin.revision]);
  function connect(documentId: string, attempt: number) {
    // A ready announcement is retried until it is answered. It is not a request to rotate a
    // healthy channel: doing that can strand a request on the just-closed MessagePort. Only a
    // new iframe document or a newer recovery attempt replaces the connection.
    if (connection.current?.documentId === documentId && connection.current.attempt >= attempt) {
      const latest = context.current;
      connection.current.channel.port1.postMessage({event: "context", theme: latest.theme, locale: latest.locale, page: latest.settings ? "settings" : "workshop"});
      return;
    }
    if (connection.current) {
      connection.current.channel.port1.postMessage({ event: "disconnect", error: "Tool page reconnected" });
      connection.current.channel.port1.close();
      connection.current.channel.port2.close();
    }
    const channel = new MessageChannel(); connection.current = { channel, documentId, attempt };
    let active = 0;
    channel.port1.onmessage = async ({ data }) => {
      if (!Number.isSafeInteger(data?.id) || typeof data?.method !== "string") return;
      served.current = true;
      setError("");
      if (active >= 8) { channel.port1.postMessage({ id: data.id, error: "Too many tool requests" }); return; }
      active++;
      try {
        if (data.method === "openSettings") { context.current.onOpenSettings?.(); channel.port1.postMessage({id:data.id,value:null}); return; }
        const value = await call("tool_call", { id: plugin.id, method: data.method, params: data.params ?? {} });
        if (connection.current?.channel === channel) channel.port1.postMessage({ id: data.id, value });
      } catch (error) {
        if (connection.current?.channel === channel) channel.port1.postMessage({ id: data.id, error: String(error) });
      } finally { active--; }
    };
    const latest = context.current;
    frame.current?.contentWindow?.postMessage({ type: "ember-tool-connect", documentId, attempt, theme: latest.theme, locale: latest.locale, page: latest.settings ? "settings" : "workshop" }, "*", [channel.port2]);
  }
  return <section className="tool-page" data-tool-drop={settings ? "disabled" : "enabled"}>
    {error && <p className="warning" role="alert">{error}</p>}
    <iframe title={plugin.name} ref={frame} sandbox="allow-scripts" src={`${viewUrl(`@tool-${plugin.id}`, plugin.entry)}${settings ? '?page=settings' : ''}`} onError={() => setError("Unable to load tool / 工具页面加载失败")} />
  </section>;
}
