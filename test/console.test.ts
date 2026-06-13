import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setDataDir } from '../src/main/store/paths'
import { addProject } from '../src/main/store/config'
import type { ProjectInput } from '../src/shared/types'
import { runGit } from '../src/main/git/run'
import { getOverview, getLog, getBranches, perform } from '../src/main/git/console'

let root: string
let work: string

const baseInput = (path: string): ProjectInput => ({
  name: 'Console',
  path,
  origin: '',
  branch: 'main',
  run_interval_minutes: 30,
  excluded_paths: [],
  enabled: true,
  paused: false,
  auto_commit: true,
  auto_push: true,
  run_on_startup: true
})

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'gm-console-'))
  setDataDir(join(root, 'data'))
  work = join(root, 'work')
  mkdirSync(work, { recursive: true })
  await runGit(['init', '-b', 'main'], { cwd: work })
  await runGit(['config', 'user.name', 'Tester'], { cwd: work })
  await runGit(['config', 'user.email', 't@e.com'], { cwd: work })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('console read queries', () => {
  it('reports untracked files in the overview', async () => {
    writeFileSync(join(work, 'a.txt'), 'hi')
    const p = addProject(baseInput(work))
    const ov = await getOverview(p.id)
    expect(ov.ok).toBe(true)
    expect(ov.is_repo).toBe(true)
    expect(ov.untracked).toContain('a.txt')
    expect(ov.clean).toBe(false)
  })
})

describe('console actions', () => {
  it('stages, commits, and shows up in the log', async () => {
    writeFileSync(join(work, 'a.txt'), 'hi')
    const p = addProject(baseInput(work))

    const staged = await perform(p.id, 'stage', { all: true })
    expect(staged.success).toBe(true)
    const ov = await getOverview(p.id)
    expect((ov.staged as { path: string }[]).some((s) => s.path === 'a.txt')).toBe(true)

    const committed = await perform(p.id, 'commit', { message: 'init commit' })
    expect(committed.success).toBe(true)

    const log = await getLog(p.id)
    const commits = log.commits as { subject: string }[]
    expect(commits[0].subject).toBe('init commit')
  })

  it('creates and switches branches', async () => {
    writeFileSync(join(work, 'a.txt'), 'hi')
    const p = addProject(baseInput(work))
    await perform(p.id, 'stage', { all: true })
    await perform(p.id, 'commit', { message: 'init' })

    const created = await perform(p.id, 'branch_create', { name: 'dev' })
    expect(created.success).toBe(true)
    const br = await getBranches(p.id)
    expect(br.current).toBe('dev')

    const switched = await perform(p.id, 'branch_switch', { name: 'main' })
    expect(switched.success).toBe(true)
    expect((await getBranches(p.id)).current).toBe('main')
  })

  it('runs an arbitrary git terminal command (escape hatch)', async () => {
    const p = addProject(baseInput(work))
    const res = await perform(p.id, 'terminal', { command: 'status --short' })
    expect(res.success).toBe(true)
    expect(res.message).toMatch(/^\$ git status/)
  })

  it('strips a leading "git" token in the terminal op', async () => {
    const p = addProject(baseInput(work))
    const res = await perform(p.id, 'terminal', { command: 'git symbolic-ref --short HEAD' })
    expect(res.success).toBe(true)
    expect(res.output.trim()).toBe('main')
  })

  it('rejects an unknown operation', async () => {
    const p = addProject(baseInput(work))
    // @ts-expect-error testing invalid op
    const res = await perform(p.id, 'bogus', {})
    expect(res.success).toBe(false)
    expect(res.message).toMatch(/Unknown operation/)
  })

  it('refuses non-terminal ops on a folder that is not a repo', async () => {
    const plain = join(root, 'plain')
    mkdirSync(plain)
    const p = addProject(baseInput(plain))
    const res = await perform(p.id, 'stage', { all: true })
    expect(res.success).toBe(false)
    expect(res.message).toMatch(/not a Git repository/)
  })
})
