/**
 * ts-node-dev 下将相对路径 `*.js` import 解析到同目录 `*.ts`。
 * video/text 模块按 Node16 规范写 `.js` 后缀，但 dev 时只有 `.ts` 源文件。
 */
const Module = require("node:module");

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith(".") && request.endsWith(".js")) {
    const tsRequest = `${request.slice(0, -3)}.ts`;
    try {
      return originalResolveFilename.call(this, tsRequest, parent, isMain, options);
    } catch {
      // fall through to default .js resolution
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
