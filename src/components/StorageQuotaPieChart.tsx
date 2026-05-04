import { useEffect, useState } from 'react';

import type { Translator } from '../i18n';
import type { OriginStorageQuotaMib } from '../storageEstimate';
import { getOriginStorageQuotaMib } from '../storageEstimate';
import { StorageQuotaHint } from './StorageQuotaHint';

const REFRESH_MS = 5000;
const CX = 60;
const CY = 60;
const R = 52;

function pieWedge(cx: number, cy: number, r: number, startRad: number, endRad: number): string {
  if (endRad - startRad <= 1e-6) return '';
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const large = endRad - startRad > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

type Props = {
  t: Translator;
};

export function StorageQuotaPieChart({ t }: Props) {
  const [q, setQ] = useState<OriginStorageQuotaMib | null>(null);

  useEffect(() => {
    const tick = () => {
      void getOriginStorageQuotaMib().then(setQ);
    };
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!q || (q.quotaMib === 0 && q.usedMib === 0 && q.freeMib === 0)) {
    return <StorageQuotaHint t={t} />;
  }

  if (q.quotaMib <= 0) {
    return <StorageQuotaHint t={t} />;
  }

  const usedRatio = Math.min(1, Math.max(0, q.usedMib / q.quotaMib));
  const start = -Math.PI / 2;
  const usedEnd = start + usedRatio * 2 * Math.PI;
  const fullEnd = start + 2 * Math.PI;

  const usedPath =
    usedRatio >= 1 - 1e-9
      ? null
      : usedRatio <= 1e-9
        ? null
        : pieWedge(CX, CY, R, start, usedEnd);
  const freePath =
    usedRatio >= 1 - 1e-9
      ? null
      : usedRatio <= 1e-9
        ? null
        : pieWedge(CX, CY, R, usedEnd, fullEnd);

  const ariaLabel = t('settings.storageQuotaTitle')
    .replace('{quota}', String(q.quotaMib))
    .replace('{used}', String(q.usedMib))
    .replace('{free}', String(q.freeMib));

  return (
    <div className="settings-storage-pie-wrap">
      <h4 className="settings-storage-pie-title">{t('settings.storagePieTitle')}</h4>
      <div className="settings-storage-pie-row">
        <svg
          className="settings-storage-pie-svg"
          viewBox="0 0 120 120"
          width={120}
          height={120}
          role="img"
          aria-label={ariaLabel}
        >
          {usedRatio <= 1e-9 ? (
            <circle cx={CX} cy={CY} r={R} className="settings-storage-pie-slice settings-storage-pie-slice--free" />
          ) : usedRatio >= 1 - 1e-9 ? (
            <circle cx={CX} cy={CY} r={R} className="settings-storage-pie-slice settings-storage-pie-slice--used" />
          ) : (
            <>
              {usedPath ? (
                <path d={usedPath} className="settings-storage-pie-slice settings-storage-pie-slice--used" />
              ) : null}
              {freePath ? (
                <path d={freePath} className="settings-storage-pie-slice settings-storage-pie-slice--free" />
              ) : null}
            </>
          )}
        </svg>
        <ul className="settings-storage-pie-legend" aria-hidden="true">
          <li className="settings-storage-pie-legend-item settings-storage-pie-legend-item--used">
            <span className="settings-storage-pie-legend-label">{t('settings.storagePieLegendUsed')}</span>
            <span className="settings-storage-pie-legend-value">{q.usedMib} MiB</span>
          </li>
          <li className="settings-storage-pie-legend-item settings-storage-pie-legend-item--free">
            <span className="settings-storage-pie-legend-label">{t('settings.storagePieLegendFree')}</span>
            <span className="settings-storage-pie-legend-value">{q.freeMib} MiB</span>
          </li>
          <li className="settings-storage-pie-legend-item settings-storage-pie-legend-item--quota">
            <span className="settings-storage-pie-legend-label">{t('settings.storagePieLegendQuota')}</span>
            <span className="settings-storage-pie-legend-value">{q.quotaMib} MiB</span>
          </li>
        </ul>
      </div>
      <p className="hint settings-storage-pie-caption">{t('settings.storagePieCaption')}</p>
    </div>
  );
}
