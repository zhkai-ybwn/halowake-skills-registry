import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inferCategory, inferSdlcStage } from '../enricher/category-classifier.js'
import type { CatalogSkill } from '../types/registry.js'

// The corpus metadata is CC0. Skill files themselves remain at their original repositories.
export const CORPUS_METADATA_URL =
  'https://raw.githubusercontent.com/lawrence3699/agent-skills-corpus/main/data/metadata.public.jsonl.gz'

interface CorpusRecord {
  platform?: string
  repo?: string
  path?: string
  stars?: number
  frontmatter_name?: string
  frontmatter_description?: string
  category?: string
  agent_platform?: string
  is_fork?: boolean
  unavailable_repo?: boolean
  content_sha256?: string
}

export function skillsFromCorpus(lines: Iterable<string>, limit = 2000): CatalogSkill[] {
  const candidates: CatalogSkill[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (!line.trim()) continue
    let record: CorpusRecord
    try { record = JSON.parse(line) as CorpusRecord } catch { continue }
    if (record.platform !== 'github' || record.is_fork || record.unavailable_repo) continue
    const repo = record.repo || ''
    const skillPath = record.path || ''
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) continue
    if (!/(^|\/)SKILL\.md$/.test(skillPath) || skillPath.split('/').some(part => part === '..')) continue
    const name = record.frontmatter_name?.trim()
    const description = record.frontmatter_description?.trim()
    if (!name || !description || description.length < 20) continue
    const key = `${repo}/${skillPath}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const [owner, repoName] = repo.split('/')
    const subPath = skillPath === 'SKILL.md' ? undefined : skillPath.slice(0, -'/SKILL.md'.length)
    const stars = Math.max(0, Math.floor(Number(record.stars) || 0))
    const stage = inferSdlcStage(name, description, [record.category || ''])
    const slug = `${repo}/${subPath || 'root'}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80)
    const suffix = createHash('sha256').update(key).digest('hex').slice(0, 8)
    const compatibleAgents = ['claude', 'codex', 'cursor'].includes(record.agent_platform || '')
      ? [record.agent_platform as string]
      : []
    candidates.push({
      id: `corpus-${slug}-${suffix}`,
      name,
      titleZh: name,
      description,
      stage,
      category: inferCategory(stage, record.category || 'Community'),
      author: { name: owner, url: `https://github.com/${owner}`, verified: false },
      gitUrl: `https://github.com/${repo}`,
      subPath,
      stars,
      halowakeScore: 0,
      badge: 'community',
      metrics: { githubStars: stars, forks: 0, lastCommitDaysAgo: 0, issueCloseRate: 0, securityAuditPassed: false },
      tags: [record.category || 'community', record.agent_platform || 'generic'],
      recommendedWith: [],
      howToUse: '索引未收录触发条件。请查看来源仓库中的 SKILL.md，并按原作者的说明使用。',
      compatibleAgents,
      sourceId: 'agent-skills-corpus'
    })
  }
  // Repository popularity is only a coarse discovery signal, never a security or quality score.
  const perRepo = new Map<string, number>()
  return candidates
    .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))
    .filter(skill => {
      const count = perRepo.get(skill.gitUrl) || 0
      if (count >= 20) return false
      perRepo.set(skill.gitUrl, count + 1)
      return true
    })
    .slice(0, limit)
}

export async function fetchCorpusSeed(limit = 2000): Promise<CatalogSkill[]> {
  let bytes: Buffer
  if (process.env.REGISTRY_CORPUS_FILE) {
    bytes = await readFile(process.env.REGISTRY_CORPUS_FILE)
  } else {
    const response = await fetch(CORPUS_METADATA_URL, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw new Error(`Corpus metadata download failed: HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (bytes.length > 40 * 1024 * 1024) throw new Error('Corpus metadata exceeds the 40 MB download limit')
  const lines = gunzipSync(bytes).toString('utf8').split(/\r?\n/)
  return skillsFromCorpus(lines, limit)
}
