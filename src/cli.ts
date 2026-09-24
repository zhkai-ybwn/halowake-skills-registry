import fs from 'node:fs/promises'
import path from 'node:path'
import { RegistryBuilder } from './builder/registry-builder.js'
import { writeRegistryDist } from './builder/dist-writer.js'
import type { SkillSourceConfig } from './types/source.js'
import type { SkillPipeline } from './types/registry.js'

async function loadJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(content) as T
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const outDirIndex = args.indexOf('--out-dir')
  const outDir = outDirIndex !== -1 && args[outDirIndex + 1] ? args[outDirIndex + 1] : './dist'

  console.log('====================================================')
  console.log('🚀 Halowake Skills Registry Pipeline')
  console.log('====================================================')

  const baseDir = process.cwd()
  const officialSourcesPath = path.join(baseDir, 'sources/official.json')
  const communitySourcesPath = path.join(baseDir, 'sources/community.json')
  const pipelinesPath = path.join(baseDir, 'sources/pipelines.json')

  console.log(`📂 Loading source manifests...`)
  const officialSources = await loadJsonFile<SkillSourceConfig[]>(officialSourcesPath)
  const communitySources = await loadJsonFile<SkillSourceConfig[]>(communitySourcesPath)
  const pipelines = await loadJsonFile<SkillPipeline[]>(pipelinesPath)

  const allSources = [...officialSources, ...communitySources]
  console.log(`📦 Loaded ${allSources.length} source definitions and ${pipelines.length} pipelines.`)

  const builder = new RegistryBuilder({
    githubToken: process.env.GITHUB_TOKEN
  })

  console.log(`\n🔍 Crawling and enriching skills with authentic GitHub data...`)
  const registry = await builder.build({
    sources: allSources,
    pipelines
  })

  console.log(`\n✅ Successfully generated registry with ${registry.skills.length} skills!`)

  if (isDryRun) {
    console.log(`[Dry Run] Skipping file output. Summary:`)
    console.log(JSON.stringify(registry, null, 2).slice(0, 500) + '...\n')
    return
  }

  const { distPath, minPath, statsPath } = await writeRegistryDist(outDir, registry)
  console.log(`📄 Formatted registry: ${distPath}`)
  console.log(`⚡ Minified registry:  ${minPath}`)
  console.log(`📊 Registry stats:    ${statsPath}`)
  console.log('====================================================')
}

main().catch((err) => {
  console.error('❌ Pipeline failed:', err)
  process.exit(1)
})
