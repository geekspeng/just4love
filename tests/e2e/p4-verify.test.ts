/**
 * P4 认证与管理 E2E —— 真实云函数（App 级通道，遵守 e2e-test skill）
 * 单测试号（normal 角色）无法构造管理员视角：审核→升级→配额联动、举报处置、
 * 嘉宾 flags、配额保存等管理闭环由集成测试（mock 任意 openid/role）全覆盖；
 * 本文件覆盖本端可达路径：认证页表单校验与状态渲染、认证云函数状态机（直连）、
 * admin 守卫（forbidden）、管理页直链无权限态、群码页未认证态、mine 菜单角色化。
 * 会话走 helpers.getSharedSession() 全程共享（一次建立/一次关闭，teardown 统一收口）；本文件用例仍可单独指定运行。
 */
import {
  getSharedSession, pageData, runInApp, navTo,
  TEST_TIMEOUT as T, MiniProgram, ConnectedSession,
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

function drivePage(m: MiniProgram, method: string, event: Record<string, unknown>): Promise<boolean> {
  return m.evaluate(
    (mm: string, ev: Record<string, unknown>) => {
      getCurrentPages().slice(-1)[0][mm](ev);
      return true;
    },
    method,
    event
  );
}

describe('P4 认证与管理 E2E（真实云函数）', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await getSharedSession();
    mp = session.miniProgram;
    const setup = await callCloud(mp, 'setupDb', {});
    if (setup && setup.error) throw new Error('setupDb failed: ' + JSON.stringify(setup));
    const login = await callCloud(mp, 'login', {});
    expect(login && login.user).toBeTruthy();
  }, 120000);

  it('认证页：三类卡片加载（初始 none）；未选图提交被前端拦截不落库', async () => {
    await navTo(mp, '/pages/verification/verification');
    await waitFor(async () => (await pageData<any[]>(mp, 'items')).length === 3);
    const items = await pageData<any[]>(mp, 'items');
    expect(items.map((i) => i.type)).toEqual(['identity', 'education', 'career']);
    expect(items.every((i) => i.status === 'none' || i.status === 'pending' || i.status === 'approved')).toBe(true);
    // 未选图直接提交 → 前端 toast 拦截，不落库
    const before = await callCloud(mp, 'getMyVerifications');
    const submittedBefore = before.list.filter((v: { status: string }) => v.status !== 'none').length;
    const idx = before.list.findIndex((v: { status: string }) => v.status === 'none');
    if (idx >= 0) {
      await drivePage(mp, 'onSubmit', { currentTarget: { dataset: { idx } } });
      const after = await callCloud(mp, 'getMyVerifications');
      expect(after.list.filter((v: { status: string }) => v.status !== 'none')).toHaveLength(submittedBefore);
    }
  }, T);

  it('认证状态机（直连云函数）：提交 career → pending；重复提交幂等 unchanged', async () => {
    const first = await callCloud(mp, 'submitVerification', {
      type: 'career',
      materialFileIDs: ['cloud://e2e-career-1.jpg'],
    });
    expect(first.status).toBe('pending');
    const again = await callCloud(mp, 'submitVerification', {
      type: 'career',
      materialFileIDs: ['cloud://e2e-career-1.jpg'],
    });
    expect(again.unchanged).toBe(true);
  }, T);

  it('认证页重进：pending 项展示「审核中」且隐藏提交入口', async () => {
    await navTo(mp, '/pages/verification/verification');
    await waitFor(async () => (await pageData<any[]>(mp, 'items')).length === 3);
    const items = await pageData<any[]>(mp, 'items');
    const career = items.find((i) => i.type === 'career');
    expect(career.status).toBe('pending');
    expect(career.editable).toBe(false);
    expect(career.statusText).toBe('审核中');
  }, T);

  it('admin 云函数守卫：normal 用户任意 action → forbidden', async () => {
    const cfg = await callCloud(mp, 'admin', { action: 'getConfig' });
    expect(cfg.error).toBe('forbidden');
    const review = await callCloud(mp, 'admin', { action: 'reviewVerification', verificationId: 'nonexistent', decision: 'approve' });
    expect(review.error).toBe('forbidden');
  }, T);

  it('管理页直链（normal）：渲染无权限空态（forbidden=true）', async () => {
    await navTo(mp, '/pages/admin/admin');
    await waitFor(async () => (await pageData<boolean>(mp, 'forbidden')) === true);
    expect(await pageData<boolean>(mp, 'forbidden')).toBe(true);
  }, T);

  it('群码页（未认证）：引导态 + getGroupQr 云函数 forbidden', async () => {
    const cloud = await callCloud(mp, 'getGroupQr');
    expect(cloud.error).toBe('forbidden');
    await navTo(mp, '/pages/group-qrcode/group-qrcode');
    await waitFor(async () => (await pageData<boolean>(mp, 'verified')) === false);
    const d = await pageData<{ verified: boolean; qrFileID: null }>(mp);
    expect(d.verified).toBe(false);
    expect(d.qrFileID).toBe(null);
  }, T);

  it('mine 菜单角色化（normal）：认证/群入口在位，管理后台不出现', async () => {
    await mp.switchTab('/pages/mine/mine');
    await waitFor(async () => !!(await pageData<unknown>(mp, 'user')));
    const menus = await pageData<{ id: string }[]>(mp, 'menus');
    expect(menus.map((m) => m.id)).toEqual([
      'edit', 'album', 'story', 'tags', 'preview', 'verify', 'group', 'settings',
    ]);
    // 缓存登录态确认后 menus 不含 admin（页面 data 层断言，等价 UI 不可见）
    const user = await runInApp<{ role: string }>(mp, () => wx.getStorageSync('j4l_user'));
    expect(user.role).toBe('normal');
  }, T);
});
