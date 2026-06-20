
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== 开始打包流程 ===\n');

try {
  // 1. 读取 package.json
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // 2. 打包 1.0.0
  console.log('📦 打包 1.0.0...');
  execSync('npm run build:win', { stdio: 'inherit', cwd: __dirname });
  
  // 3. 备份 1.0.0
  console.log('\n✅ 保存 1.0.0...');
  const dest100 = path.join(__dirname, 'release-1.0.0');
  if (!fs.existsSync(dest100)) fs.mkdirSync(dest100);
  const files = fs.readdirSync(path.join(__dirname, 'dist'));
  files.forEach(f => {
    if (f.endsWith('.exe') || f === 'latest.yml') {
      fs.copyFileSync(path.join(__dirname, 'dist', f), path.join(dest100, f));
      console.log('  ✓', f);
    }
  });
  
  // 4. 修改版本号为 1.0.1
  console.log('\n📝 更新版本号到 1.0.1...');
  pkg.version = '1.0.1';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  
  // 5. 清空 dist 目录
  console.log('\n🗑️  清理...');
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }
  
  // 6. 打包 1.0.1
  console.log('\n📦 打包 1.0.1...');
  execSync('npm run build:win', { stdio: 'inherit', cwd: __dirname });
  
  // 7. 备份 1.0.1
  console.log('\n✅ 保存 1.0.1...');
  const dest101 = path.join(__dirname, 'release-1.0.1');
  if (!fs.existsSync(dest101)) fs.mkdirSync(dest101);
  const files101 = fs.readdirSync(path.join(__dirname, 'dist'));
  files101.forEach(f => {
    if (f.endsWith('.exe') || f === 'latest.yml') {
      fs.copyFileSync(path.join(__dirname, 'dist', f), path.join(dest101, f));
      console.log('  ✓', f);
    }
  });
  
  // 8. 恢复版本号为 1.0.0
  console.log('\n📝 恢复版本号到 1.0.0...');
  pkg.version = '1.0.0';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  
  console.log('\n🎉 全部完成！');
  console.log('  📁 release-1.0.0 - 1.0.0 版本');
  console.log('  📁 release-1.0.1 - 1.0.1 版本');
  
} catch (err) {
  console.error('\n❌ 打包失败:', err.message);
  process.exit(1);
}
