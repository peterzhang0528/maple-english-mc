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
