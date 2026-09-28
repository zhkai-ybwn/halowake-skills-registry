import { describe, expect, it } from 'vitest'
import { discoverSources } from '../src/collector/source-discovery.js'
import { RepoScanner } from '../src/collector/repo-scanner.js'
import type { GitHubClient, GitHubRepositorySearchItem } from '../src/collector/github-client.js'
import type { SkillSourceConfig } from '../src/types/source.js'

const curated: SkillSourceConfig = {
  id: 'curated', name: 'Curated', owner: 'owner', repo: 'existing', type: 'monorepo',
  category: 'Core', verified: true, defaultStage: 'coding'
}

function repo(name: string, stars: number): GitHubRepositorySearchItem {
  return {
    full_name: `owner/${name}`, name, description: name, default_branch: 'main',
    stargazers_count: stars, archived: false, fork: false, owner: { login: 'owner' }
  }
}

describe('repository discovery', () => {
  it('deduplicates curated and overlapping search results before applying the cap', async () => {
    const client = {
      searchRepositories: async () => [repo('existing', 100), repo('new', 50), repo('new', 50), repo('low', 1)]
    } as unknown as GitHubClient
    const result = await discoverSources(client, [curated], { queries: ['one', 'two'], maxRepositories: 1 })
    expect(result).toHaveLength(1)
    expect(result[0].repo).toBe('new')
    expect(result[0].type).toBe('auto')
    expect(result[0].verified).toBe(false)
  })

  it('only emits installable directories containing SKILL.md', async () => {
    const client = {
      getTree: async () => [
        { type: 'blob', path: 'skills/real/SKILL.md' },
        { type: 'blob', path: 'examples/demo/SKILL.md' },
        { type: 'blob', path: 'skills/readme/README.md' }
      ],
      getFileRaw: async () => '---\nname: Real Skill\ndescription: A useful skill\n---\nUse it.'
    } as unknown as GitHubClient
    const scanner = new RepoScanner(client)
    const result = await scanner.scanSource({ ...curated, repo: 'new', type: 'auto' })
    expect(result).toHaveLength(1)
    expect(result[0].subPath).toBe('skills/real')
    expect(result[0].id).toBe('owner-new-skills-real')
  })
})
