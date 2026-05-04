import { useEffect, useState } from 'react';

import type { Translator } from '../i18n';
import { getOriginStorageQuotaMib } from '../storageEstimate';

const REFRESH_MS = 5000;

type Props = {
  t: Translator;
};

export function StorageQuotaHint({ t }: Props) {
  const [q, setQ] = useState<Awaited<ReturnType<typeof getOriginStorageQuotaMib>> | null>(null);

  useEffect(() => {
    const tick = () => {
      void getOriginStorageQuotaMib().then(setQ);
    };
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!q || (q.quotaMib === 0 && q.usedMib === 0 && q.freeMib === 0)) {
    const title = t('settings.storageQuotaUnavailableTitle');
    return (
      <p className="hint settings-storage-quota" title={title} aria-label={title}>
        <span className="settings-storage-quota-inner">{t('settings.storageQuotaUnavailable')}</span>
      </p>
    );
  }

  const title = t('settings.storageQuotaTitle')
    .replace('{quota}', String(q.quotaMib))
    .replace('{used}', String(q.usedMib))
    .replace('{free}', String(q.freeMib));

  const line = t('settings.storageQuotaLine')
    .replace('{quota}', String(q.quotaMib))
    .replace('{used}', String(q.usedMib))
    .replace('{free}', String(q.freeMib));

  return (
    <p className="hint settings-storage-quota" title={title} aria-label={title}>
      <span aria-hidden="true" className="settings-storage-quota-inner">
        {line}
      </span>
    </p>
  );
}
