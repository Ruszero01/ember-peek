import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "./i18n";

const commonExtensions = ["txt", "md", "json", "js", "ts", "png", "jpg", "gif", "webp", "pdf", "csv", "html", "css", "py"];

export function PluginDetails({ extensions, children }: { extensions: string[]; children?: ReactNode }) {
  const t = useT();
  const all = !extensions.length || extensions.some(ext => ext === "*" || ext.toLowerCase() === "all");
  const preview = [
    ...commonExtensions.flatMap(common => extensions.filter(ext => ext.toLowerCase() === common)),
    ...extensions.filter(ext => !commonExtensions.includes(ext.toLowerCase())),
  ].slice(0, 4);
  const supported = t("details.extensionCount", { count: extensions.length });

  return <details className="plugin-disclosure">
    <summary>
      <span className="extensions extension-summary">
        {all ? <span>{t("details.allFiles")}</span> : <>
          {preview.map(ext => <span key={ext}>.{ext}</span>)}
          <span className="extension-count" title={supported} aria-label={supported}>{extensions.length > preview.length ? `…${extensions.length}` : extensions.length}</span>
        </>}
      </span>
      <span className="disclosure-label">{t("details.show")} <ChevronDown size={13} /></span>
    </summary>
    <div className="plugin-expanded">{children}<div className="extensions">{(all ? ["all"] : extensions).map(ext => <span key={ext}>{ext === "all" ? t("details.allFiles") : `.${ext}`}</span>)}</div></div>
  </details>;
}
