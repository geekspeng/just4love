// tests/helpers/mock-db.js —— 内存版云数据库 mock（集成测试共用）
// 仅实现本项目云函数用到的子集：
//   collection(name).where(query).orderBy(field, order).skip(n).limit(n).get() → { data: [...] }
//     query 支持：等值、点路径（'about.height'）、db.command 命令（可链式 AND）
//   collection(name).doc(id).get() → { data }（不存在时抛错，同云数据库语义）
//   collection(name).doc(id).set({ data })（整篇替换）/ .update({ data })（不存在 → { updated: 0 }）
//   collection(name).doc(id).remove()
//   collection(name).add({ data }) → { _id }（支持自定义 data._id）
//   db.command：inc(n)（update 时解释）/ gte/lte/gt/lt/neq/in（where 时解释，链式为 AND）
const clone = (v) => JSON.parse(JSON.stringify(v));

// 点路径取值：'about.height' → doc.about.height（缺路径返回 undefined）
function getByPath(obj, path) {
  return path.split('.').reduce(
    (cur, key) => (cur === undefined || cur === null ? undefined : cur[key]),
    obj
  );
}

// 单个命令是否匹配文档值
function matchOne(op, v, docVal) {
  switch (op) {
    case 'gte': return docVal >= v;
    case 'lte': return docVal <= v;
    case 'gt': return docVal > v;
    case 'lt': return docVal < v;
    case 'neq': return docVal !== v;
    case 'in': return v.indexOf(docVal) >= 0;
    default: return false;
  }
}

// 命令对象：{ __ops: [{op, v}, ...] }，多元素即链式 AND（对应 wx-server-sdk 的 _.gte(x).lte(y)）
const CMD_OPS = ['gte', 'lte', 'gt', 'lt', 'neq', 'in'];
function makeCmd(ops) {
  const cmd = { __ops: ops };
  for (const name of CMD_OPS) {
    cmd[name] = (v) => makeCmd(ops.concat([{ op: name, v }]));
  }
  return cmd;
}
const isCmd = (c) => !!c && typeof c === 'object' && Array.isArray(c.__ops);
const matchCmd = (cmd, docVal) => cmd.__ops.every(({ op, v }) => matchOne(op, v, docVal));

function createMockDb(initial = {}) {
  const store = {}; // name → { id → doc }
  for (const name of Object.keys(initial)) {
    store[name] = clone(initial[name]);
  }

  function applyUpdate(doc, data) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && v.__inc !== undefined) {
        doc[k] = (doc[k] || 0) + v.__inc; // 普通对象为整字段替换（同云数据库 update），仅 inc 特判
      } else {
        doc[k] = v;
      }
    }
  }

  const command = { inc: (n) => ({ __inc: n }) };
  for (const op of CMD_OPS) {
    command[op] = (v) => makeCmd([{ op, v }]);
  }

  return {
    command,
    collection(name) {
      store[name] = store[name] || {};
      const col = store[name];
      return {
        add: async ({ data }) => {
          const id = data._id || 'id_' + name + '_' + (Object.keys(col).length + 1);
          col[id] = clone({ ...data, _id: id });
          return { _id: id };
        },
        doc: (id) => ({
          get: async () => {
            if (!(id in col)) {
              const err = new Error('document not exists');
              err.errCode = -1;
              throw err;
            }
            return { data: clone(col[id]) };
          },
          set: async ({ data }) => {
            col[id] = clone({ ...data, _id: id });
            return { updated: 1 };
          },
          update: async ({ data }) => {
            if (!(id in col)) return { updated: 0 };
            applyUpdate(col[id], clone(data));
            return { updated: 1 };
          },
          remove: async () => {
            delete col[id];
            return { deleted: 1 };
          },
        }),
        where: (query) => {
          // 链式 orderBy/skip/limit 只记录，get() 时统一执行（filter → sort → skip → limit）
          const ops = { orderBy: null, skip: 0, limit: Infinity };
          const chain = {
            orderBy: (field, order) => { ops.orderBy = { field, order }; return chain; },
            skip: (n) => { ops.skip = n; return chain; },
            limit: (n) => { ops.limit = n; return chain; },
            get: async () => {
              let docs = Object.values(col).filter((d) =>
                Object.keys(query).every((k) => {
                  const cond = query[k];
                  const val = getByPath(d, k);
                  return isCmd(cond) ? matchCmd(cond, val) : val === cond;
                })
              );
              if (ops.orderBy) {
                const { field, order } = ops.orderBy;
                // 缺字段文档按最小值参与排序（本项目排序列 createdAt 均存在，此语义仅兜底）
                const norm = (v) => (v === undefined ? -Infinity : v);
                docs = docs.slice().sort((a, b) => {
                  const cmp = norm(getByPath(a, field)) < norm(getByPath(b, field)) ? -1
                    : norm(getByPath(a, field)) > norm(getByPath(b, field)) ? 1 : 0;
                  return order === 'desc' ? -cmp : cmp;
                });
              }
              if (ops.skip > 0) docs = docs.slice(ops.skip);
              if (Number.isFinite(ops.limit)) docs = docs.slice(0, ops.limit);
              return { data: docs.map(clone) };
            },
          };
          return chain;
        },
      };
    },
  };
}

module.exports = { createMockDb };
