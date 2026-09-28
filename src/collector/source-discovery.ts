import type { GitHubClient, GitHubRepositorySearchItem } from './github-client.js'
import type { SkillSourceConfig } from '../types/source.js'

export const DEFAULT_DISCOVERY_QUERIES = [
  'topic:agent-skills',
  'topic:claude-skills',
  'topic:codex-skills',
  'topic:ai-agent-skills',
  'skills SKILL.md in:readme'
]

export interface DiscoveryOptions {
  queries?: string[]
  maxRepositories?: number
  minStars?: number
  page?: number
  knownRepositories?: Set<string>
}

export async function discoverSources(
  client: GitHubClient,
  curated: SkillSourceConfig[],
  options: DiscoveryOptions = {}
): Promise<SkillSourceConfig[]> {
  const queries = options.queries ?? DEFAULT_DISCOVERY_QUERIES
  const maxRepositories = options.maxRepositories ?? 40
  const minStars = options.minStars ?? 2
  const seen = new Set(curated.map(s => `${s.owner}/${s.repo}`.toLowerCase()))
  for (const repo of options.knownRepositories ?? []) seen.add(repo.toLowerCase())
  const candidates: GitHubRepositorySearchItem[] = []

  for (const query of queries) {
    const items = await client.searchRepositories(`${query} fork:false archived:false`, options.page ?? 1)
    for (const item of items) {
      const key = item.full_name.toLowerCase()
      if (seen.has(key) || item.archived || item.fork || item.stargazers_count < minStars) continue
      seen.add(key)
      candidates.push(item)
    }
  }

  candidates.sort((a, b) => b.stargazers_count - a.stargazers_count)
  return candidates.slice(0, maxRepositories).map(item => ({
    id: `${item.owner.login}-${item.name}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    name: item.name,
    owner: item.owner.login,
    repo: item.name,
    branch: item.default_branch,
    type: 'auto',
    category: 'Community',
    verified: false,
    defaultStage: 'coding',
    description: item.description || undefined
  }))
}
