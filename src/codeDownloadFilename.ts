/** Maps common fenced-code language tags to file extensions (with leading dot). */
const FENCE_LANG_TO_EXT: Record<string, string> = {
  javascript: '.js',
  js: '.js',
  jsx: '.jsx',
  mjs: '.mjs',
  cjs: '.cjs',
  typescript: '.ts',
  ts: '.ts',
  tsx: '.tsx',
  python: '.py',
  py: '.py',
  rust: '.rs',
  rs: '.rs',
  go: '.go',
  golang: '.go',
  java: '.java',
  kotlin: '.kt',
  kt: '.kt',
  swift: '.swift',
  ruby: '.rb',
  rb: '.rb',
  php: '.php',
  csharp: '.cs',
  cs: '.cs',
  cpp: '.cpp',
  cxx: '.cpp',
  cc: '.c',
  c: '.c',
  h: '.h',
  hpp: '.hpp',
  sql: '.sql',
  shell: '.sh',
  bash: '.sh',
  sh: '.sh',
  zsh: '.zsh',
  powershell: '.ps1',
  ps1: '.ps1',
  pwsh: '.ps1',
  html: '.html',
  htm: '.html',
  css: '.css',
  scss: '.scss',
  sass: '.sass',
  less: '.less',
  json: '.json',
  jsonc: '.jsonc',
  yaml: '.yaml',
  yml: '.yml',
  xml: '.xml',
  svg: '.svg',
  markdown: '.md',
  md: '.md',
  toml: '.toml',
  ini: '.ini',
  dockerfile: '',
  text: '.txt',
  plaintext: '.txt',
  txt: '.txt',
  diff: '.diff',
  vue: '.vue',
  svelte: '.svelte',
};

const WIN_INVALID = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeBase(name: string, maxLen = 96): string {
  const trimmed = name
    .trim()
    .replace(WIN_INVALID, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, maxLen)
    .replace(/\.+$/, '');
  return trimmed || 'snippet';
}

function basenameOnly(pathLike: string): string {
  const s = pathLike.trim().replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** First-line hints (model or user) for download filename. */
function parseMagicFilename(code: string): string | null {
  const lines = code.split(/\r?\n/).slice(0, 5);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m1 = /^(?:\/\/|#|\*|<!--)\s*minerva-filename:\s*(.+)$/i.exec(t);
    if (m1) return basenameOnly(m1[1]);
    const m2 = /^(?:\/\/|#)\s*@?(?:file|filename)\s*[:=]\s*(.+)$/i.exec(t);
    if (m2) return basenameOnly(m2[1]);
    const m3 = /^\/\*\s*minerva-filename:\s*(.+?)\s*\*\/\s*$/i.exec(t);
    if (m3) return basenameOnly(m3[1]);
  }
  return null;
}

function extensionForFenceLang(lang: string): string {
  const k = lang.trim().toLowerCase();
  if (!k) return '.txt';
  if (k in FENCE_LANG_TO_EXT) {
    const ext = FENCE_LANG_TO_EXT[k];
    return ext === '' ? '' : ext;
  }
  if (/^[\w.-]+$/.test(k)) return `.${k}`;
  return '.txt';
}

function stemFromCode(code: string): string | null {
  const body = code.replace(/^\uFEFF/, '').trimStart();
  const patterns: RegExp[] = [
    /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/m,
    /^export\s+default\s+function\s+([A-Za-z_$][\w$]*)/m,
    /^class\s+([A-Za-z_$][\w$]*)/m,
    /^interface\s+([A-Za-z_$][\w$]*)/m,
    /^type\s+([A-Za-z_$][\w$]*)\s*=/m,
    /^enum\s+([A-Za-z_$][\w$]*)/m,
    /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/m,
    /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/m,
    /^def\s+([A-Za-z_][\w]*)\s*\(/m,
    /^async\s+def\s+([A-Za-z_][\w]*)\s*\(/m,
    /^fn\s+([A-Za-z_][\w]*)\s*[({]/m,
    /^pub\s+fn\s+([A-Za-z_][\w]*)\s*\(/m,
  ];
  for (const re of patterns) {
    const m = re.exec(body);
    if (m?.[1] && m[1].length >= 1) return m[1];
  }
  return null;
}

/**
 * Suggests a download filename for a fenced code block: magic first-line hint,
 * then identifier heuristics, then language-based extension.
 */
export function inferCodeDownloadFilename(code: string, fenceLang: string): string {
  const langLower = fenceLang.trim().toLowerCase();
  if (langLower === 'dockerfile') {
    return 'Dockerfile';
  }

  const magic = parseMagicFilename(code);
  if (magic) {
    const base = sanitizeBase(basenameOnly(magic));
    if (/\.[A-Za-z0-9._-]{1,24}$/.test(base)) return base;
    const ext = extensionForFenceLang(fenceLang);
    return ext ? `${base}${ext}` : base;
  }

  const ext = extensionForFenceLang(fenceLang);
  const stemRaw = stemFromCode(code);
  const stem = stemRaw ? sanitizeBase(stemRaw) : 'snippet';
  return ext ? `${stem}${ext}` : stem;
}
