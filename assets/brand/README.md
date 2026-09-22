# 品牌资产

保留 Ember Peek 原有图标和颜色。`mark.svg` 用于界面，`src-tauri/icons/icon.ico` 用于 Windows 应用图标。

## 两个矢量源

- **`mark.svg`** —— 界面里的标志，由 `src/BrandMark.tsx` 把它的内层内容注入到一个 `<svg>` 里渲染。
  图形画在 64 格上但不在格心（尾焰往左伸得比身体往右远，偏左 5.331 单位），文件里那层
  `translate` 把它挪回格心，因此外部按正方形居中就等于视觉居中。
- **`icon.svg`** —— 应用图标的矢量母版：奶白圆盘加砖红火焰，火焰缩放 0.8 后按自身中心对齐圆心。

标志里瞳孔与眼里的高光合成为**一条 `evenodd` 路径**，高光是真正的镂空，取背后的颜色。
这样它在浅色与深色界面上都成立，不需要为两种主题各出一个版本。

## 重新生成栅格图标

`icon-16.png`、`icon-32.png`、`icon-256.png` 与 `icon.ico` 是 `icon.svg` 的产物；仓库里没有构建脚本，
改完矢量源后按下面三步重做。`src-tauri/tauri.conf.json` 的 `bundle.icon` 指向 `icons/icon.ico`，
因此最后要同步一份过去。

1. 用项目自带的 Tauri CLI 渲染一张 512 母图（它按 viewBox 1:1 输出，不加边距）：

   ```bash
   npx tauri icon assets/brand/icon.svg --output /tmp/ep-icons
   ```

2. 从母图下采样出三个尺寸。大图缩比直接按 16px 渲染更清晰：

   ```bash
   python -c "
   from PIL import Image
   src = Image.open('/tmp/ep-icons/icon.png').convert('RGBA')
   for size in (16, 32, 256):
       src.resize((size, size), Image.LANCZOS).save(f'assets/brand/icon-{size}.png', 'PNG', optimize=True)
   "
   ```

3. 把三张 PNG 原样打进 ICO（PNG 压缩型条目，Windows Vista 起支持），再复制到 `src-tauri/icons/`：

   ```bash
   node -e '
   const fs = require("fs");
   const sizes = [256, 32, 16];
   const pngs = sizes.map((s) => fs.readFileSync(`assets/brand/icon-${s}.png`));
   const header = Buffer.alloc(6);
   header.writeUInt16LE(1, 2);
   header.writeUInt16LE(sizes.length, 4);
   const dir = Buffer.alloc(16 * sizes.length);
   let offset = 6 + dir.length;
   sizes.forEach((size, i) => {
     const o = i * 16;
     dir[o] = dir[o + 1] = size === 256 ? 0 : size;
     dir.writeUInt16LE(1, o + 4);
     dir.writeUInt16LE(32, o + 6);
     dir.writeUInt32LE(pngs[i].length, o + 8);
     dir.writeUInt32LE(offset, o + 12);
     offset += pngs[i].length;
   });
   fs.writeFileSync("assets/brand/icon.ico", Buffer.concat([header, dir, ...pngs]));
   fs.copyFileSync("assets/brand/icon.ico", "src-tauri/icons/icon.ico");
   '
   ```

## 改完怎么核对

火焰在画面里居不居中可以直接量：取所有砖红像素的包围盒中心，和画布中心比较。正确结果是偏差
不超过半像素（包围盒取整带来的误差），而不是之前 256px 下的 −7 像素。
