// tests/helpers/mock-db.js —— 内存版云数据库 mock（集成测试共用）
// 仅实现本项目云函数用到的子集：
//   collection(name).where(等值查询).get() → { data: [...] }
//   collection(name).doc(id).get() → { data }（不存在时抛错，同云数据库语义）
//   collection(name).doc(id).set({ data })（整篇替换）/ .update({ data })（不存在 → { updated: 0 }）
//   collection(name).doc(id).remove()
//   collection(name).add({ data }) → { _id }（支持自定义 data._id）
//   db.command.inc(n)（仅 update 时解释）
const clone = (v) => JSON.parse(JSON.stringify(v));

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

  return {
    command: { inc: (n) => ({ __inc: n }) },
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
        where: (query) => ({
          get: async () => ({
            data: Object.values(col)
              .filter((d) => Object.keys(query).every((k) => d[k] === query[k]))
              .map(clone),
          }),
        }),
      };
    },
  };
}

module.exports = { createMockDb };
