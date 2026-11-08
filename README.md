# Maple — a Minecraft English companion

Maple is a Minecraft Java bot that joins your world, talks with you in English, and walks with you while you play. She is a patient tutor-friend: she corrects you gently, teaches words from the blocks and tools around you, and keeps replies short enough for chat.

She can practice with a built-in tutor when you have no API key. When `ANTHROPIC_API_KEY` is set, typed chat asks **Claude Opus 5.5** (`claude-opus-5-5`) to write the reply. Spoken classroom practice uses Doubao realtime voice instead: Maple hears you, answers, and talks back.

There are two ways to play. **The classroom path is Minecraft Java.** Maple joins with Mineflayer, you speak English into a microphone window on the same computer, and you hear her voice there while she chats and walks inside the Java world. **The browser page is a separate voxel island for typing.** It is not Mojang’s client. Do not use it when you want the microphone in Java. The steps are in [DEMO.md](DEMO.md).

[中文说明](#中文)

## Classroom voice in Minecraft Java

This is the path that uses a real Java client and a microphone.

```bash
npm install
cp .env.example .env
npm run server    # terminal 1: Paper 1.21.4, offline mode
npm start         # terminal 2: Maple joins, and prints the mic URL
```

In Minecraft Java, add `127.0.0.1:25565` and join. Then, on the same computer, open the URL `npm start` prints (default [http://127.0.0.1:47822](http://127.0.0.1:47822)). Type your Minecraft name, click **Start talking · 开始说话**, and speak English.

Set `DOUBAO_APP_ID` and `DOUBAO_ACCESS_KEY` in `.env` first. Optional: `DOUBAO_SECRET_KEY`. The keys stay in the Node process. The mic page never receives them. You hear Maple from that window, because the Java client has no microphone API for bots. Her reply is also written in the game chat. `follow me`, `come here`, `stop`, `look at me`, `what is this block?`, and `how do I craft a pickaxe?` move her or teach a real recipe.

Without those keys, skip the mic window and type to her in the game. The local tutor still answers. Full Mac steps: [DEMO.md](DEMO.md).

## Try typing in a browser

```bash
npm install
cp .env.example .env
npm run web
```

Open [http://127.0.0.1:47821](http://127.0.0.1:47821). The landing page is in English and Chinese. Choose **Try it in the browser**, click the world, walk with W A S D, and type English in the chat.

Leave `ANTHROPIC_API_KEY` empty and Maple still answers with the local tutor. Put the key only in the server environment when you want Claude Opus 5.5 (`claude-opus-5-5`). The browser bundle never receives the key. Public chat is limited to about one message every 1.5 seconds and 20 messages per 10 minutes per visitor, plus a site-wide cap.

Type in this page. The classroom microphone is the Java path above, not this island.

This island is a voxel world in the page, not Mojang's client and not a full Paper server. A public always-on Java server is a poor fit for a casual demo (memory, the EULA, and the fact that visitors would still need a desktop client). The browser world keeps Maple's corrections, block names, and crafting lessons. Spoken Doubao voice belongs on the Java bot.

`npm run web` builds the page and serves the site and the API from one Node process. `docker compose up --build` does the same in a container. See [Deploy the website](#deploy-the-website).

## What you need

- Node.js 22 or newer
- A Minecraft **Java** server Maple can join
- Java 21, only if you want the local Paper server in this repo
- An Anthropic API key, only if you want Claude instead of the local tutor

You do **not** need a paid Minecraft account to play on an offline / cracked server, including the local server below. That is Mineflayer's normal offline mode. A premium Microsoft account is required only when the server has `online-mode=true`.

## Quick start

```bash
npm install
cp .env.example .env
npm run server    # terminal 1: Paper 1.21.4, offline mode
npm start         # terminal 2: Maple joins
```

In the Minecraft client, add a server at `127.0.0.1:25565` and join. Offline mode accepts any username. Say hello to Maple in chat, or open the mic window from `npm start` and speak. See [Classroom voice](#classroom-voice-in-minecraft-java).

Leave `ANTHROPIC_API_KEY` empty the first time. Maple still answers. Add the key when you want Claude Opus 5.5.

## Dig three stones

Off unless you set `DIG_STONE_QUEST=1` or `QUEST=digstone` (also `dig_stone` or `digStone`). Maple — not Spark — then teaches one tiny mining step and will not say the next English line until the kid does it in the world: stand next to stone, break three stone blocks, then `Good job! Three stones!` Chat does not skip a step. How to join `127.0.0.1:25565` and which blocks count: [docs/dig-stone-quest.md](docs/dig-stone-quest.md).

Try the same conversation without a game:

```bash
npm run demo
```

## Pinned Minecraft version

Mineflayer 4.39 supports Java Edition **1.8 through 26.1** (including 1.21.4, 1.21.11, and 26.1). It does not list Paper **26.2** or **26.3**. This project pins **1.21.4**, which matches a current Paper build and the recipe data Maple uses.

| Setting | Value |
| --- | --- |
| `MC_VERSION` | `1.21.4` (default) |
| Local server | Paper 1.21.4 build 232 |
| `MC_VERSION=auto` | Mineflayer detects the server. Use this only for a version it supports. |

If chat or login fails with a protocol error, the server is newer or older than the pin. Point Maple at a 1.21.4 server, or set `MC_VERSION` to another version Mineflayer documents.

## Two ways to sign in

### Offline / cracked / local (no paid account)

Server `server.properties`:

```properties
online-mode=false
enforce-secure-profile=false
```

`enforce-secure-profile=false` lets offline accounts chat. The local server script sets both. In `.env`:

```properties
MC_AUTH=offline
MC_USERNAME=Maple
```

The username is 3–16 letters, numbers, or underscores. It is the name players see.

### Online-mode (premium)

The bot needs its own Microsoft account that owns Java Edition. That is the same requirement Mineflayer has for online servers. In `.env`:

```properties
MC_AUTH=microsoft
MC_USERNAME=your.email@example.com
```

On first launch Maple prints a device-login URL and code. Sign in with the bot's Microsoft account. Tokens are cached in `.minecraft-auth/` (gitignored). Your player account and the bot account must be different, or the server will kick one of you.

## Configuration

Copy `.env.example` to `.env`. Nothing secret is hardcoded.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MC_HOST` | `127.0.0.1` | Server address |
| `MC_PORT` | `25565` | Server port. `npm run server` reads this too |
| `MC_USERNAME` | `Maple` | Bot name, or Microsoft login in online mode |
| `MC_AUTH` | `offline` | `offline` or `microsoft` |
| `MC_VERSION` | `1.21.4` | Protocol version, or `auto` |
| `MC_PLAYER` | empty | If set, Maple only answers these names (comma-separated). Set this on a public server |
| `MC_GREET` | `true` | Say hello on join. Skipped while the dig-stone quest is on, so the quest line is the hello |
| `DIG_STONE_QUEST` | off | `1` turns on the gated dig-three-stones tutorial for Maple. `QUEST=digstone` does the same (`dig_stone` and `digStone` too). See [docs/dig-stone-quest.md](docs/dig-stone-quest.md) |
| `CHAT_MODE` | `chat` | `chat` talks to everyone nearby. `whisper` uses `/tell` |
| `CHAT_MAX_LINE_CHARS` | `180` | Minecraft allows 256. Shorter lines are easier to read |
| `CHAT_MAX_LINES` | `3` | Most replies are cut after this many lines |
| `CHAT_MIN_INTERVAL_MS` | `900` | Pause between Maple's lines so the server does not kick her for spam |
| `PLAYER_MIN_INTERVAL_MS` | `1200` | How fast one player may talk to her |
| `GLOBAL_TURNS` / `GLOBAL_WINDOW_MS` | `6` / `30000` | Shared cap so a busy server cannot drain the API |
| `ENGLISH_DIFFICULTY` | `beginner` | `beginner` or `intermediate` |
| `ANTHROPIC_API_KEY` | empty | Empty uses the local tutor |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude Opus 5.5. Fixed id, no date suffix. Override if Anthropic renames it |
| `ANTHROPIC_MAX_TOKENS` | `2048` | Covers thinking plus the short reply. Thinking cannot be turned off on this model |
| `ANTHROPIC_EFFORT` | `low` | `low` keeps chat fast. Also `medium`, `high`, `xhigh`, `max` |
| `DOUBAO_APP_ID` | empty | Volcengine speech app id. With `DOUBAO_ACCESS_KEY`, `npm start` opens Doubao voice |
| `DOUBAO_ACCESS_KEY` | empty | Access token. Stays in this process. Never put it in the mic page |
| `DOUBAO_SECRET_KEY` | empty | Optional secret / API key header |
| `VOICE_PORT` | `47822` | Mic window port. Open `http://127.0.0.1:47822` on the same computer |
| `VOICE_HOST` | `127.0.0.1` | Bind address for the mic window. Leave it on localhost |
| `VOICE_COMPANION` | `true` | Set `false` to skip the mic window. Typed game chat still works |

Model docs: <https://platform.claude.com/docs/en/models/opus-5-5/overview>

## Play together

Join the same server as Maple and talk in public chat. She also answers a `/msg Maple ...` whisper, and whispers back.

| Say this | Maple does |
| --- | --- |
| Any sentence | Practices English. Beginners get one gentle correction |
| `follow me` or `come with me` | Follows you. She does not dig or fight |
| `come here` | Walks to where you are standing |
| `stop` or `wait here` | Stops and stays |
| `look at me` | Turns to face you |
| `what is this block?` | Looks at the block you are looking at and teaches the word |
| `how do I craft a pickaxe?` | Teaches a real recipe from Minecraft 1.21.4 data (oak planks and sticks for a wooden pickaxe) |
| `beginner` or `intermediate` | Changes how simple her English is |
| `help` | Lists what she can do |

`pickaxe` means the wooden one, the first tool you need. You can also ask for a stone pickaxe, sticks, a crafting table, a torch, or a furnace.

She will not run server commands. A message that starts with `/` gets a short refusal, and her own replies never start with `/`.

## Sample session

`npm run demo` prints this local-tutor walkthrough. The same lines work in game.

```text
<Steve> Hello! I want go mining.
<Maple> Nice try. You can say: "Hello! I want to go mining." What do you want to do next?

<Steve> follow me
<Maple> I will follow you. "Follow me" means walk behind me.

<Steve> what is this block?
<Maple> This is an oak log. It is wood from an oak tree. You can make planks with it.

<Steve> how do I craft a pickaxe?
<Maple> A wooden pickaxe is your first mining tool. It mines stone. Crafting grid — row 1: Oak Planks, Oak Planks, Oak Planks; row 2: empty, Stick, empty; row 3: empty, Stick, empty.

<Steve> let us use intermediate English
<Maple> We can use intermediate English now. I will add a few new words as we play.

<Steve> come here
<Maple> On my way. "Come here" is what you say when you want someone to walk to your spot.
```

With a key in `.env`:

```bash
npm run demo -- --claude
```

That sends one sample turn to `claude-opus-5-5`. In game, `npm start` uses Claude for every reply when the key is present, and falls back to the local tutor if the API errors.

## Connect to a server you already have

1. Match `MC_HOST`, `MC_PORT`, and `MC_VERSION` to that server.
2. Use `MC_AUTH=offline` only if `online-mode=false`.
3. Set `MC_PLAYER` to your username so Maple ignores other people.
4. `npm start`.

Vanilla dedicated servers work the same way as Paper. Singleplayer does not accept bots. Open to LAN is not a real server. Use the Paper script, or a dedicated server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Connect Maple to Java, and open the local mic window when Doubao keys are set |
| `npm run server` | Download (once) and start Paper 1.21.4. Writes `eula=true`. Read <https://aka.ms/MinecraftEULA> first |
| `npm run demo` | Scripted English practice, no Minecraft |
| `npm run demo -- --claude` | One Claude Opus 5.5 reply |
| `npm test` | Unit tests for chat limits, intents, recipes, and the practice script |
| `npm run typecheck` | TypeScript |
| `npm run smoke` | Two bots on a running 1.21.4 server: correction, recipe, and follow. Used to check the loop |

The local server files live in `.local-server/` and are not committed. Stop the server with Ctrl+C in that terminal.

## How the loop works

1. Mineflayer joins the server (offline or Microsoft).
2. Public chat `<Name> message`, and whispers, are parsed. Maple ignores herself.
3. A rate limiter drops floods. One fast message gets a single "speak a little slower" line.
4. A small intent parser handles follow, come, wait, look, "what is this block?", crafting questions, and difficulty. Movement starts immediately.
5. Pathfinder follows or walks over. Maple cannot break or place blocks (`canDig` is off, and she carries no scaffolding).
6. The reply is either Claude or the local tutor. Crafting grids come from `minecraft-data` for the pinned version, and Claude is told to teach that grid instead of inventing one.
7. The reply is split to at most `CHAT_MAX_LINES` lines of `CHAT_MAX_LINE_CHARS`, then sent with a gap between lines.
8. Spoken English uses the mic window. Doubao returns text and audio. The text is written in the game chat. Follow, come, stop, look, and block inspection run on the same Mineflayer bot.

Claude Opus 5.5 always uses adaptive thinking. This project does not send `thinking: { type: "disabled" }` (the API rejects it). Effort is `low` by default. Only `text` blocks are shown in chat. Earlier turns are stored as plain text so a changing world snapshot cannot invalidate thinking blocks.

## Layout

```text
src/index.ts            desktop bot
src/bot/voiceCompanion.ts  mic window beside Java (default :47822)
src/bot/voiceBridge.ts  Doubao text and actions -> Mineflayer
web/companion/          mic page (not the voxel island)
src/web/server.ts       browser typing demo: site and /api/chat
web/public/             landing page and play page
web/client/             voxel world
src/voice/              Doubao duplex client (keys stay here)
src/config.ts           environment
src/bot/run.ts          connection, chat, reconnect, mic window
src/chat/turn.ts        one player turn
src/chat/claude.ts      Anthropic Messages API
src/chat/fallback.ts    local tutor
src/behavior/intents.ts play commands
src/behavior/actions.ts follow, come, look
src/behavior/recipes.ts crafting lessons
scripts/demo.ts         scripted walkthrough
scripts/smoke.ts        in-game check
scripts/start-local-server.sh
```

## Troubleshooting

- **Maple never appears.** The server is still starting, the port does not match, or `online-mode=true` while `MC_AUTH=offline`.
- **She joins but never answers.** Chat is unsigned. Set `enforce-secure-profile=false` on an offline server. On a public server, set `MC_PLAYER` to your exact name. Prefixed chat such as `[VIP] Steve: hi` is ignored; use `/msg Maple hi`.
- **Protocol / version error.** Stay on 1.21.4, or set `MC_VERSION` to a version Mineflayer 4.39 supports. 26.2 and 26.3 are outside that list.
- **`[Not Secure]` in the server log.** Normal for offline chat. Players still see the sentence.
- **She says she is stuck.** She will not mine through walls. Walk back to her.
- **Claude is silent.** The key, model id, or `ANTHROPIC_MAX_TOKENS` is wrong. Maple logs the error and uses the local tutor for that turn. Raising `ANTHROPIC_MAX_TOKENS` helps if thinking uses the whole budget.
- **Microsoft login.** Complete the device code in the terminal. Delete `.minecraft-auth/` to sign in as someone else.
- **The play page has no classroom microphone.** `http://127.0.0.1:47821/play` is the browser island. Open the URL from `npm start` (default `http://127.0.0.1:47822`) while Maple is on the Java server.
- **Maple does not hear you.** Allow the microphone in Chrome or Edge. Type your exact Minecraft name in the mic window. Set `DOUBAO_APP_ID` and `DOUBAO_ACCESS_KEY`, then restart `npm start`.
- **You cannot hear her inside the Java client.** That client has no speaker for the bot. Her voice plays in the mic window. The game chat still shows the words. Use headphones if she answers herself.

## Deploy the website

The public site is the browser demo. Deploy the Docker image and set the API key on the host, not in the client.

```bash
docker compose up --build
```

Then open `http://127.0.0.1:47821`. Compose passes `ANTHROPIC_API_KEY` through if it is already in your shell. An empty key keeps the local tutor.

| Host | What to do |
| --- | --- |
| Fly.io | Install `flyctl`. Change `app` in `fly.toml`. `fly launch --no-deploy --copy-config`, then `fly secrets set ANTHROPIC_API_KEY=your-key`, then `fly deploy`. |
| Railway | New project from this repo, Docker build. Set `ANTHROPIC_API_KEY` and leave `PORT` to the platform. |
| Render | New Web Service, Docker runtime. Set `ANTHROPIC_API_KEY`. Render provides `PORT`; the server listens on it. |

The container listens on `PORT` (47821 in Compose). Set `WEB_TRUST_PROXY=true` behind those proxies so rate limits use the visitor address. This environment does not log in to those hosts, so the deploy stops at the Dockerfile, Compose file, and `fly.toml`.

## License

MIT.

---

# 中文

Maple 是一个 Minecraft Java 版机器人。她会进入你的世界，用英语和你聊天，并跟着你一起走。她像一个有耐心的朋友兼老师：轻轻纠正你的句子，用周围的方块和工具教单词，并把回答控制在聊天框能看完的长度。

没有 API key 时，她用内置的本地陪练回答。设置 `ANTHROPIC_API_KEY` 之后，打字聊天会把回复交给 **Claude Opus 5.5**（模型 ID：`claude-opus-5-5`）。课堂里的开口练习走豆包实时语音：她听见你，回答你，并把声音播回来。

有两种玩法。**课堂路径是 Minecraft Java 版。** Maple 用 Mineflayer 进入游戏，你在同一台电脑的麦克风窗口里说英语，在这个窗口里听见她，同时她在 Java 世界里打字和走动。**浏览器页面是另一个用来打字的方块小岛。** 它不是 Mojang 的客户端。想在 Java 版里用麦克风时，不要打开那个页面。步骤见 [DEMO.md](DEMO.md)。

## 在 Minecraft Java 里用语音上课

这是使用真正的 Java 客户端和麦克风的路径。

```bash
npm install
cp .env.example .env
npm run server    # 终端 1：Paper 1.21.4，离线模式
npm start         # 终端 2：Maple 进入游戏，并打印麦克风地址
```

在 Minecraft Java 版里添加 `127.0.0.1:25565` 并进入。然后在同一台电脑上打开 `npm start` 打印的地址（默认 [http://127.0.0.1:47822](http://127.0.0.1:47822)）。填写你的 Minecraft 名字，点击 **Start talking · 开始说话**，用英语开口。

先在 `.env` 里填写 `DOUBAO_APP_ID` 和 `DOUBAO_ACCESS_KEY`。可选 `DOUBAO_SECRET_KEY`。密钥只留在 Node 进程里，麦克风页面拿不到。Java 客户端没有给机器人用的麦克风接口，所以你在这个窗口里听见 Maple。同一句话也会出现在游戏聊天里。`follow me`、`come here`、`stop`、`look at me`、`what is this block?`、`how do I craft a pickaxe?` 会让她移动，或教一个真实配方。

没有这些密钥时，不要开麦克风窗口，直接在游戏里打字。本地陪练仍会回答。Mac 上的完整步骤见 [DEMO.md](DEMO.md)。

## 在浏览器里打字试玩

```bash
npm install
cp .env.example .env
npm run web
```

打开 [http://127.0.0.1:47821](http://127.0.0.1:47821)。首页有中文和英文。点 **Try it in the browser**，再点画面，用 W A S D 走路，在聊天框里用英语说话。

`ANTHROPIC_API_KEY` 留空时，本地陪练仍会回答。只有希望使用 Claude Opus 5.5（`claude-opus-5-5`）时，才把 key 放在服务器环境里。浏览器包里没有 key。公开聊天大约每 1.5 秒一句，每位访客 10 分钟内约 20 句，另外还有全站上限。

在这个页面里打字。课堂麦克风是上面的 Java 路径，不是这个小岛。

这个小岛是页面里的体素世界，不是 Mojang 的客户端，也不是完整的 Paper 服务器。长期对外开着一台 Java 服务器并不适合随便试玩（内存、EULA，而且访客仍然需要桌面客户端）。网页世界保留了 Maple 的纠错、方块单词和合成课。开口的豆包语音属于 Java 机器人。

`npm run web` 会构建页面，并用一个 Node 进程同时提供网页和 API。`docker compose up --build` 在容器里做同样的事。部署步骤见 [部署网站](#部署网站)。

## 环境

- Node.js 22 或更新版本
- 一个 Maple 能加入的 Minecraft **Java** 服务器
- 只有在使用本仓库自带的 Paper 服务器时才需要 Java 21
- 只有在希望由 Claude 写回复时才需要 Anthropic API key

在离线 / 盗版（cracked）服务器上玩，**不需要**付费的 Minecraft 账号，包括下面的本地服务器。这是 Mineflayer 的离线模式。只有服务器开启 `online-mode=true` 时，机器人才需要一个拥有 Java 版的 Microsoft 账号。

## 最快开始

```bash
npm install
cp .env.example .env
npm run server    # 终端 1：Paper 1.21.4，离线模式
npm start         # 终端 2：Maple 进入游戏
```

在 Minecraft 客户端里添加服务器 `127.0.0.1:25565` 并进入。离线模式可以使用任意用户名。在游戏里对 Maple 打字，或打开 `npm start` 的麦克风窗口说话。见 [在 Minecraft Java 里用语音上课](#在-minecraft-java-里用语音上课)。

第一次可以把 `ANTHROPIC_API_KEY` 留空，Maple 仍会回答。需要 Claude Opus 5.5 时再填上 key。

## 挖三块石头

默认关闭。设置 `DIG_STONE_QUEST=1` 或 `QUEST=digstone`（也可以 `dig_stone`、`digStone`）后，只有 Maple 会教这一件小事：走到石头旁边，敲碎三块，然后说 `Good job! Three stones!`。没在世界里做到，就不会说下一句英语。只打字不能跳步。怎么进 `127.0.0.1:25565`、哪些方块算数，见 [docs/dig-stone-quest.md](docs/dig-stone-quest.md)。

不启动游戏也可以看同一段练习：

```bash
npm run demo
```

## 固定的 Minecraft 版本

Mineflayer 4.39 支持 Java 版 **1.8 到 26.1**（含 1.21.4、1.21.11 和 26.1），不包含 Paper **26.2** 和 **26.3**。本项目把版本固定在 **1.21.4**：它有仍在发布的 Paper 构建，也和 Maple 使用的配方数据一致。

| 设置 | 值 |
| --- | --- |
| `MC_VERSION` | `1.21.4`（默认） |
| 本地服务器 | Paper 1.21.4 build 232 |
| `MC_VERSION=auto` | 由 Mineflayer 探测服务器。仅用于它支持的版本 |

如果登录或聊天报协议错误，说明服务器比这个版本新或旧。请改用 1.21.4，或把 `MC_VERSION` 设成 Mineflayer 文档里列出的版本。

## 两种登录方式

### 离线 / cracked / 本地（不需要付费账号）

服务器 `server.properties`：

```properties
online-mode=false
enforce-secure-profile=false
```

`enforce-secure-profile=false` 让离线账号可以说话。本地服务器脚本会写上这两项。`.env`：

```properties
MC_AUTH=offline
MC_USERNAME=Maple
```

用户名是 3 到 16 位字母、数字或下划线，也是游戏里显示的名字。

### 正版在线服务器

机器人需要一个单独的、已购买 Java 版的 Microsoft 账号。这是 Mineflayer 连接正版服务器时的正常要求。`.env`：

```properties
MC_AUTH=microsoft
MC_USERNAME=your.email@example.com
```

第一次启动时，终端会打印设备登录网址和代码。用机器人的 Microsoft 账号完成登录。令牌保存在 `.minecraft-auth/`（已加入 `.gitignore`）。你自己的账号和机器人的账号必须不同，否则服务器会把其中一个踢掉。

## 配置

把 `.env.example` 复制为 `.env`。代码里没有写死任何密钥。

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `MC_HOST` | `127.0.0.1` | 服务器地址 |
| `MC_PORT` | `25565` | 端口。`npm run server` 也会读它 |
| `MC_USERNAME` | `Maple` | 机器人名字；正版模式下是 Microsoft 登录名 |
| `MC_AUTH` | `offline` | `offline` 或 `microsoft` |
| `MC_VERSION` | `1.21.4` | 协议版本，或 `auto` |
| `MC_PLAYER` | 空 | 若填写，Maple 只回复这些玩家（逗号分隔）。公共服务器请一定要填 |
| `MC_GREET` | `true` | 进入游戏时打招呼。挖石头任务开启时会跳过，避免盖过任务的第一句 |
| `DIG_STONE_QUEST` | 关 | 设为 `1` 时，Maple 开启挖三块石头教程。`QUEST=digstone` 同样（也接受 `dig_stone`、`digStone`）。见 [docs/dig-stone-quest.md](docs/dig-stone-quest.md) |
| `CHAT_MODE` | `chat` | `chat` 是附近都能看见的公聊。`whisper` 使用 `/tell` |
| `CHAT_MAX_LINE_CHARS` | `180` | 游戏上限是 256。短一点更好读 |
| `CHAT_MAX_LINES` | `3` | 一条回复最多这么多行 |
| `CHAT_MIN_INTERVAL_MS` | `900` | Maple 每行之间的间隔，避免被服务器当成刷屏踢出 |
| `PLAYER_MIN_INTERVAL_MS` | `1200` | 同一个玩家两次说话的最短间隔 |
| `GLOBAL_TURNS` / `GLOBAL_WINDOW_MS` | `6` / `30000` | 全服共享上限，避免很多人同时说话耗尽 API |
| `ENGLISH_DIFFICULTY` | `beginner` | `beginner`（初级）或 `intermediate`（中级） |
| `ANTHROPIC_API_KEY` | 空 | 留空则使用本地陪练 |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude Opus 5.5。固定 ID，没有日期后缀。若官方改名，在这里覆盖 |
| `ANTHROPIC_MAX_TOKENS` | `2048` | 包含思考和短回复。这个模型不能关闭思考 |
| `ANTHROPIC_EFFORT` | `low` | `low` 让聊天更快。还可以是 `medium`、`high`、`xhigh`、`max` |
| `DOUBAO_APP_ID` | 空 | 火山引擎语音应用的 APP ID。和 `DOUBAO_ACCESS_KEY` 一起填写后，`npm start` 会打开豆包语音 |
| `DOUBAO_ACCESS_KEY` | 空 | Access Token。只留在本进程里，不要写进麦克风页面 |
| `DOUBAO_SECRET_KEY` | 空 | 可选的 Secret / API key 请求头 |
| `VOICE_PORT` | `47822` | 麦克风窗口端口。在同一台电脑打开 `http://127.0.0.1:47822` |
| `VOICE_HOST` | `127.0.0.1` | 麦克风窗口绑定地址。请保持在本机 |
| `VOICE_COMPANION` | `true` | 设为 `false` 则不打开麦克风窗口。游戏里打字仍然可用 |

模型说明：<https://platform.claude.com/docs/en/models/opus-5-5/overview>

## 一起玩

和 Maple 进入同一个服务器，在公聊里说话。你也可以 `/msg Maple ...`，她会悄悄回复你。

| 你说 | Maple 会 |
| --- | --- |
| 任意句子 | 用英语陪练。初级会轻轻改一句 |
| `follow me` 或 `come with me` | 跟着你。她不会挖方块，也不会打怪 |
| `come here` | 走到你站的地方 |
| `stop` 或 `wait here` | 停下并留在原地 |
| `look at me` | 转身看你 |
| `what is this block?` | 看你正在看的方块，并教这个词 |
| `how do I craft a pickaxe?` | 用 Minecraft 1.21.4 的真实配方教你（木镐是橡木木板和木棍） |
| `beginner` 或 `intermediate` | 切换英语难度 |
| `help` | 说明她能做什么 |

只说 `pickaxe` 时，她教的是木镐，也就是第一把镐。你也可以问石镐、木棍、工作台、火把或熔炉。

她不会执行服务器命令。以 `/` 开头的话会得到一句拒绝，她自己的回复也不会以 `/` 开头。

## 一段练习

`npm run demo` 会打印下面这段本地陪练。游戏里可以说同样的话。

```text
<Steve> Hello! I want go mining.
<Maple> Nice try. You can say: "Hello! I want to go mining." What do you want to do next?

<Steve> follow me
<Maple> I will follow you. "Follow me" means walk behind me.

<Steve> what is this block?
<Maple> This is an oak log. It is wood from an oak tree. You can make planks with it.

<Steve> how do I craft a pickaxe?
<Maple> A wooden pickaxe is your first mining tool. It mines stone. Crafting grid — row 1: Oak Planks, Oak Planks, Oak Planks; row 2: empty, Stick, empty; row 3: empty, Stick, empty.

<Steve> let us use intermediate English
<Maple> We can use intermediate English now. I will add a few new words as we play.

<Steve> come here
<Maple> On my way. "Come here" is what you say when you want someone to walk to your spot.
```

`.env` 里已经有 key 时：

```bash
npm run demo -- --claude
```

这会向 `claude-opus-5-5` 发送一轮示例。游戏里只要 key 存在，`npm start` 的每一句回复都走 Claude；API 出错时，这一句会退回本地陪练。

## 连接已有的服务器

1. 让 `MC_HOST`、`MC_PORT`、`MC_VERSION` 和那台服务器一致。
2. 只有 `online-mode=false` 时才使用 `MC_AUTH=offline`。
3. 把 `MC_PLAYER` 设成你的用户名，这样她不会回应别人。
4. 运行 `npm start`。

原版专用服务器和 Paper 的接法相同。单人游戏不能直接进机器人。对局域网开放也不是完整的服务器。请用本仓库的 Paper 脚本，或单独开一个专用服务器。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 让 Maple 进入 Java 版，并在配置了豆包密钥时打开本机麦克风窗口 |
| `npm run server` | 首次会下载并启动 Paper 1.21.4。脚本会写入 `eula=true`。请先阅读 <https://aka.ms/MinecraftEULA> |
| `npm run demo` | 脚本化英语练习，不需要 Minecraft |
| `npm run demo -- --claude` | 向 Claude Opus 5.5 要一句回复 |
| `npm test` | 聊天长度、意图、配方和练习脚本的单元测试 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run smoke` | 在已经运行的 1.21.4 服务器上用两个机器人检查纠错、配方和跟随 |

本地服务器文件在 `.local-server/`，不会提交。在那个终端按 Ctrl+C 停止服务器。

## 循环怎么走

1. Mineflayer 进入服务器（离线或 Microsoft）。
2. 解析公聊 `<名字> 内容` 和悄悄话。Maple 不回应自己。
3. 限流。说得太快时，她只提醒一次 “speak a little slower”。
4. 意图解析负责跟随、过来、等待、看向你、“这是什么方块”、合成问题，以及难度。移动会马上开始。
5. Pathfinder 跟随或走过去。她不能破坏或放置方块（`canDig` 关闭，也不携带搭路方块）。
6. 回复来自 Claude 或本地陪练。合成配方来自固定版本的 `minecraft-data`。交给 Claude 时会附上这个配方，避免她编一个不存在的格子。
7. 回复被拆成最多 `CHAT_MAX_LINES` 行，每行最多 `CHAT_MAX_LINE_CHARS` 个字符，然后隔开再发送。
8. 开口说话走麦克风窗口。豆包返回文字和声音。文字打进游戏聊天，跟随、过来、停下、看向你、看方块，走同一个 Mineflayer 机器人。

Claude Opus 5.5 始终使用自适应思考。本项目不会发送 `thinking: { type: "disabled" }`（API 会拒绝）。默认 effort 是 `low`。聊天里只显示 `text` 块。历史记录只保存纯文本，这样每回合变化的世界信息不会把思考块判为无效。

## 目录

```text
src/index.ts            桌面机器人
src/bot/voiceCompanion.ts  Java 旁边的麦克风窗口（默认 :47822）
src/bot/voiceBridge.ts  豆包的文字和动作 -> Mineflayer
web/companion/          麦克风页面（不是方块小岛）
src/web/server.ts       浏览器打字试玩：页面和 /api/chat
web/public/             首页和游戏页
web/client/             体素世界
src/voice/              豆包双工客户端（密钥留在这里）
src/config.ts           环境变量
src/bot/run.ts          连接、聊天、重连、麦克风窗口
src/chat/turn.ts        处理玩家的一句话
src/chat/claude.ts      Anthropic Messages API
src/chat/fallback.ts    本地陪练
src/behavior/intents.ts 游戏指令
src/behavior/actions.ts 跟随、过来、看向
src/behavior/recipes.ts 合成课
scripts/demo.ts         脚本化练习
scripts/smoke.ts        游戏内检查
scripts/start-local-server.sh
```

## 排错

- **看不到 Maple。** 服务器还在启动，端口不一致，或者服务器是 `online-mode=true` 但 `.env` 仍是 `MC_AUTH=offline`。
- **她进来了但不说话。** 离线聊天未签名。请在离线服务器上设置 `enforce-secure-profile=false`。公共服务器请把 `MC_PLAYER` 设成你的准确名字。带前缀的聊天（例如 `[VIP] Steve: hi`）会被忽略，请改用 `/msg Maple hi`。
- **协议 / 版本错误。** 请使用 1.21.4，或把 `MC_VERSION` 设成 Mineflayer 4.39 支持的版本。26.2 和 26.3 不在支持列表里。
- **服务器日志里出现 `[Not Secure]`。** 离线聊天的正常现象。玩家仍然能看见这句话。
- **她说自己卡住了。** 她不会挖墙。请走回去找她。
- **Claude 没有回复。** key、模型 ID 或 `ANTHROPIC_MAX_TOKENS` 不正确。Maple 会记下错误，这一句改用本地陪练。如果思考用完了 token 预算，把 `ANTHROPIC_MAX_TOKENS` 调高。
- **Microsoft 登录。** 在终端完成设备代码。想换账号时，删除 `.minecraft-auth/`。
- **试玩页没有课堂麦克风。** `http://127.0.0.1:47821/play` 是浏览器小岛。Maple 在 Java 服务器上时，打开 `npm start` 打印的地址（默认 `http://127.0.0.1:47822`）。
- **她听不见你。** 在 Chrome 或 Edge 里允许麦克风。在麦克风窗口填写和游戏里完全一致的名字。设置 `DOUBAO_APP_ID` 和 `DOUBAO_ACCESS_KEY` 后重新运行 `npm start`。
- **Java 客户端里听不见她。** 官方客户端没有给机器人用的扬声器。她的声音在麦克风窗口里播放。游戏聊天仍会显示这句话。如果她回答自己的声音，请戴耳机。

## 部署网站

对外公开的是浏览器试玩。部署 Docker 镜像，把 API key 放在主机上，不要放进前端。

```bash
docker compose up --build
```

然后打开 `http://127.0.0.1:47821`。如果当前 shell 里已有 `ANTHROPIC_API_KEY`，Compose 会把它传进容器。key 为空时仍使用本地陪练。

| 平台 | 做法 |
| --- | --- |
| Fly.io | 安装 `flyctl`。改 `fly.toml` 里的 `app`。依次运行 `fly launch --no-deploy --copy-config`、`fly secrets set ANTHROPIC_API_KEY=你的key`、`fly deploy`。 |
| Railway | 用这个仓库新建项目，选择 Docker。设置 `ANTHROPIC_API_KEY`。`PORT` 交给平台。 |
| Render | 新建 Web Service，运行时选 Docker。设置 `ANTHROPIC_API_KEY`。Render 会提供 `PORT`，服务器会监听它。 |

容器监听 `PORT`（Compose 里是 47821）。在这些反向代理后面请设置 `WEB_TRUST_PROXY=true`，这样限流用的是访客地址。这里没有登录这些平台，所以部署材料停在 Dockerfile、Compose 和 `fly.toml`。

## 许可证

MIT。
