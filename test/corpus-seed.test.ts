import { describe, expect, it } from 'vitest'
import { skillsFromCorpus } from '../src/collector/corpus-seed.js'

describe('CC0 corpus import', () => {
  it('imports only usable GitHub pointers without claiming verification', () => {
    const base = {
      platform: 'github', repo: 'owner/project', path: '.agents/skills/example/SKILL.md',
      frontmatter_name: 'example', frontmatter_description: 'A complete example skill description',
      stars: 42, category: 'web-frontend'
    }
    const skills = skillsFromCorpus([
      JSON.stringify(base),
      JSON.stringify(base),
      JSON.stringify({ ...base, platform: 'gitlab', repo: 'owner/other' }),
      JSON.stringify({ ...base, path: '../SKILL.md' })
    ])
    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      gitUrl: 'https://github.com/owner/project',
      subPath: '.agents/skills/example',
      badge: 'community',
      compatibleAgents: [],
      metrics: { securityAuditPassed: false }
    })
  })

  it('only records an Agent when the source identifies one', () => {
    const record = {
      platform: 'github', repo: 'owner/project', path: 'SKILL.md',
      frontmatter_name: 'example', frontmatter_description: 'A complete example skill description',
      agent_platform: 'codex'
    }
    expect(skillsFromCorpus([JSON.stringify(record)])[0].compatibleAgents).toEqual(['codex'])
  })
})
