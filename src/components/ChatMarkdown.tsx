import { type ReactNode, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ThemeMode } from '../types';
import type { Translator } from '../i18n';

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

function ChatMarkdownInner({ content }: ChatMarkdownProps) {
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
    }),
    [],
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
