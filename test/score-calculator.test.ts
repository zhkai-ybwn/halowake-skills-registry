import { describe, it, expect } from 'vitest'
import { computeSkillScore } from '../src/enricher/score-calculator.js'
import type { SkillMetrics } from '../src/types/registry.js'

describe('ScoreCalculator', () => {
  it('should give higher scores to high-star active verified repositories', () => {
    const highQualityMetrics: SkillMetrics = {
      githubStars: 1500,
      forks: 230,
      lastCommitDaysAgo: 5,
      issueCloseRate: 92,
      securityAuditPassed: true
    }

    const { halowakeScore, badge } = computeSkillScore(highQualityMetrics, true, true)
    expect(halowakeScore).toBeGreaterThanOrEqual(80)
    expect(badge).toBe('verified')
  })

  it('should assign trending badge to non-verified popular fresh repos', () => {
    const popularMetrics: SkillMetrics = {
      githubStars: 800,
      forks: 120,
      lastCommitDaysAgo: 10,
      issueCloseRate: 85,
      securityAuditPassed: true
    }

    const { badge } = computeSkillScore(popularMetrics, false, true)
    expect(badge).toBe('trending')
  })

  it('should penalize failing security audit', () => {
    const insecureMetrics: SkillMetrics = {
      githubStars: 200,
      forks: 30,
      lastCommitDaysAgo: 100,
      issueCloseRate: 50,
      securityAuditPassed: false
    }

    const { halowakeScore } = computeSkillScore(insecureMetrics, false, false)
    expect(halowakeScore).toBeLessThanOrEqual(45)
  })
})
