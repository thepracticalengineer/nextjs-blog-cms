import { test as base, expect } from './coverage/fixture'
import { readFileSync } from 'fs'

interface E2EState {
  userId: string
  seedPostIds: string[]
}

function readState(): E2EState {
  return JSON.parse(readFileSync('.e2e-state.json', 'utf8'))
}

export const test = base.extend<{
  seedPostIds: string[]
}>({
  seedPostIds: async ({}, provideFixture) => {
    await provideFixture(readState().seedPostIds)
  },
})

export { expect }
