package io.github.angelze.jiuyijian;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/**
 * 就一件 —— 全部内容打包在 assets 里，本地加载，不联网。
 *
 * 用 WebViewAssetLoader 而不是 file:// 的原因：
 *   file:// 来源在现代 WebView 里算"不安全来源"，localStorage 会被限制甚至清掉。
 *   WebViewAssetLoader 把资源映射到 https://appassets.androidplatform.net/ 这个安全来源，
 *   本地存储、JSON、Date 等行为都和正常网页一致。
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://appassets.androidplatform.net/assets/index.html";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage —— 任务数据存这里
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);           // 不需要文件访问
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                    // 不跟随系统字体缩放，避免布局被撑坏
        s.setMediaPlaybackRequiresUserGesture(false);

        webView.setBackgroundColor(0xFFF6F7F9); // 与页面底色一致，避免启动白闪
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    /** 返回键优先走网页历史；已经在首页就正常退出 */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
