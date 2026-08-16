import { useEffect, useState } from 'react'
import { SITE } from './site'

function repoPath(url: string): string {
  const path = url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  return path.split('#')[0].split('?')[0]
}

/** Live star count from the GitHub API. Returns null until loaded / on failure. */
export function useGithubStars(): number | null {
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${repoPath(SITE.github)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.stargazers_count === 'number') {
          setStars(data.stargazers_count)
        }
      })
      .catch(() => {
        // keep null fallback on network errors / rate limits
      })
    return () => {
      cancelled = true
    }
  }, [])

  return stars
}

export function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}