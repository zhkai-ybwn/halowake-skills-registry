import fs from 'node:fs/promises'
import path from 'node:path'
import { RegistryBuilder } from './builder/registry-builder.js'
import { writeRegistryDist } from './builder/dist-writer.js'
import { fetchCorpusSeed } from './collector/corpus-seed.js'
import { GitHubClient } from './collector/github-client.js'
import { discoverSources } from './collector/source-discovery.js'
import { enrichUsageGuides } from './enricher/usage-guide-enricher.js'
import type { CatalogSkill, RemoteSkillsRegistry, SkillPipeline } from './types/registry.js'
import type { SkillSourceConfig } from './types/source.js'
import { validateRegistry } from './validator/schema-validator.js'

interface CollectorState {
  discoveryPage: number
  scannedAt: Record<string, number>
  discoveredSources: SkillSourceConfig[]
  guideAttemptedAt?: Record<string, number>
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')) as T } catch { return fallback }
}

function skillLocation(skill: CatalogSkill): string {
  return `${skill.gitUrl.replace(/\.git$/, '').toLowerCase()}/${(skill.subPath || '').toLowerCase()}`
}

export function mergeSkills(previous: CatalogSkill[], seed: CatalogSkill[], fresh: CatalogSkill[]): CatalogSkill[] {
  const byLocation = new Map<string, CatalogSkill>()
  for (const skill of previous) byLocation.set(skillLocation(skill), skill)
  for (const skill of seed) {
    const location = skillLocation(skill)
    const old = byLocation.get(location)
    if (!old || old.sourceId === 'agent-skills-corpus') byLocation.set(location, {
      ...skill,
      usageGuide: skill.usageGuide || old?.usageGuide
    })
  }
  for (const skill of fresh) {
    const location = skillLocation(skill)
    byLocation.set(location, { ...skill, usageGuide: skill.usageGuide || byLocation.get(location)?.usageGuide })
  }
  return Array.from(byLocation.values()).sort((a, b) =>
    Number(b.badge === 'verified') - Number(a.badge === 'verified') || b.stars - a.stars || a.id.localeCompare(b.id)
  )
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const seedOnly = args.includes('--seed-only')
  const outDirIndex = args.indexOf('--out-dir')
  const outDir = outDirIndex !== -1 && args[outDirIndex + 1] ? args[outDirIndex + 1] : './dist'
  if (args.includes('validate')) {
    const registry = await readJson<RemoteSkillsRegistry | null>(path.join(outDir, 'registry.json'), null)
    const result = validateRegistry(registry)
    if (!result.success) throw new Error(`Registry schema invalid: ${result.error.message}`)
    const ids = new Set(result.data.skills.map(skill => skill.id))
    if (ids.size !== result.data.skills.length) throw new Error('Registry contains duplicate skill IDs')
    console.log(`Validated ${result.data.skills.length} skills.`)
    return
  }
  const officialSources = await readJson<SkillSourceConfig[]>('sources/official.json', [])
  const communitySources = await readJson<SkillSourceConfig[]>('sources/community.json', [])
  const pipelines = await readJson<SkillPipeline[]>('sources/pipelines.json', [])
  const curated = [...officialSources, ...communitySources]
  const previous = await readJson<RemoteSkillsRegistry | null>(path.join(outDir, 'registry.json'), null)
  const statePath = path.join(outDir, 'collector-state.json')
  const state = await readJson<CollectorState>(statePath, { discoveryPage: 1, scannedAt: {}, discoveredSources: [] })
  state.guideAttemptedAt ||= {}
  const now = Date.now()

  // The CC0 snapshot quickly populates the catalog. It is not a freshness or safety claim.
  let seed: CatalogSkill[] = []
  if (!previous || previous.skills.length < 500 || args.includes('--refresh-corpus')) {
    try {
      seed = await fetchCorpusSeed(Number(process.env.REGISTRY_CORPUS_LIMIT || 2000))
      console.log(`[Corpus] Imported ${seed.length} GitHub metadata records.`)
    } catch (error) {
      console.warn(`[Corpus] Import failed; retaining previous catalog: ${String(error)}`)
    }
  }

  const client = new GitHubClient(process.env.GITHUB_TOKEN)
  const known = new Set(state.discoveredSources.map(s => `${s.owner}/${s.repo}`.toLowerCase()))
  let discovered: SkillSourceConfig[] = []
  if (!seedOnly) {
    try {
      discovered = await discoverSources(client, curated, {
        page: state.discoveryPage,
        maxRepositories: Number(process.env.REGISTRY_MAX_REPOSITORIES || 20),
        knownRepositories: known
      })
      state.discoveryPage = state.discoveryPage >= 10 ? 1 : state.discoveryPage + 1
    } catch (error) {
      console.warn(`[Discovery] Search failed; retaining previous catalog: ${String(error)}`)
    }
  }

  const refresh = [...state.discoveredSources]
    .sort((a, b) => (state.scannedAt[`${a.owner}/${a.repo}`.toLowerCase()] || 0) -
      (state.scannedAt[`${b.owner}/${b.repo}`.toLowerCase()] || 0))
    .slice(0, 5)
  const sources = seedOnly ? [] : [...curated, ...refresh, ...discovered]
  const builder = new RegistryBuilder({ githubToken: process.env.GITHUB_TOKEN })
  let scanned: CatalogSkill[] = []
  try {
    scanned = (await builder.build({ sources, pipelines })).skills
    for (const source of [...refresh, ...discovered]) {
      state.scannedAt[`${source.owner}/${source.repo}`.toLowerCase()] = now
    }
    state.discoveredSources = [...state.discoveredSources, ...discovered]
  } catch (error) {
    console.warn(`[Builder] Scan failed; retaining previous catalog: ${String(error)}`)
  }

  // The original tiny demo registry included entries that were not installable skills.
  // Replace it on the first successful corpus import; subsequent runs preserve the catalog.
  const previousSkills = seed.length > 0 && (previous?.skills.length || 0) < 10 ? [] : previous?.skills || []
  const skills = mergeSkills(previousSkills, seed, scanned)
  if (!isDryRun) {
    const guideResult = await enrichUsageGuides(skills, state.guideAttemptedAt, {
      batchSize: Number(process.env.REGISTRY_GUIDE_BATCH ?? 200)
    })
    console.log(`[Guide] Checked ${guideResult.attempted} skills; updated ${guideResult.enriched} usage guides.`)
  }
  const validIds = new Set(skills.map(s => s.id))
  const registry: RemoteSkillsRegistry = {
    version: '1.0.0',
    updatedAt: now,
    description: 'Halowake Skills Registry: curated skills and community source pointers',
    skills,
    pipelines: pipelines.filter(p => p.skills.every(id => validIds.has(id)))
  }
  if (previous && JSON.stringify({ ...previous, updatedAt: 0 }) === JSON.stringify({ ...registry, updatedAt: 0 })) {
    registry.updatedAt = previous.updatedAt
  }
  if (isDryRun) {
    console.log(`[Dry Run] ${skills.length} skills (${seed.length} corpus records, ${scanned.length} freshly scanned).`)
    return
  }
  const minimumCount = Math.max(10, Math.floor((previous?.skills.length || 0) * 0.7))
  if (skills.length < minimumCount && process.env.REGISTRY_ALLOW_SHRINK !== '1') {
    throw new Error(`Refusing to publish ${skills.length} skills; minimum safe count is ${minimumCount}`)
  }
  await writeRegistryDist(outDir, registry)
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8')
  console.log(`Published ${skills.length} skills (${seed.length} corpus records, ${scanned.length} freshly scanned).`)
}

main().catch(error => {
  console.error('Registry pipeline failed:', error)
  process.exitCode = 1
})
