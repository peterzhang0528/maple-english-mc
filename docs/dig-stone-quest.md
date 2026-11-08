# Dig three stones

Maple's first quest. One tiny Minecraft job, in English, with a gate on every step. She does not move on because the kid typed the right sentence. She moves on when the world shows the step is done.

This is the first quest. `HANDWASH_QUEST` is not used.

Off unless you opt in. Maple only — if Spark's process sees the flag, Spark ignores it.

```bash
DIG_STONE_QUEST=1 npm start
```

Either line turns it on. Do not put an API key in the flag.

```bash
QUEST=digstone
QUEST=dig_stone
QUEST=digStone
```

`QUEST=dig-stone` and `QUEST=dig stone` work too. Other quest names do nothing.

## Try it on 127.0.0.1:25565

1. Terminal 1: `npm run server` (Paper, offline, port `25565`).
2. Terminal 2: `DIG_STONE_QUEST=1 npm start`. Leave API keys empty if you only want this quest. The local tutor is enough.
3. In Minecraft Java, add a server at `127.0.0.1:25565` and join. Offline mode accepts any username.
4. The microphone page is optional. The quest advances from blocks, not from speech.

She does not follow you, and she does not say she will walk behind you. She is the friend who leads. You follow her.

When you join she says hello before any quest:

1. `Hi! You can call me Maple.`
2. `What's your name?` If you answer (`I'm Tom`, `Tom`), she says `Nice to meet you, Tom.` If you say nothing for about 18 seconds, she uses your join name: `I will call you Steve.`
3. `Hey, wanna play something cool?`
4. Then the mission is obvious: chat says `Quest: Dig three stones.` and `Come with me. Dig three stones.` On Paper she also puts **Dig three stones** on the title, with subtitle `Follow Maple`, and keeps that on the action bar. Title commands need her to be allowed to run `/title`. The chat lines still show the goal if the command is refused.

She then walks toward stone (or digs a short way down if none is in sight). Stay with her. When stone is beside you she says `Dig three stones.` Break three allowed blocks. She counts `One stone.` then `Two stones.` then `Good job! Three stones!`

A wooden pickaxe is faster. Punching stone also counts. You do not have to say "I dug it."

| Step | She says | You do |
| --- | --- | --- |
| Hello | `Hi! You can call me Maple.` | Nothing. She asks next. |
| Name | `What's your name?` | Say a name, or wait. She will use your join name. |
| Invite | `Hey, wanna play something cool?` | Nothing. She starts the quest. |
| Find | `Quest: Dig three stones.` then `Come with me. Dig three stones.` | Follow her to stone. |
| Dig | `Dig three stones.` | Break three allowed blocks. `One stone.` / `Two stones.` mark progress. |
| Done | `Good job! Three stones!` | Stop. One quest, then she goes back to normal play. |

Typing does not skip the dig. During the name step, a normal chat line is your answer. `follow me` does not make her trail you. Lines like "right behind me" or "I will follow you" are not said while she is guiding.

If the find or dig step sits for about 18 seconds, she adds one short Chinese hint (`跟着我去挖石头。` or `挖三块石头。`), once per step. English stays the lesson. She repeats the current English line about every 14 seconds.

While she is guiding, she does not send the usual join invite, party idle chat, mini-quests, situate chatter, or quiet nudges. Those come back after `Good job! Three stones!`

## What counts as stone

Exact block ids only. Looking at stone, or chatting about stone, does not count. The block has to break into air.

Counts:

- `stone`, `cobblestone`, `mossy_cobblestone`
- `deepslate`, `cobbled_deepslate`
- `andesite`, `diorite`, `granite` (the speckled stone in the same layer)
- `tuff`, `calcite`, `dripstone_block`
- `blackstone`, `basalt`, `smooth_basalt`

Does not count: dirt, gravel, sand, sandstone, logs, ores (`coal_ore`, `deepslate_iron_ore`, …), stone bricks, stairs, slabs, infested stone.

She counts a break when Mineflayer sees that block become air. If the dig animation names a player, that player must be the kid. If there is no animation (creative instant break), the closest player within 6 blocks must be the kid. Maple's own breaks do not count. The same position cannot count twice in the same moment.

Three breaks after she has a kid in the quest complete it. If the first break is what shows her the stone, that break still counts as stone one, and she says `Dig three stones.` before `One stone.`

## Logs

```text
[maple] DIG_STONE_QUEST on. Gated dig-three-stones tutorial. See docs/dig-stone-quest.md
[maple] digstone quest armed
[maple] digstone quest start player=YourName step=hello
[maple] digstone say step=hello player=YourName: Hi! You can call me Maple.
[maple] digstone say step=name player=YourName: What's your name?
[maple] digstone say step=name player=YourName: Nice to meet you, Tom.
[maple] digstone say step=invite player=YourName: Hey, wanna play something cool?
[maple] digstone objective player=YourName: Quest: Dig three stones.
[maple] digstone title phase=find player=YourName
[maple] digstone say step=find player=YourName: Come with me. Dig three stones.
[maple] digstone step find -> dig player=YourName reason=near-stone
[maple] digstone say step=dig player=YourName: Dig three stones.
[maple] digstone progress dug=1 player=YourName: One stone.
[maple] digstone progress dug=2 player=YourName: Two stones.
[maple] digstone step dig -> done player=YourName reason=dug-3
[maple] digstone quest done player=YourName
[maple] digstone say step=done player=YourName: Good job! Three stones!
```

A chat line while the quest is open looks like this, and the step does not change:

```text
[maple] digstone hold; chat does not advance <YourName> I dug three stones
```

## 中文（给 Peter）

1. 终端 1：`npm run server`（Paper 离线，`127.0.0.1:25565`）。
2. 终端 2：`DIG_STONE_QUEST=1 npm start`。也可以 `QUEST=digstone`、`QUEST=dig_stone` 或 `QUEST=digStone`。不要把密钥写进这个开关。
3. Minecraft Java 加入 `127.0.0.1:25565`。麦克风可开可不开。
4. Maple 只属于 Maple 这个人格。Spark 看到这个开关也会忽略。
5. 她先做很短的招呼：`Hi! You can call me Maple.`，再问 `What's your name?`。你回答名字就用你的名字；大约 18 秒不回答，就用你进服的用户名。然后她说 `Hey, wanna play something cool?`。
6. 招呼之后才是任务。聊天会出现 `Quest: Dig three stones.` 和 `Come with me. Dig three stones.`。Paper 上还会打出大标题 **Dig three stones**（副标题 `Follow Maple`）和动作栏。她带路走向石头，你跟着她。她不会跟在你后面，也不会说 right behind me。
7. 到了石头旁边她说 `Dig three stones.`。敲碎三块允许的石头（石头、圆石、深板岩、安山岩、闪长岩、花岗岩、凝灰岩等，见上面的名单）。她会说 `One stone.`、`Two stones.`，然后 `Good job! Three stones!`。
8. 挖石头这一步不能靠打字跳过。找石头或挖石头卡住大约 18 秒，她用一句中文提示（`跟着我去挖石头。` 或 `挖三块石头。`），然后继续重复当前的英语。
