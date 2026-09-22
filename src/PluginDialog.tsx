import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import { useT } from "./i18n";
import type { PluginDialogRequest } from "./protocol.mjs";

/** Generic modal chrome. All wording and opaque action ids come from the plugin. */
export function PluginDialog({
  request,
  onResolve,
}: {
  request: PluginDialogRequest;
  onResolve: (result: string | null) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => ref.current?.showModal(), []);
  return createPortal(
    <dialog
      ref={ref}
      className="plugin-confirm plugin-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onResolve(null);
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="confirm-icon"><CircleHelp size={24} /></div>
      <h2 id={title}>{request.title}</h2>
      {request.message && <p>{request.message}</p>}
      {request.detail && <div className="confirm-source">{request.detail}</div>}
      <footer>
        <button className="secondary-button" onClick={() => onResolve(null)}>
          {request.cancelLabel || t("confirm.cancel")}
        </button>
        {request.actions.map((action) => (
          <button
            key={action.id}
            autoFocus={action.primary}
            className={`${action.primary ? "confirm-submit" : "secondary-button"} ${action.tone === "danger" ? "danger" : ""}`}
            onClick={() => onResolve(action.id)}
          >
            {action.label}
          </button>
        ))}
      </footer>
    </dialog>,
    document.body,
  );
}
