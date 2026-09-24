export type SdlcStage = 'requirement' | 'design' | 'coding' | 'testing' | 'delivery'

export type SkillBadgeType = 'verified' | 'trending' | 'security' | 'community'

export type InstallTargetMode = 'project' | 'specific_agent' | 'global'

export interface SkillAuthor {
  name: string
  url?: string
  verified?: boolean
  avatar?: string
}

export interface SkillMetrics {
  githubStars: number
  forks: number
  lastCommitDaysAgo: number
  issueCloseRate: number // e.g. 92 (%)
  securityAuditPassed: boolean
}

export interface SubSkillItem {
  id: string
  name: string
  titleZh: string
  description: string
  subPath?: string
  tags?: string[]
}

export interface CatalogSkill {
  id: string
  name: string
  titleZh: string
  description: string
  stage: SdlcStage
  category: string
  author: SkillAuthor
  gitUrl: string
  stars: number
  halowakeScore: number // 0-100
  badge: SkillBadgeType
  metrics: SkillMetrics
  tags: string[]
  recommendedWith: string[]
  howToUse: string
  promptExample?: string
  compatibleAgents: string[]
  isStar?: boolean
  isBundle?: boolean
  bundleCount?: number
  subSkills?: SubSkillItem[]
  sourceId?: string
}

export interface PipelineStepPlaybook {
  stage: SdlcStage
  skillId: string
  skillName: string
  role: string
  howToAct: string
  promptExample: string
}

export interface SkillPipeline {
  id: string
  title: string
  subtitle: string
  description: string
  targetScenario: string
  badge: string
  icon: string
  skills: string[]
  playbook?: PipelineStepPlaybook[]
}

export interface RemoteSkillsRegistry {
  version: string
  updatedAt: number
  description?: string
  skills: CatalogSkill[]
  pipelines?: SkillPipeline[]
}
