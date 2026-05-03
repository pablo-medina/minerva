import { useEffect, useState } from 'react';

import type { Translator } from '../i18n';
import { getOriginStorageQuotaMb } from '../storageEstimate';

const REFRESH_MS = 5000;

type Props = {
  t: Translator;
};

export function StorageQuotaHint({ t }: Props) {
  const [q, setQ] = useState<Awaited<ReturnType<typeof getOriginStorageQuotaMb>> | null>(null);

  useEffect(() => {
    const tick = () => {
      void getOriginStorageQuotaMb().then(setQ);
    };
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!q || (q.quotaMb === 0 && q.usedMb === 0 && q.freeMb === 0)) {
    const title = t('settings.storageQuotaUnavailableTitle');
    return (
      <p className="hint settings-storage-quota" title={title} aria-label={title}>
        <span className="settings-storage-quota-inner">{t('settings.storageQuotaUnavailable')}</span>
      </p>
    );
  }

  const title = t('settings.storageQuotaTitle')
    .replace('{quota}', String(q.quotaMb))
    .replace('{used}', String(q.usedMb))
    .replace('{free}', String(q.freeMb));

  const line = t('settings.storageQuotaLine')
    .replace('{quota}', String(q.quotaMb))
    .replace('{used}', String(q.usedMb))
    .replace('{free}', String(q.freeMb));

  return (
    <p className="hint settings-storage-quota" title={title} aria-label={title}>
      <span aria-hidden="true" className="settings-storage-quota-inner">
        {line}
      </span>
    </p>
  );
}
