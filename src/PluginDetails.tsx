import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

const commonExtensions = ["txt", "md", "json", "js", "ts", "png", "jpg", "gif", "webp", "pdf", "csv", "html", "css", "py"];

export function PluginDetails({ extensions, children }: { extensions: string[]; children?: ReactNode }) {
  const all = !extensions.length || extensions.some(ext => ext === "*" || ext.toLowerCase() === "all");
  const preview = [
    ...commonExtensions.flatMap(common => extensions.filter(ext => ext.toLowerCase() === common)),
    ...extensions.filter(ext => !commonExtensions.includes(ext.toLowerCase())),
  ].slice(0, 4);

  return <details className="plugin-disclosure">
    <summary>
      <span className="extensions extension-summary">
        {all ? <span>所有文件</span> : <>
          {preview.map(ext => <span key={ext}>.{ext}</span>)}
          <span className="extension-count" title={`共支持 ${extensions.length} 种文件类型`} aria-label={`共支持 ${extensions.length} 种文件类型`}>{extensions.length > preview.length ? `…${extensions.length}` : extensions.length}</span>
        </>}
      </span>
      <span className="disclosure-label">查看详情 <ChevronDown size={13} /></span>
    </summary>
    <div className="plugin-expanded">{children}<div className="extensions">{(all ? ["all"] : extensions).map(ext => <span key={ext}>{ext === "all" ? "所有文件" : `.${ext}`}</span>)}</div></div>
  </details>;
}
