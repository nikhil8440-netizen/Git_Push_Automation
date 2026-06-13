import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setDataDir, configPath } from '../src/main/store/paths'
import {
  loadConfig,
  addProject,
  getProject,
  getProjects,
  updateProject,
  deleteProject,
  isDryRun,
  setDryRun
} from '../src/main/store/config'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gm-config-'))
  setDataDir(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const sampleInput = {
  name: 'My Project',
  path: 'C:\\Projects\\MyWeb',
  origin: 'https://github.com/user/repo.git',
  branch: 'main',
  run_interval_minutes: 30,
  excluded_paths: ['node_modules'],
  enabled: true,
  paused: false,
  auto_commit: true,
  auto_push: true,
  run_on_startup: true
}

describe('config store', () => {
  it('creates a default config when none exists', () => {
    const cfg = loadConfig()
    expect(cfg).toEqual({ dry_run: false, automation_enabled: false, projects: [] })
    expect(existsSync(configPath())).toBe(true)
  })

  it('adds a project with a generated id and normalized path', () => {
    const p = addProject(sampleInput)
    expect(p.id).toMatch(/[0-9a-f-]{36}/)
    expect(p.path).toBe('C:/Projects/MyWeb') // backslashes normalized
    expect(p.last_status).toBe('')
    expect(getProjects()).toHaveLength(1)
    expect(getProject(p.id)?.name).toBe('My Project')
  })

  it('applies defaults for omitted optional fields', () => {
    const p = addProject({
      name: 'Bare',
      path: '/tmp/bare',
      origin: 'x',
      branch: 'main',
      run_interval_minutes: 30,
      excluded_paths: [],
      enabled: true,
      paused: false,
      auto_commit: true,
      auto_push: true,
      run_on_startup: true
    })
    expect(p.branch).toBe('main')
    expect(p.auto_push).toBe(true)
  })

  it('updates fields but never the id, and coerces interval', () => {
    const p = addProject(sampleInput)
    const updated = updateProject(p.id, {
      // @ts-expect-error testing that id changes are ignored
      id: 'HACKED',
      name: 'Renamed',
      run_interval_minutes: 15.9 as unknown as number,
      path: 'D:\\new\\path'
    })
    expect(updated?.id).toBe(p.id)
    expect(updated?.name).toBe('Renamed')
    expect(updated?.run_interval_minutes).toBe(15)
    expect(updated?.path).toBe('D:/new/path')
  })

  it('deletes a project', () => {
    const p = addProject(sampleInput)
    expect(deleteProject(p.id)).toBe(true)
    expect(getProjects()).toHaveLength(0)
    expect(deleteProject('missing')).toBe(false)
  })

  it('toggles dry run', () => {
    expect(isDryRun()).toBe(false)
    expect(setDryRun(true)).toBe(true)
    expect(isDryRun()).toBe(true)
  })

  it('self-heals a corrupt config and preserves the bad file', () => {
    writeFileSync(configPath(), '{ this is not json', 'utf-8')
    const cfg = loadConfig()
    expect(cfg).toEqual({ dry_run: false, automation_enabled: false, projects: [] })
    expect(existsSync(configPath() + '.corrupt')).toBe(true)
  })

  it('writes valid, parseable JSON', () => {
    addProject(sampleInput)
    const raw = readFileSync(configPath(), 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})
