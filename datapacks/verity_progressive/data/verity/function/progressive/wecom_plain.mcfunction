# Verity progressive v2.4 — dump WeCom-plain progress (same schema as browser buildWecomProgressText)
# /function verity:progressive/wecom_plain
# Chat text is for screenshot / manual copy into WeCom; MC has no clipboard API.

function verity:progressive/_recount

tellraw @s [{"text":"【Verity 口语里程碑】今天 ","color":"light_purple"},{"score":{"name":"#oral_n","objective":"verity_stamp"},"color":"light_purple","bold":true},{"text":"/5","color":"light_purple"}]

# Stamped lines first (✓), then unstamped (○) when partial — mirrors browser WeCom copy
execute if score verity_o1 verity_stamp matches 1.. run tellraw @s [{"text":"✓ 1. 你的脸","color":"aqua"}]
execute if score verity_o2 verity_stamp matches 1.. run tellraw @s [{"text":"✓ 2. 可爱 Verity","color":"yellow"}]
execute if score verity_o3 verity_stamp matches 1.. run tellraw @s [{"text":"✓ 3. 恐怖脸","color":"red"}]
execute if score verity_o4 verity_stamp matches 1.. run tellraw @s [{"text":"✓ 4. friend（占位）","color":"gold"}]
execute if score verity_o5 verity_stamp matches 1.. run tellraw @s [{"text":"✓ 5. friend-2（占位）","color":"green"}]

execute if score #oral_n verity_stamp matches 1..4 unless score verity_o1 verity_stamp matches 1.. run tellraw @s [{"text":"○ 1. 你的脸","color":"dark_gray"}]
execute if score #oral_n verity_stamp matches 1..4 unless score verity_o2 verity_stamp matches 1.. run tellraw @s [{"text":"○ 2. 可爱 Verity","color":"dark_gray"}]
execute if score #oral_n verity_stamp matches 1..4 unless score verity_o3 verity_stamp matches 1.. run tellraw @s [{"text":"○ 3. 恐怖脸","color":"dark_gray"}]
execute if score #oral_n verity_stamp matches 1..4 unless score verity_o4 verity_stamp matches 1.. run tellraw @s [{"text":"○ 4. friend（占位）","color":"dark_gray"}]
execute if score #oral_n verity_stamp matches 1..4 unless score verity_o5 verity_stamp matches 1.. run tellraw @s [{"text":"○ 5. friend-2（占位）","color":"dark_gray"}]

execute if score #oral_n verity_stamp matches 0 run tellraw @s [{"text":"（还没打卡）","color":"gray"}]

tellraw @s [{"text":"孩子跟读了 ","color":"aqua"},{"score":{"name":"#oral_n","objective":"verity_stamp"},"color":"aqua","bold":true},{"text":" 句英语 · 里程碑不是成绩","color":"aqua"}]
tellraw @s [{"text":"朋友专名仍用 friend / friend-2 占位","color":"gray"}]
