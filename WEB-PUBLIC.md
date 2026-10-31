# Maple web multiplayer — 在线试玩

> **流畅自测（自己画面不闪不卡）请用本机：** http://127.0.0.1:47821/  
> 公网隧道给同学联机用；隧道 RTT 会让联机更卡，但**本机闪/卡**应先在 localhost 验证已修好。


## 点这个链接玩（HTTPS）

**主链接（Cloudflare，已验证双端同房 + Maple 聊天）：**

### https://expected-shoe-geographical-engaging.trycloudflare.com

备用：
- https://ojxxp-36-132-228-164.free.pinggy.net （免费约 60 分钟）
- https://4559b23eaadd33.lhr.life
- https://twelve-items-remain.loca.lt （可能有点一下确认的页面）

> 当前是本机 `npm run web` + 公网隧道。**请保持电脑开机、别杀进程。**  
> 永久地址需要 Fly 登录后 deploy → 预计 `https://maple-english-demo.fly.dev`

## 怎么玩（3 步）

1. 打开上面的 HTTPS 链接（手机/电脑浏览器都行，不用装 Java）
2. 输入昵称 → **创建房间**，把 **房间码** 发给同学；或填同学的房间码 **加入**
3. WASD 走路，鼠标转头，Enter 用英语和 Maple 聊天；同一房间能看到彼此移动

## MVP 范围

**已有：** 公开网页、2–4 人同房、Maple 按昵称打招呼 + 英语陪练（有 OPENAI key 用 GPT，否则本地陪练）、中英落地页  
**未做 / 下步：** 浏览器 Doubao 语音（服务端 `/api/voice` 钩子仍在）、方块建造同步、Fly 永久部署（需 `fly auth login`）  
**未动：** Java Paper + mineflayer 双人路径

## 本机进程

- Web: `http://127.0.0.1:47821`（pid 见 `/tmp/maple-web.pid`）
- Cloudflare tunnel pid: `/tmp/maple-cf2.pid` (fresh 2026-10-30)
