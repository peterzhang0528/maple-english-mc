export function prettyName(id: string): string {
  return id.replaceAll('_', ' ')
}

export function followOk(name: string): string {
  return `I am following ${name}.`
}

export function followBlind(name: string): string {
  return `I cannot see ${name} yet. Walk closer, then say follow me again.`
}

export function comeOk(name: string): string {
  return `I am walking to ${name}.`
}

export function comeBlind(name: string): string {
  return `I cannot see ${name} yet. Walk closer, then say come here again.`
}

export function waitOk(): string {
  return 'I will wait here.'
}

export function lookOk(name: string): string {
  return `I am looking at ${name}.`
}

export function lookBlind(name: string): string {
  return `I cannot see ${name} yet.`
}

export function inspectOk(blockName: string): string {
  return `I am looking at ${prettyName(blockName)}.`
}

export function inspectMiss(): string {
  return 'I am not sure which block you are looking at.'
}

export function cannotWalk(): string {
  return 'I cannot walk yet. I just joined.'
}

export function digOk(blockName: string): string {
  return `I am digging ${prettyName(blockName)} with you.`
}

export function digMiss(): string {
  return 'I cannot find a soft block near you. Come closer, then say dig again.'
}

export function buildOk(blockName: string): string {
  return `I am placing ${prettyName(blockName)} with you.`
}

export function buildMiss(): string {
  return 'I cannot place a block here yet. Come closer, then say build again.'
}

export function giveOk(itemName: string, who: string): string {
  return `Here, ${who} — ${prettyName(itemName)} for you!`
}

export function giveMiss(who: string): string {
  return `I do not have items for ${who} yet. Say dig with me, then give again.`
}

export function assistOk(who: string): string {
  return `I am coming to help ${who}. Dig, build, or say give!`
}

export function houseOk(placed: number, totalLeft: number): string {
  if (totalLeft <= 0) return `House done! We placed ${placed} blocks. Come inside!`
  return `Building a house with you — ${placed} blocks. Say build a house again for more!`
}

export function houseMiss(): string {
  return 'I cannot start the house yet. Come closer, then say build a house again.'
}
