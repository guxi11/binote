#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const bump = (path, mutate) => {
  const file = join(root, path)
  const json = JSON.parse(readFileSync(file, 'utf8'))
  mutate(json)
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  console.log(`  ${path} → ${version}`)
}

console.log(`sync version ${version}`)
bump('.claude-plugin/plugin.json', j => { j.version = version })
bump('.claude-plugin/marketplace.json', j => { j.plugins.forEach(p => { p.version = version }) })
