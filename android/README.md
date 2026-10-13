# Android 工程

把仓库根目录的 `index.html` 包成一个 APK。

**不要直接 `./gradlew assembleRelease`** —— 先跑打包脚本，它会先把 `index.html`
同步进 `app/src/main/assets/`，再构建、对齐、签名：

```bash
bash ../dev/build-apk.sh 1.4.2
```

## 为什么是这个结构

| 东西 | 为什么这么定 |
|---|---|
| **没有 INTERNET 权限** | 内容全部打包在 assets 里本地加载，系统层面就没有联网能力。这不是承诺，是权限层面的事实 |
| **用 WebViewAssetLoader** | 让本地资源跑在 `https://appassets.androidplatform.net` 这个安全来源下，`localStorage` 才能正常工作（`file://` 来源在现代 WebView 上限制很多） |
| **`app/src/main/assets/index.html` 不入库** | 它是从根目录 `index.html` 拷过来的。仓库里只保留一个真源，避免两份不同步 |
| **`local.properties` 不入库** | 里面是这台机器的 SDK 路径。Android Studio 打开工程会自动生成 |

## 需要预先装好

- **JDK 17**
- **Android SDK**：`platforms;android-36`、`build-tools;35.0.0`、`platform-tools`

```bash
sdkmanager "platforms;android-36" "build-tools;35.0.0" "platform-tools"
```

## 版本号

在 `app/build.gradle` 里改（脚本会自动改）：

```
versionCode = 主×10000 + 次×100 + 修订      ← 永远单调递增
```
