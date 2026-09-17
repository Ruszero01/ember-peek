import {
  ready,
  controls,
  status,
  clipboard,
  presented,
  configuration,
  onSettings,
  setSetting,
  translate,
  onLocale,
} from "./sdk.js";
import { createTextView } from "./sdk-view.js";
import { synchronizePosition } from "./sdk-navigation.js";
/** The plugin's own wording, in the language the host is showing. */
const say = translate({
  "zh-CN": {
    copy: "复制文本",
    wrap: "自动换行",
    line: "行",
    lines: "行",
    summary: "{encoding} · {lines} {word}",
    truncated: " · 仅显示前 2 MiB",
  },
  en: {
    copy: "Copy text",
    wrap: "Wrap long lines",
    line: "line",
    lines: "lines",
    summary: "{encoding} · {lines} {word}",
    truncated: " · showing the first 2 MiB",
  },
});

/** One line of prose about what is on screen, the way this language counts lines. */
function summary(data, lines) {
  return say("summary", {
    encoding: data.encoding,
    lines,
    word: say(lines === 1 ? "line" : "lines"),
  });
}

const initial = await ready;
const data = initial.source?.data || initial.data;
let navigation;
try {
  const surface = await createTextView({
    parent: document.querySelector("#surface"),
    text: data.text,
    name: initial.file.name,
    highlight: false,
    onPosition: () => navigation?.changed(),
  });
  function settings() {
    surface.configure({
      numbers: configuration().lineNumbers !== false,
      wrap: configuration().wrap !== false,
    });
    controls([
      {
        id: "copy",
        kind: "button",
        label: say("copy"),
        icon: "copy",
        run: () => clipboard(surface.text),
      },
      {
        id: "wrap",
        kind: "toggle",
        label: say("wrap"),
        icon: "text-wrap",
        active: configuration().wrap !== false,
        run: () => setSetting("wrap", configuration().wrap === false),
      },
    ]);
  }
  settings();
  onSettings(settings);
  // The control labels are this plugin's own text, so a language change re-publishes them.
  onLocale(() => {
    settings();
    publishStatus();
  });
  navigation = await synchronizePosition(
    () => surface.position(),
    (position) => surface.reveal(position),
  );
  const publishStatus = () => {
    const lines = surface.view.state.doc.lines;
    status(`${summary(data, lines)}${data.truncated ? say("truncated") : ""}`);
  };
  publishStatus();
  await presented();
} catch (error) {
  await presented(String(error));
}
