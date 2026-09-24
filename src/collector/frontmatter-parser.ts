import YAML from 'yaml'

export interface ParsedSkillDoc {
  frontmatter: Record<string, any>
  body: string
  title: string
  description: string
  tags: string[]
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseSkillMarkdown(content: string): ParsedSkillDoc {
  if (!content) {
    return { frontmatter: {}, body: '', title: '', description: '', tags: [] }
  }

  const match = content.match(FRONTMATTER_REGEX)
  let frontmatter: Record<string, any> = {}
  let body = content

  if (match) {
    try {
      frontmatter = YAML.parse(match[1]) || {}
      body = match[2].trim()
    } catch {
      frontmatter = {}
      body = content
    }
  }

  let title = frontmatter.name || frontmatter.title || ''
  let description = frontmatter.description || ''

  if (!title) {
    const headingMatch = body.match(/^#\s+(.+)$/m)
    if (headingMatch) {
      title = headingMatch[1].trim()
    }
  }

  if (!description) {
    const cleaned = body
      .replace(/^#+.*$/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`{1,3}[^`\n]+`{1,3}/g, '')
      .trim()
    const firstParagraph = cleaned.split(/\n\s*\n/)[0] || ''
    description = firstParagraph.replace(/\s+/g, ' ').slice(0, 200).trim()
  }

  const tagsRaw = frontmatter.tags || frontmatter.keywords || []
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t: unknown) => String(t).trim().toLowerCase())
    : []

  return { frontmatter, body, title, description, tags }
}
