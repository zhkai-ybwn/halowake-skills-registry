import { describe, expect, it } from 'vitest'
import { skillsFromCorpus } from '../src/collector/corpus-seed.js'
import { enrichUsageGuides } from '../src/enricher/usage-guide-enricher.js'
import { extractSkillUsageGuide } from '../src/enricher/usage-guide-extractor.js'

const source = `---
name: review
description: Use when reviewing a pull request before merge.
---
# Review
## How to Use
1. Read the changed files and related tests.
2. Report concrete findings with file locations.
## Example
\`\`\`text
Review this change for correctness.
\`\`\`
`

describe('skill usage guide', () => {
  it('extracts short, source-backed usage information from SKILL.md', () => {
    const guide = extractSkillUsageGuide(source, 'https://github.com/acme/skills/blob/HEAD/review/SKILL.md', 123)
    expect(guide).toMatchObject({
      summary: 'Use when reviewing a pull request before merge.',
      trigger: 'Use when reviewing a pull request before merge.',
      steps: ['Read the changed files and related tests.', 'Report concrete findings with file locations.'],
      example: 'Review this change for correctness.',
      extractedAt: 123
    })
    expect(guide?.sourceHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('joins wrapped list items and omits examples too long to preview usefully', () => {
    const wrapped = `---\nname: example\ndescription: Use when an issue needs diagnosis.\n---\n## Workflow\n1. Inspect the failing test and read\n   the related implementation before editing.\n2. Explain the root cause.\n## Example\n\`\`\`text\n${'a'.repeat(800)}\n\`\`\``
    const guide = extractSkillUsageGuide(wrapped, 'https://github.com/acme/example/blob/HEAD/SKILL.md')
    expect(guide?.steps).toEqual([
      'Inspect the failing test and read the related implementation before editing.',
      'Explain the root cause.'
    ])
    expect(guide?.example).toBeUndefined()
  })

  it('enriches incrementally and keeps the previous guide when the source is unchanged', async () => {
    const skill = skillsFromCorpus([JSON.stringify({
      platform: 'github', repo: 'acme/skills', path: 'review/SKILL.md',
      frontmatter_name: 'review', frontmatter_description: 'Review pull requests for correctness'
    })])[0]
    const attemptedAt: Record<string, number> = {}
    const urls: string[] = []
    const fetchFile = async (url: string) => { urls.push(url); return source }
    const first = await enrichUsageGuides([skill], attemptedAt, { now: 1_000_000_000_000, fetchFile })
    expect(first).toEqual({ attempted: 1, enriched: 1 })
    expect(urls).toEqual(['https://raw.githubusercontent.com/acme/skills/HEAD/review/SKILL.md'])
    const original = skill.usageGuide

    const second = await enrichUsageGuides([skill], attemptedAt, { now: 1_000_000_000_000 + 60_000, fetchFile })
    expect(second).toEqual({ attempted: 0, enriched: 0 })
    const refresh = await enrichUsageGuides([skill], attemptedAt, { now: 1_000_000_000_000 + 31 * 24 * 60 * 60 * 1000, fetchFile })
    expect(refresh).toEqual({ attempted: 1, enriched: 0 })
    expect(skill.usageGuide).toBe(original)
  })
})
