import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const workflow = parse(read('.github/workflows/pr-policy.yml'))
const script = workflow.jobs.policy.steps[0].with.script
export async function validate(base, head, { fork = false, author = 'human', title = 'fix: repair behavior', files = ['package.json'], labels = [], body = '', authorId = 345175842, authorType = 'Bot' } = {}) {
  const failures = []
  await runInNewContext(`(async () => {${script}\n})()`, {
    context: { repo: { owner: 'org', repo: 'repo' }, issue: { number: 1 } },
    github: { rest: { pulls: {
      get: async () => ({ data: { base: { ref: base }, head: { ref: head, repo: { full_name: fork ? 'fork/repo' : 'org/repo' } }, title, body, user: { login: author, id: authorId, type: authorType }, labels: labels.map(name => ({ name })) } }),
      listFiles: async () => ({ data: files.map(file => typeof file === 'string' ? { filename: file, status: 'modified' } : file) }),
    } }, paginate: async method => (await method()).data },
    core: { setFailed: message => failures.push(message), notice() {} },
  })
  return failures
}
