import fs from 'node:fs/promises'
import path from 'node:path'
import type { RemoteSkillsRegistry, CatalogSkill } from '../types/registry.js'

export interface RegistryStats {
  totalSkills: number
  totalBundles: number
  totalSubSkills: number
  byStage: Record<string, number>
  byBadge: Record<string, number>
  avgHalowakeScore: number
  updatedAt: string
}

export function generateStats(skills: CatalogSkill[]): RegistryStats {
  const byStage: Record<string, number> = {}
  const byBadge: Record<string, number> = {}
  let totalSubSkills = 0
  let totalBundles = 0
  let scoreSum = 0

  for (const s of skills) {
    byStage[s.stage] = (byStage[s.stage] || 0) + 1
    byBadge[s.badge] = (byBadge[s.badge] || 0) + 1
    scoreSum += s.halowakeScore
    if (s.isBundle) {
      totalBundles += 1
      totalSubSkills += s.subSkills?.length || 0
    }
  }

  const avgHalowakeScore = skills.length > 0 ? Math.round(scoreSum / skills.length) : 0

  return {
    totalSkills: skills.length,
    totalBundles,
    totalSubSkills,
    byStage,
    byBadge,
    avgHalowakeScore,
    updatedAt: new Date().toISOString()
  }
}

export async function writeRegistryDist(
  outDir: string,
  registry: RemoteSkillsRegistry
): Promise<{ distPath: string; minPath: string; statsPath: string }> {
  await fs.mkdir(outDir, { recursive: true })

  const distPath = path.join(outDir, 'registry.json')
  const minPath = path.join(outDir, 'registry.min.json')
  const statsPath = path.join(outDir, 'stats.json')

  const prettyJson = JSON.stringify(registry, null, 2)
  const minifiedJson = JSON.stringify(registry)
  const stats = generateStats(registry.skills)

  await fs.writeFile(distPath, prettyJson, 'utf-8')
  await fs.writeFile(minPath, minifiedJson, 'utf-8')
  await fs.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf-8')

  return { distPath, minPath, statsPath }
}
