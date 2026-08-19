/**
 * P2 遇见：浏览与配额 E2E —— 真实云函数全链路（App 级通道，遵守 e2e-test skill）
 * 覆盖：列表脱敏 VO / 筛选数据流 / 本人详情（隐私明文不占配额）/ 游客登录引导 / 收尾恢复登录态。
 * 前置：listProfiles、getProfileDetail、setupDb 已部署且 setupDb 已调用（beforeAll 幂等兜底）。
 * 文件内 wait/waitFor/callCloud 等 helper 与 p1-profile.test.ts 同款（该文件刻意不抽公共模块，
 * 保持每个 e2e 文件自包含可独跑；此处复制沿用同一约定）。
 */
import {
  connectOrLaunch,
  closeSession,
  pageData,
  runInApp,
  navTo,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn: () => Promise<boolean>, timeout = 15000, step = 500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await wait(step);
  }
  throw new Error('waitFor 超时');
}

function callCloud(mp: MiniProgram, name: string, data?: Record<string, unknown>): Promise<any> {
  return mp.evaluate(
    (n: string, d: Record<string, unknown> | undefined) =>
      new Promise((resolve) => {
        wx.cloud
          .callFunction({ name: n, data: d || {} })
          .then((r) => resolve(r.result))
          .catch((e) => resolve({ error: String((e && e.errMsg) || e) }));
      }),
    name,
    data
  );
}

describe('P2 遇见：浏览与配额 E2E（真实云函数）', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
    // 幂等初始化（代替人工调 setupDb）：建 config/view_logs 集合 + 种子配额
    const setup = await callCloud(mp, 'setupDb', {});
    if (setup && setup.error) throw new Error('setupDb failed: ' + JSON.stringify(setup));
  }, 120000);

  afterAll(() => closeSession(session));

  it('遇见列表：清缓存冷启动后加载真实数据，列表项为脱敏 CardVO', async () => {
    await runInApp(mp, () => {
      wx.clearStorageSync();
      return true;
    });
    // reLaunch 重建 recommend 实例（复用 IDE 时旧实例 data 带残留值，见 skill 环境事实）
    await navTo(mp, '/pages/recommend/recommend');
    await waitFor(async () => (await pageData<boolean>(mp, 'loading')) === false);
    const list = await pageData<any[]>(mp, 'list');
    expect(Array.isArray(list)).toBe(true);
    for (const item of list) {
      expect(item.privacy).toBeUndefined();
      expect(item.openid).toBeUndefined();
      expect(item._id).toBeTruthy();
      expect(typeof item.verified).toBe('boolean');
    }
  }, T);

  it('筛选数据流：onFilterChange 更新 filter 并按学历重查', async () => {
    // 组件内部交互由单测覆盖；e2e 驱动页面 handler 验证数据流（skill：交互走页面方法调用）
    await runInApp(mp, () => {
      const page = getCurrentPages().slice(-1)[0];
      page.onFilterChange({ detail: { filter: { educations: ['本科'] } } });
      return true;
    });
    await waitFor(async () => (await pageData<boolean>(mp, 'loading')) === false);
    expect(await pageData<any>(mp, 'filter')).toEqual({ educations: ['本科'] });
    const list = await pageData<any[]>(mp, 'list');
    expect(list.every((it) => it.about.education === '本科')).toBe(true);
  }, T);

  it('本人详情：self 视角隐私明文、quota 为 null、verified 徽标数据在位', async () => {
    // 先确保登录与本人资料存在（真实环境可能被上一轮 deleteAccount 清掉）
    const login = await callCloud(mp, 'login', {});
    expect(login && login.user).toBeTruthy();
    let mine: any = await callCloud(mp, 'getMyProfile', {});
    if (!mine || !mine.profile) {
      await callCloud(mp, 'updateProfile', {
        patch: { basic: { nickname: 'E2E嘉宾', gender: '女', birthday: '1995-06-15' } },
      });
      mine = await callCloud(mp, 'getMyProfile', {});
    }
    expect(mine && mine.profile && mine.profile._id).toBeTruthy();
    await navTo(mp, '/pages/profile-detail/profile-detail?id=' + mine.profile._id);
    await waitFor(async () => (await pageData<any>(mp, 'profile')) !== null);
    const d = await pageData<any>(mp);
    expect(d.self).toBe(true);
    expect(d.quota).toBeNull();
    expect(d.profile.privacy).toBeTruthy(); // 本人直看隐私
    expect(d.profile.basic.nickname).toBeTruthy();
  }, T);

  it('游客详情：deleteAccount 构造无档态 → 登录引导', async () => {
    const removed = await callCloud(mp, 'deleteAccount', {});
    expect(removed && removed.deleted).toBe(true);
    await navTo(mp, '/pages/profile-detail/profile-detail?id=whatever');
    await waitFor(async () => (await pageData<boolean>(mp, 'needLogin')) === true);
    expect(await pageData<boolean>(mp, 'needLogin')).toBe(true);
  }, T);

  it('收尾：login 重建用户档，恢复环境（资料可由 p1 用例重建）', async () => {
    const res = await callCloud(mp, 'login', {});
    expect(res && res.user && res.user.userId).toBeTruthy();
  }, T);
});
