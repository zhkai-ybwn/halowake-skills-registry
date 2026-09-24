import type { SdlcStage } from '../types/registry.js'

const STAGE_KEYWORDS: Record<SdlcStage, string[]> = {
  requirement: ['requirement', 'spec', 'prd', 'story', 'planning', 'i18n', 'localize', 'architecture', 'rfc'],
  design: ['design', 'ui', 'ux', 'mockup', 'wireframe', 'figma', 'theme', 'color', 'layout'],
  coding: ['code', 'coding', 'refactor', 'frontend', 'backend', 'api', 'typescript', 'rust', 'python', 'vue', 'react'],
  testing: ['test', 'testing', 'qa', 'e2e', 'unit', 'cdp', 'browser', 'playwright', 'cypress', 'vitest', 'jest', 'mock'],
  delivery: ['devops', 'ci', 'cd', 'deploy', 'docker', 'kubernetes', 'release', 'git', 'publish', 'monitoring']
}

export function inferSdlcStage(name: string, description: string, tags: string[], fallback: SdlcStage = 'coding'): SdlcStage {
  const combined = `${name} ${description} ${tags.join(' ')}`.toLowerCase()

  for (const [stage, keywords] of Object.entries(STAGE_KEYWORDS) as [SdlcStage, string[]][]) {
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        return stage
      }
    }
  }

  return fallback
}

export function inferCategory(stage: SdlcStage, defaultCategory = 'Code & Refactor'): string {
  switch (stage) {
    case 'requirement':
      return 'Requirements & Architecture'
    case 'design':
      return 'UI & UX Design'
    case 'coding':
      return defaultCategory || 'Code & Refactor'
    case 'testing':
      return 'Testing & QA'
    case 'delivery':
      return 'DevOps & Delivery'
    default:
      return 'General Utilities'
  }
}
