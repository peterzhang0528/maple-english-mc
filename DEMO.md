# Classroom demo: speak English to Maple in Minecraft Java

Maple joins a **Minecraft Java** world as a Mineflayer bot. You speak English into a **microphone window on the same computer**. Doubao turns speech into text, writes Maple’s reply, and speaks it back. You hear her in that window. Inside the game she also types the reply and can follow you.

This is not the browser voxel island at `http://127.0.0.1:47821/play`. That page is only for typing. It is not Mojang’s client, and it is not this demo.

The official Java client cannot give a bot a microphone. The mic window runs beside Minecraft. Headphones help if Maple starts answering her own voice.

## On a Mac that already has the keys

You need Node.js 22+, Java 21, and Minecraft Java (`Minecraft.app`). `DOUBAO_APP_ID` and `DOUBAO_ACCESS_KEY` are already in `.env` on the classroom machine. Do not commit `.env`.

### 1. Start the local Java server

```bash
cd maple-english-mc
npm install
npm run server
```

Leave this terminal open. It starts Paper 1.21.4 in offline mode on `127.0.0.1:25565`. Offline mode is enough. You do not need a paid account.

### 2. Join with Minecraft.app, then start Maple

In **Minecraft.app**: Multiplayer → Add Server → `127.0.0.1:25565` → Join. Pick a name such as `Steve`.

In a second terminal:

```bash
npm start
```

Wait until the log says Maple spawned, then open the mic URL it prints. The default is:

<http://127.0.0.1:47822>

Use Chrome or Edge on the **same Mac**. The page should say this window sits beside Java Minecraft.

### 3. Speak English

1. Type your Minecraft name (`Steve`) in the mic window.
2. Click **Start talking · 开始说话** and allow the microphone.
3. Say:
   - `Hello! I want go mining.` — she corrects you gently, in the window and in the game chat
   - `follow me` — she walks behind you in the Java world
   - `what is this block?` — look at a block in Minecraft first
   - `how do I craft a pickaxe?` — she teaches the wooden pickaxe (oak planks and sticks)

You hear her voice from the Mac speakers (or headphones). The game chat shows the same English. Keys never appear in the page.

Click **Stop · 停止** when you are done.

## If voice does not connect

In-game chat still works. Type the same English sentences to Maple in Minecraft. The local tutor answers. Check that `.env` has `DOUBAO_APP_ID` and `DOUBAO_ACCESS_KEY`, then restart `npm start`.

`npm run web` is the browser typing island. Do not use it for this classroom voice demo.

---

# 课堂演示：在 Minecraft Java 版里对 Maple 说英语

Maple 以 Mineflayer 机器人进入 **Minecraft Java 版**世界。你在**同一台电脑的麦克风窗口**里说英语。豆包负责语音识别、回复和语音合成。你在这个窗口里听见她。游戏里她会把同一句话打进聊天，也可以跟着你走。

这不是 `http://127.0.0.1:47821/play` 的浏览器方块小岛。那个页面只能打字。它不是 Mojang 的客户端，也不是这次演示。

官方 Java 客户端不能给机器人提供麦克风。麦克风窗口跑在 Minecraft 旁边。如果 Maple 开始回答自己的声音，请戴耳机。

## 这台 Mac 上已经有密钥

需要 Node.js 22 或更新版本、Java 21，以及 Minecraft Java（`Minecraft.app`）。课堂电脑的 `.env` 里已经有 `DOUBAO_APP_ID` 和 `DOUBAO_ACCESS_KEY`。不要提交 `.env`。

### 1. 启动本地 Java 服务器

```bash
cd maple-english-mc
npm install
npm run server
```

这个终端保持打开。它会以离线模式启动 Paper 1.21.4，地址是 `127.0.0.1:25565`。离线模式就够用，不需要付费账号。

### 2. 用 Minecraft.app 进入，然后启动 Maple

打开 **Minecraft.app**：多人游戏 → 添加服务器 → `127.0.0.1:25565` → 加入。名字可以用 `Steve`。

另一个终端：

```bash
npm start
```

等到日志里 Maple 已经出生，再打开它打印的麦克风地址。默认是：

<http://127.0.0.1:47822>

在**同一台 Mac** 上用 Chrome 或 Edge 打开。页面上应写明：这个窗口在 Java 版 Minecraft 旁边。

### 3. 说英语

1. 在麦克风窗口里填写你的 Minecraft 名字（`Steve`）。
2. 点击 **Start talking · 开始说话**，并允许麦克风。
3. 说：
   - `Hello! I want go mining.` — 她会轻轻纠正，窗口里和游戏聊天里都能看到
   - `follow me` — 她会在 Java 世界里跟在你后面
   - `what is this block?` — 先在游戏里看着一个方块
   - `how do I craft a pickaxe?` — 她教木镐（橡木木板和木棍）

你从 Mac 的扬声器（或耳机）里听见她。游戏聊天里是同一句英语。密钥不会出现在页面上。

结束时点击 **Stop · 停止**。

## 语音连不上时

游戏里的打字聊天仍然可用。在 Minecraft 里对 Maple 打同样的英语，本地陪练会回答。请确认 `.env` 里有 `DOUBAO_APP_ID` 和 `DOUBAO_ACCESS_KEY`，然后重新运行 `npm start`。

`npm run web` 是浏览器打字小岛。课堂语音不要用那个页面。
