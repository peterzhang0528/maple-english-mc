# 豆包语音进度（给你掌控用）

仓库：[Origin ai-english-minecraft](https://cursor.com/codebase/peter-zhang-3m8wd/ai-english-minecraft)（PRIVATE）

## 状态：语音代码已写完（服务端 + 浏览器 + 测试 + DEMO）

| 文件 | 作用 | 状态 |
|------|------|------|
| `src/voice/config.ts` | 读 DOUBAO_* / VOLC_*，鉴权头，脱敏 | 完成 |
| `src/voice/connect.ts` | 连火山 duplex WS，失败回退 legacy | 完成 |
| `src/voice/protocol.ts` | session / 音频 / tool 协议编解码 | 完成 |
| `src/voice/relay.ts` | 浏览器 ↔ 豆包 双向中继 | 完成 |
| `src/voice/gateway.ts` | `/api/voice` WebSocket 入口 | 完成 |
| `src/voice/tools.ts` | follow/come/stop/look/craft 等动作 | 完成 |
| `web/client/voice.ts` | 「Start talking」麦克风 + 播放 | 完成 |
| `test/voice.test.ts` | 单元测试 | 完成 |
| `DEMO.md` | 课堂演示步骤 | 完成 |
| `.env.example` | DOUBAO_APP_ID / ACCESS_KEY 等说明 | 完成 |

## 你怎么自己打开看

1. Origin：https://cursor.com/codebase/peter-zhang-3m8wd/ai-english-minecraft → 点 `src/voice/`
2. 本机：`~/maple-english-mc/src/voice/`（我会同步过去）
3. 课堂：按 `DEMO.md`，填 `.env` 后 `npm run web`，打开 http://127.0.0.1:47821/play ，点 **Start talking · 开始说话**

## 还没做完

- GitHub 公开推送（box 上 `gh` 未登录）还没做完
- 用你本机密钥做一次真实「开麦」联调（代码已就位，等你确认）
