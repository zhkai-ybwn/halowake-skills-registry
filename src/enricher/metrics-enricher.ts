import type { GitHubClient } from '../collector/github-client.js'
import type { SkillMetrics } from '../types/registry.js'

export class MetricsEnricher {
  constructor(private client: GitHubClient) {}

  async enrichMetrics(
    owner: string,
    repo: string,
    branch = 'main',
    securityPassed = true
  ): Promise<SkillMetrics> {
    const repoInfo = await this.client.getRepo(owner, repo)
    const latestCommitDateStr = await this.client.getLatestCommitDate(owner, repo, branch)

    const stars = repoInfo?.stargazers_count ?? 0
    const forks = repoInfo?.forks_count ?? 0
    const openIssues = repoInfo?.open_issues_count ?? 0

    // Compute last commit days ago
    let lastCommitDaysAgo = 30
    const commitDate = latestCommitDateStr || repoInfo?.pushed_at || repoInfo?.updated_at
    if (commitDate) {
      const commitTs = new Date(commitDate).getTime()
      const diffMs = Math.max(0, Date.now() - commitTs)
      lastCommitDaysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    }

    // Heuristic for issue close rate: if open issues < 50 => high close rate
    const issueCloseRate = openIssues > 100 ? 75 : openIssues > 20 ? 88 : 95

    return {
      githubStars: stars,
      forks,
      lastCommitDaysAgo,
      issueCloseRate,
      securityAuditPassed: securityPassed
    }
  }
}
