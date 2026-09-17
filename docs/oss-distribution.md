# 官方插件发布：GitHub 源码 + OSS 分发

0.1.0 保留同仓库插件源码、SDK 和共享库。OSS 只提供静态目录与插件 ZIP，不部署 API 服务。当前只发布 `stable / api-1 / windows-x86_64`。

## 需要准备的配置

| 配置 | 示例 | 放置位置 |
| --- | --- | --- |
| `OSS_REGION` | `oss-cn-hongkong` | GitHub Environment Variables / 本机 `.env` |
| `OSS_BUCKET` | 实际 Bucket 名 | 同上 |
| `OSS_PREFIX` | `ember-peek`（默认） | 同上 |
| `OSS_PUBLIC_BASE_URL` | `https://<bucket>.oss-cn-hongkong.aliyuncs.com/ember-peek` | 同上；这是含前缀的公开 HTTPS 地址 |
| `OSS_ACCESS_KEY_ID` | 发布专用 RAM 身份的 AccessKey ID | GitHub Environment Secrets / 本机 `.env` |
| `OSS_ACCESS_KEY_SECRET` | 对应 Secret | 同上，不能写入仓库或客户端 |
| `OSS_STS_TOKEN` | 可选，使用临时凭据时填写 | 同上；ID、Secret、Token 必须属于同一组凭据 |

示例 Region 不代表必须选香港，按已有资源和用户访问位置选择。初期可以直接用 OSS 公网域名，不要求自有域名、CDN、数据库或服务器。自有域名必须配置有效 HTTPS，公开地址的路径必须与 `OSS_PREFIX` 一致，当前不支持 CDN 路径重写或限时签名 URL。

建议使用**独立、标准存储、从未开启过版本控制**的分发 Bucket。当前脚本拒绝版本控制为 Enabled 或 Suspended 的桶：OSS 对这两种桶会忽略 `x-oss-forbid-overwrite`，无法保证发布锁和版本记录不被覆盖。目录回退由 `catalog-history/` 实现，不依赖 Bucket 版本控制。已有业务桶开启过版本控制时，新建专用分发桶即可，不要为发布修改业务桶的设置。

Bucket 保持私有，仅用 Bucket Policy 允许匿名 `GetObject` 访问以下两类对象：

```text
ember-peek/channels/*
ember-peek/packages/*
```

`registry/`、`catalog-history/` 和 `publish.lock` 不需要匿名访问；不开放匿名写入或列举 Bucket。请检查 Bucket/账号层的“阻止公共访问”是否拦截上述读取策略。本工具不会修改 Bucket ACL、公共访问设置、生命周期或账户策略。

宿主用 Rust HTTP 客户端下载，发布器用 Node 下载，均不依赖浏览器 CORS。不要启用只接受网站 Referer 的防盗链规则，也不要让插件包自动转为需要解冻的归档存储。建议配置下载流量告警。

## 发布身份的最小权限

将下面模板里的 `YOUR_BUCKET` 和前缀替换为实际值，再绑定给发布专用 RAM 身份。`DeleteObject` 只用于释放发布锁，不需要删除历史包的权限。

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:GetBucketVersioning"],
      "Resource": ["acs:oss:*:*:YOUR_BUCKET"]
    },
    {
      "Effect": "Allow",
      "Action": ["oss:GetObject", "oss:PutObject"],
      "Resource": ["acs:oss:*:*:YOUR_BUCKET/ember-peek/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["oss:DeleteObject"],
      "Resource": ["acs:oss:*:*:YOUR_BUCKET/ember-peek/publish.lock"]
    }
  ]
}
```

匿名读取的 Bucket Policy 示例（不是给发布身份使用的 RAM Policy）：

```json
{
  "Version": "1",
  "Statement": [{
    "Effect": "Allow",
    "Principal": ["*"],
    "Action": ["oss:GetObject"],
    "Resource": [
      "acs:oss:*:*:YOUR_BUCKET/ember-peek/channels/*",
      "acs:oss:*:*:YOUR_BUCKET/ember-peek/packages/*"
    ]
  }]
}
```

## 本地首次发布

需要 Windows x64、Node.js 22.9+ 和 Rust 工具链。把仓库根目录的 `.env.example` 复制为 `.env` 并填写；`.env` 已被 Git 忽略。以下命令都不启动开发服务器：

```powershell
npm ci
npm test
npm run plugins:dist
npm run plugins:validate
npm run plugins:plan
npm run plugins:publish
npm run source:configure
npm run source:check
npm run build:desktop
```

- `plugins:dist` 只生成 `.release/`，不改开发镜像 `.marketplace/`。
- `plugins:validate` 不需要 OSS 配置，使用宿主自己的解析器、SHA-256 校验、ZIP 解包和清单检查验证全部 release 包，不运行插件程序。
- `plugins:plan` 读取 OSS 目录、版本登记和现有包，列出最终版本、复用包和待上传包，不写 OSS。
- `plugins:publish` 才执行上传。上传完成后还会验证公开目录是否已生效。
- `source:configure` 只需要公开地址，写入 `src-tauri/plugin-sources.json`。公开配置可以提交 Git；它不包含密钥。
- 未配置官方源时，`source:check` 阻止桌面发行构建。开发模式仍然读取本地镜像。

仓库暂不填写虚构域名，也不再使用 GitHub `releases/latest` 作为官方源。必须先发布可下载的插件，再向用户发放桌面安装包。

## GitHub Actions

已有两个工作流：

- `Baseline checks`：dev/main 推送和 PR 时运行测试、前端构建、workspace 检查、插件 release 构建及包校验。
- `Publish official plugins`：手动触发。创建名为 `plugin-production` 的 GitHub Environment，在里面配置上表的 Variables 和 Secrets。工作流先构建并归档 `.release/`，再在发布任务中取用凭据。

第一次触发保留 `publish=false`，查看只读预演结果；实际发布设为 `true`。工作流配置了串行发布，OSS 发布锁还会拦截来自其他机器的并发发布。工作流文件需要先存在于 GitHub 默认分支，才能从 Actions 页面使用 `workflow_dispatch`。

源码指纹包含插件自身源码、共享 SDK、直接使用的共享库、锁文件和构建脚本，不包含本机路径、链接时间戳或安装 revision。相同插件版本、相同源码指纹的重复构建复用原包；源码或这些构建输入变化却不升版本会被拒绝。锁文件或公共构建脚本变化可能要求多个插件一起升级，这是保守的发布约束。宿主版本与插件版本继续独立。

当前是首个未冻结的 0.1.0 基线，修复仍使用 0.1.0；一旦第一次登记并发布，任何后续内容修复都应升级对应插件的 `plugin.json` 和 native `Cargo.toml` 版本。

## OSS 对象布局与发布保证

```text
ember-peek/
  channels/stable/api-1/windows-x86_64/catalog.json
  packages/windows-x86_64/<id>-<version>-<buildId24>.zip
  registry/windows-x86_64/<id>/<version>.json
  catalog-history/<sha256>.json
  publish.lock
```

发布依次执行：获得锁 → 校验完整目录与历史版本登记 → 上传缺少的包 → 匿名下载并验证哈希/大小 → 写入不可变版本记录 → 保存新旧目录快照 → 最后切换 stable 目录 → 验证公开目录 → 释放锁。

ZIP 和版本记录禁止同名覆盖；目录使用 `Cache-Control: no-cache`，内容寻址的包使用一年缓存。脚本不删除历史包，不以“本次构建没有引用”为理由删除线上对象。源目录格式仍为 `api:1`，新增发布元数据放在私有的版本记录中，不往现有目录塞入客户端不认识的字段。

同一份构建产物可从 GitHub Actions artifact 下载归档，但目前不配置第二个下载源。后续做镜像时应复制这份原包，不能让镜像重新编译生成另一份哈希。

## 失败与恢复

- 上传、哈希或匿名读取失败：stable 目录不切换。已上传的不可变包可以保留，下次重试复用。
- 目录写入后的网络校验失败：目录可能已经生效。检查 OSS 与公开 URL 后重试，不能假定发布被回滚。
- 程序被终止：锁可能保留。确认没有任何发布任务运行后，由运维查看 `publish.lock` 中的 owner、时间和 run，手动删除该锁；脚本不按超时擅自抢锁。
- 错误版本上线：可由运维从 `catalog-history` 恢复之前的完整目录，引用的旧包必须保留。暂停所有发布操作再恢复。正常发布器拒绝目录降级，也拒绝意外移除已上架插件。
- 已安装坏版本的客户端不会因目录回滚自动降级，需要发更高版本的修复包。已经登记的版本号不会被回收，即使该次发布最终没有切换目录。
- 首启或市场读取失败：页面提供重试/刷新，绕过客户端十分钟远程缓存。本地开发镜像缓存一秒，通常在下一次两秒同步时被发现。

0.1.0 仍无目录签名、无 OS 插件沙箱，只发布可信官方插件。HTTPS 与目录中的 SHA-256 保护下载一致性，不等于发布者数字签名。

## 参考

- [OSS PutObject：覆盖保护、版本控制及缓存头](https://www.alibabacloud.com/help/en/oss/developer-reference/putobject)
- [OSS 阻止公共访问](https://www.alibabacloud.com/help/zh/oss/user-guide/block-public-access)
- [GitHub 手动触发工作流](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
