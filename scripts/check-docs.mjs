import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const errors = []
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(file) : file.endsWith('.md') ? [file] : []
})
const files = ['README.md', 'AGENTS.md', 'CLAUDE.md', ...walk('docs')]
const slug = heading => heading.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').trim().replace(/\s/g, '-')
const anchors = file => {
  const result = new Set(), counts = new Map()
  const content = readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slug(match[1]), count = counts.get(base) ?? 0
    result.add(count ? `${base}-${count}` : base)
    counts.set(base, count + 1)
  }
  for (const match of content.matchAll(/(?:id|name)=["']([^"']+)["']/g)) result.add(match[1])
  return result
}
for (const file of files) {
  const content = readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '').replace(/`[^`\n]+`/g, '')
  const links = [...content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g), ...content.matchAll(/^\[[^\]]+\]:\s+(\S+)/gm)]
  for (const match of links) {
    const link = match[1].replace(/^<|>$/g, '')
    if (/^[a-z][a-z\d+.-]*:/i.test(link)) continue
    const [relative, fragment] = link.split('#')
    const target = path.resolve(path.dirname(file), decodeURIComponent(relative.split('?')[0]))
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
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else console.log(`Verified links, anchors and images in ${files.length} documents; ${Object.keys(lock.skills).length} project skills agree with the lockfile.`)
