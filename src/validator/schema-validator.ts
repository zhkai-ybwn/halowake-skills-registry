import { z } from 'zod'

export const SdlcStageSchema = z.enum(['requirement', 'design', 'coding', 'testing', 'delivery'])

export const SkillBadgeSchema = z.enum(['verified', 'trending', 'security', 'community'])

export const SkillAuthorSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  verified: z.boolean().optional(),
  avatar: z.string().url().optional()
})

export const SkillMetricsSchema = z.object({
  githubStars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  lastCommitDaysAgo: z.number().int().nonnegative(),
  issueCloseRate: z.number().min(0).max(100),
  securityAuditPassed: z.boolean()
})

export const SubSkillItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  titleZh: z.string(),
  description: z.string(),
  subPath: z.string().optional(),
  tags: z.array(z.string()).optional()
})

export const CatalogSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  titleZh: z.string(),
  description: z.string(),
  stage: SdlcStageSchema,
  category: z.string(),
  author: SkillAuthorSchema,
  gitUrl: z.string().url(),
  stars: z.number().int().nonnegative(),
  halowakeScore: z.number().min(0).max(100),
  badge: SkillBadgeSchema,
  metrics: SkillMetricsSchema,
  tags: z.array(z.string()),
  recommendedWith: z.array(z.string()),
  howToUse: z.string(),
  promptExample: z.string().optional(),
  compatibleAgents: z.array(z.string()),
  isStar: z.boolean().optional(),
  isBundle: z.boolean().optional(),
  bundleCount: z.number().int().optional(),
  subSkills: z.array(SubSkillItemSchema).optional(),
  sourceId: z.string().optional()
})

export const RemoteSkillsRegistrySchema = z.object({
  version: z.string(),
  updatedAt: z.number(),
  description: z.string().optional(),
  skills: z.array(CatalogSkillSchema),
  pipelines: z.array(z.any()).optional()
})

export function validateSkill(data: unknown) {
  return CatalogSkillSchema.safeParse(data)
}

export function validateRegistry(data: unknown) {
  return RemoteSkillsRegistrySchema.safeParse(data)
}
