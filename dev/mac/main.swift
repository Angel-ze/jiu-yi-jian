// 就一件 · 原生 Mac 窗口（WKWebView，不是浏览器套壳）
//
// 它加载的是打进 .app 里的 index.html —— 与手机版逐字节同一个文件。
// 用 WebKit 而不是 Chromium 内核，和 iPhone Safari 同引擎，
// 所以它顺便能验苹果端的渲染兼容性。
//
// 编译（见同目录 build.sh）：
//   swiftc -O -o 就一件 main.swift -framework Cocoa -framework WebKit
import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ note: Notification) {
        guard let html = Bundle.main.url(forResource: "index", withExtension: "html") else {
            NSLog("找不到 index.html"); NSApp.terminate(nil); return
        }
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")   // 右键可开检查器

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 430, height: 880),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "就一件"
        window.contentView = webView
        window.minSize = NSSize(width: 360, height: 640)
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(calibratedRed: 0.055, green: 0.067, blue: 0.086, alpha: 1)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
