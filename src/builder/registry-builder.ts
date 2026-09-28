import { GitHubClient } from '../collector/github-client.js'
import { RepoScanner } from '../collector/repo-scanner.js'
import { MetricsEnricher } from '../enricher/metrics-enricher.js'
import { computeSkillScore } from '../enricher/score-calculator.js'
import { inferSdlcStage, inferCategory } from '../enricher/category-classifier.js'
import { auditSkillContent } from '../validator/security-auditor.js'
import { validateSkill, validateRegistry } from '../validator/schema-validator.js'
import type { SkillSourceConfig } from '../types/source.js'
import type { CatalogSkill, SkillPipeline, RemoteSkillsRegistry } from '../types/registry.js'

export interface BuildOptions {
  githubToken?: string
  sources: SkillSourceConfig[]
  pipelines?: SkillPipeline[]
}

export class RegistryBuilder {
  private client: GitHubClient
  private scanner: RepoScanner
  private enricher: MetricsEnricher

  constructor(options?: { githubToken?: string }) {
    this.client = new GitHubClient(options?.githubToken)
    this.scanner = new RepoScanner(this.client)
    this.enricher = new MetricsEnricher(this.client)
  }

  async build(options: BuildOptions): Promise<RemoteSkillsRegistry> {
    const catalogSkills: CatalogSkill[] = []
    const metricsCache = new Map<string, Awaited<ReturnType<MetricsEnricher['enrichMetrics']>>>()

    for (const source of options.sources) {
      console.log(`[Builder] Scanning source: ${source.owner}/${source.repo} (${source.name})`)
      const discoveredList = await this.scanner.scanSource(source)

      for (const discovered of discoveredList) {
        if (!discovered.rawSkillContent && !discovered.subSkills?.length) continue
        // 1. Static security audit
        const audit = auditSkillContent(discovered.rawSkillContent)
        if (!audit.passed) {
          console.warn(`[Security Warning] Skill ${discovered.id} failed audit: ${audit.violations.join(', ')}`)
          continue
        }

        // 2. Enrich authentic GitHub metrics
        const repoKey = `${discovered.owner}/${discovered.repo}`.toLowerCase()
        let metrics = metricsCache.get(repoKey)
        if (!metrics) {
          metrics = await this.enricher.enrichMetrics(discovered.owner, discovered.repo, discovered.branch, audit.passed)
          metricsCache.set(repoKey, metrics)
        }

        // 3. Compute score and badge
        const { halowakeScore, badge } = computeSkillScore(
          metrics,
          source.verified,
          Boolean(discovered.rawSkillContent && discovered.rawSkillContent.length > 100)
        )

        // 4. Infer SDLC stage and Category
        const stage = source.type === 'standalone'
          ? discovered.defaultStage
          : inferSdlcStage(discovered.name, discovered.description || '', discovered.tags || [], source.defaultStage)
        const category = discovered.category || inferCategory(stage, source.category)

        const isBundle = Boolean(discovered.subSkills && discovered.subSkills.length > 0)

        const skill: CatalogSkill = {
          id: discovered.id,
          name: discovered.name,
          titleZh: discovered.titleZh || discovered.name,
          description: discovered.description || `Autonomous agent skill from ${discovered.owner}/${discovered.repo}`,
          stage,
          category,
          author: {
            name: discovered.authorName || discovered.owner,
            url: `https://github.com/${discovered.owner}`,
            verified: source.verified,
            avatar: discovered.authorAvatar || `https://github.com/${discovered.owner}.png`
          },
          gitUrl: discovered.gitUrl,
          subPath: discovered.subPath,
          stars: metrics.githubStars,
          halowakeScore,
          badge,
          metrics,
          tags: discovered.tags && discovered.tags.length > 0 ? discovered.tags : ['agent', 'skill'],
          recommendedWith: [],
          howToUse: source.customSkill?.howToUse || '未收录触发条件。请查看来源仓库中的 SKILL.md，并按原作者说明使用。',
          promptExample: source.customSkill?.promptExample,
          compatibleAgents: source.customSkill?.compatibleAgents || [],
          isBundle,
          bundleCount: discovered.subSkills ? discovered.subSkills.length : undefined,
          subSkills: discovered.subSkills,
          sourceId: source.id
        }

        // Validate individual skill schema
        const validation = validateSkill(skill)
        if (!validation.success) {
          console.warn(`[Validation Error] Skill ${skill.id} failed schema validation:`, validation.error.format())
        }

        if (validation.success) catalogSkills.push(skill)
      }
    }

    const registry: RemoteSkillsRegistry = {
      version: '1.0.0',
      updatedAt: Date.now(),
      description: 'Official Halowake Verified Agent Skills Registry',
      skills: catalogSkills,
      pipelines: (options.pipelines || []).filter(p => p.skills.every(id => catalogSkills.some(s => s.id === id)))
    }

    const regValidation = validateRegistry(registry)
    if (!regValidation.success) {
      console.warn('[Validation Error] Registry root failed validation:', regValidation.error.format())
    }

    return registry
  }
}
