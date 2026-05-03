import { useEffect, useState } from 'react';

import type { Translator } from '../i18n';
import { getOriginStorageQuotaMb } from '../storageEstimate';

const REFRESH_MS = 30_000;
/** Show banner when used/quota is at or above this ratio (0–1). */
const PRESSURE_RATIO = 0.82;

type Props = {
  t: Translator;
  onOpenDataSettings: () => void;
};

export function StoragePressureBanner({ t, onOpenDataSettings }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const tick = () => {
      void getOriginStorageQuotaMb().then((q) => {
        if (q.quotaMb <= 0) {
          setVisible(false);
          return;
        }
        setVisible(q.usedMb / q.quotaMb >= PRESSURE_RATIO);
      });
    };
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!visible) return null;

  return (
    <div className="storage-pressure-banner" role="status">
      <p className="storage-pressure-banner-text">{t('storage.pressureBanner')}</p>
      <button type="button" className="storage-pressure-banner-link" onClick={onOpenDataSettings}>
        {t('storage.pressureBannerLink')}
      </button>
    </div>
  );
}
