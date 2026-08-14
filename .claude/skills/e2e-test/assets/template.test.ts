/**
 * <功能名> E2E 测试
 *
 * 生成后填充：<功能名>、路由、data 字段、选择器、页面方法。
 * 运行：npm run test:e2e
 */
import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  pageData,
  countSelector,
  runInApp,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

describe('<功能名> E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  // ---- 按需选用以下用例模式，删掉用不到的 ----

  it('进入 <页面>', async () => {
    // tab 页用 switchTab；普通页用 reLaunch / navigateTo
    await mp.reLaunch('/pages/<page>/<page>');
    expect(await currentRoute(mp)).toContain('<page>');
  }, T);

  it('页面渲染了核心元素', async () => {
    // 页面级 class 计数（注意：跨自定义组件边界的选择器查不到，
    // 组件内部状态改用 pageData 断言）
    expect(await countSelector(mp, '.<page>__list')).toBe(1);
  }, T);

  it('页面数据符合预期', async () => {
    const <field> = await pageData<{ /* 字段类型 */ }[]>(mp, '<field>');
    expect(<field>).toHaveLength(<n>);
    expect(<field>[0].<prop>).toBe('<value>');
  }, T);

  it('交互方法可触发', async () => {
    // 直接调用页面方法（验证不抛错 + 可选返回值）；
    // 事件对象按 wxml 绑定的 handler 签名构造
    const ok = await runInApp(mp, () => {
      const page = getCurrentPages().slice(-1)[0] as unknown as {
        <handler>: (e: { currentTarget: { dataset: Record<string, string> } }) => void;
      };
      page.<handler>({ currentTarget: { dataset: { id: '<id>' } } });
      return true;
    });
    expect(ok).toBe(true);
  }, T);
});
