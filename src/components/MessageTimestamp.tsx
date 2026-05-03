import { useEffect, useMemo, useState } from 'react';
import type { AppLang } from '../types';
import type { Translator } from '../i18n';

const REFRESH_MS = 45_000;
const JUST_NOW_SEC = 90;
const FULL_DATE_AFTER_SEC = 7 * 24 * 60 * 60;

type Props = {
  createdAt?: string;
  lang: AppLang;
  t: Translator;
};

function localeForLang(lang: AppLang): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'es') return 'es-MX';
  return 'es-AR';
}

function formatShortLabel(iso: string, nowMs: number, lang: AppLang, t: Translator): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = localeForLang(lang);
  const diffSec = Math.floor((nowMs - d.getTime()) / 1000);
  if (diffSec < 0) {
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
  if (diffSec < JUST_NOW_SEC) {
    return t('chat.time.justNow');
  }
  if (diffSec >= FULL_DATE_AFTER_SEC) {
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diffSec < 3600) {
    return rtf.format(-Math.max(1, Math.floor(diffSec / 60)), 'minute');
  }
  if (diffSec < 86400) {
    return rtf.format(-Math.floor(diffSec / 3600), 'hour');
  }
  return rtf.format(-Math.floor(diffSec / 86400), 'day');
}

export function MessageTimestamp({ createdAt, lang, t }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const trimmed = createdAt?.trim();
  const tooltip = useMemo(() => {
    if (!trimmed) return '';
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(localeForLang(lang), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [trimmed, lang]);

  const short = useMemo(
    () => (trimmed ? formatShortLabel(trimmed, now, lang, t) : ''),
    [trimmed, now, lang, t],
  );

  if (!trimmed || !tooltip || !short) return null;

  return (
    <time className="msg-time" dateTime={trimmed} title={tooltip} aria-label={tooltip}>
      {short}
    </time>
  );
}
