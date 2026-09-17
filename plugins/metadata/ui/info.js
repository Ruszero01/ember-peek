import { ready, controls, status, presented, translate, onLocale } from "./sdk.js";

/** The plugin's own wording, in the language the host is showing. */
const say = translate({
  "zh-CN": {
    name: "名称",
    bytes: "字节数",
    extension: "扩展名",
    readOnly: "只读",
    none: "无",
    yes: "是",
    no: "否",
    hex: "切换字节数进制",
  },
  en: {
    name: "Name",
    bytes: "Bytes",
    extension: "Extension",
    readOnly: "Read-only",
    none: "none",
    yes: "yes",
    no: "no",
    hex: "Switch the byte notation",
  },
});
const { data, file } = await ready;
let hex = false;
function render() {
  const list = document.querySelector("#info");
  list.replaceChildren();
  for (const [name, value] of [
    [say("name"), file.name],
    [say("bytes"), hex ? `0x${data.bytes.toString(16)}` : String(data.bytes)],
    [say("extension"), data.extension || say("none")],
    [say("readOnly"), data.readOnly ? say("yes") : say("no")],
  ]) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = name;
    dd.textContent = value;
    list.append(dt, dd);
  }
  status(`${data.bytes} B`);
}
function publish() {
  controls([
    {
      id: "hex",
      kind: "button",
      label: say("hex"),
      icon: "hash",
      run: () => {
        hex = !hex;
        render();
      },
    },
  ]);
}
publish();
// The panel's labels and its two words are this plugin's own text.
onLocale(() => {
  publish();
  render();
});
render();
await presented();
