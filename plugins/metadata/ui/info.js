import { ready, controls, status, presented } from "./sdk.js";
const { data, file } = await ready;
let hex = false;
function render() {
  const list = document.querySelector("#info");
  list.replaceChildren();
  for (const [name, value] of [
    ["名称", file.name],
    ["字节数", hex ? `0x${data.bytes.toString(16)}` : String(data.bytes)],
    ["扩展名", data.extension || "无"],
    ["只读", data.readOnly ? "是" : "否"],
  ]) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = name;
    dd.textContent = value;
    list.append(dt, dd);
  }
  status(`${data.bytes} B`);
}
controls([
  {
    id: "hex",
    kind: "button",
    label: "切换字节数进制",
    icon: "hash",
    run: () => {
      hex = !hex;
      render();
    },
  },
]);
render();
await presented();
