# Verity progressive v2.5 — oral stamp scoreboard + load banner
# Objective verity_stamp (dummy): fake players verity_o1..verity_o5 = 0/1 oral stamps.

scoreboard objectives add verity_stamp dummy "Verity oral stamps"
scoreboard players add verity_o1 verity_stamp 0
scoreboard players add verity_o2 verity_stamp 0
scoreboard players add verity_o3 verity_stamp 0
scoreboard players add verity_o4 verity_stamp 0
scoreboard players add verity_o5 verity_stamp 0

tellraw @a [{"text":"[Verity datapack v2.5] ","color":"dark_gray"},{"text":"loaded — /function verity:progressive/start · [我说了!] · oral_summary · wecom_plain · stamp_demo","color":"gray"}]
