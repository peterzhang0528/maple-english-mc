# Verity progressive v2.4 — cleanup demo entities + oral stamps
kill @e[type=armor_stand,tag=verity_demo]
kill @e[type=armor_stand,tag=verity_friend]
tag @a[tag=verity_demo_runner] remove verity_demo_runner
scoreboard players set verity_o1 verity_stamp 0
scoreboard players set verity_o2 verity_stamp 0
scoreboard players set verity_o3 verity_stamp 0
scoreboard players set verity_o4 verity_stamp 0
scoreboard players set verity_o5 verity_stamp 0
scoreboard players set #oral_n verity_stamp 0
tellraw @s [{"text":"[Verity] ","color":"gray"},{"text":"已清理盔甲架 / runner 标签 / 口语打卡 stamps","color":"white"}]
