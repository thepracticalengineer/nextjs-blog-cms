import { readFileSync, existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const errors = []
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name)
  if (entry.isDirectory()) return walk(file)
  return file.endsWith('.md') ? [file] : []
})
const files = ['README.md', 'AGENTS.md', 'CLAUDE.md', ...walk('docs')]
// Scan fenced blocks line by line rather than backtracking through whole documents.
const withoutCodeBlocks = content => {
  let fence = null
  return content.split('\n').map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null
      return ''
    }
    if (marker) { fence = marker; return '' }
    return line
  }).join('\n')
}
const withoutHtmlTags = text => {
  let result = '', cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf('<', cursor)
    if (start === -1) return result + text.slice(cursor)
    const end = text.indexOf('>', start + 1)
    if (end === -1) return result + text.slice(cursor)
    result += text.slice(cursor, start)
    cursor = end + 1
  }
  return result
}
const slug = heading => withoutHtmlTags(heading).toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').trim().replace(/\s/g, '-')
const anchors = file => {
  const result = new Set(), counts = new Map()
  const content = withoutCodeBlocks(readFileSync(file, 'utf8'))
  for (const line of content.split('\n')) {
    const prefix = /^#{1,6}\s/.exec(line)
    if (!prefix) continue
    let heading = line.slice(prefix[0].length).trim()
    while (heading.endsWith('#')) heading = heading.slice(0, -1)
    const base = slug(heading), count = counts.get(base) ?? 0
    result.add(count ? `${base}-${count}` : base)
    counts.set(base, count + 1)
  }
  for (const match of content.matchAll(/(?:id|name)=["']([^"']+)["']/g)) result.add(match[1])
  return result
}
for (const file of files) {
  const content = withoutCodeBlocks(readFileSync(file, 'utf8')).replace(/`[^`\n]+`/g, '')
  const links = [...content.matchAll(/!?\[[^[\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g), ...content.matchAll(/^\[[^\]]+\]:\s+(\S+)/gm)]
  for (const match of links) {
    const link = match[1].replace(/^<|>$/g, '')
    if (/^[a-z][a-z\d+.-]*:/i.test(link)) continue
    const [relative, fragment] = link.split('#')
    const target = relative
      ? path.resolve(path.dirname(file), decodeURIComponent(relative.split('?')[0]))
      : path.resolve(file)
    if (!target.startsWith(root + path.sep) && target !== root) errors.push(`${file}: outside repository: ${link}`)
    else if (!existsSync(target)) errors.push(`${file}: missing target: ${link}`)
    else if (fragment && target.endsWith('.md') && !anchors(target).has(decodeURIComponent(fragment))) errors.push(`${file}: missing anchor: ${link}`)
  }
}
const lock = JSON.parse(readFileSync('skills-lock.json', 'utf8'))
for (const name of Object.keys(lock.skills)) {
  if (!existsSync(`.agents/skills/${name}/SKILL.md`)) errors.push(`Skill missing from project: ${name}`)
}
for (const name of readdirSync('.agents/skills')) {
  if (!lock.skills[name]) errors.push(`Skill missing from lockfile: ${name}`)
}
for (const name of ['vercel-react-best-practices', 'vercel-composition-patterns', 'shadcn', 'playwright-cli']) {
  if (!lock.skills[name]) errors.push(`Required skill missing: ${name}`)
}
// Both agents must discover one canonical copy of each project skill.
const claudeDir = '.claude/skills'
const aliases = existsSync(claudeDir) ? readdirSync(claudeDir) : []
for (const name of Object.keys(lock.skills)) {
  if (!aliases.includes(name)) errors.push(`Claude skill link missing: ${name}`)
}
for (const name of aliases) {
  const alias = path.join(claudeDir, name)
  const canonical = path.join('.agents/skills', name)
  if (!lstatSync(alias).isSymbolicLink()) errors.push(`Claude skill must be a symlink: ${name}`)
  else if (!existsSync(alias)) errors.push(`Claude skill link is broken: ${name}`)
  else if (!existsSync(canonical) || realpathSync(alias) !== realpathSync(canonical)) errors.push(`Claude skill link has wrong target: ${name}`)
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else console.log(`Verified links, anchors and images in ${files.length} documents; ${Object.keys(lock.skills).length} project skills agree with the lockfile.`)
