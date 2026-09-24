export interface GitHubRepoResponse {
  name: string
  full_name: string
  description: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  updated_at: string
  pushed_at: string
  html_url: string
  owner: {
    login: string
    avatar_url: string
    html_url: string
  }
}

export interface GitHubContentResponse {
  name: string
  path: string
  type: 'file' | 'dir'
  content?: string
  encoding?: string
  download_url?: string | null
}

export interface GitHubCommitSummary {
  sha: string
  commit: {
    author: { date: string }
    committer: { date: string }
    message: string
  }
}

export class GitHubClient {
  private token?: string
  private cache = new Map<string, any>()

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    if (this.cache.has(url)) {
      return this.cache.get(url) as T
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Halowake-Skills-Registry/1.0 (+https://github.com/zhkai-ybwn/halowake-skills-registry)',
      Accept: 'application/vnd.github.v3+json'
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    try {
      const res = await fetch(url, { headers })
      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          console.warn(`[GitHubClient] Rate limited on: ${url}`)
        } else if (res.status !== 404) {
          console.warn(`[GitHubClient] HTTP ${res.status} for ${url}`)
        }
        return null
      }
      const data = (await res.json()) as T
      this.cache.set(url, data)
      return data
    } catch (err) {
      console.warn(`[GitHubClient] Network error fetching ${url}:`, (err as Error).message)
      return null
    }
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepoResponse | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}`
    return this.fetchJson<GitHubRepoResponse>(url)
  }

  async getDirectory(
    owner: string,
    repo: string,
    path = '',
    branch = 'main'
  ): Promise<GitHubContentResponse[] | null> {
    const cleanPath = path.replace(/^\/+|\/+$/g, '')
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`
    const result = await this.fetchJson<GitHubContentResponse[] | GitHubContentResponse>(url)
    if (!result) return null
    return Array.isArray(result) ? result : [result]
  }

  async getFileRaw(
    owner: string,
    repo: string,
    path: string,
    branch = 'main'
  ): Promise<string | null> {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.replace(/^\/+/, '')}`
    const cacheKey = `raw:${rawUrl}`
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)

    const headers: Record<string, string> = {
      'User-Agent': 'Halowake-Skills-Registry/1.0'
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    try {
      const res = await fetch(rawUrl, { headers })
      if (!res.ok) return null
      const text = await res.text()
      this.cache.set(cacheKey, text)
      return text
    } catch {
      return null
    }
  }

  async getLatestCommitDate(owner: string, repo: string, branch = 'main'): Promise<string | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1&sha=${branch}`
    const commits = await this.fetchJson<GitHubCommitSummary[]>(url)
    if (commits && commits.length > 0) {
      return commits[0].commit.committer.date || commits[0].commit.author.date
    }
    return null
  }
}
