import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { marked } from 'marked';

import { bubbleRoleLabel } from '../chatExportHelpers';
import type { ChatMessage } from '../types';
import type { Translator } from '../i18n';
import { getExportCapabilities } from './exportCapabilities';

marked.use({ breaks: true, gfm: true });

export type ChatExportFormat = 'html' | 'markdown' | 'pdf';

export type ChatExportPhase =
  | 'idle'
  | 'collecting'
  | 'building'
  | 'packaging'
  | 'renderingPdf'
  | 'done'
  | 'cancelled'
  | 'error';

export type ChatExportProgress = {
  phase: ChatExportPhase;
  percent: number;
};

const DATA_IMAGE_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extFromDataUrl(dataUrl: string): string {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  if (!m) return 'bin';
  const t = m[1].toLowerCase();
  if (t === 'jpeg') return 'jpg';
  return t.replace('+xml', '').replace(/[^a-z0-9]/g, '') || 'bin';
}

function collectDataImageUrls(messages: ChatMessage[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (u: string) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    ordered.push(u);
  };
  for (const m of messages) {
    if (m.attachments) {
      for (const a of m.attachments) {
        if (a.dataUrl) add(a.dataUrl);
      }
    }
    DATA_IMAGE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = DATA_IMAGE_RE.exec(m.content)) !== null) {
      add(match[0]);
    }
  }
  return ordered;
}

function buildUrlToPathMap(urls: string[]): Map<string, string> {
  const map = new Map<string, string>();
  urls.forEach((url, i) => {
    map.set(url, `images/img_${String(i + 1).padStart(3, '0')}.${extFromDataUrl(url)}`);
  });
  return map;
}

function replaceDataUrls(text: string, urlToPath: Map<string, string>): string {
  let out = text;
  const entries = [...urlToPath.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [url, path] of entries) {
    out = out.split(url).join(path);
  }
  return out;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const i = dataUrl.indexOf('base64,');
  if (i === -1) throw new Error('Invalid data URL');
  const b64 = dataUrl.slice(i + 7);
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let j = 0; j < len; j++) bytes[j] = binary.charCodeAt(j);
  return bytes;
}

async function buildAssistantHtml(content: string, urlToPath: Map<string, string>): Promise<string> {
  const replaced = replaceDataUrls(content, urlToPath);
  const raw = await marked(replaced, { async: true });
  return typeof raw === 'string' ? raw : String(raw);
}

function triggerDownload(filename: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function sanitizeFilenameBase(title: string): string {
  const t = title.trim() || 'chat';
  return t
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
    .replace(/\s/g, '-');
}

function formatTimestamp(iso: string | undefined, lang: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : lang === 'es-AR' ? 'es-AR' : 'es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return iso;
  }
}

const EXPORT_HTML_STYLES = `
:root {
  --bg: #f6f4ef;
  --panel: #fff;
  --text: #1a1a1a;
  --muted: #5c5c5c;
  --border: #e2ddd4;
  --user-bg: #e8f4fc;
  --assistant-bg: #fafafa;
  --code-bg: #f0ebe3;
  --accent: #2d6a9f;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2rem 1.25rem 3rem;
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
  font-size: 15px;
}
.export-header {
  max-width: 820px;
  margin: 0 auto 1.75rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.export-header h1 {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.export-header .meta {
  color: var(--muted);
  font-size: 0.88rem;
}
main { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.1rem; }
article.msg {
  border-radius: 14px;
  border: 1px solid var(--border);
  padding: 1rem 1.15rem;
  background: var(--panel);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
article.msg-user { background: var(--user-bg); border-color: #cfe8f8; }
article.msg-assistant { background: var(--assistant-bg); }
article.msg-system { background: #fff8e6; border-color: #f0e0b2; }
.msg-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.65rem;
  font-size: 0.82rem;
  color: var(--muted);
}
.msg-head strong { color: var(--accent); font-size: 0.95rem; }
.msg-body { color: var(--text); }
.msg-body-user { white-space: pre-wrap; }
.msg-attachments { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 0.75rem; }
.msg-attachments img {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.msg-body :is(h1,h2,h3,h4) { margin: 1rem 0 0.4rem; line-height: 1.25; }
.msg-body h1 { font-size: 1.35rem; }
.msg-body h2 { font-size: 1.2rem; }
.msg-body p { margin: 0.5rem 0; }
.msg-body ul, .msg-body ol { margin: 0.5rem 0; padding-left: 1.35rem; }
.msg-body pre {
  background: var(--code-bg);
  padding: 0.85rem 1rem;
  border-radius: 10px;
  overflow: auto;
  font-size: 0.84rem;
  line-height: 1.45;
}
.msg-body code {
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace;
  font-size: 0.88em;
  background: rgba(0,0,0,0.06);
  padding: 0.12em 0.35em;
  border-radius: 4px;
}
.msg-body pre code { background: none; padding: 0; }
.msg-body blockquote {
  margin: 0.65rem 0;
  padding: 0.35rem 0 0.35rem 0.85rem;
  border-left: 3px solid var(--accent);
  color: var(--muted);
}
.msg-body table { border-collapse: collapse; width: 100%; margin: 0.65rem 0; font-size: 0.9rem; }
.msg-body th, .msg-body td { border: 1px solid var(--border); padding: 0.35rem 0.5rem; }
.msg-body th { background: #ebe6de; }
.msg-body a { color: var(--accent); }
footer.export-footer {
  max-width: 820px;
  margin: 2rem auto 0;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.8rem;
  color: var(--muted);
  text-align: center;
}
`;

export async function runChatExport(options: {
  messages: ChatMessage[];
  sessionTitle: string;
  format: ChatExportFormat;
  signal: AbortSignal;
  t: Translator;
  chatDisplayName: string;
  assistantExportLabel: string;
  lang: string;
  onProgress: (p: ChatExportProgress) => void;
}): Promise<void> {
  const { messages, sessionTitle, format, signal, t, chatDisplayName, assistantExportLabel, lang, onProgress } =
    options;

  const report = (phase: ChatExportPhase, percent: number) => {
    onProgress({ phase, percent: Math.min(100, Math.max(0, percent)) });
  };

  if (!messages.length) {
    throw new Error('empty');
  }

  assertNotAborted(signal);
  report('collecting', 5);

  const imageUrls = collectDataImageUrls(messages);
  const useZip = imageUrls.length > 0 && (format === 'html' || format === 'markdown');
  const urlToPath = buildUrlToPathMap(imageUrls);

  assertNotAborted(signal);
  report('building', 18);

  const baseName = sanitizeFilenameBase(sessionTitle);
  const exportedAt = new Date().toISOString();

  if (format === 'markdown') {
    const parts: string[] = [];
    parts.push(`# ${sessionTitle}\n\n_${t('chat.export.metaExported')}: ${exportedAt}_\n\n---\n\n`);

    for (const m of messages) {
      assertNotAborted(signal);
      const roleLabel = bubbleRoleLabel(m, chatDisplayName, assistantExportLabel, t);
      const ts = formatTimestamp(m.createdAt, lang);
      parts.push(`## ${roleLabel}${ts ? ` · ${ts}` : ''}\n\n`);

      const body = replaceDataUrls(m.content, urlToPath);
      if (m.role === 'user') {
        parts.push(body ? `${body}\n\n` : '');
        if (m.attachments?.length) {
          for (const a of m.attachments) {
            const p = urlToPath.get(a.dataUrl);
            if (p) parts.push(`![${a.name}](${p})\n\n`);
          }
        }
      } else {
        parts.push(body ? `${body}\n\n` : '');
      }
      parts.push('---\n\n');
    }

    const md = parts.join('');

    if (useZip) {
      report('packaging', 55);
      const zip = new JSZip();
      zip.file('chat.md', md);
      const imgFolder = zip.folder('images');
      if (!imgFolder) throw new Error('zip folder');
      let i = 0;
      for (const url of imageUrls) {
        assertNotAborted(signal);
        const path = urlToPath.get(url);
        if (!path) continue;
        imgFolder.file(path.replace(/^images\//, ''), dataUrlToUint8Array(url));
        i++;
        report('packaging', 55 + Math.round((i / Math.max(imageUrls.length, 1)) * 35));
      }
      report('packaging', 92);
      assertNotAborted(signal);
      const blob = await zip.generateAsync({ type: 'blob' });
      assertNotAborted(signal);
      triggerDownload(`${baseName}-export.zip`, blob);
    } else {
      report('building', 85);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      triggerDownload(`${baseName}.md`, blob);
    }
    report('done', 100);
    return;
  }

  if (format === 'html') {
    const head = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(sessionTitle)}</title>
<style>${EXPORT_HTML_STYLES}</style>
</head>
<body>
<header class="export-header">
  <h1>${escapeHtml(sessionTitle)}</h1>
  <div class="meta">${escapeHtml(t('chat.export.metaExported'))}: ${escapeHtml(formatTimestamp(exportedAt, lang) || exportedAt)}</div>
</header>
<main>`;

    const foot = `</main>
<footer class="export-footer">${escapeHtml(t('chat.export.footer'))}</footer>
</body>
</html>`;

    const chunks: string[] = [head];
    let built = 0;
    for (const m of messages) {
      assertNotAborted(signal);
      const roleLabel = bubbleRoleLabel(m, chatDisplayName, assistantExportLabel, t);
      const ts = formatTimestamp(m.createdAt, lang);
      const roleClass =
        m.role === 'user' ? 'msg-user' : m.role === 'system' ? 'msg-system' : 'msg-assistant';

      let inner = '';

      if (m.role === 'user') {
        inner += `<div class="msg-body msg-body-user">${escapeHtml(m.content)}</div>`;
        if (m.attachments?.length) {
          inner += '<div class="msg-attachments">';
          for (const a of m.attachments) {
            const src = useZip ? urlToPath.get(a.dataUrl) ?? a.dataUrl : a.dataUrl;
            inner += `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(a.name)}"/></figure>`;
          }
          inner += '</div>';
        }
      } else {
        inner += `<div class="msg-body">${await buildAssistantHtml(m.content, urlToPath)}</div>`;
      }

      chunks.push(`<article class="msg ${roleClass}">
  <div class="msg-head"><strong>${escapeHtml(roleLabel)}</strong><span>${escapeHtml(ts)}</span></div>
  ${inner}
</article>`);

      built++;
      report('building', 18 + Math.round((built / Math.max(messages.length, 1)) * 40));
    }
    chunks.push(foot);
    const html = chunks.join('\n');

    if (useZip) {
      report('packaging', 65);
      const zip = new JSZip();
      zip.file('chat.html', html);
      const imgFolder = zip.folder('images');
      if (!imgFolder) throw new Error('zip folder');
      let i = 0;
      for (const url of imageUrls) {
        assertNotAborted(signal);
        const path = urlToPath.get(url);
        if (!path) continue;
        imgFolder.file(path.replace(/^images\//, ''), dataUrlToUint8Array(url));
        i++;
        report('packaging', 65 + Math.round((i / Math.max(imageUrls.length, 1)) * 28));
      }
      assertNotAborted(signal);
      const blob = await zip.generateAsync({ type: 'blob' });
      assertNotAborted(signal);
      triggerDownload(`${baseName}-export.zip`, blob);
    } else {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      triggerDownload(`${baseName}.html`, blob);
    }
    report('done', 100);
    return;
  }

  if (!getExportCapabilities().pdf) {
    throw new Error('unsupported');
  }

  report('building', 25);
  const pdfHost = document.createElement('div');
  pdfHost.setAttribute('data-chat-export-pdf', '1');
  pdfHost.id = 'minerva-chat-pdf-export-host';
  Object.assign(pdfHost.style, {
    position: 'fixed',
    left: '0',
    top: '-32000px',
    width: '720px',
    boxSizing: 'border-box',
    padding: '0',
    margin: '0',
    background: '#ffffff',
    color: '#161616',
    fontFamily: 'system-ui, "Segoe UI", sans-serif',
    fontSize: '13px',
    lineHeight: '1.45',
    zIndex: '2147483646',
    opacity: '1',
    pointerEvents: 'none',
    overflow: 'visible',
  } as Partial<CSSStyleDeclaration>);

  const innerPdf: string[] = [
    `<div style="margin-bottom:14px;border-bottom:1px solid #ddd;padding-bottom:10px;">
      <div style="font-size:16px;font-weight:600;">${escapeHtml(sessionTitle)}</div>
      <div style="font-size:11px;color:#666;margin-top:4px;">${escapeHtml(t('chat.export.metaExported'))}: ${escapeHtml(formatTimestamp(exportedAt, lang) || exportedAt)}</div>
    </div>`,
  ];

  for (const m of messages) {
    assertNotAborted(signal);
    const roleLabel = bubbleRoleLabel(m, chatDisplayName, assistantExportLabel, t);
    const ts = formatTimestamp(m.createdAt, lang);
    let block = `<section class="pdf-msg" style="padding:12px 0;border-bottom:1px solid #ddd;margin:0;">
      <div style="font-size:11px;color:#555;margin-bottom:8px;">
        <span style="font-weight:700;color:#111;">${escapeHtml(roleLabel)}</span>
        ${ts ? `<span style="color:#777;"> · ${escapeHtml(ts)}</span>` : ''}
      </div>`;
    if (m.role === 'user') {
      block += `<div style="white-space:pre-wrap;font-size:12px;line-height:1.5;">${escapeHtml(m.content)}</div>`;
      if (m.attachments?.length) {
        for (const a of m.attachments) {
          block += `<div style="margin-top:8px;"><img src="${a.dataUrl}" alt="" style="max-width:100%;height:auto;border:1px solid #ccc;display:block;"/></div>`;
        }
      }
    } else {
      block += `<div class="pdf-md-body" style="font-size:12px;line-height:1.5;">${await buildAssistantHtml(m.content, new Map())}</div>`;
    }
    block += '</section>';
    innerPdf.push(block);
  }

  const pdfCssReset = `<style type="text/css">
#minerva-chat-pdf-export-inner, #minerva-chat-pdf-export-inner * {
  color: #161616 !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
#minerva-chat-pdf-export-inner a { color: #0a4d94 !important; }
#minerva-chat-pdf-export-inner pre,
#minerva-chat-pdf-export-inner code {
  color: #141414 !important;
  background: #ececec !important;
}
#minerva-chat-pdf-export-inner blockquote {
  color: #333333 !important;
  border-left: 3px solid #888888 !important;
}
#minerva-chat-pdf-export-inner th, #minerva-chat-pdf-export-inner td {
  color: #141414 !important;
  border-color: #cccccc !important;
}
#minerva-chat-pdf-export-inner .pdf-msg { border-radius: 0 !important; }
#minerva-chat-pdf-export-inner .pdf-md-body pre { overflow: visible !important; max-height: none !important; }
</style>`;

  pdfHost.innerHTML = `${pdfCssReset}<div id="minerva-chat-pdf-export-inner" style="padding:20px 22px;background:#fff;color:#161616;">${innerPdf.join('')}</div>`;
  document.body.appendChild(pdfHost);

  try {
    assertNotAborted(signal);
    report('renderingPdf', 42);
    await document.fonts.ready.catch(() => {});
    const imgs = [...pdfHost.querySelectorAll('img')];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }
          }),
      ),
    );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    assertNotAborted(signal);
    const hostH = Math.max(1, pdfHost.scrollHeight);
    const maxCanvasPx = 12000;
    let scale = 1.75;
    if (hostH * scale > maxCanvasPx) scale = Math.max(0.85, maxCanvasPx / hostH);

    const canvas = await html2canvas(pdfHost, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 720,
      windowHeight: hostH,
      scrollX: 0,
      scrollY: 0,
    });

    assertNotAborted(signal);
    report('renderingPdf', 72);

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableW = pageW - 2 * margin;
    const usableH = pageH - 2 * margin;

    const imgW = usableW;
    const imgHmm = (canvas.height / canvas.width) * usableW;
    const pxPerPage = Math.max(1, (usableH / imgHmm) * canvas.height);

    let srcY = 0;
    let pageIdx = 0;
    while (srcY < canvas.height) {
      assertNotAborted(signal);
      if (pageIdx > 0) pdf.addPage();
      const remainingPx = canvas.height - srcY;
      const sliceH = Math.max(1, Math.min(Math.floor(pxPerPage), remainingPx));
      const strip = document.createElement('canvas');
      strip.width = canvas.width;
      strip.height = sliceH;
      const sctx = strip.getContext('2d');
      if (!sctx) throw new Error('Canvas 2D context unavailable');
      sctx.fillStyle = '#ffffff';
      sctx.fillRect(0, 0, strip.width, strip.height);
      sctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const stripData = strip.toDataURL('image/png');
      const sliceHmm = (sliceH / canvas.height) * imgHmm;
      pdf.addImage(stripData, 'PNG', margin, margin, imgW, sliceHmm, undefined, 'FAST');
      srcY += sliceH;
      pageIdx++;
    }

    report('renderingPdf', 92);
    pdf.save(`${baseName}.pdf`);
    report('done', 100);
  } finally {
    pdfHost.remove();
  }
}
