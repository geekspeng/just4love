// scripts/gen-region-data.js —— 生成 miniprogram/utils/region-data.js（省市二级数据）
// 数据源：china-division（npm install --no-save china-division@2 后运行本脚本）。
// pc.json = {省: [市/直辖市辖区...]}；HK-MO-TW.json = {区域: {子区: [...]}}，取其键为第二级。
// 产出为「值为文案」选项：{label, value} 同值；存储格式保持「省 市」（与原生 region picker 一致）。
const fs = require('fs');
const path = require('path');

const pc = require('china-division/dist/pc.json');
const hmt = require('china-division/dist/HK-MO-TW.json');

const provinces = Object.keys(pc).concat(Object.keys(hmt));
const cityMap = {};
provinces.forEach((prov) => {
  const list = pc[prov] || Object.keys(hmt[prov] || {});
  cityMap[prov] = list;
});

const toOption = (name) => `  { label: ${JSON.stringify(name)}, value: ${JSON.stringify(name)} }`;
const out = `// miniprogram/utils/region-data.js —— 省市二级选项（t-picker 双列联动用）
// 由 scripts/gen-region-data.js 从 china-division 生成，勿手改；直辖市第二级为市辖区。
const PROVINCES = [
${provinces.map(toOption).join(',\n')},
];

const CITY_MAP = {
${provinces.map((prov) => `  ${JSON.stringify(prov)}: [\n${cityMap[prov].map(toOption).join(',\n')},\n  ]`).join(',\n')},
};

module.exports = { PROVINCES, CITY_MAP };
`;

const target = path.resolve(__dirname, '../miniprogram/utils/region-data.js');
fs.writeFileSync(target, out);
console.log(`written ${target}: ${provinces.length} provinces, ${Object.values(cityMap).reduce((n, l) => n + l.length, 0)} cities`);
