import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const localPorts = new Set([
  'api.port', 'db.port', 'db.shadow_port', 'db.pooler.port', 'studio.port',
  'local_smtp.port', 'inbucket.port', 'edge_runtime.inspector_port', 'analytics.port',
])

function portLines(config) {
  let section = ''
  return config.split('\n').flatMap((line, index) => {
    const heading = /^\[([^\]]+)\]$/.exec(line.trim())
    if (heading) section = heading[1]
    const setting = /^(\w+) = \d+$/.exec(line)
    return setting && localPorts.has(`${section}.${setting[1]}`) ? [{ index, key: setting[1] }] : []
  })
}

export function configurePorts(config, ports) {
  const settings = portLines(config)
  if (!settings.length || settings.length !== ports.length || new Set(ports).size !== ports.length ||
    ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('Expected one distinct valid port per local Supabase listener')
  }
  const lines = config.split('\n')
  settings.forEach(({ index, key }, offset) => { lines[index] = `${key} = ${ports[offset]}` })
  return lines.join('\n')
}

/** Hold all listeners until the config is written so allocations stay distinct. */
export async function reservePorts(count) {
  const servers = Array.from({ length: count }, () => createServer())
  const release = () => Promise.all(servers.filter(server => server.listening).map(server => new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose())
  })))
  try {
    const results = await Promise.allSettled(servers.map(server =>
      new Promise((resolveListen, reject) => {
        server.once('error', reject)
        server.listen(0, '0.0.0.0', resolveListen)
      }),
    ))
    const failed = results.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
    return { ports: servers.map(server => server.address().port), release }
  } catch (error) {
    await release()
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error('This script does not accept file paths; run from the disposable project directory')
  const configPath = 'supabase/config.toml'
  const config = await readFile(configPath, 'utf8')
  const reserved = await reservePorts(portLines(config).length)
  try {
    await writeFile(configPath, configurePorts(config, reserved.ports))
    console.log('Allocated available local Supabase ports for this E2E run.')
  } finally { await reserved.release() }
}
