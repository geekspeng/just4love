// E2E evaluate 回调在小程序运行时执行，那里存在全局 getCurrentPages / wx。
// 此声明让所有 e2e 测试文件的回调通过 Node 侧 TS 检查。
// （tests/e2e/*.test.ts 和 helpers.ts 均依赖，勿删）
declare function getCurrentPages(): Array<{
  route: string;
  data: Record<string, unknown>;
}>;
declare const wx: {
  createSelectorQuery: () => {
    selectAll: (selector: string) => {
      fields: (opt: { id: boolean }) => {
        exec: (cb: (res: Array<Array<unknown>>) => void) => void;
      };
    };
  };
};
