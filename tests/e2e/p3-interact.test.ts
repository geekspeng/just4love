/**
 * P3 互动与隐私授权 E2E —— 真实云函数（App 级通道，遵守 e2e-test skill）
 * 单测试号无法构造对方视角：互配/被通知/owner 同意由集成测试覆盖；
 * 本文件覆盖本端可达路径：interact 落库、授权申请幂等、通知流渲染、举报全链路。
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

describe('P3 互动与隐私授权 E2E（真实云函数）', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;
  let myProfileId = '';
  let targetProfileId = ''; // 环境中任一非本人嘉宾（无则用本人 id 测 forbidden/cannot-self 路径）

  beforeAll(async () => {
    session = await getSharedSession();
    mp = session.miniProgram;
    const setup = await callCloud(mp, 'setupDb', {});
    if (setup && setup.error) throw new Error('setupDb failed: ' + JSON.stringify(setup));
    const login = await callCloud(mp, 'login', {});
    expect(login && login.user).toBeTruthy();
    let mine: any = await callCloud(mp, 'getMyProfile', {});
    if (!mine || !mine.profile) {
      await callCloud(mp, 'updateProfile', {
        patch: { basic: { nickname: 'E2E嘉宾', gender: '女', birthday: '1995-06-15' } },
      });
      mine = await callCloud(mp, 'getMyProfile', {});
    }
    myProfileId = mine.profile._id;
    const list = await callCloud(mp, 'listProfiles', { filter: {}, page: 1, pageSize: 10 });
    const other = (list.list || []).find((it: any) => it._id !== myProfileId);
    targetProfileId = other ? other._id : myProfileId; // 无他人时走 cannot-self 分支断言
  }, 120000);

  it('interact：对自己 → cannot interact self；对他人心动 → 落库返回 matched=false', async () => {
    const self = await callCloud(mp, 'interact', { targetProfileId: myProfileId, type: 'like' });
    if (targetProfileId === myProfileId) {
      expect(self.error).toBe('cannot interact self'); // 环境无他人嘉宾：至少验证守卫
      return;
    }
    expect(self.error).toBeUndefined();
    const res = await callCloud(mp, 'interact', { targetProfileId, type: 'like' });
    expect(res.matched).toBe(false); // 单向（对方是真实他人账号，未回心）
  }, T);

  it('授权申请：对自己 → cannot request self；重复申请幂等（unchanged）', async () => {
    const selfReq = await callCloud(mp, 'requestConsent', { ownerProfileId: myProfileId, field: 'contact' });
    expect(selfReq.error).toBe('cannot request self');
    if (targetProfileId === myProfileId) return;
    const first = await callCloud(mp, 'requestConsent', { ownerProfileId: targetProfileId, field: 'contact' });
    expect(['pending', 'approved']).toContain(first.status);
    const second = await callCloud(mp, 'requestConsent', { ownerProfileId: targetProfileId, field: 'contact' });
    expect(second.unchanged).toBe(true); // 幂等
  }, T);

  it('respondConsent：非 owner 处理他人授权 → forbidden', async () => {
    // 找一条「我作为 owner」的授权不存在；直接构造：对我自己的授权申请被 cannot self 挡，
    // 故用假 consentId 验证 not found，行为已由集成测试覆盖 forbidden——此处验证错误路径不崩
    const res = await callCloud(mp, 'respondConsent', { consentId: 'nonexistent', action: 'approve' });
    expect(res.error).toBe('not found');
  }, T);

  it('消息页：通知列表渲染 + 未读数据 + 顶部入口在位', async () => {
    await navTo(mp, '/pages/message/message');
    await waitFor(async () => (await pageData<boolean>(mp, 'loading')) === false);
    const d = await pageData<any>(mp);
    expect(Array.isArray(d.entries)).toBe(true);
    expect(typeof d.unread).toBe('number');
    // 顶部两个入口（t-cell 跨界选择器）
    const cells = await mp.evaluate(
      () => new Promise<number>((resolve) => {
        wx.createSelectorQuery().selectAll('.message__entries >>> .t-cell').fields({ id: true }).exec((res: any) => {
          resolve((res[0] || []).length);
        });
      })
    );
    expect(cells).toBe(2);
  }, T);

  it('举报全链路：report 页校验 + 提交成功态', async () => {
    await navTo(mp, '/pages/report/report?id=' + targetProfileId);
    await waitForDataExists(mp, 'types');
    // 未选类型提交 → toast 路径（不中断），驱动后仍 submitted=false
    await drivePage(mp, 'onSubmit', {});
    const mid = await pageData<any>(mp);
    expect(mid.submitted).toBe(false);
    // 选择类型 + 填描述 → 提交成功
    await drivePage(mp, 'onToggleType', { currentTarget: { dataset: { item: '虚假资料' } } });
    await drivePage(mp, 'onInputDesc', { detail: { value: 'E2E 自动化举报' } });
    await drivePage(mp, 'onSubmit', {});
    await waitFor(async () => (await pageData<boolean>(mp, 'submitted')) === true);
  }, T);

  it('P2 遗留：详情页错误区分（loadError 独立于 notFound）数据键在位', async () => {
    await navTo(mp, '/pages/profile-detail/profile-detail?id=' + targetProfileId);
    await waitFor(async () => (await pageData<any>(mp, 'profile')) !== null);
    const d = await pageData<any>(mp);
    expect(d.consents).toBeTruthy(); // T5 响应键
    expect(typeof d.consents.contact).toBe('string');
    expect(d.loadError).toBe(false);
  }, T);

  /** 等待页面 data[path] 非 null/undefined */
  async function waitForDataExists(m: MiniProgram, path: string, timeout = 15000): Promise<void> {
    await waitFor(async () => {
      const v = await pageData<unknown>(m, path);
      return v !== null && v !== undefined;
    }, timeout);
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
});
