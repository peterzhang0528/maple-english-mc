# Verity progressive demo — /function verity:progressive/start
# Labels friend / friend-2 are PLACEHOLDERS — not official names.
# v2.4: clickable [我说了!] oral stamps (scoreboard verity_stamp); v2.2 Say lines; v2.1 milestone N/5.

tag @a[tag=verity_demo_runner] remove verity_demo_runner
tag @s add verity_demo_runner
kill @e[type=armor_stand,tag=verity_demo]

tellraw @s [{"text":"[Verity] ","color":"gold"},{"text":"叙事链开始：你的脸 → 可爱 → 恐怖 → friend → friend-2（专名待确认）","color":"white"}]
tellraw @s [{"text":"  里程碑 1/5 你的脸 — 身旁盔甲架（头颅用可爱模板；标签区分；实机可换 face_to_verity_skin.py 产出）","color":"aqua"}]
tellraw @s [{"text":"  Say: ","color":"gray"},{"text":"Look! This is my face.","color":"aqua","italic":true}]
tellraw @s [{"text":"  ","color":"white"},{"text":"[我说了!]","color":"green","bold":true,"clickEvent":{"action":"run_command","value":"/function verity:progressive/stamp_1"},"hoverEvent":{"action":"show_text","contents":{"text":"跟读打卡 · 需要权限执行 /function（创意/op 演示 OK）","color":"gray"}}}]
execute as @a[tag=verity_demo_runner,limit=1] at @s run summon armor_stand ~ ~ ~1 {CustomName:'{"text":"你的脸","color":"aqua"}',CustomNameVisible:1b,NoGravity:1b,ShowArms:1b,NoBasePlate:1b,Tags:["verity_demo","verity_face"],ArmorItems:[{},{},{},{id:"minecraft:player_head",count:1,components:{"minecraft:profile":{properties:[{name:"textures",value:"ewogICJ0aW1lc3RhbXAiIDogMTc4MTQzMDkzOTUyMywKICAicHJvZmlsZUlkIiA6ICI1MzgyNzM1OGIzOTc0ZmJiOTg0OTY5MWM5Yzg3NTA1YiIsCiAgInByb2ZpbGVOYW1lIiA6ICJPdmVyQmlnYm95MTIzIiwKICAic2lnbmF0dXJlUmVxdWlyZWQiIDogdHJ1ZSwKICAidGV4dHVyZXMiIDogewogICAgIlNLSU4iIDogewogICAgICAidXJsIiA6ICJodHRwOi8vdGV4dHVyZXMubWluZWNyYWZ0Lm5ldC90ZXh0dXJlLzRkNDg0MTlkMzI3M2E1ZDdjNjYzYmZmMzY5NTkxMDJlNjFlZjMyZWZkZmVjNjIwM2NkNTNmNWUxYmQ4MWQwNDEiCiAgICB9CiAgfQp9"}]}}}]}
schedule function verity:progressive/step_cute 40t
