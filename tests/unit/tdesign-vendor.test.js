// tests/unit/tdesign-vendor.test.js —— vendored TDesign 组件库本地补丁守卫
// miniprogram_npm/tdesign-miniprogram 是直接入库的（无 npm 构建链路），
// 本仓库对它打了两处补丁；重新 vendor 新版组件库会静默回退，此测试负责报警。
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', '..', 'miniprogram', 'miniprogram_npm', 'tdesign-miniprogram');

describe('TDesign vendored 补丁：图标字体本地化', () => {
  const css = fs.readFileSync(path.join(BASE, 'icon', 'icon.wxss'), 'utf8');

  test('不依赖远程字体域名', () => {
    expect(css).not.toContain('tdesign.gtimg.com');
  });

  test('@font-face 内嵌 base64 字体', () => {
    expect(css).toMatch(/@font-face\s*\{[^}]*src:\s*url\(data:font\/woff;base64,/);
    // 真实字体载荷（279KB woff → ~373KB base64），防止退化成空占位
    const m = css.match(/base64,([A-Za-z0-9+/=]+)/);
    expect(m).toBeTruthy();
    expect(m[1].length).toBeGreaterThan(200000);
  });
});

describe('t-check-tag 使用约定：文案走 content 属性（官方用法）', () => {
  // 上游 t-check-tag 的 content 属性默认值为 null，其模板
  // <block wx:else>{{content}}</block> 会把 null 渲染成字符串 "null"，
  // 追加在插槽文本后（t-tag__text 文本节点，2026-08-19 实测定位）。
  // 官方 demo 的用法即 content 驱动（支持 [选中内容, 非选中内容] 数组）；
  // 约定：业务侧 t-check-tag 一律显式传 content，不再依赖插槽承载文案。
  const wxmlDir = path.join(__dirname, '..', '..', 'miniprogram', 'pages');
  const files = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.wxml')) files.push(p);
    });
  };
  walk(wxmlDir);

  test('所有 t-check-tag 均显式声明 content', () => {
    const offenders = [];
    files.forEach((f) => {
      const src = fs.readFileSync(f, 'utf8');
      const tags = src.match(/<t-check-tag[\s\S]*?>/g) || [];
      tags.forEach((tag) => {
        if (!/\bcontent=/.test(tag)) offenders.push(path.relative(wxmlDir, f));
      });
    });
    // 先证明扫描确实覆盖到了使用点，防止文件布局变化后空转过关
    const total = files.reduce(
      (n, f) => n + ((fs.readFileSync(f, 'utf8').match(/<t-check-tag/g) || []).length), 0
    );
    expect(total).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
