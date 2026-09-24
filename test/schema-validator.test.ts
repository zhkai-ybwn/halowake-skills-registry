import { describe, it, expect } from 'vitest'
import { validateSkill, validateRegistry } from '../src/validator/schema-validator.js'
import type { CatalogSkill } from '../src/types/registry.js'

describe('SchemaValidator', () => {
  it('should validate complete CatalogSkill', () => {
    const validSkill: CatalogSkill = {
      id: 'test-skill',
      name: 'Test Skill',
      titleZh: '测试技能',
      description: 'A test skill for validation',
      stage: 'coding',
      category: 'Code & Refactor',
      author: {
        name: 'test-author',
        url: 'https://github.com/test-author',
        verified: true
      },
      gitUrl: 'https://github.com/test-author/test-skill',
      stars: 120,
      halowakeScore: 85,
      badge: 'verified',
      metrics: {
        githubStars: 120,
        forks: 15,
        lastCommitDaysAgo: 3,
        issueCloseRate: 90,
        securityAuditPassed: true
      },
      tags: ['coding', 'test'],
      recommendedWith: [],
      howToUse: 'Use in agent prompt',
      compatibleAgents: ['claude', 'codex']
    }

    const result = validateSkill(validSkill)
    expect(result.success).toBe(true)
  })

  it('should reject invalid stage or negative stars', () => {
    const invalidSkill: any = {
      id: 'invalid-skill',
      name: 'Invalid',
      titleZh: '非法技能',
      description: 'broken',
      stage: 'unknown_stage',
      stars: -5
    }

    const result = validateSkill(invalidSkill)
    expect(result.success).toBe(false)
  })
})
