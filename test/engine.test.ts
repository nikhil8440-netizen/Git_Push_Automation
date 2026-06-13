import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setDataDir } from '../src/main/store/paths'
import { addProject, setDryRun } from '../src/main/store/config'
import type { ProjectInput } from '../src/shared/types'
import { runGit } from '../src/main/git/run'
import { runBackup, ensureGitRepo, __setConnectivityCheck } from '../src/main/git/engine'

let root: string
let remoteDir: string
let originUrl: string
let work: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'gm-engine-'))
  setDataDir(join(root, 'data'))
  remoteDir = join(root, 'remote.git')
  originUrl = remoteDir.replace(/\\/g, '/')
  work = join(root, 'work')
  mkdirSync(work, { recursive: true })
  await runGit(['init', '--bare', remoteDir])
  // Run offline: force connectivity true so push paths use the local bare remote.
  __setConnectivityCheck(async () => true)
})

afterEach(() => {
  __setConnectivityCheck(null)
  rmSync(root, { recursive: true, force: true })
})

function makeProject(overrides: Partial<ProjectInput> = {}): ReturnType<typeof addProject> {
  return addProject({
    name: 'Test',
    path: work,
    origin: originUrl,
    branch: 'main',
    run_interval_minutes: 30,
    excluded_paths: ['node_modules', 'dist'],
    enabled: true,
    paused: false,
    auto_commit: true,
    auto_push: true,
    run_on_startup: true,
    ...overrides
  })
}

describe('ensureGitRepo', () => {
  it('initializes a plain folder and links origin', async () => {
    const res = await ensureGitRepo(work, 'main', originUrl, 'Test')
    expect(res.ok).toBe(true)
    expect(existsSync(join(work, '.git'))).toBe(true)
    const url = await runGit(['remote', 'get-url', 'origin'], { cwd: work })
    expect(url.stdout.trim()).toBe(originUrl)
  })
})

describe('runBackup', () => {
  it('commits and pushes changes, reaching the remote', async () => {
    writeFileSync(join(work, 'a.txt'), 'hello')
    const p = makeProject()
    const out = await runBackup(p.id, true, 'first commit')
    expect(out.status).toBe('SUCCESS')
    const ls = await runGit(['ls-remote', originUrl])
    expect(ls.stdout).toMatch(/refs\/heads\/main/)
  })

  it('reports NO_CHANGES on a second run with nothing new', async () => {
    writeFileSync(join(work, 'a.txt'), 'hello')
    const p = makeProject()
    await runBackup(p.id, true, 'first')
    const out = await runBackup(p.id, true)
    expect(out.status).toBe('NO_CHANGES')
  })

  it('excludes configured folders from the commit', async () => {
    writeFileSync(join(work, 'real.txt'), 'x')
    mkdirSync(join(work, 'node_modules'))
    writeFileSync(join(work, 'node_modules', 'junk.js'), 'y')
    const p = makeProject()
    const out = await runBackup(p.id, true, 'msg')
    expect(out.status).toBe('SUCCESS')
    const tree = await runGit(['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: work })
    expect(tree.stdout).toContain('real.txt')
    expect(tree.stdout).not.toContain('node_modules')
  })

  it('blocks a >1000 file scheduled run (large commit guard)', async () => {
    for (let i = 0; i < 1001; i++) writeFileSync(join(work, `f${i}.txt`), String(i))
    const p = makeProject()
    const out = await runBackup(p.id, false) // scheduled, not manual
    expect(out.status).toBe('FAILED')
    expect(out.message).toMatch(/Large commit guard/)
  })

  it('simulates only in dry-run mode (no commit created)', async () => {
    setDryRun(true)
    writeFileSync(join(work, 'b.txt'), 'x')
    const p = makeProject()
    const out = await runBackup(p.id, true, 'msg')
    expect(out.status).toBe('NO_CHANGES')
    const head = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd: work })
    expect(head.ok).toBe(false) // no commits were made
  })

  it('commits locally but does not push when auto_push is off', async () => {
    writeFileSync(join(work, 'c.txt'), 'x')
    const p = makeProject({ auto_push: false })
    const out = await runBackup(p.id, true, 'commit only')
    expect(out.status).toBe('SUCCESS')
    expect(out.message).toMatch(/push disabled/)
    const ls = await runGit(['ls-remote', originUrl])
    expect(ls.stdout.trim()).toBe('') // nothing reached the remote
  })

  it('pushes a previously-committed-but-unpushed commit on a later run', async () => {
    // Commit locally with push disabled, then enable push and re-run with no new changes.
    writeFileSync(join(work, 'd.txt'), 'x')
    const p = makeProject({ auto_push: false })
    await runBackup(p.id, true, 'local only')
    const { updateProject } = await import('../src/main/store/config')
    updateProject(p.id, { auto_push: true })
    const out = await runBackup(p.id, true)
    expect(out.status).toBe('SUCCESS')
    const ls = await runGit(['ls-remote', originUrl])
    expect(ls.stdout).toMatch(/refs\/heads\/main/)
  })
})

describe('automated engine safety rules', () => {
  it('never force-pushes and never hard-resets', () => {
    const src = readFileSync(join(process.cwd(), 'src/main/git/engine.ts'), 'utf-8')
    expect(src).not.toMatch(/--force/)
    expect(src).not.toMatch(/--hard/)
  })
})
