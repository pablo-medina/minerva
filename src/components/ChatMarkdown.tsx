import {
  Children,
  type ReactElement,
  type ReactNode,
  isValidElement,
  memo,
  useCallback,
  useMemo,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ThemeMode } from '../types';
import type { Translator } from '../i18n';
import { inferCodeDownloadFilename } from '../codeDownloadFilename';

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const t = href.trim().toLowerCase();
  if (t.startsWith('javascript:') || t.startsWith('data:') || t.startsWith('vbscript:')) {
    return undefined;
  }
  return href;
}

const remarkPlugins = [remarkGfm];

type ChatMarkdownProps = {
  content: string;
  theme: ThemeMode;
  t: Translator;
};

function flattenMarkdownText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenMarkdownText).join('');
  if (isValidElement(node)) {
    return flattenMarkdownText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function IconDownload() {
  return (
    <svg className="markdown-code-toolbar-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
      />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg className="markdown-code-toolbar-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
      />
    </svg>
  );
}

function MarkdownCodeToolbar({
  code,
  fenceLang,
  t,
}: {
  code: string;
  fenceLang: string;
  t: Translator;
}) {
  const [copied, setCopied] = useState(false);
  const filename = useMemo(() => inferCodeDownloadFilename(code, fenceLang), [code, fenceLang]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }, [code]);

  const onDownload = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [code, filename]);

  return (
    <div className="markdown-code-toolbar">
      <button
        type="button"
        className="markdown-code-toolbar-btn"
        onClick={onDownload}
        title={t('chat.code.download')}
        aria-label={t('chat.code.downloadAria')}
      >
        <IconDownload />
      </button>
      <button
        type="button"
        className="markdown-code-toolbar-btn"
        onClick={() => void onCopy()}
        title={copied ? t('chat.code.copied') : t('chat.code.copy')}
        aria-label={t('chat.code.copyAria')}
      >
        <IconCopy />
      </button>
    </div>
  );
}

function MarkdownPreWithToolbar({ children, t }: { children?: ReactNode; t: Translator }) {
  const arr = Children.toArray(children);
  const codeEl = arr.find(
    (c): c is ReactElement<{ className?: string; children?: ReactNode }> =>
      isValidElement(c) && c.type === 'code',
  );

  if (!codeEl) {
    return <pre>{children}</pre>;
  }

  const className = codeEl.props.className ?? '';
  const fenceMatch = /language-([\w.-]+)/.exec(className);
  const fenceLang = fenceMatch?.[1] ?? '';
  const raw = flattenMarkdownText(codeEl.props.children);

  return (
    <pre className="markdown-pre-with-toolbar">
      <MarkdownCodeToolbar code={raw} fenceLang={fenceLang} t={t} />
      {children}
    </pre>
  );
}

function ChatMarkdownInner(props: ChatMarkdownProps) {
  const { content, t } = props;
  const components = useMemo(
    () => ({
      a: ({
        href,
        children,
        ...rest
      }: {
        href?: string;
        children?: ReactNode;
      }) => (
        <a href={safeHref(href)} {...rest} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
      pre: ({ children }: { children?: ReactNode }) => <MarkdownPreWithToolbar t={t}>{children}</MarkdownPreWithToolbar>,
    }),
    [t],
  );

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownInner);
