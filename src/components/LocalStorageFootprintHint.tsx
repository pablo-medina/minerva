import { useEffect, useState } from 'react';
import { getLocalStorageUsageSummary } from '../storage';

type Props = {
  t: (key: string) => string;
};

const REFRESH_MS = 4000;

export function LocalStorageFootprintHint({ t }: Props) {
  const [snapshot, setSnapshot] = useState(() => getLocalStorageUsageSummary());

  useEffect(() => {
    const tick = () => setSnapshot(getLocalStorageUsageSummary());
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const title = t('settings.localStorageUsageTitle')
    .replace('{pct}', String(snapshot.percentTypical))
    .replace('{quotaMiB}', String(snapshot.assumedQuotaMiB));

  const line = t('settings.localStorageUsageLine').replace('{pct}', String(snapshot.percentTypical));

  return (
    <p className="hint settings-localstorage-footprint" title={title} aria-label={title}>
      <span aria-hidden="true" className="settings-localstorage-footprint-inner">
        {line}
      </span>
    </p>
  );
}
