# 依伴儿部署到腾讯云开发 CloudBase

本项目需要 Python 后端、Qwen API 和 SQLite，因此应使用 **云托管 CloudBase Run（容器模式）**，不是单纯静态网站托管。

## 1. 开通环境

1. 打开 <https://tcb.cloud.tencent.com/dev>。
2. 登录腾讯云，新建一个云开发环境，例如 `yiban-demo`。
3. 进入该环境的「云托管」，新建容器服务，服务名可填 `yiban-ai`。

## 2. 上传项目

选择「从本地代码或代码库构建」，上传本项目。根目录已包含 `Dockerfile`。

上传时不要包含：

- `.env`（里面含 API Key）
- `data/`（本地患者演示数据）
- 设计截图和参考文档

`.dockerignore` 已自动排除这些内容。

## 3. 配置服务

- 容器监听端口：`8080`
- Dockerfile：项目根目录的 `Dockerfile`
- 流量：新版本设为 `100%`
- 演示阶段建议副本范围：最小 `1`，最大 `1`

配置以下环境变量：

| 名称 | 值 |
| --- | --- |
| `DASHSCOPE_API_KEY` | 你自己的 Qwen API Key |
| `QWEN_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | `qwen-plus` |
| `PRO_ANALYZER_MODEL` | `qwen-plus` |
| `HOST` | `0.0.0.0` |
| `PORT` | `8080` |
| `YIBAN_DB_PATH` | `/tmp/yiban-demo/yiban.db` |
| `DEMO_ACCESS_TOKEN` | 自定义一个难猜的体验码，例如随机字母数字组合 |

API Key 和体验码只能填在云端环境变量中，不要写入代码或发给体验者。

## 4. 发布与分享

构建完成并且健康检查通过后，云托管会分配一个 HTTPS 默认域名。假设域名为：

`https://yiban-ai-xxxx.example.com`

分享时使用：

- 患者端：`https://yiban-ai-xxxx.example.com/?invite=你设置的体验码`
- 医生端：`https://yiban-ai-xxxx.example.com/doctor.html?invite=你设置的体验码`

体验者只需点击完整链接，不需要单独输入密码。

## 5. Demo 数据限制

当前云端版使用容器内 SQLite，适合短期功能体验，但服务重启、重新发版或实例迁移时数据可能清空。请只使用虚构演示患者，不要填写真实姓名、病历或检查报告。

如需要长期保留数据，下一阶段应将 SQLite 迁移到 CloudBase MySQL，并将报告文件迁移到云存储。

## 可选：命令行部署

也可以使用官方 CLI：

```bash
npm install -g @cloudbase/cli
tcb login
tcb env list
tcb env use <你的环境ID>
tcb cloudrun init
tcb cloudrun deploy
```

首次部署更建议使用控制台，便于确认环境变量、监听端口和流量比例。
