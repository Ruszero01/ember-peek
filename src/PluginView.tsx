import { useEffect, useRef } from "react";
import { call, viewUrl } from "./bridge";
import { validateControls, isSessionOwning, ROLES } from "./protocol.mjs";
import { useT } from "./i18n";
import type { Control, Session, Theme, ViewReport } from "./types";

export function PluginView({
  session,
  role,
  visible,
  interactive,
  theme,
  locale,
  settings,
  controls,
  report,
  register,
  registerPeer,
  peer,
  edge,
  shortcut,
  panel,
}: {
  session: Session;
  /** Which surface of the plugin's entry this is: its view, or its floating panel. */
  role: "view" | "panel";
  visible: boolean;
  interactive: boolean;
  theme: Theme;
  /** Interface language, so a plugin can show its own text in the user's language. */
  locale: string;
  /** Current values of the settings this plugin declared, keyed by setting key. */
  settings: Record<string, unknown> | undefined;
  /** Controls the view declared; only a view mount may declare them. */
  controls: Control[];
  report: (id: string, value: Partial<ViewReport>) => void;
  register: (
    id: string,
    send: ((id: string, value?: unknown) => void) | null,
  ) => void;
  /** Register this mount so the same plugin's other mount can reach it. */
  registerPeer: (
    id: string,
    role: string,
    send: ((payload: unknown, from: string) => void) | null,
  ) => void;
  /** Forward one opaque payload to the plugin's other mount; false when it is not up. */
  peer: (to: string, payload: unknown) => boolean;
  edge: (value: string) => void;
  shortcut: (key: string) => void;
  /** Ask the host to show or hide this plugin's floating panel. */
  panel: (open: boolean) => void;
}) {
  const t = useT();
  // When one entry owns both a view and a panel, the panel mount is secondary: it renders
  // and talks to the native process, but the view stays the owner of session state
  // (lifecycle, pending changes, toolbar controls) and of writes to the document.
  const secondary = role === "panel" && session.capabilities.includes("view");
  const instanceId = secondary ? `${session.id}#panel` : session.id;
  const frame = useRef<HTMLIFrameElement>(null);
  const channel = useRef<MessageChannel | null>(null);
  const latest = useRef({
    theme,
    locale,
    visible,
    interactive,
    settings,
    controls,
    report,
    edge,
    shortcut,
    panel,
    peer,
  });
  latest.current = {
    theme,
    locale,
    visible,
    interactive,
    settings,
    controls,
    report,
    edge,
    shortcut,
    panel,
    peer,
  };
  const generation = useRef(0);
  const handshake = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    channel.current?.port1.postMessage({ type: "theme", theme });
  }, [theme]);
  useEffect(() => {
    channel.current?.port1.postMessage({ type: "locale", locale });
  }, [locale]);
  useEffect(() => {
    channel.current?.port1.postMessage({
      type: "settings",
      settings: settings ?? {},
    });
  }, [settings]);
  useEffect(() => {
    channel.current?.port1.postMessage({ type: "visible", visible });
  }, [visible]);
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(handshake.current);
      channel.current?.port1.close();
      channel.current?.port2.close();
      register(instanceId, null);
      // Peers are keyed by the session both mounts belong to, not by the mount.
      registerPeer(session.id, role, null);
    },
    [instanceId, register, registerPeer, role, session.id],
  );

  function connect() {
    const ticket = ++generation.current;
    channel.current?.port1.close();
    const connection = new MessageChannel();
    channel.current = connection;
    clearTimeout(handshake.current);
    handshake.current = setTimeout(
      () =>
        latest.current.report(session.id, {
          error: t("view.disconnected"),
        }),
      10000,
    );
    let requests = 0;
    connection.port1.onmessage = async (event) => {
      if (ticket !== generation.current) return;
      const message = event.data;
      try {
        if (message?.type === "connected") {
          clearTimeout(handshake.current);
          const [data, source] = await Promise.all([
            call("session_data", { id: session.id }),
            call("source_data", { id: session.id }),
          ]);
          if (ticket === generation.current)
            connection.port1.postMessage({
              type: "init",
              data,
              source,
              session: session.id,
              file: { name: session.name, size: session.size },
              theme: latest.current.theme,
              locale: latest.current.locale,
              visible: latest.current.visible,
              settings: latest.current.settings ?? {},
              // Same entry, two surfaces: the plugin renders its view or its panel.
              role,
            });
        } else if (message?.type === "controls") {
          if (secondary)
            throw new Error(t("view.panelNoControls"));
          latest.current.report(instanceId, {
            controls: session.capabilities.includes("controls")
              ? validateControls(message.items, t)
              : [],
          });
        } else if (
          message?.type === "status" &&
          typeof message.text === "string"
        ) {
          if (secondary) throw new Error(t("view.panelNoStatus"));
          latest.current.report(instanceId, {
            status: message.text.slice(0, 300),
          });
        } else if (
          message?.type === "searchStatus" &&
          typeof message.text === "string"
        ) {
          throw new Error(t("view.searchNotHost"));
        } else if (message?.type === "edge" && latest.current.visible)
          latest.current.edge(message.value);
        else if (message?.type === "shortcut" && latest.current.visible)
          latest.current.shortcut(message.key);
        else if (message?.type === "request") {
          if (!Number.isSafeInteger(message.id) || requests >= 8)
            throw new Error(t("view.tooManyRequests"));
          requests++;
          try {
            const params = message.params;
            let value;
            if (secondary && isSessionOwning(message.method))
              throw new Error(t("view.panelNoSession"));
            if (message.method === "viewState") {
              if (secondary)
                throw new Error(t("view.onlyPrimaryNavigates"));
              value = await call("view_state", {
                id: session.id,
                value: params?.value ?? null,
              });
            } else if (message.method === "presented") {
              value = await call("complete_view", {
                id: session.id,
                error:
                  typeof params?.error === "string"
                    ? params.error.slice(0, 500)
                    : null,
              });
            } else if (message.method === "pending") {
              if (typeof params?.pending !== "boolean")
                throw new Error(t("view.invalidPending"));
              value = await call("set_pending", {
                id: session.id,
                pending: params.pending,
                reason:
                  typeof params?.reason === "string"
                    ? params.reason.slice(0, 60)
                    : null,
              });
            } else if (message.method === "fileChanged") {
              value = await call("file_changed", {
                id: session.id,
                returnToSource: params?.returnToSource === true,
              });
            } else if (message.method === "returnView") {
              value = await call("return_view", { id: session.id });
            } else if (
              message.method === "mutate" ||
              message.method === "sourceCall"
            ) {
              if (
                typeof params?.method !== "string" ||
                params.method.length > 100
              )
                throw new Error(t("view.invalidMethod"));
              value = await call(
                message.method === "mutate" ? "plugin_mutate" : "source_call",
                {
                  id: session.id,
                  method: params.method,
                  value: params.value ?? null,
                },
              );
            } else if (message.method === "read") {
              if (
                !Number.isSafeInteger(params?.offset) ||
                params.offset < 0 ||
                !Number.isSafeInteger(params?.length) ||
                params.length < 0 ||
                params.length > 1024 * 1024
              )
                throw new Error(t("view.invalidReadRange"));
              value = await call("read_file", {
                id: session.id,
                offset: params.offset,
                length: params.length,
              });
            } else if (message.method === "peer") {
              // A dumb pipe between this plugin's own mounts. The host forwards the payload
              // without looking inside, so a plugin can build its own features (search,
              // palettes, anything) on top of a view and a panel that cannot see each other.
              if (!ROLES.includes(params?.to))
                throw new Error(t("view.peerTarget"));
              const encoded = JSON.stringify(params.payload ?? null);
              if (typeof encoded !== "string" || encoded.length > 64 * 1024)
                throw new Error(t("view.peerTooLarge"));
              value = latest.current.peer(params.to, params.payload ?? null);
            } else if (message.method === "setting") {
              // A control that flips a declared setting (the text view's wrap toggle).
              // The host owns validation; the view learns the result through settings.
              if (typeof params?.key !== "string")
                throw new Error(t("view.invalidSettingKey"));
              value = await call("set_plugin_setting", {
                id: session.pluginId,
                key: params.key,
                value: params.value ?? null,
              });
            } else if (message.method === "panel") {
              // The panel is the plugin's own surface, so any mount may open or close it.
              latest.current.panel(params?.open === true);
              value = null;
            } else if (message.method === "call") {
              if (
                typeof params?.method !== "string" ||
                params.method.length > 100
              )
                throw new Error(t("view.invalidPluginMethod"));
              value = await call("plugin_call", {
                id: session.id,
                method: params.method,
                value: params.value ?? null,
              });
            } else if (
              message.method === "clipboard" &&
              latest.current.interactive
            ) {
              if (
                typeof params?.text !== "string" ||
                params.text.length > 2 * 1024 * 1024
              )
                throw new Error(t("view.clipboardTooLarge"));
              await call("authorize_clipboard", { id: session.id });
              await navigator.clipboard.writeText(params.text);
              value = null;
            } else throw new Error(t("view.unsupportedCapability"));
            connection.port1.postMessage({
              type: "reply",
              id: message.id,
              value,
            });
          } finally {
            requests--;
          }
        }
      } catch (error) {
        if (message?.type === "request")
          connection.port1.postMessage({
            type: "reply",
            id: message.id,
            error: String(error),
          });
        else latest.current.report(session.id, { error: String(error) });
      }
    };
    connection.port1.start();
    registerPeer(session.id, role, (payload, from) => {
      connection.port1.postMessage({ type: "peer", from, payload });
    });
    register(instanceId, (id, value) => {
      connection.port1.postMessage({ type: "action", id, value });
    });
    frame.current?.contentWindow?.postMessage({ type: "ember:connect" }, "*", [
      connection.port2,
    ]);
  }
  return (
    <iframe
      ref={frame}
      title={`${session.pluginId} · ${session.name}`}
      className={`plugin-view${visible && (session.capabilities.includes("view") || session.capabilities.includes("overlay")) ? " selected" : ""}`}
      sandbox="allow-scripts"
      src={viewUrl(session.id, session.entry)}
      onLoad={connect}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    />
  );
}
