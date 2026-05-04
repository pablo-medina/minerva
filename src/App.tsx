import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { createTranslator, detectBrowserLang } from './i18n';
import { modelLabelForSession } from './modelLabel';
import {
  LM_CORE,
  isChromiumBrowser,
  languageModelEntryOk,
  languageModelImageInputSupported,
  languageModelSupported,
  lmCoreForThreadUsesImages,
} from './promptApi';
import { BackupRestoreError, downloadMinervaBackupFile, importMinervaBackupFromFile } from './backupRestore';
import {
  clampStreamFirstChunkTimeoutSec,
  DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
  DEFAULT_STREAM_FIRST_CHUNK_TIMEOUT_SEC,
  deleteChatSession,
  loadActiveSessionId,
  loadAppPrefs,
  loadMessages,
  loadSessions,
  loadSettings,
  pruneOldestChatSessionsExcludingActive,
  saveActiveSessionId,
  saveAppPrefsLang,
  saveAppPrefsTheme,
  saveMessages,
  saveSessions,
  saveSettings,
  wipeAllChatThreads,
} from './storage';
import { fingerprintForChatSummaryCache, summarizeChatMessages } from './chatSummary';
import { generateChatTitleWithOnDeviceModel, shouldRefreshChatTitle } from './chatTitleAi';
import {
  buildSessionInitialPromptsAsync,
  defaultSessionSystemContext,
  resolveApproximateLocation,
} from './sessionSystemPrompt';
import { buildNanoTurnStats } from './nanoTurnStats';
import { buildUserTurnModelParts } from './userModelParts';
import type { AppLang, ChatAttachment, ChatImageAttachment, ChatMessage, ChatSession, LocalSettings, ThemeMode } from './types';
import { isChatImageAttachment, isChatTextAttachment } from './types';
import { ChatExportDialog } from './components/ChatExportDialog';
import { ImageViewerDialog } from './components/ImageViewerDialog';
import { NanoTurnStatsFooter } from './components/NanoTurnStatsFooter';
import { formatBytes, estimateDataUrlBytes } from './chatExportHelpers';
import { collectChatImagesInOrder, indexOfAttachmentInChat } from './util/collectChatImages';
import {
  COMPOSER_FILE_INPUT_ACCEPT,
  DEFAULT_MAX_IMAGE_ATTACHMENT_MIB,
  DEFAULT_MAX_TEXT_ATTACHMENT_MIB,
  MAX_CHAT_ATTACHMENTS_TOTAL,
  MAX_CHAT_IMAGE_ATTACHMENTS,
  MAX_CHAT_TEXT_ATTACHMENTS,
  MAX_MAX_IMAGE_ATTACHMENT_MIB,
  MAX_MAX_TEXT_ATTACHMENT_MIB,
  MIN_MAX_IMAGE_ATTACHMENT_MIB,
  MIN_MAX_TEXT_ATTACHMENT_MIB,
} from './chatAttachmentConstants';
import {
  closeImageBitmaps,
  collectPastedImageFilesFromClipboard,
  fileToImageAttachment,
  formatImageSizeLimitLabel,
  isSupportedChatImageMime,
  threadUsesImageInputs,
} from './chatImageAttachments';
import {
  collectPastedTextFilesFromClipboard,
  countImageAttachments,
  countTextAttachments,
  fileToTextAttachment,
  isSupportedTextAttachmentMime,
} from './chatTextAttachments';
import {
  clampMaxImageAttachmentMib,
  formatImageMibForField,
  maxImageAttachmentBytesFromSettings,
} from './imageAttachmentSettings';
import {
  clampMaxTextAttachmentMib,
  formatMibForField,
  formatTextAttachmentSizeLimitLabel,
  maxTextAttachmentBytesFromSettings,
  parseMibFromUserText,
} from './textAttachmentSettings';
import { AiActionIcon } from './components/AiActionIcon';
import { StoragePressureBanner } from './components/StoragePressureBanner';
import { StorageQuotaPieChart } from './components/StorageQuotaPieChart';
import { ChatMarkdown } from './components/ChatMarkdown';
import { DraggableDialog } from './components/DraggableDialog';
import { MessageDialog } from './components/MessageDialog';
import { MessageTimestamp } from './components/MessageTimestamp';
import { EditUserMessageDialog } from './components/EditUserMessageDialog';
import {
  buildUserMessageDisplayContent,
  modelPromptTextFromUserMessage,
  userMessageEditableText,
} from './chatUserMessageDisplay';

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

/** Chrome Prompt API throws `QuotaExceededError` when the combined prompt exceeds an internal limit. */
function isBrowserPromptInputTooLargeError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return true;
  if (e instanceof Error && /too large/i.test(e.message)) return true;
  return false;
}

/** Desktop / fine pointer: focus the composer. Touch-primary devices: skip (avoids opening the virtual keyboard). */
function shouldAutoFocusComposerInput(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (coarse && !fine) return false;
    return true;
  } catch {
    return true;
  }
}

async function consumeTextStream(
  stream: ReadableStream<string>,
  onDelta: (chunk: string) => void,
  signal: AbortSignal,
  onFirstChunk?: () => void,
): Promise<void> {
  const reader = stream.getReader();
  let first = true;
  try {
    for (;;) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (first && value.length > 0 && onFirstChunk) {
          first = false;
          onFirstChunk();
        }
        onDelta(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function IconPaperclip({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
      />
    </svg>
  );
}

function IconEditMessage({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
      />
    </svg>
  );
}

function IconResendMessage({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a9 9 0 1 1-3-6.7M21 3v7h-7"
      />
    </svg>
  );
}

/** Document with lines — distinct from generic “AI” sparkles; reads as condensed text / summary. */
function IconChatSummary({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 2v6h6"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 9h2M8 13h8M8 17h6"
      />
    </svg>
  );
}

/** Download / export to file (arrow into tray — distinct from upload). */
function IconExportChat({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v10m0 0l-4-4m4 4l4-4M5 19h14"
      />
    </svg>
  );
}

type Gate = 'loading' | 'unsupported' | 'blocked' | 'ready';

export function App() {
  const [gate, setGate] = useState<Gate>('loading');
  const [lang, setLang] = useState<AppLang>(() => detectBrowserLang());
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [howToOpen, setHowToOpen] = useState(false);

  const t = useMemo(() => createTranslator(lang), [lang]);

  const recheckGate = useCallback(() => {
    if (!languageModelSupported()) {
      setGate('unsupported');
      return;
    }
    setGate('loading');
    void (async () => {
      const ok = await languageModelEntryOk();
      setGate(ok ? 'ready' : 'blocked');
    })();
  }, []);

  useEffect(() => {
    recheckGate();
  }, [recheckGate]);

  useEffect(() => {
    void loadAppPrefs().then((p) => {
      setLang(p.lang);
      setTheme(p.theme);
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    void saveAppPrefsTheme(theme);
  }, [theme]);

  useEffect(() => {
    void saveAppPrefsLang(lang);
  }, [lang]);

  const howToChromeFlagsDialog = (
    <DraggableDialog
      open={howToOpen}
      title={t('howToEnableTitle')}
      closeAriaLabel={t('dialog.close')}
      mobileBackAriaLabel={t('dialog.back')}
      onClose={() => setHowToOpen(false)}
      width={520}
      variant="solid"
    >
      <div className="api-keys-doc-dialog">
        <ChatMarkdown content={t('howToEnableMarkdown')} theme={theme} t={t} />
      </div>
    </DraggableDialog>
  );

  if (gate === 'loading') {
    return (
      <div className="auth-screen">
        <p className="hint">{t('gate.loading')}</p>
      </div>
    );
  }

  if (gate === 'unsupported') {
    const showChromeFlagsHowTo = isChromiumBrowser();
    return (
      <>
        <div className="auth-screen">
          <div className="auth-card">
            <h1>{t('brand.name')}</h1>
            <p>{t('gate.unsupported')}</p>
            <p className="hint">{t('gate.unsupportedHint')}</p>
            {showChromeFlagsHowTo ? (
              <>
                <p className="hint gate-chrome-flags-hint">{t('gate.chromeMaybeFlagsHint')}</p>
                <div className="minerva-how-to-wrap">
                  <button
                    type="button"
                    className="minerva-how-to-link minerva-how-to-link--prominent"
                    onClick={() => setHowToOpen(true)}
                  >
                    {t('howToEnableLink')}
                  </button>
                </div>
                <div className="auth-card-retry-wrap">
                  <button type="button" className="btn btn-primary" onClick={recheckGate}>
                    {t('gate.retry')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
        {showChromeFlagsHowTo ? howToChromeFlagsDialog : null}
      </>
    );
  }

  if (gate === 'blocked') {
    return (
      <>
        <div className="auth-screen">
          <div className="auth-card">
            <h1>{t('brand.name')}</h1>
            <p>{t('gate.blocked')}</p>
            <p className="hint">{t('gate.blockedHint')}</p>
            <div className="minerva-how-to-wrap">
              <button
                type="button"
                className="minerva-how-to-link minerva-how-to-link--prominent"
                onClick={() => setHowToOpen(true)}
              >
                {t('howToEnableLink')}
              </button>
            </div>
            <div className="auth-card-retry-wrap">
              <button type="button" className="btn btn-primary" onClick={recheckGate}>
                {t('gate.retry')}
              </button>
            </div>
          </div>
        </div>
        {howToChromeFlagsDialog}
      </>
    );
  }

  return (
    <MinervaChatApp
      lang={lang}
      setLang={setLang}
      theme={theme}
      setTheme={setTheme}
      t={t}
    />
  );
}

type MinervaChatAppProps = {
  lang: AppLang;
  setLang: (l: AppLang) => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  t: ReturnType<typeof createTranslator>;
};

type SettingsSectionId = 'general' | 'profile' | 'system' | 'data' | 'files' | 'backup' | 'about';

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  'general',
  'profile',
  'system',
  'data',
  'files',
  'backup',
  'about',
];

function settingsSectionLabelKey(id: SettingsSectionId): string {
  switch (id) {
    case 'general':
      return 'settings.sectionGeneral';
    case 'profile':
      return 'settings.sectionProfile';
    case 'system':
      return 'settings.sectionSystem';
    case 'data':
      return 'settings.sectionData';
    case 'files':
      return 'settings.sectionFiles';
    case 'backup':
      return 'settings.sectionBackup';
    case 'about':
      return 'settings.sectionAbout';
    default:
      return 'settings.sectionGeneral';
  }
}

function MinervaChatApp({ lang, setLang, theme, setTheme, t }: MinervaChatAppProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const activeSessionIdRef = useRef(activeSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<LocalSettings>({
    systemPrompt: '',
    preferredName: '',
    chatTitleRefreshEveryUserMessages: DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
    maxTextAttachmentMib: DEFAULT_MAX_TEXT_ATTACHMENT_MIB,
    maxImageAttachmentMib: DEFAULT_MAX_IMAGE_ATTACHMENT_MIB,
    streamFirstChunkTimeoutSec: DEFAULT_STREAM_FIRST_CHUNK_TIMEOUT_SEC,
  });
  const mibTextEditingRef = useRef(false);
  const imageMibTextEditingRef = useRef(false);
  const [mibText, setMibText] = useState(() => formatMibForField(DEFAULT_MAX_TEXT_ATTACHMENT_MIB));
  const [imageMibText, setImageMibText] = useState(() => formatImageMibForField(DEFAULT_MAX_IMAGE_ATTACHMENT_MIB));
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [modelUiName, setModelUiName] = useState(() => modelLabelForSession(null, t));
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmClearChatsOpen, setConfirmClearChatsOpen] = useState(false);
  const [confirmClearAllDataOpen, setConfirmClearAllDataOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summarySessionLabel, setSummarySessionLabel] = useState('');
  const [summaryBody, setSummaryBody] = useState('');
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryInFlight, setSummaryInFlight] = useState(false);
  const [refiningSystemPrompt, setRefiningSystemPrompt] = useState(false);
  const [settingsRefineError, setSettingsRefineError] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('general');
  const [imageInputSupported, setImageInputSupported] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [confirmPruneChatsOpen, setConfirmPruneChatsOpen] = useState(false);
  const [confirmRestoreBackupOpen, setConfirmRestoreBackupOpen] = useState(false);
  const [pendingRestoreLabel, setPendingRestoreLabel] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerInitial, setImageViewerInitial] = useState(0);
  const [editUserDialog, setEditUserDialog] = useState<{
    idx: number;
    initialText: string;
    initialAttachments: ChatAttachment[];
  } | null>(null);
  const [truncateTailConfirmOpen, setTruncateTailConfirmOpen] = useState(false);
  const [truncateTailPending, setTruncateTailPending] = useState<
    | { kind: 'resend'; idx: number }
    | { kind: 'edit'; idx: number; text: string; attachments: ChatAttachment[] }
    | null
  >(null);
  const [confirmDeleteUserMessageOpen, setConfirmDeleteUserMessageOpen] = useState(false);
  const [pendingDeleteUserMessageIdx, setPendingDeleteUserMessageIdx] = useState<number | null>(null);

  const nanoLmRuntimeOk = useMemo(() => languageModelSupported(), []);

  const lmRef = useRef<LanguageModel | null>(null);
  const lmUsesImagesRef = useRef(false);
  const refineAbortRef = useRef<AbortController | null>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);
  /** In-memory summary text per session + UI language; invalidated when transcript fingerprint changes. */
  const summaryCacheRef = useRef<Map<string, { fp: string; body: string }>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupRestoreInputRef = useRef<HTMLInputElement>(null);
  const pendingRestoreFileRef = useRef<File | null>(null);
  const prevBusyRef = useRef(false);

  const bootstrapSessions = useCallback(async () => {
    let list = await loadSessions();
    let active = await loadActiveSessionId();
    if (!list.length) {
      const id = makeId();
      const now = isoNow();
      list = [{ id, title: t('defaultChatTitle'), createdAt: now, updatedAt: now, hasUserMessage: false }];
      await saveSessions(list);
      await saveMessages(id, []);
      await saveActiveSessionId(id);
      active = id;
    } else if (!active || !list.some((s) => s.id === active)) {
      active = list[0]!.id;
      await saveActiveSessionId(active);
    }
    setSessions(list);
    setActiveSessionId(active);
  }, [t]);

  useEffect(() => {
    void bootstrapSessions();
  }, [bootstrapSessions]);

  useEffect(() => {
    void loadSettings().then(setSettingsDraft);
  }, []);

  useEffect(() => {
    if (!mibTextEditingRef.current) {
      setMibText(formatMibForField(settingsDraft.maxTextAttachmentMib));
    }
  }, [settingsDraft.maxTextAttachmentMib]);

  useEffect(() => {
    if (!imageMibTextEditingRef.current) {
      setImageMibText(formatImageMibForField(settingsDraft.maxImageAttachmentMib));
    }
  }, [settingsDraft.maxImageAttachmentMib]);

  useEffect(() => {
    let cancelled = false;
    if (!nanoLmRuntimeOk) {
      setImageInputSupported(false);
      return undefined;
    }
    void languageModelImageInputSupported().then((ok) => {
      if (!cancelled) setImageInputSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [nanoLmRuntimeOk]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** After the model finishes (or streaming stops), return focus to the composer on desktop. */
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (!wasBusy || busy) return;
    if (!shouldAutoFocusComposerInput()) return;
    queueMicrotask(() => {
      const el = inputRef.current;
      if (el && !el.disabled) el.focus();
    });
  }, [busy]);

  useEffect(() => {
    if (busy) setComposerImageDropHover(false);
  }, [busy]);

  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    void loadMessages(activeSessionId).then((m) => {
      if (!cancelled) setMessages(m);
    });
    setPendingAttachments([]);
    setImageViewerOpen(false);
    setExportOpen(false);
    setEditUserDialog(null);
    setTruncateTailConfirmOpen(false);
    setTruncateTailPending(null);
    setConfirmDeleteUserMessageOpen(false);
    setPendingDeleteUserMessageIdx(null);
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const viewerImages = useMemo(() => collectChatImagesInOrder(messages), [messages]);

  const openAttachmentViewer = useCallback(
    (att: ChatImageAttachment) => {
      const all = collectChatImagesInOrder(messages);
      if (!all.length) return;
      setImageViewerInitial(indexOfAttachmentInChat(all, att));
      setImageViewerOpen(true);
    },
    [messages],
  );

  useEffect(() => {
    setModelUiName(modelLabelForSession(lmRef.current, t));
  }, [t]);

  useEffect(() => {
    if (!nanoLmRuntimeOk) return undefined;
    let cancelled = false;
    lmRef.current?.destroy();
    lmRef.current = null;
    lmUsesImagesRef.current = false;
    setModelUiName(modelLabelForSession(null, t));
    const sid = activeSessionId;
    if (!sid) return undefined;

    void (async () => {
      const [msgs, settings] = await Promise.all([loadMessages(sid), loadSettings()]);
      if (cancelled) return;
      if (!msgs.length) {
        return;
      }
      try {
        const geo = await resolveApproximateLocation(2600);
        const ctx = defaultSessionSystemContext(lang, geo);
        const usesImages = threadUsesImageInputs(msgs);
        const initial = await buildSessionInitialPromptsAsync(settings, msgs, ctx, {
          attachmentsOnlyPrompt: t('chat.internal.attachmentsOnlyBody'),
          resolveUserModelText: (m) => modelPromptTextFromUserMessage(m, t),
        });
        const session = await LanguageModel.create({
          ...lmCoreForThreadUsesImages(usesImages),
          ...(initial ? { initialPrompts: initial } : {}),
          monitor(m) {
            m.addEventListener('downloadprogress', (ev) => {
              const total = ev.total || 1;
              const pct = Math.round((ev.loaded / total) * 100);
              setDownloadPct(Number.isFinite(pct) ? pct : null);
            });
          },
        });
        if (!cancelled) {
          lmRef.current = session;
          lmUsesImagesRef.current = usesImages;
          setModelUiName(modelLabelForSession(session, t));
          setDownloadPct(null);
        } else {
          session.destroy();
        }
      } catch {
        if (!cancelled) {
          setDownloadPct(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      lmRef.current?.destroy();
      lmRef.current = null;
      lmUsesImagesRef.current = false;
      setModelUiName(modelLabelForSession(null, t));
    };
  }, [activeSessionId, lang, nanoLmRuntimeOk, t]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      summaryAbortRef.current?.abort();
      lmRef.current?.destroy();
      lmRef.current = null;
      lmUsesImagesRef.current = false;
    },
    [],
  );

  const persistSessionMeta = useCallback(async (next: ChatSession[]) => {
    await saveSessions(next);
    setSessions(next);
  }, []);

  const persistMessages = useCallback(async (sid: string, next: ChatMessage[]) => {
    await saveMessages(sid, next);
    setMessages(next);
    setSessions((prev) => {
      const mapped = prev.map((s) =>
        s.id === sid
          ? { ...s, hasUserMessage: next.some((m) => m.role === 'user'), updatedAt: isoNow() }
          : s,
      );
      void saveSessions(mapped);
      return mapped;
    });
  }, []);

  const openNewChat = useCallback(() => {
    void (async () => {
      const id = makeId();
      const now = isoNow();
      const row: ChatSession = {
        id,
        title: t('defaultChatTitle'),
        createdAt: now,
        updatedAt: now,
        hasUserMessage: false,
      };
      const prev = sessions;
      for (const s of prev) {
        if (!s.hasUserMessage) {
          await deleteChatSession(s.id);
        }
      }
      const kept = prev.filter((s) => s.hasUserMessage === true);
      const next = [row, ...kept];
      await saveSessions(next);
      await saveMessages(id, []);
      await saveActiveSessionId(id);
      setSessions(next);
      setActiveSessionId(id);
      setChatsOpen(false);
      setSettingsOpen(false);
      setError(null);
      setPendingAttachments([]);
      queueMicrotask(() => {
        if (shouldAutoFocusComposerInput()) inputRef.current?.focus();
      });
    })();
  }, [sessions, t]);

  const selectSession = useCallback(
    (id: string) => {
      if (!id || id === activeSessionId) return;
      void (async () => {
        await saveActiveSessionId(id);
        setActiveSessionId(id);
        setError(null);
      })();
    },
    [activeSessionId],
  );

  const askDeleteSession = useCallback((id: string) => {
    setPendingDeleteId(id);
    setConfirmDeleteOpen(true);
  }, []);

  const runDeleteSession = useCallback(() => {
    const id = pendingDeleteId;
    setConfirmDeleteOpen(false);
    setPendingDeleteId(null);
    if (!id) return;
    void (async () => {
      const next = sessions.filter((s) => s.id !== id);
      await deleteChatSession(id);
      for (const k of [...summaryCacheRef.current.keys()]) {
        if (k.startsWith(`${id}|`)) summaryCacheRef.current.delete(k);
      }
      if (!next.length) {
        const nid = makeId();
        const now = isoNow();
        const row: ChatSession = {
          id: nid,
          title: t('defaultChatTitle'),
          createdAt: now,
          updatedAt: now,
          hasUserMessage: false,
        };
        await persistSessionMeta([row]);
        await saveMessages(nid, []);
        await saveActiveSessionId(nid);
        setActiveSessionId(nid);
        return;
      }
      await persistSessionMeta(next);
      if (activeSessionId === id) {
        const first = next[0]!.id;
        await saveActiveSessionId(first);
        setActiveSessionId(first);
      }
    })();
  }, [activeSessionId, pendingDeleteId, persistSessionMeta, sessions, t]);

  const saveSettingsClick = useCallback(() => {
    void (async () => {
      const clamped: LocalSettings = {
        ...settingsDraft,
        chatTitleRefreshEveryUserMessages: Math.min(
          500,
          Math.max(
            0,
            Math.floor(
              Number.isFinite(settingsDraft.chatTitleRefreshEveryUserMessages)
                ? settingsDraft.chatTitleRefreshEveryUserMessages
                : DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
            ),
          ),
        ),
        maxTextAttachmentMib: clampMaxTextAttachmentMib(settingsDraft.maxTextAttachmentMib),
        maxImageAttachmentMib: clampMaxImageAttachmentMib(settingsDraft.maxImageAttachmentMib),
        streamFirstChunkTimeoutSec: clampStreamFirstChunkTimeoutSec(settingsDraft.streamFirstChunkTimeoutSec),
      };
      await saveSettings(clamped);
      setSettingsDraft(clamped);
      setSettingsNotice(null);
      setSettingsOpen(false);
      lmRef.current?.destroy();
      lmRef.current = null;
      lmUsesImagesRef.current = false;
    })();
  }, [settingsDraft]);

  const resetToFreshSingleChat = useCallback((): Promise<void> => {
    return (async () => {
      abortRef.current?.abort();
      abortRef.current = null;
      lmRef.current?.destroy();
      lmRef.current = null;
      lmUsesImagesRef.current = false;
      await wipeAllChatThreads();
      const id = makeId();
      const now = isoNow();
      const row: ChatSession = {
        id,
        title: t('defaultChatTitle'),
        createdAt: now,
        updatedAt: now,
        hasUserMessage: false,
      };
      summaryCacheRef.current.clear();
      await saveSessions([row]);
      await saveMessages(id, []);
      await saveActiveSessionId(id);
      setSessions([row]);
      setActiveSessionId(id);
      setMessages([]);
      setPendingAttachments([]);
      setChatsOpen(false);
      setSettingsOpen(false);
      setError(null);
    })();
  }, [t]);

  const runClearAllChats = useCallback(() => {
    setConfirmClearChatsOpen(false);
    void resetToFreshSingleChat().then(() => setSettingsNotice(t('settings.clearedChats')));
  }, [resetToFreshSingleChat, t]);

  const runClearAllData = useCallback(() => {
    setConfirmClearAllDataOpen(false);
    void (async () => {
      await resetToFreshSingleChat();
      const empty: LocalSettings = {
        systemPrompt: '',
        preferredName: '',
        chatTitleRefreshEveryUserMessages: DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
        maxTextAttachmentMib: DEFAULT_MAX_TEXT_ATTACHMENT_MIB,
        maxImageAttachmentMib: DEFAULT_MAX_IMAGE_ATTACHMENT_MIB,
        streamFirstChunkTimeoutSec: DEFAULT_STREAM_FIRST_CHUNK_TIMEOUT_SEC,
      };
      await saveSettings(empty);
      setSettingsDraft(empty);
      setSettingsNotice(t('settings.clearedAllData'));
    })();
  }, [resetToFreshSingleChat, t]);

  const openDataSettingsFromBanner = useCallback(() => {
    setChatsOpen(false);
    setSettingsOpen(true);
    setSettingsSection('data');
    queueMicrotask(() => {
      document.getElementById('settings-pane-data')?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  const runPruneOldestChats = useCallback(() => {
    setConfirmPruneChatsOpen(false);
    void (async () => {
      const sid = activeSessionIdRef.current;
      const { deletedIds } = await pruneOldestChatSessionsExcludingActive(sid, 0.78);
      const list = await loadSessions();
      const active = await loadActiveSessionId();
      setSessions(list);
      setActiveSessionId(active);
      setMessages(await loadMessages(active));
      setSettingsNotice(
        deletedIds.length
          ? t('settings.prunedChatsNotice').replace('{n}', String(deletedIds.length))
          : t('settings.pruneNoop'),
      );
    })();
  }, [t]);

  const runDownloadFullBackup = useCallback(() => {
    setSettingsNotice(null);
    void (async () => {
      setBackupBusy(true);
      try {
        await downloadMinervaBackupFile();
        setSettingsNotice(t('settings.backup.downloadDone'));
      } catch {
        setError(t('settings.backup.error.exportFailed'));
      } finally {
        setBackupBusy(false);
      }
    })();
  }, [t]);

  const requestRestoreBackupFilePick = useCallback(() => {
    setSettingsNotice(null);
    setError(null);
    backupRestoreInputRef.current?.click();
  }, []);

  const onBackupRestoreFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    pendingRestoreFileRef.current = f;
    setPendingRestoreLabel(f.name);
    setConfirmRestoreBackupOpen(true);
  }, []);

  const closeRestoreBackupConfirm = useCallback(() => {
    setConfirmRestoreBackupOpen(false);
    pendingRestoreFileRef.current = null;
    setPendingRestoreLabel(null);
  }, []);

  const runConfirmedRestoreBackup = useCallback(() => {
    setConfirmRestoreBackupOpen(false);
    const f = pendingRestoreFileRef.current;
    pendingRestoreFileRef.current = null;
    setPendingRestoreLabel(null);
    if (!f) return;
    void (async () => {
      setBackupBusy(true);
      try {
        await importMinervaBackupFromFile(f);
        window.location.reload();
      } catch (err) {
        const key =
          err instanceof BackupRestoreError ? err.i18nKey : 'settings.backup.error.importFailed';
        setError(t(key));
      } finally {
        setBackupBusy(false);
      }
    })();
  }, [t]);

  const [composerImageDropHover, setComposerImageDropHover] = useState(false);

  const addComposerFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || !activeSessionId || !nanoLmRuntimeOk || busy) return;
      setError(null);
      const maxImageBytes = maxImageAttachmentBytesFromSettings(settingsDraft);
      const imgLimitLabel = formatImageSizeLimitLabel(maxImageBytes);
      const maxTextBytes = maxTextAttachmentBytesFromSettings(settingsDraft);
      const txtLimitLabel = formatTextAttachmentSizeLimitLabel(maxTextBytes);
      const added: ChatAttachment[] = [];
      const cur = () => [...pendingAttachments, ...added];

      for (const file of Array.from(list)) {
        const nTot = cur().length;
        if (nTot >= MAX_CHAT_ATTACHMENTS_TOTAL) {
          setError(t('chat.attachments.maxTotal').replace('{n}', String(MAX_CHAT_ATTACHMENTS_TOTAL)));
          break;
        }

        const mime = (file.type || '').trim();
        const isImg = mime && isSupportedChatImageMime(mime);
        const isTxt = isSupportedTextAttachmentMime(mime, file.name);

        if (isImg) {
          if (!imageInputSupported) {
            setError(t('chat.attach.hintUnavailable'));
            continue;
          }
          if (countImageAttachments(cur()) >= MAX_CHAT_IMAGE_ATTACHMENTS) {
            setError(t('chat.attachments.maxCount').replace('{n}', String(MAX_CHAT_IMAGE_ATTACHMENTS)));
            break;
          }
          if (file.size > maxImageBytes) {
            setError(
              t('chat.attachments.fileTooLarge')
                .replace('{name}', file.name)
                .replace('{limit}', imgLimitLabel),
            );
            continue;
          }
          try {
            added.push(await fileToImageAttachment(file));
          } catch {
            setError(t('chat.attachments.imageReadFailed'));
          }
          continue;
        }

        if (isTxt) {
          if (countTextAttachments(cur()) >= MAX_CHAT_TEXT_ATTACHMENTS) {
            setError(t('chat.attachments.maxText').replace('{n}', String(MAX_CHAT_TEXT_ATTACHMENTS)));
            break;
          }
          if (file.size > maxTextBytes) {
            setError(
              t('chat.attachments.textTooLarge')
                .replace('{name}', file.name)
                .replace('{limit}', txtLimitLabel),
            );
            continue;
          }
          try {
            added.push(await fileToTextAttachment(file));
          } catch {
            setError(t('chat.attachments.textReadFailed'));
          }
          continue;
        }

        setError(t('chat.attachments.unsupportedFile').replace('{name}', file.name));
      }

      if (added.length) {
        setPendingAttachments((prev) => [...prev, ...added].slice(0, MAX_CHAT_ATTACHMENTS_TOTAL));
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [
      activeSessionId,
      busy,
      imageInputSupported,
      nanoLmRuntimeOk,
      pendingAttachments,
      settingsDraft,
      t,
    ],
  );

  const dataTransferHasFiles = useCallback((dt: DataTransfer | null) => {
    if (!dt?.types) return false;
    try {
      return Array.from(dt.types as unknown as string[]).includes('Files');
    } catch {
      return false;
    }
  }, []);

  const onComposerDragEnter = useCallback(
    (e: DragEvent<HTMLFormElement>) => {
      if (!nanoLmRuntimeOk || !activeSessionId) return;
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      if (!busy) setComposerImageDropHover(true);
    },
    [activeSessionId, busy, dataTransferHasFiles, nanoLmRuntimeOk],
  );

  const onComposerDragLeave = useCallback((e: DragEvent<HTMLFormElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setComposerImageDropHover(false);
  }, []);

  const onComposerDragOver = useCallback(
    (e: DragEvent<HTMLFormElement>) => {
      if (!nanoLmRuntimeOk || !activeSessionId) return;
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
      } catch {
        /* ignore */
      }
    },
    [activeSessionId, busy, dataTransferHasFiles, nanoLmRuntimeOk],
  );

  const onComposerDrop = useCallback(
    (e: DragEvent<HTMLFormElement>) => {
      setComposerImageDropHover(false);
      if (!nanoLmRuntimeOk || !activeSessionId) return;
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (busy) return;
      const { files } = e.dataTransfer;
      if (!files?.length) return;
      void addComposerFiles(files);
    },
    [activeSessionId, addComposerFiles, busy, dataTransferHasFiles, nanoLmRuntimeOk],
  );

  const runUserTurnStream = useCallback(
    async (opts: {
      sessionId: string;
      prior: ChatMessage[];
      userMsg: ChatMessage;
      resetLanguageModel: boolean;
    }) => {
      const { sessionId, prior, userMsg, resetLanguageModel } = opts;
      const pending = userMsg.attachments ?? [];
      const pendingHasImages = pending.some(isChatImageAttachment);
      const plainPromptText = userMessageEditableText(userMsg, t).trim();
      const modelText = modelPromptTextFromUserMessage(userMsg, t);

      if (resetLanguageModel) {
        abortRef.current?.abort();
        abortRef.current = null;
        for (const k of [...summaryCacheRef.current.keys()]) {
          if (k.startsWith(`${sessionId}|`)) summaryCacheRef.current.delete(k);
        }
        try {
          lmRef.current?.destroy();
        } catch {
          /* ignore */
        }
        lmRef.current = null;
        lmUsesImagesRef.current = false;
        setModelUiName(modelLabelForSession(null, t));
      }

      const settings = await loadSettings();
      const nextMsgs = [...prior, userMsg];
      await persistMessages(sessionId, nextMsgs);

      const assistantId = makeId();
      const assistantShell: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: isoNow(),
      };
      await persistMessages(sessionId, [...nextMsgs, assistantShell]);

      const ac = new AbortController();
      abortRef.current = ac;

      const needsMm = pendingHasImages || threadUsesImageInputs(prior);
      let partsToClose: LanguageModelMessageContent[] | null = null;
      let timedOutBeforeFirstChunk = false;
      let streamWatchdogTid: ReturnType<typeof window.setTimeout> | null = null;
      const clearStreamWatchdog = () => {
        if (streamWatchdogTid != null) {
          window.clearTimeout(streamWatchdogTid);
          streamWatchdogTid = null;
        }
      };

      try {
        if (lmRef.current && lmUsesImagesRef.current !== needsMm) {
          try {
            lmRef.current.destroy();
          } catch {
            /* ignore */
          }
          lmRef.current = null;
          lmUsesImagesRef.current = false;
        }

        if (!lmRef.current) {
          const geo = await resolveApproximateLocation(2600);
          const ctx = defaultSessionSystemContext(lang, geo);
          const initial = await buildSessionInitialPromptsAsync(settings, prior, ctx, {
            attachmentsOnlyPrompt: t('chat.internal.attachmentsOnlyBody'),
            resolveUserModelText: (m) => modelPromptTextFromUserMessage(m, t),
          });
          const session = await LanguageModel.create({
            ...lmCoreForThreadUsesImages(needsMm),
            ...(initial ? { initialPrompts: initial } : {}),
            monitor(m) {
              m.addEventListener('downloadprogress', (ev) => {
                const total = ev.total || 1;
                const pct = Math.round((ev.loaded / total) * 100);
                setDownloadPct(Number.isFinite(pct) ? pct : null);
              });
            },
          });
          lmRef.current = session;
          lmUsesImagesRef.current = needsMm;
          setModelUiName(modelLabelForSession(session, t));
          setDownloadPct(null);
        }
        const session = lmRef.current;
        if (!session) {
          throw new Error('error.noLm');
        }
        const startedAt = performance.now();
        let firstTokenAt: number | null = null;
        const markFirstChunk = () => {
          if (firstTokenAt != null) return;
          firstTokenAt = performance.now();
          clearStreamWatchdog();
        };
        let acc = '';
        const onStreamDelta = (chunk: string) => {
          acc += chunk;
          setMessages((prev) => {
            const out = prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m));
            void saveMessages(sessionId, out);
            return out;
          });
        };
        const limitSec = settings.streamFirstChunkTimeoutSec;
        const consumeWithFirstChunkTimeout = async (stream: ReadableStream<string>) => {
          if (limitSec > 0) {
            streamWatchdogTid = window.setTimeout(() => {
              streamWatchdogTid = null;
              if (firstTokenAt != null) return;
              if (ac.signal.aborted) return;
              timedOutBeforeFirstChunk = true;
              ac.abort();
            }, Math.round(limitSec * 1000));
          }
          try {
            await consumeTextStream(stream, onStreamDelta, ac.signal, markFirstChunk);
          } finally {
            clearStreamWatchdog();
          }
        };
        if (pending.length === 0) {
          const stream = session.promptStreaming(plainPromptText, { signal: ac.signal });
          await consumeWithFirstChunkTimeout(stream);
        } else {
          const parts = (await buildUserTurnModelParts({
            modelText,
            attachments: pending,
            attachmentsOnlyPrompt: t('chat.internal.attachmentsOnlyBody'),
          })) as LanguageModelMessageContent[];
          partsToClose = parts;
          const stream = session.promptStreaming([{ role: 'user', content: parts }], {
            signal: ac.signal,
          });
          await consumeWithFirstChunkTimeout(stream);
        }
        const finishedAt = performance.now();
        const stats = buildNanoTurnStats({
          modelId: modelLabelForSession(session, t),
          startedAt,
          finishedAt,
          firstTokenAt,
          outputText: acc,
          contextMessages: nextMsgs,
        });
        const assistantFinal: ChatMessage = { ...assistantShell, content: acc, nanoTurnStats: stats };
        setMessages((prev) => {
          const out = prev.map((m) => (m.id === assistantId ? assistantFinal : m));
          void saveMessages(sessionId, out);
          return out;
        });
        const finalThread: ChatMessage[] = [...nextMsgs, assistantFinal];
        const userCount = nextMsgs.filter((m) => m.role === 'user').length;
        const interval = settings.chatTitleRefreshEveryUserMessages;
        if (shouldRefreshChatTitle(userCount, interval)) {
          const sid = sessionId;
          const titleAc = new AbortController();
          const tid = window.setTimeout(() => titleAc.abort(), 55_000);
          void generateChatTitleWithOnDeviceModel({
            lang,
            messages: finalThread,
            fallback: t('defaultChatTitle'),
            signal: titleAc.signal,
          })
            .then((newTitle) => {
              window.clearTimeout(tid);
              if (!newTitle || sid !== activeSessionIdRef.current) return;
              setSessions((prev) => {
                const nextSess = prev.map((s) =>
                  s.id === sid ? { ...s, title: newTitle, updatedAt: isoNow() } : s,
                );
                void saveSessions(nextSess);
                return nextSess;
              });
            })
            .catch(() => {
              window.clearTimeout(tid);
            });
        }
      } catch (e) {
        const aborted =
          (e instanceof DOMException && e.name === 'AbortError') ||
          (e instanceof Error && e.name === 'AbortError');
        if (aborted) {
          if (timedOutBeforeFirstChunk) {
            setError(
              t('error.streamFirstChunkTimeout').replace('{seconds}', String(settings.streamFirstChunkTimeoutSec)),
            );
          }
          setMessages((prev) => {
            const out = prev.filter((m) => m.id !== assistantId);
            void saveMessages(sessionId, out);
            return out;
          });
        } else {
          console.error('[Minerva] Chat stream / LanguageModel failed', e);
          const key =
            e instanceof Error && e.message === 'error.noLm'
              ? 'error.noLm'
              : isBrowserPromptInputTooLargeError(e)
                ? 'error.promptInputTooLarge'
                : 'error.generic';
          setError(t(key));
          setMessages((prev) => {
            const out = prev.filter((m) => m.id !== assistantId);
            void saveMessages(sessionId, out);
            return out;
          });
        }
      } finally {
        clearStreamWatchdog();
        if (partsToClose) {
          closeImageBitmaps(partsToClose.filter((p) => p.type === 'image'));
        }
        setBusy(false);
        abortRef.current = null;
        setDownloadPct(null);
      }
    },
    [lang, persistMessages, t],
  );

  const send = useCallback(async () => {
    if (!nanoLmRuntimeOk) return;
    const text = input.trim();
    const pending = [...pendingAttachments];
    if ((!text && pending.length === 0) || busy || !activeSessionId) return;
    const pendingHasImages = pending.some(isChatImageAttachment);
    if (pendingHasImages && !imageInputSupported) {
      setError(t('chat.attach.hintUnavailable'));
      return;
    }
    setInput('');
    setPendingAttachments([]);
    setError(null);
    setBusy(true);
    const userDisplay =
      text ||
      t('chat.internal.userAttachmentsLine')
        .replace('{n}', String(pending.length))
        .replace('{names}', pending.map((p) => p.name).join(', '));
    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: userDisplay,
      createdAt: isoNow(),
      ...(pending.length ? { attachments: pending } : {}),
    };
    const prior = messages;
    await runUserTurnStream({
      sessionId: activeSessionId,
      prior,
      userMsg,
      resetLanguageModel: false,
    });
  }, [
    activeSessionId,
    busy,
    imageInputSupported,
    input,
    messages,
    nanoLmRuntimeOk,
    pendingAttachments,
    runUserTurnStream,
    t,
  ]);

  const closeEditUserMessage = useCallback(() => setEditUserDialog(null), []);

  const openEditUserMessage = useCallback(
    (idx: number) => {
      const m = messagesRef.current[idx];
      if (!m || m.role !== 'user') return;
      const initialAttachments = [...(m.attachments ?? [])];
      const initialText = userMessageEditableText(m, t);
      setEditUserDialog({ idx, initialText, initialAttachments });
    },
    [t],
  );

  const submitEditedUserMessage = useCallback(
    (text: string, attachments: ChatAttachment[]) => {
      if (!editUserDialog || !activeSessionId || !nanoLmRuntimeOk) return;
      const idx = editUserDialog.idx;
      const pendingHasImages = attachments.some(isChatImageAttachment);
      if (pendingHasImages && !imageInputSupported) {
        setError(t('chat.attach.hintUnavailable'));
        return;
      }
      const cur = messagesRef.current;
      const base = cur[idx];
      if (!base || base.role !== 'user') return;
      const userDisplay = buildUserMessageDisplayContent(text, attachments, t);
      const userMsg: ChatMessage = {
        id: base.id,
        role: 'user',
        createdAt: base.createdAt,
        content: userDisplay,
        ...(attachments.length > 0 ? { attachments } : {}),
      };
      const hasLater = idx < cur.length - 1;
      if (hasLater) {
        setTruncateTailPending({ kind: 'edit', idx, text, attachments });
        setTruncateTailConfirmOpen(true);
        closeEditUserMessage();
        return;
      }
      closeEditUserMessage();
      setError(null);
      setBusy(true);
      const prior = cur.slice(0, idx);
      void runUserTurnStream({
        sessionId: activeSessionId,
        prior,
        userMsg,
        resetLanguageModel: true,
      });
    },
    [
      activeSessionId,
      closeEditUserMessage,
      editUserDialog,
      imageInputSupported,
      nanoLmRuntimeOk,
      runUserTurnStream,
      t,
    ],
  );

  const requestDeleteUserMessage = useCallback((idx: number) => {
    if (busy) return;
    setPendingDeleteUserMessageIdx(idx);
    setConfirmDeleteUserMessageOpen(true);
  }, [busy]);

  const closeDeleteUserMessageConfirm = useCallback(() => {
    setConfirmDeleteUserMessageOpen(false);
    setPendingDeleteUserMessageIdx(null);
  }, []);

  const resendUserMessageAt = useCallback(
    (idx: number) => {
      if (!nanoLmRuntimeOk || busy || !activeSessionId) return;
      const cur = messagesRef.current;
      const m = cur[idx];
      if (!m || m.role !== 'user') return;
      const pendingHasImages = (m.attachments ?? []).some(isChatImageAttachment);
      if (pendingHasImages && !imageInputSupported) {
        setError(t('chat.attach.hintUnavailable'));
        return;
      }
      if (idx < cur.length - 1) {
        setTruncateTailPending({ kind: 'resend', idx });
        setTruncateTailConfirmOpen(true);
        return;
      }
      setError(null);
      setBusy(true);
      const prior = cur.slice(0, idx);
      void runUserTurnStream({
        sessionId: activeSessionId,
        prior,
        userMsg: m,
        resetLanguageModel: true,
      });
    },
    [activeSessionId, busy, imageInputSupported, nanoLmRuntimeOk, runUserTurnStream, t],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const closeChatsPanel = useCallback(() => {
    setChatsOpen(false);
  }, []);

  const closeChatSummaryDialog = useCallback(() => {
    summaryAbortRef.current?.abort();
    summaryAbortRef.current = null;
    setSummaryOpen(false);
    setSummaryInFlight(false);
    setSummaryBody('');
    setSummaryError(null);
  }, []);

  const openChatSummary = useCallback(
    (sessionId: string, sessionLabel: string, msgsOverride?: ChatMessage[]) => {
      void (async () => {
        const msgs = msgsOverride ?? (await loadMessages(sessionId));
        summaryAbortRef.current?.abort();
        if (!msgs.some((m) => m.role === 'user')) {
          summaryAbortRef.current = null;
          setSummarySessionLabel(sessionLabel);
          setSummaryOpen(true);
          setSummaryInFlight(false);
          setSummaryBody('');
          setSummaryError(t('chat.summary.empty'));
          return;
        }
        const fp = fingerprintForChatSummaryCache(msgs);
        const cacheKey = `${sessionId}|${lang}`;
        const cached = sessionId ? summaryCacheRef.current.get(cacheKey) : undefined;
        if (cached && cached.fp === fp && cached.body.trim()) {
          summaryAbortRef.current = null;
          setSummarySessionLabel(sessionLabel);
          setSummaryOpen(true);
          setSummaryInFlight(false);
          setSummaryBody(cached.body);
          setSummaryError(null);
          return;
        }
        const ac = new AbortController();
        summaryAbortRef.current = ac;
        setSummarySessionLabel(sessionLabel);
        setSummaryOpen(true);
        setSummaryInFlight(true);
        setSummaryBody('');
        setSummaryError(null);
        void summarizeChatMessages({
          lang,
          messages: msgs,
          signal: ac.signal,
          onDelta: (partial) => {
            setSummaryBody(partial);
          },
        })
          .then((full) => {
            if (ac.signal.aborted) return;
            if (full) {
              setSummaryBody(full);
              if (sessionId) summaryCacheRef.current.set(cacheKey, { fp, body: full });
            } else {
              setSummaryBody('');
              setSummaryError(t('chat.summary.error'));
            }
          })
          .finally(() => {
            if (!ac.signal.aborted) setSummaryInFlight(false);
          });
      })();
    },
    [lang, t],
  );

  useEffect(() => {
    if (!settingsOpen) {
      refineAbortRef.current?.abort();
      refineAbortRef.current = null;
    } else {
      setSettingsRefineError(null);
      setSettingsSection('general');
    }
  }, [settingsOpen]);

  const refineSystemPromptWithAi = useCallback(async () => {
    if (busy || refiningSystemPrompt || !nanoLmRuntimeOk) return;
    setSettingsRefineError(null);
    setSettingsNotice(null);
    setRefiningSystemPrompt(true);
    const ac = new AbortController();
    refineAbortRef.current = ac;
    let session: LanguageModel | null = null;
    try {
      const draft = settingsDraft.systemPrompt.trim();
      const instruction = t('settings.systemPromptRefine.instruction');
      const userPrompt = `${instruction}\n\n--- Current draft ---\n${draft || '(empty)'}\n---`;
      session = await LanguageModel.create({ ...LM_CORE });
      let acc = '';
      const stream = session.promptStreaming(userPrompt, { signal: ac.signal });
      await consumeTextStream(
        stream,
        (chunk) => {
          acc += chunk;
        },
        ac.signal,
      );
      let cleaned = acc.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/^```[a-zA-Z]*\n?/, '')
          .replace(/\n?```\s*$/, '')
          .trim();
      }
      setSettingsDraft((d) => ({ ...d, systemPrompt: cleaned }));
      setSettingsNotice(t('settings.refineDone'));
    } catch (e) {
      const aborted =
        ac.signal.aborted ||
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError');
      if (!aborted) {
        console.error('[Minerva] System prompt refine failed', e);
        setSettingsRefineError(
          isBrowserPromptInputTooLargeError(e) ? t('error.promptInputTooLarge') : t('settings.refineFailed'),
        );
      }
    } finally {
      if (refineAbortRef.current === ac) refineAbortRef.current = null;
      session?.destroy();
      setRefiningSystemPrompt(false);
    }
  }, [busy, nanoLmRuntimeOk, refiningSystemPrompt, settingsDraft.systemPrompt, t]);

  const canSendMessage = useMemo(
    () =>
      Boolean(activeSessionId) &&
      !busy &&
      (input.trim().length > 0 || pendingAttachments.length > 0),
    [activeSessionId, busy, input, pendingAttachments.length],
  );

  const listableSessions = useMemo(
    () => sessions.filter((s) => s.hasUserMessage === true),
    [sessions],
  );

  const showChatsListButton = useMemo(() => {
    if (listableSessions.length > 1) return true;
    const activeHasUser = messages.some((m) => m.role === 'user');
    if (listableSessions.length === 1) {
      const onlyId = listableSessions[0]!.id;
      return activeHasUser || activeSessionId !== onlyId;
    }
    return activeHasUser;
  }, [listableSessions, messages, activeSessionId]);

  useEffect(() => {
    if (!showChatsListButton && chatsOpen) {
      setChatsOpen(false);
    }
  }, [showChatsListButton, chatsOpen]);

  const onComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!canSendMessage) return;
        inputRef.current?.blur();
        void send();
      }
    },
    [canSendMessage, send],
  );

  const onComposerPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!nanoLmRuntimeOk || busy || !activeSessionId) return;
      const imageFiles = imageInputSupported ? collectPastedImageFilesFromClipboard(e.clipboardData) : [];
      const textFiles = collectPastedTextFilesFromClipboard(e.clipboardData);
      if (!imageFiles.length && !textFiles.length) return;
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of imageFiles) {
        dt.items.add(f);
      }
      for (const f of textFiles) {
        dt.items.add(f);
      }
      void addComposerFiles(dt.files);
    },
    [activeSessionId, addComposerFiles, busy, imageInputSupported, nanoLmRuntimeOk],
  );

  const updateMessagesBottomFade = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const epsilon = 10;
    const hasOverflow = el.scrollHeight > el.clientHeight + 1;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= epsilon;
    el.classList.toggle('messages--fade-bottom', hasOverflow && !atBottom);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
    requestAnimationFrame(() => {
      updateMessagesBottomFade();
      requestAnimationFrame(updateMessagesBottomFade);
    });
  }, [messages, busy, updateMessagesBottomFade]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const run = () => updateMessagesBottomFade();
    run();
    el.addEventListener('scroll', run, { passive: true });
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', run);
      ro.disconnect();
    };
  }, [updateMessagesBottomFade, activeSessionId]);

  if (!nanoLmRuntimeOk) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>{t('brand.name')}</h1>
          <p>{t('gate.unsupported')}</p>
          <p className="hint">{t('gate.unsupportedHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-nav" role="tablist" aria-label={t('nav.section')}>
          {showChatsListButton ? (
            <button
              type="button"
              className={`side-btn${chatsOpen ? ' side-btn-active' : ''}`}
              onClick={() => setChatsOpen((v) => !v)}
              title={t('nav.chats')}
              aria-label={t('nav.chats')}
              aria-expanded={chatsOpen}
            >
              <svg className="side-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="side-btn sidebar-nav-new-chat"
            onClick={() => void openNewChat()}
            title={t('nav.newChat')}
            aria-label={t('nav.newChat')}
          >
            <svg className="side-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            type="button"
            className={`side-btn${theme === 'light' ? ' side-btn-active' : ''}`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`${t('settings.theme')}: ${theme === 'dark' ? t('settings.theme.dark') : t('settings.theme.light')}`}
            aria-label={`${t('settings.theme')}: ${theme === 'dark' ? t('settings.theme.dark') : t('settings.theme.light')}`}
          >
            {theme === 'dark' ? (
              <svg className="side-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.5 3.5a8.5 8.5 0 1 0 6 14.5 9 9 0 1 1-6-14.5Z" fill="currentColor" />
              </svg>
            ) : (
              <svg className="side-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 4a1 1 0 0 1 1 1v1.4a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm0 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-5a1 1 0 0 1 1 1 1 1 0 0 1-1 1h-1.4a1 1 0 1 1 0-2H19ZM7.4 12a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1.4Zm8.49-5.07a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm-9.19 9.19a1 1 0 0 1 1.41 0l.99.99a1 1 0 1 1-1.41 1.41l-.99-.99a1 1 0 0 1 0-1.41Zm10.6 2.4a1 1 0 0 1-1.41 0l-.99-.99a1 1 0 0 1 1.41-1.41l.99.99a1 1 0 0 1 0 1.41Zm-9.2-9.19a1 1 0 0 1-1.41 0l-.99-.99a1 1 0 0 1 1.41-1.41l.99.99a1 1 0 0 1 0 1.41ZM12 17.6a1 1 0 0 1 1 1V20a1 1 0 1 1-2 0v-1.4a1 1 0 0 1 1-1Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={`side-btn${settingsOpen ? ' side-btn-active' : ''}`}
            onClick={() => {
              setChatsOpen(false);
              setSettingsOpen((v) => !v);
            }}
            title={settingsOpen ? t('nav.settings.close') : t('nav.settings.open')}
            aria-label={settingsOpen ? t('nav.settings.close') : t('nav.settings.open')}
            aria-pressed={settingsOpen}
          >
            <svg
              className="side-icon side-icon--stroke"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              />
              <path
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              />
            </svg>
          </button>
        </div>
      </aside>

      <DraggableDialog
        open={chatsOpen}
        title={t('chat.dialog.title')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={closeChatsPanel}
        width={560}
      >
        <div className="chat-dialog">
          <div className="chat-dialog-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void openNewChat()}>
              {t('chat.dialog.newChat')}
            </button>
          </div>
          <div className="chat-dialog-list-wrap">
            <div className="chat-dialog-list">
              {listableSessions.length === 0 ? (
                <div className="chat-dialog-empty">{t('chat.dialog.empty')}</div>
              ) : (
                listableSessions.map((s) => (
                  <div key={s.id} className="chat-dialog-item">
                    <button
                      type="button"
                      className="chat-dialog-open"
                      onClick={() => {
                        selectSession(s.id);
                        closeChatsPanel();
                      }}
                    >
                      <span className="chat-dialog-open-title">{s.title}</span>
                    </button>
                    <div className="chat-dialog-row-actions-icons">
                      <button
                        type="button"
                        className="chat-dialog-icon-btn chat-dialog-icon-btn-summary"
                        disabled={busy || summaryInFlight}
                        onClick={() => {
                          closeChatsPanel();
                          openChatSummary(s.id, s.title);
                        }}
                        title={t('chat.summary.view')}
                        aria-label={t('chat.summary.view')}
                      >
                        <IconChatSummary size={17} />
                      </button>
                      <button
                        type="button"
                        className="chat-dialog-icon-btn chat-dialog-icon-btn-danger"
                        onClick={() => askDeleteSession(s.id)}
                        title={t('chat.delete')}
                        aria-label={t('chat.delete')}
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DraggableDialog>

      <DraggableDialog
        open={summaryOpen}
        title={t('chat.summary.title')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={closeChatSummaryDialog}
        width={580}
        variant="solid"
      >
        <div className="summary-dialog">
          <p className="summary-dialog-lead">{summarySessionLabel}</p>
          {summaryError ? <p className="summary-dialog-error">{summaryError}</p> : null}
          {summaryInFlight && !summaryBody.trim() ? (
            <p className="summary-dialog-loading" role="status">
              {t('chat.summary.loading')}
            </p>
          ) : null}
          {summaryBody.trim() ? (
            <div className="summary-dialog-scroll markdown-body">
              <ChatMarkdown content={summaryBody} theme={theme} t={t} />
            </div>
          ) : null}
        </div>
      </DraggableDialog>

      <main className="main">
        <>
            {error ? <div className="banner-error">{error}</div> : null}
            {downloadPct != null ? (
              <div className="minerva-banner-info" role="status">
                {t('downloading').replace('{pct}', String(downloadPct))}
              </div>
            ) : null}
            <div className="messages" ref={listRef}>
              {messages.length === 0 ? (
                <div className="empty">
                  <strong>{t('empty.title')}</strong>
                  <p>{t('empty.bodyWhere')}</p>
                  <p>{t('empty.bodyKeys')}</p>
                  {nanoLmRuntimeOk ? <p>{t('empty.attachHint')}</p> : null}
                </div>
              ) : (
                messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  const streaming = m.role === 'assistant' && busy && isLast;
                  if (m.role === 'user') {
                    return (
                      <div key={m.id} className="msg-stack msg-user-align">
                        <div className="msg msg-user">
                          <div className="msg-user-body">
                            <div className="msg-user-topbar">
                              <div className="msg-user-topbar-leading">
                                <span className="msg-role">{t('chat.message.roleUser')}</span>
                                <MessageTimestamp createdAt={m.createdAt} lang={lang} t={t} />
                              </div>
                            </div>
                            {m.attachments?.length ? (
                              <div className="msg-attachments" aria-label={t('chat.attach.filesAndImages')}>
                              {m.attachments.map((a) =>
                                isChatTextAttachment(a) ? (
                                  <div key={a.id} className="msg-attachment-card msg-attachment-card--text">
                                    <div className="msg-attachment-card-text-head">
                                      <div className="attachment-pill-text-icon" aria-hidden>
                                        TXT
                                      </div>
                                      <div className="msg-attachment-meta">
                                        <strong title={a.name}>{a.name}</strong>
                                        <small>
                                          {(a.mime || '').trim() || t('chat.imageViewer.mimeUnknown')} ·{' '}
                                          {t('chat.textAttachment.previewChars').replace(
                                            '{n}',
                                            String(a.text.length),
                                          )}
                                        </small>
                                      </div>
                                    </div>
                                    <pre className="msg-text-attachment-preview" tabIndex={0}>
                                      {a.text.length > 4000 ? `${a.text.slice(0, 4000)}…` : a.text}
                                    </pre>
                                  </div>
                                ) : (
                                  <div
                                    key={a.id}
                                    className="msg-attachment-card msg-attachment-card-clickable msg-attachment-card--image-row"
                                    role="button"
                                    tabIndex={0}
                                    title={t('chat.imageViewer.open')}
                                    aria-label={t('chat.imageViewer.open')}
                                    onClick={() => openAttachmentViewer(a)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openAttachmentViewer(a);
                                      }
                                    }}
                                  >
                                    <div className="msg-attachment-card-image-head">
                                      <img
                                        src={a.dataUrl}
                                        alt=""
                                        className="msg-attachment-thumb-inline"
                                        draggable={false}
                                      />
                                      <div className="msg-attachment-meta">
                                        <strong title={a.name}>{a.name}</strong>
                                        <small>
                                          {(a.mime || '').trim() || t('chat.imageViewer.mimeUnknown')} ·{' '}
                                          {formatBytes(estimateDataUrlBytes(a.dataUrl))}
                                        </small>
                                      </div>
                                    </div>
                                  </div>
                                ),
                              )}
                              </div>
                            ) : null}
                            {m.content.trim() ? <div className="msg-body">{m.content}</div> : null}
                          </div>
                          <div
                            className="msg-user-toolbar"
                            role="toolbar"
                            aria-label={t('chat.userMessage.toolbarAria')}
                          >
                            <button
                              type="button"
                              className="msg-user-action-btn"
                              disabled={!nanoLmRuntimeOk || busy}
                              title={t('chat.userMessage.edit')}
                              aria-label={t('chat.userMessage.edit')}
                              onClick={() => openEditUserMessage(i)}
                            >
                              <IconEditMessage />
                            </button>
                            <button
                              type="button"
                              className="msg-user-action-btn"
                              disabled={!nanoLmRuntimeOk || busy}
                              title={t('chat.userMessage.resend')}
                              aria-label={t('chat.userMessage.resend')}
                              onClick={() => resendUserMessageAt(i)}
                            >
                              <IconResendMessage />
                            </button>
                            <button
                              type="button"
                              className="msg-user-close"
                              disabled={busy}
                              title={t('chat.userMessage.deleteTitle')}
                              aria-label={t('chat.userMessage.deleteTitle')}
                              onClick={() => requestDeleteUserMessage(i)}
                            >
                              <span className="msg-user-close-x" aria-hidden>
                                ×
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className="msg-stack msg-assistant-stack">
                      <div className="msg msg-assistant">
                        <div className="msg-bubble-header">
                          <span className="msg-role">{modelUiName}</span>
                          <div className="msg-bubble-meta-row">
                            <MessageTimestamp createdAt={m.createdAt} lang={lang} t={t} />
                          </div>
                        </div>
                        <div className="msg-body">
                          {m.content ? (
                            <ChatMarkdown content={m.content} theme={theme} t={t} />
                          ) : null}
                          {streaming ? <span className="cursor-blink" aria-hidden /> : null}
                        </div>
                        {!streaming && m.nanoTurnStats ? (
                          <NanoTurnStatsFooter
                            stats={m.nanoTurnStats}
                            t={t}
                            messageCreatedAt={m.createdAt}
                            lang={lang}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="composer">
              {busy ? (
                <div className="composer-meta-strip composer-meta-strip-busy">
                  <div className="composer-meta-center">
                    <span className="composer-status" role="status">
                      {t('waiting')}
                    </span>
                  </div>
                </div>
              ) : null}
              <form
                className={`composer-inner composer-inner--align-end${composerImageDropHover ? ' composer-inner--drop-hover' : ''}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canSendMessage) return;
                  void send();
                }}
                onDragEnter={onComposerDragEnter}
                onDragLeave={onComposerDragLeave}
                onDragOver={onComposerDragOver}
                onDrop={onComposerDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="composer-file-input"
                  accept={COMPOSER_FILE_INPUT_ACCEPT}
                  onChange={(e) => void addComposerFiles(e.target.files)}
                />
                <div
                  className="composer-meta-mobile"
                  role="group"
                  aria-label={t('composer.mobileIdentityAria')}
                >
                  <div className="composer-mobile-chip composer-mobile-chip--assistant">
                    <span className="composer-mobile-chip-label">{t('composer.mobileChipAssistant')}</span>
                    <span className="composer-mobile-chip-value">{modelUiName}</span>
                  </div>
                  {settingsDraft.preferredName.trim() ? (
                    <div className="composer-mobile-chip composer-mobile-chip--you">
                      <span className="composer-mobile-chip-label">{t('composer.mobileChipYou')}</span>
                      <span className="composer-mobile-chip-value">
                        {settingsDraft.preferredName.trim()}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="composer-left-stack">
                  <div
                    className="composer-model-discrete composer-model-above-rail composer-desktop-only"
                    aria-current="true"
                  >
                    <span className="composer-model-row">
                      <span className="composer-model-name-wrap">
                        <span className="composer-model-name">{modelUiName}</span>
                      </span>
                    </span>
                  </div>
                  <div className="composer-rail" role="toolbar" aria-label={t('composer.toolbarAria')}>
                    {nanoLmRuntimeOk ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon composer-rail-btn composer-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy || !activeSessionId}
                        title={t('chat.attach.filesAndImages')}
                        aria-label={t('chat.attach.filesAndImages')}
                      >
                        <IconPaperclip size={17} />
                      </button>
                    ) : null}
                    {messages.some((m) => m.role === 'user') ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon composer-rail-btn composer-summary-btn"
                        disabled={busy || summaryInFlight || !activeSessionId}
                        onClick={() => {
                          const label =
                            sessions.find((s) => s.id === activeSessionId)?.title ??
                            t('defaultChatTitle');
                          openChatSummary(activeSessionId, label, messages);
                        }}
                        title={t('chat.summary.view')}
                        aria-label={t('chat.summary.view')}
                      >
                        <IconChatSummary size={17} />
                      </button>
                    ) : null}
                    {messages.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon composer-rail-btn composer-export-btn"
                        disabled={busy || !activeSessionId}
                        onClick={() => {
                          setChatsOpen(false);
                          setSettingsOpen(false);
                          setExportOpen(true);
                        }}
                        title={t('chat.export.open')}
                        aria-label={t('chat.export.open')}
                      >
                        <IconExportChat size={17} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="composer-field-wrap composer-input-shell">
                  {pendingAttachments.length ? (
                    <div className="composer-attachments" aria-label={t('chat.attach.filesAndImages')}>
                      {pendingAttachments.map((a) => (
                        <div key={a.id} className="attachment-pill">
                          {isChatTextAttachment(a) ? (
                            <span className="attachment-pill-text-icon" aria-hidden>
                              TXT
                            </span>
                          ) : (
                            <img src={a.dataUrl} alt="" className="attachment-thumb" />
                          )}
                          <span>{a.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))
                            }
                            aria-label={t('chat.attach.removeAria')}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    ref={inputRef}
                    className="composer-textarea"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    onPaste={onComposerPaste}
                    placeholder={t('placeholder')}
                    disabled={busy || !activeSessionId}
                    rows={1}
                    spellCheck
                  />
                </div>
                <div className="composer-right-stack">
                  {settingsDraft.preferredName.trim() ? (
                    <div
                      className="composer-model-discrete composer-model-above-rail composer-user-above-send composer-desktop-only"
                      aria-label={t('settings.preferredName')}
                    >
                      <span className="composer-model-row">
                        <span className="composer-model-name-wrap">
                          <span className="composer-model-name">
                            {settingsDraft.preferredName.trim()}
                          </span>
                        </span>
                      </span>
                    </div>
                  ) : null}
                  {busy ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      title={t('chat.cancelStreaming')}
                      onPointerDown={(e) => {
                        if (e.pointerType !== 'touch') return;
                        e.preventDefault();
                        stop();
                      }}
                      onClick={() => stop()}
                    >
                      {t('chat.cancelStreaming')}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      onPointerDown={(e) => {
                        if (e.pointerType !== 'touch') return;
                        if (!canSendMessage) return;
                        e.preventDefault();
                        inputRef.current?.blur();
                        void send();
                      }}
                      disabled={!canSendMessage}
                    >
                      {t('chat.send')}
                    </button>
                  )}
                </div>
              </form>
            </div>
        </>
      </main>

      <button
        type="button"
        className="fab-new-chat"
        onClick={() => void openNewChat()}
        title={t('nav.newChat')}
        aria-label={t('nav.newChat')}
      >
        <svg className="fab-new-chat-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <DraggableDialog
        open={settingsOpen}
        title={t('settings.title')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={() => setSettingsOpen(false)}
        width={680}
        variant="solid"
      >
        <div className="dialog-fields settings-dialog-fields settings-dialog-fields--modal settings-dialog-root">
          <p className="hint settings-dialog-lead">{t('settings.lead')}</p>
          {settingsRefineError ? <p className="settings-dialog-error">{settingsRefineError}</p> : null}
          <div className="settings-vscode-split">
            <nav className="settings-vscode-nav" role="tablist" aria-label={t('settings.navAria')}>
              {SETTINGS_SECTION_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={settingsSection === id}
                  id={`settings-tab-${id}`}
                  className={`settings-vscode-nav-btn${settingsSection === id ? ' settings-vscode-nav-btn-active' : ''}`}
                  onClick={() => setSettingsSection(id)}
                >
                  {t(settingsSectionLabelKey(id))}
                </button>
              ))}
            </nav>
            <div
              className="settings-vscode-pane"
              role="tabpanel"
              aria-labelledby={`settings-tab-${settingsSection}`}
            >
              {settingsSection === 'general' ? (
                <div className="settings-general-stack">
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionGeneral')}</h3>
                  <div className="field">
                    <label htmlFor="minerva-lang">{t('settings.language')}</label>
                    <select
                      id="minerva-lang"
                      value={lang}
                      onChange={(e) => {
                        setLang(e.target.value as AppLang);
                        setSettingsRefineError(null);
                      }}
                    >
                      <option value="en">{t('lang.en')}</option>
                      <option value="es">{t('lang.es')}</option>
                      <option value="es-AR">{t('lang.esAR')}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="minerva-theme">{t('settings.theme')}</label>
                    <select
                      id="minerva-theme"
                      value={theme}
                      onChange={(e) => {
                        setTheme(e.target.value as ThemeMode);
                        setSettingsRefineError(null);
                      }}
                    >
                      <option value="dark">{t('settings.theme.dark')}</option>
                      <option value="light">{t('settings.theme.light')}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="minerva-title-interval">{t('settings.chatTitleInterval')}</label>
                    <input
                      id="minerva-title-interval"
                      type="number"
                      min={0}
                      max={500}
                      step={1}
                      value={settingsDraft.chatTitleRefreshEveryUserMessages}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === '' ? 0 : parseInt(raw, 10);
                        if (!Number.isFinite(v)) return;
                        setSettingsDraft((d) => ({
                          ...d,
                          chatTitleRefreshEveryUserMessages: v,
                        }));
                        setSettingsNotice(null);
                        setSettingsRefineError(null);
                      }}
                    />
                    <p className="hint">{t('settings.chatTitleIntervalHelp')}</p>
                  </div>
                  <div className="field">
                    <label htmlFor="minerva-stream-first-timeout">{t('settings.streamFirstChunkTimeout')}</label>
                    <input
                      id="minerva-stream-first-timeout"
                      type="number"
                      min={0}
                      max={600}
                      step={1}
                      value={settingsDraft.streamFirstChunkTimeoutSec}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === '' ? 0 : parseInt(raw, 10);
                        if (!Number.isFinite(v)) return;
                        setSettingsDraft((d) => ({
                          ...d,
                          streamFirstChunkTimeoutSec: v,
                        }));
                        setSettingsNotice(null);
                        setSettingsRefineError(null);
                      }}
                    />
                    <p className="hint">{t('settings.streamFirstChunkTimeoutHelp')}</p>
                  </div>
                </div>
              ) : null}
              {settingsSection === 'profile' ? (
                <>
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionProfile')}</h3>
                  <div className="field">
                    <label htmlFor="minerva-preferred-name">{t('settings.preferredName')}</label>
                    <input
                      id="minerva-preferred-name"
                      type="text"
                      autoComplete="nickname"
                      value={settingsDraft.preferredName}
                      onChange={(e) => {
                        setSettingsDraft((d) => ({ ...d, preferredName: e.target.value }));
                        setSettingsNotice(null);
                        setSettingsRefineError(null);
                      }}
                      placeholder={t('settings.preferredNamePlaceholder')}
                    />
                    <p className="hint">{t('settings.preferredNameHelp')}</p>
                  </div>
                </>
              ) : null}
              {settingsSection === 'system' ? (
                <>
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionSystem')}</h3>
                  <div className="field">
                    <div className="field-label-row">
                      <label htmlFor="minerva-sys">{t('settings.systemPrompt')}</label>
                      <button
                        type="button"
                        className="btn-ai-refine"
                        disabled={busy || refiningSystemPrompt}
                        onClick={() => void refineSystemPromptWithAi()}
                        title={t('settings.refineWithAi')}
                        aria-label={t('settings.refineWithAi')}
                      >
                        <AiActionIcon size={16} />
                        <span>{refiningSystemPrompt ? t('settings.refining') : t('settings.refineWithAi')}</span>
                      </button>
                    </div>
                    <textarea
                      id="minerva-sys"
                      className="admin-textarea"
                      rows={8}
                      value={settingsDraft.systemPrompt}
                      onChange={(e) => {
                        setSettingsDraft((d) => ({ ...d, systemPrompt: e.target.value }));
                        setSettingsNotice(null);
                        setSettingsRefineError(null);
                      }}
                      placeholder={t('settings.systemPromptPlaceholder')}
                    />
                    <p className="hint">{t('settings.systemPromptHelp')}</p>
                  </div>
                </>
              ) : null}
              {settingsSection === 'data' ? (
                <div id="settings-pane-data">
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionData')}</h3>
                  <StorageQuotaPieChart t={t} />
                  <div className="field">
                    <p className="hint">{t('settings.pruneOldestChatsHelp')}</p>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || backupBusy}
                      onClick={() => setConfirmPruneChatsOpen(true)}
                    >
                      {t('settings.pruneOldestChats')}
                    </button>
                  </div>
                  <div className="user-settings-privacy-danger-zone">
                    <button
                      type="button"
                      className="btn btn-ghost admin-danger"
                      disabled={busy || backupBusy}
                      onClick={() => setConfirmClearChatsOpen(true)}
                    >
                      {t('settings.clearChats')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost admin-danger"
                      disabled={busy || backupBusy}
                      onClick={() => setConfirmClearAllDataOpen(true)}
                    >
                      {t('settings.clearAllData')}
                    </button>
                  </div>
                </div>
              ) : null}
              {settingsSection === 'files' ? (
                <div id="settings-pane-files">
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionFiles')}</h3>
                  <div className="field">
                    <label htmlFor="minerva-max-text-mib-slider">{t('settings.maxTextAttachmentMib')}</label>
                    <div className="settings-mib-control-row">
                      <input
                        id="minerva-max-text-mib-slider"
                        type="range"
                        min={MIN_MAX_TEXT_ATTACHMENT_MIB}
                        max={MAX_MAX_TEXT_ATTACHMENT_MIB}
                        step={0.25}
                        value={settingsDraft.maxTextAttachmentMib}
                        aria-valuemin={MIN_MAX_TEXT_ATTACHMENT_MIB}
                        aria-valuemax={MAX_MAX_TEXT_ATTACHMENT_MIB}
                        aria-valuenow={settingsDraft.maxTextAttachmentMib}
                        aria-valuetext={`${formatMibForField(settingsDraft.maxTextAttachmentMib)} MiB`}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const clamped = clampMaxTextAttachmentMib(v);
                          setSettingsDraft((d) => ({ ...d, maxTextAttachmentMib: clamped }));
                          setSettingsNotice(null);
                          setSettingsRefineError(null);
                          if (!mibTextEditingRef.current) {
                            setMibText(formatMibForField(clamped));
                          }
                        }}
                      />
                      <div className="settings-mib-numeric-with-unit">
                        <input
                          id="minerva-max-text-mib"
                          type="text"
                          inputMode="decimal"
                          className="settings-mib-text-input"
                          aria-label={t('settings.maxTextAttachmentMibTextAria')}
                          value={mibText}
                          onFocus={() => {
                            mibTextEditingRef.current = true;
                          }}
                          onChange={(e) => {
                            setMibText(e.target.value);
                          }}
                          onBlur={() => {
                            mibTextEditingRef.current = false;
                            const parsed = parseMibFromUserText(mibText);
                            const next =
                              parsed != null
                                ? clampMaxTextAttachmentMib(parsed)
                                : settingsDraft.maxTextAttachmentMib;
                            setSettingsDraft((d) => ({ ...d, maxTextAttachmentMib: next }));
                            setMibText(formatMibForField(next));
                            setSettingsNotice(null);
                            setSettingsRefineError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                        <span className="settings-mib-unit" aria-hidden="true">
                          MiB
                        </span>
                      </div>
                    </div>
                    <p className="hint">
                      {t('settings.maxTextAttachmentMibHelp')
                        .replace('{minMib}', String(MIN_MAX_TEXT_ATTACHMENT_MIB))
                        .replace('{maxMib}', String(MAX_MAX_TEXT_ATTACHMENT_MIB))}
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="minerva-max-image-mib-slider">{t('settings.maxImageAttachmentMib')}</label>
                    <div className="settings-mib-control-row">
                      <input
                        id="minerva-max-image-mib-slider"
                        type="range"
                        min={MIN_MAX_IMAGE_ATTACHMENT_MIB}
                        max={MAX_MAX_IMAGE_ATTACHMENT_MIB}
                        step={0.25}
                        value={settingsDraft.maxImageAttachmentMib}
                        aria-valuemin={MIN_MAX_IMAGE_ATTACHMENT_MIB}
                        aria-valuemax={MAX_MAX_IMAGE_ATTACHMENT_MIB}
                        aria-valuenow={settingsDraft.maxImageAttachmentMib}
                        aria-valuetext={`${formatImageMibForField(settingsDraft.maxImageAttachmentMib)} MiB`}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const clamped = clampMaxImageAttachmentMib(v);
                          setSettingsDraft((d) => ({ ...d, maxImageAttachmentMib: clamped }));
                          setSettingsNotice(null);
                          setSettingsRefineError(null);
                          if (!imageMibTextEditingRef.current) {
                            setImageMibText(formatImageMibForField(clamped));
                          }
                        }}
                      />
                      <div className="settings-mib-numeric-with-unit">
                        <input
                          id="minerva-max-image-mib"
                          type="text"
                          inputMode="decimal"
                          className="settings-mib-text-input"
                          aria-label={t('settings.maxImageAttachmentMibTextAria')}
                          value={imageMibText}
                          onFocus={() => {
                            imageMibTextEditingRef.current = true;
                          }}
                          onChange={(e) => {
                            setImageMibText(e.target.value);
                          }}
                          onBlur={() => {
                            imageMibTextEditingRef.current = false;
                            const parsed = parseMibFromUserText(imageMibText);
                            const next =
                              parsed != null
                                ? clampMaxImageAttachmentMib(parsed)
                                : settingsDraft.maxImageAttachmentMib;
                            setSettingsDraft((d) => ({ ...d, maxImageAttachmentMib: next }));
                            setImageMibText(formatImageMibForField(next));
                            setSettingsNotice(null);
                            setSettingsRefineError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                        <span className="settings-mib-unit" aria-hidden="true">
                          MiB
                        </span>
                      </div>
                    </div>
                    <p className="hint">
                      {t('settings.maxImageAttachmentMibHelp')
                        .replace('{minMib}', String(MIN_MAX_IMAGE_ATTACHMENT_MIB))
                        .replace('{maxMib}', String(MAX_MAX_IMAGE_ATTACHMENT_MIB))}
                    </p>
                  </div>
                </div>
              ) : null}
              {settingsSection === 'backup' ? (
                <div id="settings-pane-backup">
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionBackup')}</h3>
                  <div className="field settings-backup-block">
                    <p className="hint">{t('settings.backup.lead')}</p>
                    <div className="settings-backup-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy || backupBusy}
                        onClick={() => void runDownloadFullBackup()}
                      >
                        {t('settings.backup.download')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy || backupBusy}
                        onClick={requestRestoreBackupFilePick}
                      >
                        {t('settings.backup.restore')}
                      </button>
                    </div>
                    <p className="hint">{t('settings.backup.restoreHint')}</p>
                  </div>
                </div>
              ) : null}
              {settingsSection === 'about' ? (
                <div id="settings-pane-about" className="settings-about-pane">
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionAbout')}</h3>
                  <div className="about-dialog settings-about-inner">
                    <p className="about-dialog-lead">{t('brand.name')}</p>
                    <p className="hint about-dialog-desc">{t('about.lead')}</p>
                    <dl className="about-dialog-dl">
                      <dt>{t('about.author')}</dt>
                      <dd>Pablo Medina</dd>
                      <dt>{t('about.license')}</dt>
                      <dd>MIT</dd>
                    </dl>
                    <p className="hint about-dialog-mit">{t('about.mitNotice')}</p>
                    <p className="about-dialog-copy">{t('about.copyright')}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="settings-dialog-footer">
            <div className="admin-actions">
              <button type="button" className="btn btn-primary" onClick={() => void saveSettingsClick()}>
                {t('settings.save')}
              </button>
              {settingsNotice ? <span className="admin-test-msg">{settingsNotice}</span> : null}
            </div>
          </div>
        </div>
      </DraggableDialog>

      <MessageDialog
        open={confirmDeleteOpen}
        variant="warning"
        title={t('chat.deleteConfirmTitle')}
        message={t('chat.deleteConfirmBody')}
        closeAriaLabel={t('dialog.close')}
        onClose={() => {
          setConfirmDeleteOpen(false);
          setPendingDeleteId(null);
        }}
        onConfirm={() => void runDeleteSession()}
        confirmLabel={t('chat.delete')}
        cancelLabel={t('dialog.back')}
      />
      <MessageDialog
        open={confirmClearChatsOpen}
        variant="warning"
        title={t('settings.clearChatsTitle')}
        message={t('settings.clearChatsBody')}
        closeAriaLabel={t('dialog.close')}
        onClose={() => setConfirmClearChatsOpen(false)}
        onConfirm={() => void runClearAllChats()}
        confirmLabel={t('settings.clearChatsAction')}
        cancelLabel={t('dialog.back')}
      />
      <MessageDialog
        open={confirmClearAllDataOpen}
        variant="warning"
        title={t('settings.clearAllDataTitle')}
        message={t('settings.clearAllDataBody')}
        closeAriaLabel={t('dialog.close')}
        onClose={() => setConfirmClearAllDataOpen(false)}
        onConfirm={() => void runClearAllData()}
        confirmLabel={t('settings.clearAllDataAction')}
        cancelLabel={t('dialog.back')}
      />
      <MessageDialog
        open={confirmPruneChatsOpen}
        variant="warning"
        title={t('settings.pruneOldestChatsTitle')}
        message={t('settings.pruneOldestChatsBody')}
        closeAriaLabel={t('dialog.close')}
        onClose={() => setConfirmPruneChatsOpen(false)}
        onConfirm={() => void runPruneOldestChats()}
        confirmLabel={t('settings.pruneOldestChatsAction')}
        cancelLabel={t('dialog.back')}
      />
      <MessageDialog
        open={confirmRestoreBackupOpen}
        variant="warning"
        title={t('settings.backup.restoreConfirmTitle')}
        message={t('settings.backup.restoreConfirmBody').replace(
          '{name}',
          pendingRestoreLabel ?? '—',
        )}
        closeAriaLabel={t('dialog.close')}
        onClose={closeRestoreBackupConfirm}
        onConfirm={() => void runConfirmedRestoreBackup()}
        confirmLabel={t('settings.backup.restoreConfirmAction')}
        cancelLabel={t('dialog.back')}
      />

      <MessageDialog
        open={truncateTailConfirmOpen}
        variant="warning"
        title={t('chat.userMessage.truncateConfirmTitle')}
        message={t('chat.userMessage.truncateConfirmBody')}
        closeAriaLabel={t('dialog.close')}
        onClose={() => {
          setTruncateTailConfirmOpen(false);
          setTruncateTailPending(null);
        }}
        onConfirm={() => {
          const p = truncateTailPending;
          setTruncateTailPending(null);
          setTruncateTailConfirmOpen(false);
          if (!p || !activeSessionId) return;
          void (async () => {
            setError(null);
            setBusy(true);
            const cur = messagesRef.current;
            if (p.kind === 'resend') {
              const base = cur[p.idx];
              if (!base || base.role !== 'user') {
                setBusy(false);
                return;
              }
              const prior = cur.slice(0, p.idx);
              await runUserTurnStream({
                sessionId: activeSessionId,
                prior,
                userMsg: base,
                resetLanguageModel: true,
              });
              return;
            }
            const base = cur[p.idx];
            if (!base || base.role !== 'user') {
              setBusy(false);
              return;
            }
            const userDisplay = buildUserMessageDisplayContent(p.text, p.attachments, t);
            const userMsg: ChatMessage = {
              id: base.id,
              role: 'user',
              createdAt: base.createdAt,
              content: userDisplay,
              ...(p.attachments.length > 0 ? { attachments: p.attachments } : {}),
            };
            const prior = cur.slice(0, p.idx);
            await runUserTurnStream({
              sessionId: activeSessionId,
              prior,
              userMsg,
              resetLanguageModel: true,
            });
          })();
        }}
        confirmLabel={t('chat.userMessage.truncateConfirmAction')}
        cancelLabel={t('dialog.back')}
      />

      <MessageDialog
        open={confirmDeleteUserMessageOpen}
        variant="warning"
        title={t('chat.userMessage.deleteConfirmTitle')}
        message={
          pendingDeleteUserMessageIdx != null && pendingDeleteUserMessageIdx < messages.length - 1
            ? t('chat.userMessage.deleteConfirmBodyWithFollowing')
            : t('chat.userMessage.deleteConfirmBodyOnly')
        }
        closeAriaLabel={t('dialog.close')}
        onClose={closeDeleteUserMessageConfirm}
        onConfirm={() => {
          const idx = pendingDeleteUserMessageIdx;
          setConfirmDeleteUserMessageOpen(false);
          setPendingDeleteUserMessageIdx(null);
          if (idx == null || !activeSessionId) return;
          const sid = activeSessionId;
          const next = messagesRef.current.slice(0, idx);
          void (async () => {
            abortRef.current?.abort();
            abortRef.current = null;
            for (const k of [...summaryCacheRef.current.keys()]) {
              if (k.startsWith(`${sid}|`)) summaryCacheRef.current.delete(k);
            }
            try {
              lmRef.current?.destroy();
            } catch {
              /* ignore */
            }
            lmRef.current = null;
            lmUsesImagesRef.current = false;
            setModelUiName(modelLabelForSession(null, t));
            setBusy(false);
            setError(null);
            await persistMessages(sid, next);
          })();
        }}
        confirmLabel={t('chat.userMessage.deleteConfirmAction')}
        cancelLabel={t('dialog.back')}
      />

      {editUserDialog ? (
        <EditUserMessageDialog
          open
          title={t('chat.editUserMessage.title')}
          initialText={editUserDialog.initialText}
          initialAttachments={editUserDialog.initialAttachments}
          onClose={closeEditUserMessage}
          onSave={submitEditedUserMessage}
          canSave={!busy && Boolean(activeSessionId) && nanoLmRuntimeOk}
          emptyError={t('chat.editUserMessage.empty')}
          placeholder={t('placeholder')}
          closeAriaLabel={t('dialog.close')}
          mobileBackAriaLabel={t('dialog.back')}
          saveLabel={t('chat.editUserMessage.save')}
          cancelLabel={t('dialog.back')}
          attachmentsGroupAria={t('chat.attach.filesAndImages')}
          removeAttachmentAria={t('chat.attach.removeAria')}
        />
      ) : null}

      <ChatExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        messages={messages}
        sessionTitle={sessions.find((s) => s.id === activeSessionId)?.title ?? t('defaultChatTitle')}
        chatDisplayName={settingsDraft.preferredName.trim()}
        assistantExportLabel={modelUiName}
        lang={lang}
        t={t}
        onErrorMessage={(msg) => setError(msg)}
      />
      {viewerImages.length > 0 ? (
        <ImageViewerDialog
          open={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
          images={viewerImages}
          initialIndex={imageViewerInitial}
          t={t}
        />
      ) : null}

      <input
        ref={backupRestoreInputRef}
        type="file"
        accept="application/json,.json"
        aria-hidden
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          opacity: 0,
          overflow: 'hidden',
        }}
        onChange={onBackupRestoreFileChange}
      />
      <StoragePressureBanner t={t} onOpenDataSettings={openDataSettingsFromBanner} />
    </div>
  );
}
