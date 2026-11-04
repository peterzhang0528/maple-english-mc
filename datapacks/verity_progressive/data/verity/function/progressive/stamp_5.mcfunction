# Verity progressive v2.4 — stamp oral check-in for milestone 5/5
# Clicked via tellraw [我说了!] (needs op / permission for /function in creative demos).

scoreboard players set verity_o5 verity_stamp 1
function verity:progressive/_recount
tellraw @s [{"text":"✓ 已跟读 · 口语 ","color":"green"},{"score":{"name":"#oral_n","objective":"verity_stamp"},"color":"green","bold":true},{"text":"/5","color":"green"}]
execute if score #oral_n verity_stamp matches 1.. run function verity:progressive/oral_summary
