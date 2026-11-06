# Wash-hands quest (handwash)

A gated first-grade tutorial. Maple says one short English line, then waits until the kid does that step. She does not skip ahead.

Default play is unchanged. The quest runs only when you opt in, and only on the Maple persona (not Spark).

## Enable

In the same shell as `npm start`, or in `.env` (do not commit `.env`):

```properties
HANDWASH_QUEST=1
```

`QUEST=handwash` does the same thing. `QUEST=washHands` is accepted too.

Then:

```bash
npm install
npm run server    # terminal 1: Paper 1.21.4, offline, 127.0.0.1:25565
HANDWASH_QUEST=1 npm start
```

Logs should include:

```text
[maple] HANDWASH_QUEST on. Gated wash-hands tutorial.
[maple] handwash quest start player=YourName step=go
[maple] handwash say step=go player=YourName: Go to the water.
```

## Join

1. In Minecraft Java, add server `127.0.0.1:25565` and join. Offline mode accepts any username.
2. Maple should already be in the world. If you are there when she spawns, or when you join after her, she starts the quest.
3. Microphone is optional. The quest itself is the in-game chat lines. To talk as well, open the URL `npm start` prints (default [http://127.0.0.1:47822](http://127.0.0.1:47822)), type your Minecraft name, and click **Start talking**. Voice can add extra words. Step changes still happen only in chat, after the action.

While the quest is running, Maple pauses idle mini-quests, situate chatter, and party banter so she stays on this script. After the last line, normal chat comes back.

## Steps

She will not say the next line until the current condition is true. Stand where Maple can see you (she follows). She only knows about blocks loaded near her body.

| Step | She says | What to do |
| --- | --- | --- |
| 1. Go | `Go to the water.` | Walk to water. Stand in it, or within about two blocks: river, ocean, a water cauldron, or water you poured from a water bucket. Looking at water from far away does not count. |
| 2. Wash | `Wash your hands.` | Stay there for about 4 seconds. Stepping away resets the timer. She will not celebrate early. |
| 3. Done | `Good job! Clean hands!` | Stop. One quest, then done. |

No mods. Detection is Mineflayer watching the player: water / flowing water / bubble column / water cauldron / a waterlogged block next to the feet, standing in water, or emptying a water bucket into a bucket.

If a step sits for about 18 seconds, she adds one short Chinese hint (`去水边。` or `在水边站一会儿。`). English stays the main language. She also repeats the current English line about every 14 seconds.

Typing in chat during the quest does not skip a step. She repeats the current line. `follow me`, `come here`, `stop`, and `look at me` still move her.

## Logs

```text
[maple] handwash step go -> wash player=YourName reason=near-water
[maple] handwash say step=wash player=YourName: Wash your hands.
[maple] handwash wash timer reset player=YourName reason=left-water
[maple] handwash step wash -> done player=YourName reason=held-4000ms
[maple] handwash quest done player=YourName
[maple] handwash say step=done player=YourName: Good job! Clean hands!
```

## 中文（给 Peter）

1. 终端 1：`npm run server`（Paper 离线，`127.0.0.1:25565`）。
2. 终端 2：`HANDWASH_QUEST=1 npm start`。不要把密钥写进提交。
3. Minecraft Java 加入 `127.0.0.1:25565`。麦克风可选：打开启动日志里的本机地址。
4. 走到水边（河里、海里、装了水的炼药锅，或用水桶倒出的水），站在大约两格以内约 4 秒。
5. 聊天会先说 `Go to the water.`，到了水边才说 `Wash your hands.`，站够才说 `Good job! Clean hands!`。没做到不会进入下一步。
