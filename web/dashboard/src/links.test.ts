import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { externalLinkProps } from './components/shared'

const sourceDir = path.dirname(new URL(import.meta.url).pathname)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'ui' ? [] : sourceFiles(full)
    return entry.name.endsWith('.tsx') ? [full] : []
  })
}

describe('external links', () => {
  it('open in a new tab without access to the dashboard', () => {
    expect(externalLinkProps).toEqual({ target: '_blank', rel: 'noopener noreferrer' })
  })

  it('always go through ExternalLink', () => {
    // A raw <a> pointing off-site would open in the same tab and replace the
    // live dashboard. Only shared.tsx may render such an anchor.
    const offenders = sourceFiles(sourceDir)
      .filter(file => !file.endsWith(`${path.sep}shared.tsx`))
      .flatMap(file => {
        const anchors = readFileSync(file, 'utf8').match(/<a\s[^>]*>/g) ?? []
        return anchors
          .filter(anchor => /https?:|HUB_URL|hubRecordingUrl|target=/.test(anchor))
          .map(anchor => `${path.relative(sourceDir, file)}: ${anchor}`)
      })
    expect(offenders).toEqual([])
  })
})
