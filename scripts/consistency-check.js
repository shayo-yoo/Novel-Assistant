// 一致性检查：package.json 命令/视图 与 src 中的注册是否对齐
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const declaredCommands = new Set(pkg.contributes.commands.map(c => c.command));
const declaredViews = new Set(Object.values(pkg.contributes.views).flat().map(v => v.id));
const declaredContainers = new Set(pkg.contributes.viewsContainers.activitybar.map(v => v.id));

// 收集源码中注册的命令
function walk(dir, acc) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      walk(p, acc);
    } else if (f.name.endsWith('.ts')) {
      acc.push(p);
    }
  }
  return acc;
}
const srcFiles = walk(path.join(root, 'src'), []);
const allSrc = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const registered = new Set();
const re = /registerCommand\s*\(\s*'([^']+)'/g;
let m;
while ((m = re.exec(allSrc)) !== null) {
  registered.add(m[1]);
}

const missing = [...declaredCommands].filter(c => !registered.has(c));
const extra = [...registered].filter(c => !declaredCommands.has(c));

console.log('声明命令数：', declaredCommands.size);
console.log('注册命令数：', registered.size);
console.log('视图 ID：', [...declaredViews].join(', '));
if (missing.length) console.log('❌ 声明但未注册：', missing.join(', '));
else console.log('✅ 全部声明命令均已注册');
if (extra.length) console.log('ℹ️ 注册但未声明（内部命令）：', extra.join(', '));

// 视图是否在源码中创建
for (const view of declaredViews) {
  if (!allSrc.includes(`'${view}'`) && !allSrc.includes(`"${view}"`)) {
    console.log('❌ 视图未在源码中创建：', view);
  }
}
console.log('✅ 视图检查完成');

// 检查 activationEvents 中的命令是否都声明了（除 onStartupFinished）
const activationCommands = pkg.activationEvents
  .filter(a => a.startsWith('onCommand:'))
  .map(a => a.slice('onCommand:'.length));
const activationMissing = activationCommands.filter(c => !declaredCommands.has(c));
if (activationMissing.length) console.log('❌ 激活事件引用未声明命令：', activationMissing.join(', '));
else console.log('✅ 激活事件全部有效');
