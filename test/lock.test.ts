import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setDataDir } from '../src/main/store/paths'
import { acquireLock, releaseLock, isLocked } from '../src/main/lock'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gm-lock-'))
  setDataDir(dir)
})

afterEach(() => {
  releaseLock()
  rmSync(dir, { recursive: true, force: true })
})

describe('lock', () => {
  it('acquires once and blocks a second acquire', () => {
    expect(acquireLock()).toBe(true)
    expect(isLocked()).toBe(true)
    expect(acquireLock()).toBe(false) // already held
  })

  it('can be re-acquired after release', () => {
    expect(acquireLock()).toBe(true)
    releaseLock()
    expect(isLocked()).toBe(false)
    expect(acquireLock()).toBe(true)
  })

  it('release is safe when no lock exists', () => {
    expect(() => releaseLock()).not.toThrow()
  })
})
