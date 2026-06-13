import { describe, it, expect } from 'vitest'
import { extractHost, parseGitStatus } from '../src/main/git/run'

describe('extractHost', () => {
  it('parses https and ssh urls, defaults to github.com', () => {
    expect(extractHost('https://github.com/user/repo.git')).toBe('github.com')
    expect(extractHost('git@gitlab.com:user/repo.git')).toBe('gitlab.com')
    expect(extractHost('https://bitbucket.org/u/r')).toBe('bitbucket.org')
    expect(extractHost('')).toBe('github.com')
    expect(extractHost('not-a-url')).toBe('github.com')
  })
})

describe('parseGitStatus', () => {
  it('extracts changed paths and drops excluded folders', () => {
    const status = [
      ' M src/app.ts',
      '?? node_modules/lib/index.js',
      'A  dist/out.js',
      '?? newfile.txt'
    ].join('\n')
    const result = parseGitStatus(status, ['node_modules', 'dist'])
    expect(result).toContain('src/app.ts')
    expect(result).toContain('newfile.txt')
    expect(result).not.toContain('node_modules/lib/index.js')
    expect(result).not.toContain('dist/out.js')
  })

  it('handles rename arrows and quoted paths', () => {
    const status = ['R  old.txt -> new.txt', ' M "spaced name.txt"'].join('\n')
    const result = parseGitStatus(status, [])
    expect(result).toContain('new.txt')
    expect(result).toContain('spaced name.txt')
  })

  it('ignores excluded folder appearing as a path component', () => {
    const status = ' M a/node_modules/b.js'
    expect(parseGitStatus(status, ['node_modules'])).toHaveLength(0)
  })
})
