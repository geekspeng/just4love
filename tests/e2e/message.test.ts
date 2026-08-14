/**
 * 消息页 E2E 测试 —— 用 skill 模板生成，验证模板可用性
 */
import {
  connectOrLaunch,
  closeSession,
  currentRoute,
  pageData,
  runInApp,
  TEST_TIMEOUT as T,
  MiniProgram,
  ConnectedSession,
} from './helpers';

describe('消息页 E2E', () => {
  let session: ConnectedSession;
  let mp: MiniProgram;

  beforeAll(async () => {
    session = await connectOrLaunch();
    mp = session.miniProgram;
  }, 120000);

  afterAll(() => closeSession(session));

  it('进入消息页', async () => {
    await mp.switchTab('/pages/message/message');
    expect(await currentRoute(mp)).toContain('message');
  }, T);

  it('会话数据符合预期', async () => {
    const sessions = await pageData<
      { id: string; nickname: string; unread: number }[]
    >(mp, 'sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].nickname).toBe('小鱼');
    expect(sessions[0].unread).toBe(1);
  }, T);

  it('点击会话可触发（onTapSession）', async () => {
    const ok = await runInApp(mp, () => {
      const page = getCurrentPages().slice(-1)[0] as unknown as {
        onTapSession: (e: { currentTarget: { dataset: Record<string, string> } }) => void;
      };
      page.onTapSession({ currentTarget: { dataset: { id: 's_demo_1' } } });
      return true;
    });
    expect(ok).toBe(true);
  }, T);
});
