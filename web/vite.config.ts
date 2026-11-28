import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));

function runGit(args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

interface ChangelogEntry {
  version?: string;
  title?: string;
  added?: string[];
  fixed?: string[];
  improved?: string[];
}

function cleanStringList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveChangelogFromGit(): Omit<ChangelogEntry, 'version'> | null {
  const prevTag = runGit(['describe', '--tags', '--abbrev=0', 'HEAD^']);
  const range = prevTag ? `${prevTag}..HEAD` : '-n 8';
  const raw = runGit(['log', range, '--no-merges', '--pretty=format:%s']);
  if (!raw) return null;

  const added: string[] = [];
  const fixed: string[] = [];
  const improved: string[] = [];

  for (const line of raw.split('\n')) {
    const msg = line.trim();
    if (!msg) continue;
    const match = msg.match(/^([a-zA-Z]+)(?:\([^)]+\))?:\s*(.+)$/);
    if (!match) continue;
    const type = match[1].toLowerCase();
    const subject = match[2].trim();
    if (!subject) continue;

    if (type === 'feat') added.push(subject);
    else if (type === 'fix') fixed.push(subject);
    else if (type === 'perf' || type === 'refactor') improved.push(subject);
  }

  if (added.length === 0 && fixed.length === 0 && improved.length === 0) {
    return null;
  }

  return {
    ...(added.length > 0 ? { added } : {}),
    ...(fixed.length > 0 ? { fixed } : {}),
    ...(improved.length > 0 ? { improved } : {}),
  };
}

function resolveChangelog(version: string): Omit<ChangelogEntry, 'version'> | null {
  const normalizedVersion = version.replace(/^v/i, '').trim();
  try {
    const raw = readFileSync(resolve(__dirname, 'changelog.json'), 'utf8');
    const entries = JSON.parse(raw) as ChangelogEntry[];
    if (Array.isArray(entries)) {
      const matched = entries.find(
        (entry) => (entry.version ?? '').replace(/^v/i, '').trim() === normalizedVersion
      );
      if (matched) {
        const added = cleanStringList(matched.added);
        const fixed = cleanStringList(matched.fixed);
        const improved = cleanStringList(matched.improved);
        const title = typeof matched.title === 'string' && matched.title.trim() ? matched.title.trim() : undefined;
        if (added.length > 0 || fixed.length > 0 || improved.length > 0) {
          return {
            ...(title ? { title } : {}),
            ...(added.length > 0 ? { added } : {}),
            ...(fixed.length > 0 ? { fixed } : {}),
            ...(improved.length > 0 ? { improved } : {}),
          };
        }
      }
    }
  } catch {
    // changelog.json missing or invalid; fall back to git commits
  }

  return resolveChangelogFromGit();
}

function resolveAppVersionInfo() {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
    version?: string;
  };
  const pkgVersion = (pkg.version ?? '0.1.0').replace(/^v/i, '').trim();
  const envVersion = (process.env.VITE_APP_VERSION || process.env.VERSION_NAME || '')
    .replace(/^v/i, '')
    .trim();
  const gitTag = runGit(['describe', '--tags', '--abbrev=0']).replace(/^v/i, '').trim();

  let version = pkgVersion;
  if (envVersion) {
    version = envVersion;
  } else if (gitTag && compareSemver(gitTag, pkgVersion) > 0) {
    version = gitTag;
  }

  const envBuild = parseInt(process.env.VERSION_CODE || '', 10);
  const isShallow = runGit(['rev-parse', '--is-shallow-repository']) === 'true';
  const gitCount = isShallow ? 0 : parseInt(runGit(['rev-list', '--count', 'HEAD']), 10) || 0;
  const build = envBuild > 0 ? envBuild : gitCount > 0 ? gitCount : null;

  const commit = (
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    runGit(['rev-parse', '--short', 'HEAD']) ||
    ''
  ).slice(0, 7);

  const buildTime = new Date().toISOString();
  const buildId = `${version}-${build ?? '0'}-${commit || 'local'}-${buildTime}`;
  const changelog = resolveChangelog(version);

  return {
    version,
    build,
    commit,
    buildTime,
    buildId,
    changelog,
  };
}

const appVersionInfo = resolveAppVersionInfo();

function versionManifestPlugin(): Plugin {
  const payload = JSON.stringify(appVersionInfo, null, 2);
  return {
    name: 'jibeman-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION_INFO__: JSON.stringify(appVersionInfo),
  },
  plugins: [
    react(),
    versionManifestPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'favicon.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
      ],
      manifest: {
        name: 'جیب من — مدیریت مالی شخصی',
        short_name: 'جیب من',
        description: 'مدیریت هزینه‌ها، درآمدها، حساب‌های بانکی و وام‌ها به‌صورت کاملاً آفلاین و خصوصی',
        theme_color: '#05060D',
        background_color: '#05060D',
        display: 'standalone',
        orientation: 'portrait',
        dir: 'rtl',
        lang: 'fa',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
});
