import type { SdlcStage, SubSkillItem } from './registry.js'

export type SourceType = 'monorepo' | 'standalone'

export interface CustomSkillOverride {
  id: string
  name: string
  titleZh?: string
  description?: string
  stage?: SdlcStage
  category?: string
  tags?: string[]
  compatibleAgents?: string[]
  howToUse?: string
  promptExample?: string
  subSkills?: SubSkillItem[]
}

export interface SkillSourceConfig {
  id: string
  name: string
  owner: string
  repo: string
  branch?: string
  type: SourceType
  category: string
  verified: boolean
  scanPath?: string
  defaultStage: SdlcStage
  description?: string
  customSkill?: CustomSkillOverride
}

export interface DiscoveredSkillRaw {
  sourceId: string
  id: string
  name: string
  titleZh?: string
  description?: string
  owner: string
  repo: string
  branch: string
  gitUrl: string
  subPath?: string
  rawSkillContent?: string
  tags?: string[]
  authorName?: string
  authorAvatar?: string
  defaultStage: SdlcStage
  category: string
  subSkills?: SubSkillItem[]
}
