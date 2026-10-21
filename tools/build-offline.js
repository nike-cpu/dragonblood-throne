/* 构建单文件离线版：把所有 CSS/JS 内联进一个 HTML，双击即可离线运行 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '龙裔王座-离线版.html');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
html = html.replace(
  '<link rel="stylesheet" href="css/style.css">',
  () => '<style>\n' + css + '\n</style>'
);

const scripts = ['cards', 'engine', 'ai', 'art', 'audio', 'ui'];
for (const name of scripts) {
  const tag = '<script src="js/' + name + '.js"></script>';
  const code = fs.readFileSync(path.join(ROOT, 'js', name + '.js'), 'utf8');
  if (code.includes('</script')) throw new Error(name + '.js 含有 </script，需转义');
  html = html.replace(tag, () => '<script>\n' + code + '\n</script>');
}

// 单文件版额外加一层 CSP：禁止任何外部网络连接，只允许内联样式/脚本与 data: 图标
if (!html.includes('Content-Security-Policy')) {
  html = html.replace(
    '<meta charset="utf-8">',
    '<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\';">'
  );
}

if (/<script[^>]+src=|<link[^>]+stylesheet/i.test(html)) {
  throw new Error('仍有外部脚本或样式引用未内联');
}
if (/https?:\/\//i.test(html.replace(/<svg[\s\S]*?<\/svg>/gi, ''))) {
  // SVG 命名空间属于无害的 xmlns；这里只做提示，不阻断构建
  console.warn('提示：HTML 中仍出现 http(s) 字符串，请确认它们只是 SVG 命名空间。');
}

fs.writeFileSync(OUT, html, 'utf8');
console.log('单文件离线版已生成:', OUT);
console.log('大小:', (fs.statSync(OUT).size / 1024).toFixed(1), 'KB');
