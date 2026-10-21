/* 构建免安装离线版：单文件 HTML + Edge 应用窗口启动器 + 备用批处理 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.resolve(ROOT, '..');
const OUT = path.join(PROJECT, 'deliverables', '龙裔王座-离线版');
const HTML = path.join(ROOT, '龙裔王座-离线版.html');
const ICON = path.join(ROOT, 'icon.ico');

if (!fs.existsSync(HTML)) throw new Error('请先运行 node tools/build-offline.js');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.copyFileSync(HTML, path.join(OUT, 'game.html'));
if (fs.existsSync(ICON)) fs.copyFileSync(ICON, path.join(OUT, 'icon.ico'));

const vbs = [
  'Set sh = CreateObject("WScript.Shell")',
  'Set fso = CreateObject("Scripting.FileSystemObject")',
  'dir = fso.GetParentFolderName(WScript.ScriptFullName)',
  'game = dir & "\\game.html"',
  'edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\\Microsoft\\Edge\\Application\\msedge.exe"',
  'If Not fso.FileExists(edge) Then',
  '  edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\\Microsoft\\Edge\\Application\\msedge.exe"',
  'End If',
  'If fso.FileExists(edge) Then',
  '  url = "file:///" & Replace(dir, "\\", "/") & "/game.html"',
  '  profile = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\\DragonbloodThrone\\EdgeProfile"',
  '  sh.Run """" & edge & """ --app=""" & url & """ --window-size=1600,1000 --no-first-run --no-default-browser-check --user-data-dir=""" & profile & """", 0, False',
  'Else',
  '  sh.Run """" & game & """", 1, False',
  'End If'
].join('\r\n');
fs.writeFileSync(path.join(OUT, '开始游戏.vbs'), vbs, 'ascii');

const bat = [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'set "GAME=%~dp0game.html"',
  'set "URL=file:///%GAME:\\=/%"',
  'set "EDGE=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
  'if not exist "%EDGE%" set "EDGE=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
  'if exist "%EDGE%" (',
  '  start "" "%EDGE%" --app="%URL%" --window-size=1600,1000 --no-first-run --no-default-browser-check --user-data-dir="%LOCALAPPDATA%\\DragonbloodThrone\\EdgeProfile"',
  ') else (',
  '  start "" "%GAME%"',
  ')'
].join('\r\n');
fs.writeFileSync(path.join(OUT, '开始游戏.bat'), bat, 'ascii');

const readme = [
  '龙裔王座 · Dragonblood Throne — 免安装离线版',
  '',
  '启动方式（任选其一）：',
  '  1. 双击「开始游戏.vbs」：无控制台，使用 Edge 应用窗口启动（无地址栏）。',
  '  2. 双击「开始游戏.bat」：如果 VBS 被系统策略禁用，用这个。',
  '  3. 双击「game.html」：直接用默认浏览器打开。',
  '',
  '无需联网、无需安装、无需管理员权限；所有卡牌、AI、音效和存档都在本机。',
  '游戏文件只有一个 game.html（CSS、JS、SVG 全部内联），可以单独复制到任何地方。',
  '启动器使用 Windows 10/11 自带的 Edge；找不到 Edge 时会退回默认浏览器。',
  '',
  '操作：',
  '  F11        切换全屏（应用窗口内）',
  '  Esc        取消选择 / 返回',
  '  鼠标左键   出牌、选择目标、移动、攻击',
  '',
  '存档位置：Edge 配置目录 %LOCALAPPDATA%\\DragonbloodThrone\\EdgeProfile',
  '（默认浏览器模式则使用浏览器自身的本地存储）',
  '',
  '完全离线：单文件版带有 CSP，页面自身不允许任何 http/https 请求。',
  '如果 Windows 对 VBS 弹出安全提示，选择允许，或改用开始游戏.bat。'
].join('\r\n');
fs.writeFileSync(path.join(OUT, '使用说明.txt'), '\ufeff' + readme, 'utf8');

let total = 0;
for (const name of fs.readdirSync(OUT)) total += fs.statSync(path.join(OUT, name)).size;
console.log('离线版已生成:', OUT);
console.log('大小:', (total / 1024).toFixed(1), 'KB');
