# Verity progressive v2.4 — parent oral summary with ✓/○ for all 5 (browser parent-card parity)
# /function verity:progressive/oral_summary

function verity:progressive/_recount

execute if score #oral_n verity_stamp matches 0 run tellraw @s [{"text":"[Verity 家长一眼] ","color":"gold"},{"text":"还没打卡 — 孩子跟读后点绿色 [我说了!]","color":"gray"}]

execute if score #oral_n verity_stamp matches 1.. run tellraw @s [{"text":"","color":"white"},{"text":"—— 今天达成 · Verity 里程碑 ","color":"gold"},{"score":{"name":"#oral_n","objective":"verity_stamp"},"color":"gold","bold":true},{"text":"/5 ——","color":"gold"}]

# Always list all five with ✓ or ○ (parity with browser PNG / 企微进度)
execute if score verity_o1 verity_stamp matches 1.. run tellraw @s [{"text":"  ✓ 1. 你的脸 · Look! This is my face.","color":"aqua"}]
execute unless score verity_o1 verity_stamp matches 1.. run tellraw @s [{"text":"  ○ 1. 你的脸 · Look! This is my face.","color":"dark_gray"}]
execute if score verity_o2 verity_stamp matches 1.. run tellraw @s [{"text":"  ✓ 2. 可爱 Verity · Cute Verity! Say hi!","color":"yellow"}]
execute unless score verity_o2 verity_stamp matches 1.. run tellraw @s [{"text":"  ○ 2. 可爱 Verity · Cute Verity! Say hi!","color":"dark_gray"}]
execute if score verity_o3 verity_stamp matches 1.. run tellraw @s [{"text":"  ✓ 3. 恐怖脸 · Oh no… scary face!","color":"red"}]
execute unless score verity_o3 verity_stamp matches 1.. run tellraw @s [{"text":"  ○ 3. 恐怖脸 · Oh no… scary face!","color":"dark_gray"}]
execute if score verity_o4 verity_stamp matches 1.. run tellraw @s [{"text":"  ✓ 4. friend（占位）· A friend is here!","color":"gold"}]
execute unless score verity_o4 verity_stamp matches 1.. run tellraw @s [{"text":"  ○ 4. friend（占位）· A friend is here!","color":"dark_gray"}]
execute if score verity_o5 verity_stamp matches 1.. run tellraw @s [{"text":"  ✓ 5. friend-2（占位）· Another friend! We did it!","color":"green"}]
execute unless score verity_o5 verity_stamp matches 1.. run tellraw @s [{"text":"  ○ 5. friend-2（占位）· Another friend! We did it!","color":"dark_gray"}]

execute if score #oral_n verity_stamp matches 1.. run tellraw @s [{"text":"孩子跟读了 ","color":"aqua"},{"score":{"name":"#oral_n","objective":"verity_stamp"},"color":"aqua","bold":true},{"text":" 句英语 · 里程碑不是成绩","color":"aqua"}]
execute if score #oral_n verity_stamp matches 1.. run tellraw @s [{"text":"  ","color":"white"},{"text":"[复制企微纯文本]","color":"light_purple","bold":true,"clickEvent":{"action":"run_command","value":"/function verity:progressive/wecom_plain"},"hoverEvent":{"action":"show_text","contents":{"text":"聊天里打出与浏览器「复制企微进度」同格式的纯文本，可截图/抄发企微","color":"gray"}}}]
