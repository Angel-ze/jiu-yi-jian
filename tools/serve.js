/*
 * 极简静态服务器 —— 只为本地预览「就一件」
 * 用法：node tools/serve.js   （默认 http://127.0.0.1:4173/）
 *
 * 用 127.0.0.1/localhost 打开时浏览器视为安全上下文，
 * 所以 Service Worker 也会正常注册 —— 能完整体验"添加到主屏"的形态。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8"
};

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";

  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end("forbidden");
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 " + p);
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"   // 改完刷新就是最新的
    });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => {
  console.log("就一件 · 本地预览： http://127.0.0.1:" + port + "/");
  console.log("服务目录：" + root);
});
