# Internal: set #oral_n verity_stamp = count of stamped milestones (0–5)
scoreboard players set #oral_n verity_stamp 0
execute if score verity_o1 verity_stamp matches 1.. run scoreboard players add #oral_n verity_stamp 1
execute if score verity_o2 verity_stamp matches 1.. run scoreboard players add #oral_n verity_stamp 1
execute if score verity_o3 verity_stamp matches 1.. run scoreboard players add #oral_n verity_stamp 1
execute if score verity_o4 verity_stamp matches 1.. run scoreboard players add #oral_n verity_stamp 1
execute if score verity_o5 verity_stamp matches 1.. run scoreboard players add #oral_n verity_stamp 1
