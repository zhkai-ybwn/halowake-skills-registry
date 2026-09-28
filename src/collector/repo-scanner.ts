import type { GitHubClient } from './github-client.js'
import type { SkillSourceConfig, DiscoveredSkillRaw } from '../types/source.js'
import type { SubSkillItem } from '../types/registry.js'
import { parseSkillMarkdown } from './frontmatter-parser.js'
import { auditSkillContent } from '../validator/security-auditor.js'

export class RepoScanner {
  constructor(private client: GitHubClient) {}

  async scanSource(source: SkillSourceConfig): Promise<DiscoveredSkillRaw[]> {
    const branch = source.branch || 'main'
    const gitUrl = `https://github.com/${source.owner}/${source.repo}`

    if (source.type === 'standalone') {
      return this.scanStandalone(source, branch, gitUrl)
    }

    if (source.type === 'auto') {
      return this.scanAuto(source, branch, gitUrl)
    }

    return this.scanMonorepo(source, branch, gitUrl)
  }

  private async scanAuto(source: SkillSourceConfig, branch: string, gitUrl: string): Promise<DiscoveredSkillRaw[]> {
    const tree = await this.client.getTree(source.owner, source.repo, branch)
    if (!tree) return []
    const docs = tree
      .filter(entry => entry.type === 'blob' && /(^|\/)SKILL\.md$/i.test(entry.path))
      .filter(entry => !/(^|\/)(test|tests|examples|fixtures|node_modules|\.github)\//i.test(entry.path))
      .slice(0, 15)
    const discovered: DiscoveredSkillRaw[] = []
    const contents: Array<string | null> = []
    for (let i = 0; i < docs.length; i += 4) {
      contents.push(...await Promise.all(docs.slice(i, i + 4).map(doc =>
        this.client.getFileRaw(source.owner, source.repo, doc.path, branch)
      )))
    }
    for (const [index, doc] of docs.entries()) {
      const raw = contents[index]
      if (!raw) continue
      const parsed = parseSkillMarkdown(raw)
      const subPath = doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : undefined
      const folderName = subPath?.split('/').at(-1) || source.repo
      const id = `${source.owner}-${source.repo}-${subPath || 'root'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      discovered.push({
        sourceId: source.id,
        id,
        name: parsed.title || folderName,
        titleZh: parsed.frontmatter.titleZh || parsed.title || folderName,
        description: parsed.description || source.description || '',
        owner: source.owner,
        repo: source.repo,
        branch,
        gitUrl,
        subPath,
        rawSkillContent: raw,
        tags: parsed.tags,
        authorName: source.owner,
        defaultStage: source.defaultStage,
        category: source.category
      })
    }
    return discovered
  }

  private async scanStandalone(
    source: SkillSourceConfig,
    branch: string,
    gitUrl: string
  ): Promise<DiscoveredSkillRaw[]> {
    const content = await this.client.getFileRaw(source.owner, source.repo, 'SKILL.md', branch)
    if (!content) return []

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
      const dirEntries = entries.filter((e) => e.type === 'dir').slice(0, 40)
      const contents: Array<string | null> = []
      for (let i = 0; i < dirEntries.length; i += 4) {
        contents.push(...await Promise.all(dirEntries.slice(i, i + 4).map(entry =>
          this.client.getFileRaw(source.owner, source.repo, `${scanDir}/${entry.name}/SKILL.md`, branch)
        )))
      }
      for (const [index, entry] of dirEntries.entries()) {
        const rawContent = contents[index]
        if (!rawContent || !auditSkillContent(rawContent).passed) continue

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
        discoveredList.push({
            sourceId: source.id,
            id: itemId,
            name: itemName,
            titleZh: parsed.frontmatter.titleZh || itemName,
            description: itemDesc,
            owner: source.owner,
            repo: source.repo,
            branch,
            gitUrl,
            subPath: `${scanDir}/${entry.name}`,
            rawSkillContent: rawContent,
            tags: parsed.tags,
            authorName: source.owner,
            defaultStage: source.defaultStage,
            category: source.category
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
