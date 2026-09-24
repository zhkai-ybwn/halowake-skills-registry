import type { SkillBadgeType, SkillMetrics } from '../types/registry.js'

export interface ScoreDetails {
  halowakeScore: number
  badge: SkillBadgeType
}

export function computeSkillScore(
  metrics: SkillMetrics,
  isVerifiedSource = false,
  hasRichDocs = true
): ScoreDetails {
  let score = 40 // Base baseline score

  // 1. Stars factor: up to 30 points (logarithmic scale)
  if (metrics.githubStars > 0) {
    const starPoints = Math.min(30, Math.round(Math.log10(metrics.githubStars + 1) * 7.5))
    score += starPoints
  }

  // 2. Freshness factor: up to 15 points
  if (metrics.lastCommitDaysAgo <= 14) {
    score += 15
  } else if (metrics.lastCommitDaysAgo <= 45) {
    score += 12
  } else if (metrics.lastCommitDaysAgo <= 90) {
    score += 8
  } else if (metrics.lastCommitDaysAgo <= 180) {
    score += 4
  }

  // 3. Issue resolution & health: up to 10 points
  if (metrics.issueCloseRate >= 90) {
    score += 10
  } else if (metrics.issueCloseRate >= 75) {
    score += 6
  }

  // 4. Security audit passed: 5 points
  if (metrics.securityAuditPassed) {
    score += 5
  } else {
    score -= 30 // Heavy penalty for failing security audit
  }

  // Documentation quality
  if (hasRichDocs) {
    score += 5
  }

  const halowakeScore = Math.max(10, Math.min(100, score))

  // Determine badge
  let badge: SkillBadgeType = 'community'
  if (isVerifiedSource) {
    badge = 'verified'
  } else if (metrics.githubStars >= 500 && metrics.lastCommitDaysAgo <= 60) {
    badge = 'trending'
  } else if (metrics.securityAuditPassed && metrics.issueCloseRate >= 85) {
    badge = 'security'
  }

  return {
    halowakeScore,
    badge
  }
}
