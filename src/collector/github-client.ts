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

export interface GitHubTreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
}

export interface GitHubRepositorySearchItem {
  full_name: string
  name: string
  description: string | null
  default_branch: string
  stargazers_count: number
  archived: boolean
  fork: boolean
  owner: { login: string }
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
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) })
      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          throw new Error(`GitHub API rate limit (${res.status}) while fetching ${url}`)
        } else if (res.status !== 404) {
          console.warn(`[GitHubClient] HTTP ${res.status} for ${url}`)
        }
        return null
      }
      const data = (await res.json()) as T
      this.cache.set(url, data)
      return data
    } catch (err) {
      if ((err as Error).message.startsWith('GitHub API rate limit')) throw err
      console.warn(`[GitHubClient] Network error fetching ${url}:`, (err as Error).message)
      return null
    }
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepoResponse | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}`
    return this.fetchJson<GitHubRepoResponse>(url)
  }

  async searchRepositories(query: string, page = 1): Promise<GitHubRepositorySearchItem[]> {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100&page=${page}`
    const result = await this.fetchJson<{ items: GitHubRepositorySearchItem[] }>(url)
    if (!result) throw new Error(`GitHub repository search failed: ${query}`)
    return result.items || []
  }

  async getTree(owner: string, repo: string, branch: string): Promise<GitHubTreeEntry[] | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    const result = await this.fetchJson<{ tree: GitHubTreeEntry[]; truncated: boolean }>(url)
    if (!result || result.truncated) return null
    return result.tree
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
      const res = await fetch(rawUrl, { headers, signal: AbortSignal.timeout(12000) })
      if (res.ok) {
        const text = await res.text()
        this.cache.set(cacheKey, text)
        return text
      }
      if (res.status === 404) return null
    } catch (err) {
      console.warn(`[GitHubClient] Raw fetch failed for ${rawUrl}: ${(err as Error).message}`)
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`
    const apiHeaders: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'Halowake-Skills-Registry/1.0' }
    if (this.token) apiHeaders.Authorization = `Bearer ${this.token}`
    const res = await fetch(apiUrl, { headers: apiHeaders, signal: AbortSignal.timeout(12000) })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GitHub file API failed (${res.status}): ${apiUrl}`)
    const file = await res.json() as { content?: string; encoding?: string }
    if (file.encoding !== 'base64' || !file.content) throw new Error(`Unsupported GitHub file response: ${apiUrl}`)
    const content = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8')
    this.cache.set(cacheKey, content)
    return content
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
