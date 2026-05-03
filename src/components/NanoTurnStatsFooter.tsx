import { useState } from 'react';
import type { NanoTurnStats } from '../types';
import type { Translator } from '../i18n';
import type { AppLang } from '../types';
import { formatMessageAbsoluteTime } from './MessageTimestamp';
import { DraggableDialog } from './DraggableDialog';

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtTps(tps: number | undefined): string {
  if (tps == null || !Number.isFinite(tps)) return '—';
  return `${tps.toFixed(1)} tok/s`;
}

function shortModel(id: string, max = 28): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 1)}…`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value}</td>
    </tr>
  );
}

export function NanoTurnStatsFooter({
  stats,
  t,
  messageCreatedAt,
  lang,
}: {
  stats: NanoTurnStats;
  t: Translator;
  messageCreatedAt?: string;
  lang: AppLang;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const compact = [fmtMs(stats.totalLatencyMs), fmtTps(stats.genTps), shortModel(stats.modelId, 22)].join(' · ');
  const approxNote = ` (${t('turnStats.estimatedShort')})`;
  const modelShort = shortModel(stats.modelId, 22);

  const trimmedCreated = messageCreatedAt?.trim();
  const absoluteTime = trimmedCreated ? formatMessageAbsoluteTime(trimmedCreated, lang) : '';

  const title = `${compact}${approxNote}`;

  return (
    <footer className="turn-stats">
      <p className="turn-stats-compact" title={title}>
        <span className="turn-stats-metrics">
          <span className="turn-stats-badge">{fmtMs(stats.totalLatencyMs)}</span>
          <span className="turn-stats-badge">{fmtTps(stats.genTps)}</span>
        </span>
        <span className="turn-stats-model">{modelShort}</span>
        <span className="turn-stats-approx">{approxNote}</span>
        <button type="button" className="turn-stats-details-btn" onClick={() => setDetailsOpen(true)}>
          {t('turnStats.details')}
        </button>
      </p>

      <DraggableDialog
        open={detailsOpen}
        title={t('turnStats.title')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={() => setDetailsOpen(false)}
        width={560}
        variant="solid"
      >
        <p className="hint turn-stats-nano-lead">{t('turnStats.nanoLead')}</p>
        <table className="turn-stats-table">
          <tbody>
            {absoluteTime ? <Row label={t('turnStats.timestamp')} value={absoluteTime} /> : null}
            <Row label={t('turnStats.model')} value={stats.modelId} />
            <Row label={t('turnStats.totalTime')} value={fmtMs(stats.totalLatencyMs)} />
            {stats.ttftMs != null ? <Row label={t('turnStats.ttft')} value={fmtMs(stats.ttftMs)} /> : null}
            <Row
              label={t('turnStats.promptTokens')}
              value={`${stats.approxPromptTokenEstimate} (${t('turnStats.estimated')})`}
            />
            <Row
              label={t('turnStats.completionTokens')}
              value={`${stats.approxCompletionTokenEstimate} (${t('turnStats.estimated')})`}
            />
            <Row label={t('turnStats.totalTokens')} value={`${stats.approxTotalTokenEstimate} (${t('turnStats.estimated')})`} />
            <Row label={t('turnStats.generationSpeed')} value={fmtTps(stats.genTps)} />
          </tbody>
        </table>
      </DraggableDialog>
    </footer>
  );
}
