# 自动更新部署说明

## 文件结构

将以下文件上传到你的 R2 存储 `update.idmanos.com/windows` 路径下：

```
windows/
├── latest.yml             # 更新元数据
├── Idpetos Setup 1.0.0.exe  # NSIS 安装包
├── Idpetos 1.0.0.exe        # 便携版
├── Idpetos Setup 1.0.1.exe  # (新版本)
└── Idpetos 1.0.1.exe        # (新版本)
```

## 工作原理

1. `electron-updater` 会请求 `https://update.idmanos.com/windows/latest.yml`
2. 解析 `latest.yml` 获取最新版本信息和文件列表
3. 使用 `path` 字段指定的文件名，拼接到更新服务器地址后下载
4. 最终下载地址：`https://update.idmanos.com/windows/Idpetos Setup 1.0.1.exe`

## latest.yml 说明

```yaml
version: 1.0.1                # 版本号
releaseDate: "2026-05-13..." # 发布日期
files:
  - url: Idpetos Setup 1.0.1.exe  # NSIS 安装包
    size: 76810451
  - url: Idpetos 1.0.1.exe        # 便携版
    size: 76593737
path: Idpetos Setup 1.0.1.exe      # 默认下载的文件
```

## 构建步骤

每次发布新版本时，运行：

```bash
npm run build:win
```

这会自动：
1. 生成两个版本（NSIS + 便携版）
2. 自动生成 `dist/latest.yml`
3. 你只需将 `dist/` 下的文件上传到 R2 即可
