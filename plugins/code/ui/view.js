import {
  ready,
  controls,
  status,
  clipboard,
  presented,
  configuration,
  onSettings,
  setSetting,
} from "./sdk.js";
import { createTextView } from "./sdk-view.js";
import { synchronizePosition } from "./sdk-navigation.js";
const initial = await ready;
const data = initial.source?.data || initial.data;
let navigation;
try {
  const surface = await createTextView({
    parent: document.querySelector("#surface"),
    text: data.text,
    name: initial.file.name,
    highlight: true,
    onPosition: () => navigation?.changed(),
  });
  function settings() {
    surface.configure({
      numbers: configuration().lineNumbers !== false,
      wrap: configuration().wrap !== false,
      tabSize: configuration().tabSize || 4,
    });
    controls([
      {
        id: "copy",
        kind: "button",
        label: "复制文本",
        icon: "copy",
        run: () => clipboard(surface.text),
      },
      {
        id: "wrap",
        kind: "toggle",
        label: "自动换行",
        icon: "text-wrap",
        active: configuration().wrap !== false,
        run: () => setSetting("wrap", configuration().wrap === false),
      },
    ]);
  }
  settings();
  onSettings(settings);
  navigation = await synchronizePosition(
    () => surface.position(),
    (position) => surface.reveal(position),
  );
  status(
    `${data.encoding} · ${surface.view.state.doc.lines} 行${data.truncated ? " · 仅显示前 2 MiB" : ""}`,
  );
  await presented();
} catch (error) {
  await presented(String(error));
}
