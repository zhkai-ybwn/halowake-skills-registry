import type { GitHubClient } from './github-client.js'
import type { SkillSourceConfig, DiscoveredSkillRaw } from '../types/source.js'
import type { SubSkillItem } from '../types/registry.js'
import { parseSkillMarkdown } from './frontmatter-parser.js'

export class RepoScanner {
  constructor(private client: GitHubClient) {}

  async scanSource(source: SkillSourceConfig): Promise<DiscoveredSkillRaw[]> {
    const branch = source.branch || 'main'
    const gitUrl = `https://github.com/${source.owner}/${source.repo}`

    if (source.type === 'standalone') {
      return this.scanStandalone(source, branch, gitUrl)
    }

    return this.scanMonorepo(source, branch, gitUrl)
  }

  private async scanStandalone(
    source: SkillSourceConfig,
    branch: string,
    gitUrl: string
  ): Promise<DiscoveredSkillRaw[]> {
    let content = await this.client.getFileRaw(source.owner, source.repo, 'SKILL.md', branch)
    if (!content) {
      content = await this.client.getFileRaw(source.owner, source.repo, 'README.md', branch)
    }

    const parsed = parseSkillMarkdown(content || '')
    const custom = source.customSkill

    const skillId = custom?.id || source.id
    const skillName = custom?.name || parsed.title || source.name
    const titleZh = custom?.titleZh || parsed.frontmatter.titleZh || skillName
    const description = custom?.description || parsed.description || source.description || ''

    return [
      {
        sourceId: source.id,
        id: skillId,
        name: skillName,
        titleZh,
        description,
        owner: source.owner,
        repo: source.repo,
        branch,
        gitUrl,
        rawSkillContent: content || undefined,
        tags: custom?.tags || parsed.tags,
        authorName: source.owner,
        defaultStage: custom?.stage || source.defaultStage,
        category: custom?.category || source.category,
        subSkills: custom?.subSkills
      }
    ]
  }

  private async scanMonorepo(
    source: SkillSourceConfig,
    branch: string,
    gitUrl: string
  ): Promise<DiscoveredSkillRaw[]> {
    const scanDir = source.scanPath || 'skills'
    const entries = await this.client.getDirectory(source.owner, source.repo, scanDir, branch)

    const subSkills: SubSkillItem[] = []
    const discoveredList: DiscoveredSkillRaw[] = []

    if (entries && Array.isArray(entries)) {
      const dirEntries = entries.filter((e) => e.type === 'dir')
      for (const entry of dirEntries) {
        const skillDocPath = `${scanDir}/${entry.name}/SKILL.md`
        let rawContent = await this.client.getFileRaw(source.owner, source.repo, skillDocPath, branch)
        if (!rawContent) {
          rawContent = await this.client.getFileRaw(
            source.owner,
            source.repo,
            `${scanDir}/${entry.name}/README.md`,
            branch
          )
        }

        const parsed = parseSkillMarkdown(rawContent || '')
        const itemId = `${source.owner}-${entry.name}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
        const itemName = parsed.title || entry.name
        const itemDesc = parsed.description || `Skill component for ${entry.name}`

        subSkills.push({
          id: itemId,
          name: itemName,
          titleZh: parsed.frontmatter.titleZh || itemName,
          description: itemDesc,
          subPath: `${scanDir}/${entry.name}`,
          tags: parsed.tags
        })
      }
    }

    // Create the bundle skill representing this monorepo
    discoveredList.push({
      sourceId: source.id,
      id: source.id,
      name: source.name,
      titleZh: source.name,
      description: source.description || `Collection of curated agent skills from ${source.owner}/${source.repo}`,
      owner: source.owner,
      repo: source.repo,
      branch,
      gitUrl,
      authorName: source.owner,
      defaultStage: source.defaultStage,
      category: source.category,
      subSkills: subSkills.length > 0 ? subSkills : undefined
    })

    return discoveredList
  }
}
