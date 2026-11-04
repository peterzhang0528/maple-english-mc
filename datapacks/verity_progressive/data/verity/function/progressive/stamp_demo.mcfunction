# Verity progressive v2.5 — demo helper: one-click fill all oral stamps (Cecilia/Peter demos only)
# /function verity:progressive/stamp_demo
# Does NOT rename friend / friend-2. Not for kid play.

scoreboard objectives add verity_stamp dummy "Verity oral stamps"
scoreboard players set verity_o1 verity_stamp 1
scoreboard players set verity_o2 verity_stamp 1
scoreboard players set verity_o3 verity_stamp 1
scoreboard players set verity_o4 verity_stamp 1
scoreboard players set verity_o5 verity_stamp 1
function verity:progressive/_recount
function verity:progressive/oral_summary
tellraw @s [{"text":"[演示一键打满] ","color":"dark_gray"},{"text":"已把 verity_o1…o5 打满 · 仅供 Cecilia/Peter 演示，不是孩子玩法","color":"gray"}]
