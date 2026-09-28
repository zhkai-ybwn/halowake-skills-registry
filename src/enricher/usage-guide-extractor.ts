import { createHash } from 'node:crypto'
import { parseSkillMarkdown } from '../collector/frontmatter-parser.js'
import type { SkillUsageGuide } from '../types/registry.js'

interface Section { heading: string; body: string }
export const GUIDE_EXTRACTOR_VERSION = 3

function clean(text: string, maxLength: number): string {
  const normalized = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^[\s>*+-]+/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length <= maxLength) return normalized
  const boundary = normalized.lastIndexOf(' ', maxLength - 1)
  return `${normalized.slice(0, boundary > maxLength / 2 ? boundary : maxLength - 1).trimEnd()}…`
}

function sections(body: string): Section[] {
  const result: Section[] = []
  let current: Section = { heading: '', body: '' }
  for (const line of body.split(/\r?\n/)) {
    const heading = /^#{1,4}\s+(.+)$/.exec(line)
    if (heading) {
      result.push(current)
      current = { heading: heading[1].trim(), body: '' }
    } else {
      current.body += `${line}\n`
    }
  }
  result.push(current)
  return result
}

function proseBlocks(body: string): Array<{ text: string; list: boolean }> {
  const withoutCode = body.replace(/```[\s\S]*?```/g, '')
  const blocks: Array<{ text: string; list: boolean }> = []
  let current = ''
  let isList = false
  const flush = () => {
    const text = clean(current, 320)
    if (text.length >= 12) blocks.push({ text, list: isList })
    current = ''
  }
  for (const line of withoutCode.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || /^(?:\||!\[|---)/.test(trimmed)) {
      flush()
      continue
    }
    const listStart = /^(?:[-*+]\s+|\d+[.)]\s+)/.test(trimmed)
    if (listStart) {
      flush()
      isList = true
      current = trimmed
    } else {
      if (!current) isList = false
      current += `${current ? ' ' : ''}${trimmed}`
    }
  }
  flush()
  return blocks
}

export function extractSkillUsageGuide(content: string, sourceUrl: string, extractedAt = Date.now()): SkillUsageGuide | null {
  if (!content || content.length > 500_000) return null
  const parsed = parseSkillMarkdown(content)
  const parts = sections(parsed.body)
  const summary = clean(parsed.description || proseBlocks(parsed.body)[0]?.text || '', 400)
  if (!summary) return null

  const triggerSection = parts.find(part => /when\s+to\s+use|when\s+to\s+apply|triggers?|适用|触发|使用时机/i.test(part.heading))
  const frontmatterDescription = typeof parsed.frontmatter.description === 'string' ? parsed.frontmatter.description : ''
  const trigger = clean(triggerSection ? proseBlocks(triggerSection.body).slice(0, 2).map(block => block.text).join('；')
    : /\buse\s+when\b|\bwhen\s+to\s+use\b|适用|触发/i.test(frontmatterDescription) ? frontmatterDescription : '', 400)

  const usageSections = parts.filter(part => /how\s+to\s+use|usage|quick\s*start|getting\s+started|instructions?|workflow|process|steps?|使用方法|操作步骤|工作流程|用法/i.test(part.heading))
  const usageBlocks = usageSections.flatMap(part => proseBlocks(part.body))
  const steps = (usageBlocks.some(block => block.list) ? usageBlocks.filter(block => block.list) : usageBlocks)
    .map(block => clean(block.text, 220))
    .filter((step, index, all) => all.indexOf(step) === index)
    .slice(0, 6)

  const exampleSection = parts.find(part => /example|示例|prompt|提示词/i.test(part.heading))
  const codeExample = exampleSection?.body.match(/```[^\n]*\n([\s\S]*?)```/)?.[1]
  const exampleCandidate = codeExample || (exampleSection ? proseBlocks(exampleSection.body)[0]?.text : '') || ''
  const example = exampleCandidate.length <= 700 ? clean(exampleCandidate, 700) : ''

  return {
    extractorVersion: GUIDE_EXTRACTOR_VERSION,
    summary,
    ...(trigger ? { trigger } : {}),
    steps,
    ...(example ? { example } : {}),
    sourceUrl,
    sourceHash: createHash('sha256').update(content).digest('hex'),
    extractedAt
  }
}
