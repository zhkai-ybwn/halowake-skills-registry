import type { CatalogSkill } from '../types/registry.js'
import { extractSkillUsageGuide, GUIDE_EXTRACTOR_VERSION } from './usage-guide-extractor.js'

const RETRY_AFTER_MS = 24 * 60 * 60 * 1000
const REFRESH_AFTER_MS = 30 * RETRY_AFTER_MS
const MAX_CONTENT_BYTES = 500_000

export type GuideFetcher = (url: string) => Promise<string | null>

async function fetchRawSkill(url: string): Promise<string | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Raw skill fetch failed: HTTP ${response.status}`)
  if (Number(response.headers.get('content-length') || 0) > MAX_CONTENT_BYTES) return null
  const content = await response.text()
  return Buffer.byteLength(content, 'utf8') <= MAX_CONTENT_BYTES ? content : null
}

function sourceUrls(skill: CatalogSkill): { raw: string; page: string } | null {
  const repo = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(skill.gitUrl)
  if (!repo || skill.isBundle) return null
  const segments = skill.subPath?.split('/').filter(Boolean) || []
  if (segments.some(segment => segment === '.' || segment === '..')) return null
  const path = [...segments, 'SKILL.md'].map(encodeURIComponent).join('/')
  const location = `${repo[1]}/${repo[2]}`
  return {
    raw: `https://raw.githubusercontent.com/${location}/HEAD/${path}`,
    page: `https://github.com/${location}/blob/HEAD/${path}`
  }
}

export function guideLocation(skill: CatalogSkill): string {
  return `${skill.gitUrl.replace(/\.git$/, '').toLowerCase()}/${(skill.subPath || '').toLowerCase()}`
}

export async function enrichUsageGuides(
  skills: CatalogSkill[],
  attemptedAt: Record<string, number>,
  options: { batchSize?: number; now?: number; fetchFile?: GuideFetcher; concurrency?: number } = {}
): Promise<{ attempted: number; enriched: number }> {
  const now = options.now ?? Date.now()
  const batchSize = Math.max(0, Math.min(200, options.batchSize ?? 200))
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4))
  const fetchFile = options.fetchFile ?? fetchRawSkill
  const eligible = skills
    .filter(skill => sourceUrls(skill) &&
      (skill.usageGuide?.extractorVersion !== GUIDE_EXTRACTOR_VERSION || now - (attemptedAt[guideLocation(skill)] || 0) >= RETRY_AFTER_MS) &&
      (!skill.usageGuide || skill.usageGuide.extractorVersion !== GUIDE_EXTRACTOR_VERSION || now - skill.usageGuide.extractedAt >= REFRESH_AFTER_MS))
    .sort((a, b) =>
      Number(Boolean(b.usageGuide && b.usageGuide.extractorVersion !== GUIDE_EXTRACTOR_VERSION)) -
        Number(Boolean(a.usageGuide && a.usageGuide.extractorVersion !== GUIDE_EXTRACTOR_VERSION)) ||
      (attemptedAt[guideLocation(a)] || 0) - (attemptedAt[guideLocation(b)] || 0))
    .slice(0, batchSize)

  let enriched = 0
  for (let index = 0; index < eligible.length; index += concurrency) {
    await Promise.all(eligible.slice(index, index + concurrency).map(async skill => {
      const urls = sourceUrls(skill)
      if (!urls) return
      attemptedAt[guideLocation(skill)] = now
      try {
        const content = await fetchFile(urls.raw)
        if (!content) return
        const extracted = extractSkillUsageGuide(content, urls.page, now)
        if (!extracted) return
        if (skill.usageGuide?.sourceHash === extracted.sourceHash &&
          skill.usageGuide.extractorVersion === extracted.extractorVersion) return
        skill.usageGuide = extracted
        enriched++
      } catch (error) {
        console.warn(`[Guide] ${skill.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }))
  }
  return { attempted: eligible.length, enriched }
}
