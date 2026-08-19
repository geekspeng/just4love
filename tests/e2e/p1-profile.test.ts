/**
 * P1 登录与资料 E2E —— 真实云环境全链路验证（App 级通道，遵守 e2e-test skill 规则）
 * 云环境已就绪（app.js 已 init 真实 env），本文件驱动真实云函数业务链路：
 *   login（建户/嘉宾编号）→ getMyProfile（编辑页/我的页加载）
 *   → updateProfile（页面保存 → 云端落库 → 重新进入回显 + basicInit 锁定规则）
 * 「遇见」tab（recommend）已接入真实列表（P2），保留结构性断言。
 */
import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  pageData,
  countSelector,
  runInApp,
  navTo,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 轮询直到谓词为真或超时——云函数冷启动耗时不定，勿用固定 sleep */
async function waitFor(fn: () => Promise<boolean>, timeout = 15000, step = 500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await wait(step);
  }
  throw new Error('waitFor 超时');
}

/** 等待页面 data[path] 就绪（onLoad 云调用返回后才有值） */
async function waitForData(mp: MiniProgram, path: string, timeout = 15000): Promise<void> {
  await waitFor(async () => {
    const v = await pageData<unknown>(mp, path);
    return v !== null && v !== undefined && v !== false;
  }, timeout);
}

/** 直连云函数（走小程序运行时 wx.cloud，与业务代码同一通道） */
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

/** 直接驱动当前页面方法（Page 级协议挂死，交互验证走页面方法调用） */
function drivePage(mp: MiniProgram, method: string, event: Record<string, unknown>): Promise<boolean> {
  return mp.evaluate(
    (m: string, ev: Record<string, unknown>) => {
      getCurrentPages().slice(-1)[0][m](ev);
      return true;
    },
    method,
    event
  );
}

interface BasicShape {
  nickname: string;
  gender: string;
  birthday: string;
  signature: string;
}
interface DraftShape {
  basicInit: boolean;
  basic: BasicShape;
  about: { city: string; weight: number | null };
}

describe('P1 登录与资料 E2E（真实云函数）', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;
  // 跨用例共享：it3 保存的值供 it5/it7 断言云端数据一致性
  let savedNickname = '';
  let savedSignature = '';
  const savedRegion = '广东省 深圳市';

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('真实登录：清缓存冷启动触发 login 云函数，建立/恢复用户与嘉宾编号', async () => {
    await runInApp(mp, () => {
      wx.clearStorageSync();
      return true;
    });
    // reLaunch 重建 mine 实例：清掉复用 IDE 时跨会话残留的 data.user，确保 onShow 全新登录
    await navTo(mp, '/pages/mine/mine');
    // mine.onShow → ensureLogin → login 云函数（真实建 users 文档 + counters/guestNo 自增）
    await waitForData(mp, 'user');
    const user = await pageData<{ userId: string; openid: string; guestNo: string; role: string }>(mp, 'user');
    expect(user.userId).toBeTruthy();
    expect(user.openid).toBeTruthy();
    expect(user.guestNo).toMatch(/^J\d{4}$/);
    expect(user.role).toBe('normal');
    // 登录态写入本地缓存（轮询等待异步登录落盘），userId 一致
    let cached: { userId?: string } = {};
    await waitFor(async () => {
      cached = await runInApp<{ userId?: string }>(mp, () => wx.getStorageSync('j4l_user'));
      return !!(cached && cached.userId);
    });
    expect(cached.userId).toBe(user.userId);
  }, T);

  it('资料编辑页经 getMyProfile 加载云端草稿（首次为空模板）', async () => {
    await navTo(mp, '/pages/profile-edit/profile-edit');
    await waitForData(mp, 'draft');
    const d = await pageData<{
      familyBackground: string[];
      pickerVisible: boolean;
      pickerOptions: { label: string; value: string | number }[];
      draft: { userId: string; basic: object; about: { weight: number | null } };
    }>(mp);
    expect(d.familyBackground).toHaveLength(12);
    // 共享 t-picker 初始未打开（选项池由 PICKER_DEFS 在打开时注入）
    expect(d.pickerVisible).toBe(false);
    expect(d.pickerOptions).toEqual([]);
    expect(d.draft).toBeTruthy();
    expect(d.draft.basic).toBeTruthy();
    // 体重字段随模板补齐（重复运行时云端可能已存数字，只断言键存在）
    expect(Object.prototype.hasOwnProperty.call(d.draft.about, 'weight')).toBe(true);
    // 真实链路：草稿 userId 来自 login 返回的 user（云端无资料时也非空）
    const cached = await runInApp<{ userId: string }>(mp, () => wx.getStorageSync('j4l_user'));
    expect(d.draft.userId).toBe(cached.userId);
  }, T);

  it('真实保存链路：页面保存 → updateProfile 云函数落库 → 重新进入云端回显', async () => {
    await navTo(mp, '/pages/profile-edit/profile-edit');
    await waitForData(mp, 'draft');
    const d0 = await pageData<DraftShape>(mp, 'draft');
    // basicInit 前昵称/性别/生日必填；已初始化则复用云端锁定值（保证重复运行幂等）
    const nickname = d0.basic.nickname || '云测嘉宾';
    await drivePage(mp, 'onInput', {
      currentTarget: { dataset: { path: 'basic.nickname' } },
      detail: { value: nickname },
    });
    if (!d0.basic.gender) {
      await drivePage(mp, 'onOpenPicker', { currentTarget: { dataset: { field: 'basic.gender' } } });
      await drivePage(mp, 'onPickerConfirm', { detail: { value: ['女'] } });
    }
    if (!d0.basic.birthday) {
      await drivePage(mp, 'onOpenBirthday', {});
      await drivePage(mp, 'onBirthdayConfirm', { detail: { value: '1995-06-15' } });
    }
    // 共享 t-picker 链路：体重（数字入库）与房产（隐私下拉）
    await drivePage(mp, 'onOpenPicker', { currentTarget: { dataset: { field: 'about.weight' } } });
    await drivePage(mp, 'onPickerConfirm', { detail: { value: [50] } });
    await drivePage(mp, 'onOpenPicker', { currentTarget: { dataset: { field: 'privacy.asset.house' } } });
    await drivePage(mp, 'onPickerConfirm', { detail: { value: ['有房无贷'] } });
    // 双列联动 t-picker 链路：现居地 省+市
    await drivePage(mp, 'onOpenRegion', { currentTarget: { dataset: { field: 'about.city' } } });
    await drivePage(mp, 'onRegionConfirm', { detail: { value: ['广东省', '深圳市'] } });
    // 唯一值证明本次真实写入云端（而非缓存/旧数据回显）——签名仍是自由输入
    savedSignature = 'E2E-' + Date.now();
    await drivePage(mp, 'onInput', {
      currentTarget: { dataset: { path: 'basic.signature' } },
      detail: { value: savedSignature },
    });
    savedNickname = nickname;

    // 触发真实保存：onSave → updateProfile 云函数（成功后页面的 navigateBack 因
    // reLaunch 后无上一页而静默失败，不作为成功信号）
    await drivePage(mp, 'onSave', {});
    // 直接轮询云端落库（比 UI 返回信号更硬的业务验证）：含新字段 weight/house/region
    await waitFor(async () => {
      const cur = await callCloud(mp, 'getMyProfile');
      return !!(cur && cur.profile && cur.profile.about
        && cur.profile.about.city === savedRegion
        && cur.profile.about.weight === 50
        && cur.profile.basic && cur.profile.basic.signature === savedSignature
        && cur.profile.privacy && cur.profile.privacy.asset
        && cur.profile.privacy.asset.house === '有房无贷');
    }, 20000);

    // 重新进入（reLaunch 重建页面实例）：getMyProfile 从云端取回刚才保存的资料
    await navTo(mp, '/pages/profile-edit/profile-edit');
    await waitFor(async () => {
      const d = await pageData<{ about: { city: string } } | null>(mp, 'draft');
      return !!(d && d.about && d.about.city === savedRegion);
    }, 15000);
    const d1 = await pageData<DraftShape>(mp, 'draft');
    expect(d1.about.city).toBe(savedRegion);
    expect(d1.about.weight).toBe(50); // 数字经共享 t-picker 入库后回显
    expect(d1.basic.signature).toBe(savedSignature);
    expect(d1.basic.nickname).toBe(nickname);
    expect(d1.basicInit).toBe(true); // 昵称/性别/生日齐备后云端置位
  }, 60000);

  it('basicInit 业务规则：updateProfile 拒改昵称、同值重提允许（直连云函数）', async () => {
    const cur = await callCloud(mp, 'getMyProfile');
    expect(cur.profile).toBeTruthy();
    const basic = cur.profile.basic as Record<string, string>;
    expect(basic.nickname).toBe(savedNickname);

    // 整段重提但改昵称 → 云端拒绝，不落库
    const locked = await callCloud(mp, 'updateProfile', {
      patch: { basic: { ...basic, nickname: basic.nickname + 'X' } },
    });
    expect(locked.error).toBe('basic locked');

    // 同值整段重提（真实客户端保存语义）→ 允许，且不破坏其他段
    const same = await callCloud(mp, 'updateProfile', {
      patch: { basic },
    });
    expect(same.error).toBeUndefined();
    expect(same.profile).toBeTruthy();

    const after = await callCloud(mp, 'getMyProfile');
    expect(after.profile.basic.nickname).toBe(savedNickname);
    expect(after.profile.basic.signature).toBe(savedSignature);
    expect(after.profile.about.city).toBe(savedRegion);
  }, T);

  it('我的页：菜单完整 + 真实登录态 + 云端资料概览', async () => {
    // 经 recommend 中转强制触发 mine.onShow（tab 页切同 tab 不重跑）
    await mp.switchTab('/pages/recommend/recommend');
    await mp.switchTab('/pages/mine/mine');
    const menus = await pageData<{ id: string; label: string }[]>(mp, 'menus');
    expect(menus.map((m) => m.id)).toEqual([
      'edit', 'album', 'story', 'tags', 'preview', 'settings',
    ]);
    const user = await pageData<{ guestNo: string }>(mp, 'user');
    expect(user.guestNo).toMatch(/^J\d{4}$/);
    // onShow 的 getMyProfile：资料概览来自云端（前一用例已保存）
    await waitForData(mp, 'profileSummary');
    const summary = await pageData<{ nickname: string }>(mp, 'profileSummary');
    expect(summary.nickname).toBe(savedNickname);
  }, T);

  it('相册/标签页云端加载后结构正确', async () => {
    await navTo(mp, '/pages/album-edit/album-edit');
    await waitFor(async () => (await pageData<unknown[]>(mp, 'slots')).length > 0);
    const slots = await pageData<{ category: string; fileID: string }[]>(mp, 'slots');
    expect(slots.map((s) => s.category)).toEqual([
      '日常生活', '兴趣爱好', '旅行经历', '家有萌宠', '健身运动',
    ]);

    await navTo(mp, '/pages/tags-edit/tags-edit');
    await waitFor(async () => (await pageData<unknown[]>(mp, 'pools')).length > 0);
    const pools = await pageData<{ key: string; items: { name: string; selected: boolean }[] }[]>(mp, 'pools');
    expect(pools.map((p) => p.key)).toEqual(['hobby', 'personality', 'food', 'media']);
    expect(pools[0].items.length).toBeGreaterThanOrEqual(6);
  }, T);

  it('预览页展示云端真实资料卡（他人视角，隐私不显示明文）', async () => {
    await navTo(mp, '/pages/profile-preview/profile-preview');
    await waitForData(mp, 'profile');
    expect(await currentRoute(mp)).toContain('profile-preview');
    // 资料来自云端（getMyProfile），昵称为上一用例保存的真实值
    const profile = await pageData<{ basic: { nickname: string } }>(mp, 'profile');
    expect(profile.basic.nickname).toBe(savedNickname);
    // 本机 DevTools 页面级查询匹配不到自定义组件标签，用 >>> 跨边界选组件根节点 .pc 计数
    expect(await countSelector(mp, '.preview >>> .pc')).toBe(1);
    // 隐私占位卡为页面级节点：断言 🔒 占位卡存在 = 隐私字段以占位符而非明文渲染
    expect(await countSelector(mp, '.preview__privacy')).toBe(1);
  }, T);

  it('设置页菜单与协议页内容', async () => {
    await navTo(mp, '/pages/settings/settings');
    expect(await currentRoute(mp)).toContain('settings');
    const menus = await pageData<{ id: string }[]>(mp, 'menus');
    expect(menus.map((m) => m.id)).toEqual([
      'help', 'about', 'user', 'privacy', 'logout', 'delete',
    ]);

    await navTo(mp, '/pages/agreement/agreement?type=privacy');
    await wait(800);
    const doc = await pageData<{ title: string; paragraphs: string[] }>(mp, 'doc');
    expect(doc.title).toBe('隐私政策');
    expect(doc.paragraphs.length).toBeGreaterThanOrEqual(4);
  }, T);

  it('「遇见」tab 已接入真实列表（结构性断言）', async () => {
    await mp.switchTab('/pages/recommend/recommend');
    // 列表数量随真实环境数据变化，只断言容器与 data 形状
    expect(await countSelector(mp, '.recommend__list')).toBe(1);
    const list = await pageData<any[]>(mp, 'list');
    expect(Array.isArray(list)).toBe(true);
  }, T);
});
