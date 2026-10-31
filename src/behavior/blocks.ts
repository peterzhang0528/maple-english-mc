import type { Difficulty } from '../config.js'
import { prettyName } from './phrases.js'

const LESSONS: Record<string, { beginner: string; intermediate: string }> = {
  oak_log: {
    beginner: 'This is an oak log. It is wood from an oak tree. You can make planks with it.',
    intermediate: 'This is an oak log, the trunk of an oak tree. Craft it into oak planks, then sticks and tools.',
  },
  oak_planks: {
    beginner: 'These are oak planks. They are flat wood. Use them to craft a table or tools.',
    intermediate: 'Oak planks come from an oak log. Four planks in a square make a crafting table.',
  },
  crafting_table: {
    beginner: 'This is a crafting table. Use it to make tools. Right-click to open it.',
    intermediate: 'A crafting table gives you a 3 by 3 grid. You need it for tools such as a pickaxe.',
  },
  stone: {
    beginner: 'This is stone. You need a pickaxe to mine it. It becomes cobblestone.',
    intermediate: 'Stone needs a pickaxe. When you mine it, you get cobblestone, which crafts a stone pickaxe.',
  },
  cobblestone: {
    beginner: 'This is cobblestone. It is stone after you mine it. It makes a stone pickaxe.',
    intermediate: 'Cobblestone is mined stone. Three cobblestone and two sticks make a stone pickaxe.',
  },
  dirt: {
    beginner: 'This is dirt. You can dig it with your hand. Plants can grow on it.',
    intermediate: 'Dirt is soft ground. You can dig it by hand and use it for building or farming.',
  },
  grass_block: {
    beginner: 'This is a grass block. Green grass is on top of dirt.',
    intermediate: 'A grass block is dirt with grass on top. It spreads to nearby dirt in the light.',
  },
  iron_ore: {
    beginner: 'This is iron ore. Use a stone pickaxe to mine it. Then cook it in a furnace.',
    intermediate: 'Iron ore needs at least a stone pickaxe. Smelt the raw iron in a furnace to get an iron ingot.',
  },
  coal_ore: {
    beginner: 'This is coal ore. Coal makes torches so you can see at night.',
    intermediate: 'Coal ore drops coal. Combine coal with a stick to craft torches.',
  },
  diamond_ore: {
    beginner: 'This is diamond ore. It is rare. You need an iron pickaxe to mine it.',
    intermediate: 'Diamond ore is rare and deep. Only an iron pickaxe or better will drop the diamond.',
  },
  water: {
    beginner: 'This is water. You can swim in it. Do not fall in if you cannot get out.',
    intermediate: 'Water is a liquid. You can swim, put out fire, and fill a bucket.',
  },
  sand: {
    beginner: 'This is sand. It falls down. You can cook it into glass.',
    intermediate: 'Sand falls if nothing is under it. Smelt it in a furnace to make glass.',
  },
  furnace: {
    beginner: 'This is a furnace. It cooks food and ore. Put fuel, like coal, beside the food.',
    intermediate: 'A furnace smelts ore and cooks food. Fuel goes in the bottom slot.',
  },
  chest: {
    beginner: 'This is a chest. Put your items inside so you do not lose them.',
    intermediate: 'A chest stores items. Two chests side by side become a large chest.',
  },
  torch: {
    beginner: 'This is a torch. It makes light. Use it in dark places.',
    intermediate: 'A torch stops some monsters from spawning nearby. Craft it with coal and a stick.',
  },
  gravel: {
    beginner: 'This is gravel. It falls, like sand. Sometimes it drops flint.',
    intermediate: 'Gravel falls and can drop flint, which you need for a flint and steel.',
  },
  oak_leaves: {
    beginner: 'These are oak leaves. They grow on an oak tree. They may drop a sapling.',
    intermediate: 'Oak leaves sit on oak logs. Breaking them sometimes drops a sapling or an apple.',
  },
  bedrock: {
    beginner: 'This is bedrock. You cannot break it. It is the bottom of the world.',
    intermediate: 'Bedrock is unbreakable in survival. It is the floor of the overworld.',
  },
  short_grass: {
    beginner: 'This is short grass. It is a plant, not a dirt block.',
    intermediate: 'Short grass is a decoration. Bone meal on a grass block can grow more of it.',
  },
}

export function explainBlock(blockName: string, difficulty: Difficulty): string {
  const key = blockName.toLowerCase()
  const known = LESSONS[key]
  if (known) return known[difficulty]
  const pretty = prettyName(key)
  if (difficulty === 'beginner') {
    return `This is ${pretty}. It is a block in this world.`
  }
  return `This is ${pretty}. Tell me what you want to do with it, and I will help you say it in English.`
}
