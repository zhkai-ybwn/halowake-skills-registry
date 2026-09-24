import { describe, it, expect } from 'vitest'
import { parseSkillMarkdown } from '../src/collector/frontmatter-parser.js'

describe('FrontmatterParser', () => {
  it('should parse standard YAML frontmatter', () => {
    const raw = `---
name: Systematic Debugging
description: Root-cause debugging workflow
tags:
  - debug
  - triage
---
# Instructions
Step 1: Reproduce`

    const parsed = parseSkillMarkdown(raw)
    expect(parsed.title).toBe('Systematic Debugging')
    expect(parsed.description).toBe('Root-cause debugging workflow')
    expect(parsed.tags).toEqual(['debug', 'triage'])
    expect(parsed.body).toContain('Step 1: Reproduce')
  })

  it('should fallback to markdown heading and body if no frontmatter', () => {
    const raw = `# Web Scraping Tool\n\nExtracts clean text content from web pages using headless browsers.`
    const parsed = parseSkillMarkdown(raw)
    expect(parsed.title).toBe('Web Scraping Tool')
    expect(parsed.description).toContain('Extracts clean text content')
  })
})
