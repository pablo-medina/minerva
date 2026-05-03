import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { LS_LANG, LS_THEME, messagesKey } from './constants';
import { createTranslator, loadStoredLang, loadStoredTheme } from './i18n';
import { modelLabelForSession } from './modelLabel';
import {
  LM_CORE,
  languageModelEntryOk,
  languageModelImageInputSupported,
  languageModelSupported,
  lmCoreForThreadUsesImages,
} from './promptApi';
import {
  DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
  loadActiveSessionId,
  loadMessages,
  loadSessions,
  loadSettings,
  saveActiveSessionId,
  saveMessages,
  saveSessions,
  saveSettings,
  sessionHasUserMessage,
  wipeAllMessageKeys,
} from './storage';
import { fingerprintForChatSummaryCache, summarizeChatMessages } from './chatSummary';
import { generateChatTitleWithOnDeviceModel, shouldRefreshChatTitle } from './chatTitleAi';
import {
  buildSessionInitialPromptsAsync,
  defaultSessionSystemContext,
  resolveApproximateLocation,
} from './sessionSystemPrompt';
import type { AppLang, ChatImageAttachment, ChatMessage, ChatSession, LocalSettings, ThemeMode } from './types';
import { MAX_CHAT_IMAGE_ATTACHMENTS, MAX_CHAT_IMAGE_BYTES } from './chatAttachmentConstants';
import {
  closeImageBitmaps,
  dataUrlToImageBitmap,
  fileToImageAttachment,
  formatImageSizeLimitLabel,
  isSupportedChatImageMime,
  threadUsesImageInputs,
} from './chatImageAttachments';
import { AiActionIcon } from './components/AiActionIcon';
import { LocalStorageFootprintHint } from './components/LocalStorageFootprintHint';
import { ChatMarkdown } from './components/ChatMarkdown';
import { DraggableDialog } from './components/DraggableDialog';
import { MessageDialog } from './components/MessageDialog';
import { MessageTimestamp } from './components/MessageTimestamp';

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
): Promise<void> {
  const reader = stream.getReader();
  try {
    for (;;) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) onDelta(value);
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

function HelpCircleIcon() {
  return (
    <svg className="side-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92c-.72.73-1.17 1.73-1.17 2.83v.5h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"
      />
    </svg>
  );
}

type Gate = 'loading' | 'unsupported' | 'blocked' | 'ready';

export function App() {
  const [gate, setGate] = useState<Gate>('loading');
  const [lang, setLang] = useState<AppLang>(loadStoredLang);
  const [theme, setTheme] = useState<ThemeMode>(loadStoredTheme);
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
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(LS_THEME, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LANG, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  if (gate === 'loading') {
    return (
      <div className="auth-screen">
        <p className="hint">{t('gate.loading')}</p>
      </div>
    );
  }

  if (gate === 'unsupported') {
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

  if (gate === 'blocked') {
    return (
      <>
        <div className="auth-screen">
          <div className="auth-card">
            <h1>{t('brand.name')}</h1>
            <p>{t('gate.blocked')}</p>
            <p className="hint">{t('gate.blockedHint')}</p>
            <div className="minerva-how-to-wrap">
              <button type="button" className="minerva-how-to-link" onClick={() => setHowToOpen(true)}>
                {t('howToEnableLink')}
              </button>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={recheckGate}>
              {t('gate.retry')}
            </button>
          </div>
        </div>
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

type SettingsSectionId = 'general' | 'profile' | 'system' | 'data';

const SETTINGS_SECTION_IDS: SettingsSectionId[] = ['general', 'profile', 'system', 'data'];

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
    default:
      return 'settings.sectionGeneral';
  }
}

function MinervaChatApp({ lang, setLang, theme, setTheme, t }: MinervaChatAppProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState(() => loadActiveSessionId());
  const activeSessionIdRef = useRef(activeSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<LocalSettings>(() => loadSettings());
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
  const [pendingImages, setPendingImages] = useState<ChatImageAttachment[]>([]);

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

  const bootstrapSessions = useCallback(() => {
    let list = loadSessions();
    let active = loadActiveSessionId();
    if (!list.length) {
      const id = makeId();
      const now = isoNow();
      list = [{ id, title: t('defaultChatTitle'), createdAt: now, updatedAt: now }];
      saveSessions(list);
      saveMessages(id, []);
      saveActiveSessionId(id);
      active = id;
    } else if (!active || !list.some((s) => s.id === active)) {
      active = list[0]!.id;
      saveActiveSessionId(active);
    }
    setSessions(list);
    setActiveSessionId(active);
  }, [t]);

  useEffect(() => {
    bootstrapSessions();
  }, [bootstrapSessions]);

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
    if (!activeSessionId) return;
    setMessages(loadMessages(activeSessionId));
    setPendingImages([]);
  }, [activeSessionId]);

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
    const msgs = loadMessages(sid);
    const settings = loadSettings();
    if (!msgs.length) {
      return () => {
        cancelled = true;
        lmRef.current?.destroy();
        lmRef.current = null;
        lmUsesImagesRef.current = false;
        setModelUiName(modelLabelForSession(null, t));
      };
    }
    void (async () => {
      try {
        const geo = await resolveApproximateLocation(2600);
        const ctx = defaultSessionSystemContext(lang, geo);
        const usesImages = threadUsesImageInputs(msgs);
        const initial = await buildSessionInitialPromptsAsync(settings, msgs, ctx, {
          attachmentsOnlyPrompt: t('chat.internal.attachmentsOnlyBody'),
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

  const persistSessionMeta = useCallback((next: ChatSession[]) => {
    saveSessions(next);
    setSessions(next);
  }, []);

  const persistMessages = useCallback((sid: string, next: ChatMessage[]) => {
    saveMessages(sid, next);
    setMessages(next);
  }, []);

  const openNewChat = useCallback(() => {
    const id = makeId();
    const now = isoNow();
    const row: ChatSession = {
      id,
      title: t('defaultChatTitle'),
      createdAt: now,
      updatedAt: now,
    };
    setSessions((prev) => {
      for (const s of prev) {
        if (!sessionHasUserMessage(s.id)) {
          try {
            localStorage.removeItem(messagesKey(s.id));
          } catch {
            /* ignore */
          }
        }
      }
      const kept = prev.filter((s) => sessionHasUserMessage(s.id));
      const next = [row, ...kept];
      saveSessions(next);
      return next;
    });
    saveMessages(id, []);
    saveActiveSessionId(id);
    setActiveSessionId(id);
    setChatsOpen(false);
    setSettingsOpen(false);
    setError(null);
    setPendingImages([]);
    queueMicrotask(() => {
      if (shouldAutoFocusComposerInput()) inputRef.current?.focus();
    });
  }, [t]);

  const selectSession = useCallback(
    (id: string) => {
      if (!id || id === activeSessionId) return;
      saveActiveSessionId(id);
      setActiveSessionId(id);
      setError(null);
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
    const next = sessions.filter((s) => s.id !== id);
    if (!next.length) {
      try {
        localStorage.removeItem(messagesKey(id));
      } catch {
        /* ignore */
      }
      for (const k of [...summaryCacheRef.current.keys()]) {
        if (k.startsWith(`${id}|`)) summaryCacheRef.current.delete(k);
      }
      const nid = makeId();
      const now = isoNow();
      const row: ChatSession = { id: nid, title: t('defaultChatTitle'), createdAt: now, updatedAt: now };
      persistSessionMeta([row]);
      saveMessages(nid, []);
      saveActiveSessionId(nid);
      setActiveSessionId(nid);
      return;
    }
    try {
      localStorage.removeItem(messagesKey(id));
    } catch {
      /* ignore */
    }
    for (const k of [...summaryCacheRef.current.keys()]) {
      if (k.startsWith(`${id}|`)) summaryCacheRef.current.delete(k);
    }
    persistSessionMeta(next);
    if (activeSessionId === id) {
      const first = next[0]!.id;
      saveActiveSessionId(first);
      setActiveSessionId(first);
    }
  }, [activeSessionId, pendingDeleteId, persistSessionMeta, sessions, t]);

  const saveSettingsClick = useCallback(() => {
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
    };
    saveSettings(clamped);
    setSettingsDraft(clamped);
    setSettingsNotice(t('settings.saved'));
    lmRef.current?.destroy();
    lmRef.current = null;
    lmUsesImagesRef.current = false;
  }, [settingsDraft, t]);

  const resetToFreshSingleChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    lmRef.current?.destroy();
    lmRef.current = null;
    lmUsesImagesRef.current = false;
    wipeAllMessageKeys();
    const id = makeId();
    const now = isoNow();
    const row: ChatSession = {
      id,
      title: t('defaultChatTitle'),
      createdAt: now,
      updatedAt: now,
    };
    summaryCacheRef.current.clear();
    saveSessions([row]);
    saveMessages(id, []);
    saveActiveSessionId(id);
    setSessions([row]);
    setActiveSessionId(id);
    setMessages([]);
    setPendingImages([]);
    setChatsOpen(false);
    setSettingsOpen(false);
    setError(null);
  }, [t]);

  const runClearAllChats = useCallback(() => {
    setConfirmClearChatsOpen(false);
    resetToFreshSingleChat();
    setSettingsNotice(t('settings.clearedChats'));
  }, [resetToFreshSingleChat, t]);

  const runClearAllData = useCallback(() => {
    setConfirmClearAllDataOpen(false);
    resetToFreshSingleChat();
    const empty: LocalSettings = {
      systemPrompt: '',
      preferredName: '',
      chatTitleRefreshEveryUserMessages: DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
    };
    saveSettings(empty);
    setSettingsDraft(empty);
    setSettingsNotice(t('settings.clearedAllData'));
  }, [resetToFreshSingleChat, t]);

  const addImageFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || !imageInputSupported) return;
      setError(null);
      const limitLabel = formatImageSizeLimitLabel();
      const added: ChatImageAttachment[] = [];
      for (const file of Array.from(list)) {
        if (added.length + pendingImages.length >= MAX_CHAT_IMAGE_ATTACHMENTS) {
          setError(t('chat.attachments.maxCount').replace('{n}', String(MAX_CHAT_IMAGE_ATTACHMENTS)));
          break;
        }
        if (file.size > MAX_CHAT_IMAGE_BYTES) {
          setError(
            t('chat.attachments.fileTooLarge')
              .replace('{name}', file.name)
              .replace('{limit}', limitLabel),
          );
          continue;
        }
        const mime = (file.type || '').trim();
        if (!mime || !isSupportedChatImageMime(mime)) {
          setError(t('chat.attachments.unsupportedFormat').replace('{name}', file.name));
          continue;
        }
        try {
          added.push(await fileToImageAttachment(file));
        } catch {
          setError(t('chat.attachments.imageReadFailed'));
        }
      }
      if (added.length) {
        setPendingImages((prev) => [...prev, ...added].slice(0, MAX_CHAT_IMAGE_ATTACHMENTS));
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [imageInputSupported, pendingImages.length, t],
  );

  const send = useCallback(async () => {
    if (!nanoLmRuntimeOk) return;
    const text = input.trim();
    const pending = [...pendingImages];
    if ((!text && pending.length === 0) || busy || !activeSessionId) return;
    if (pending.length && !imageInputSupported) {
      setError(t('chat.attach.hintUnavailable'));
      return;
    }
    setInput('');
    setPendingImages([]);
    setError(null);
    setBusy(true);
    const settings = loadSettings();
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
    const nextMsgs = [...prior, userMsg];
    persistMessages(activeSessionId, nextMsgs);
    setSessions((prev) => {
      const nextSess = prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return { ...s, updatedAt: isoNow() };
      });
      saveSessions(nextSess);
      return nextSess;
    });
    const assistantId = makeId();
    const assistantShell: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: isoNow(),
    };
    persistMessages(activeSessionId, [...nextMsgs, assistantShell]);

    const ac = new AbortController();
    abortRef.current = ac;

    const modelText = text || t('chat.internal.attachmentsOnlyBody');
    const needsMm = pending.length > 0 || threadUsesImageInputs(prior);
    let partsToClose: LanguageModelMessageContent[] | null = null;

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
      let acc = '';
      if (pending.length === 0) {
        const stream = session.promptStreaming(text, { signal: ac.signal });
        await consumeTextStream(
          stream,
          (chunk) => {
            acc += chunk;
            setMessages((prev) => {
              const out = prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m));
              saveMessages(activeSessionId, out);
              return out;
            });
          },
          ac.signal,
        );
      } else {
        const parts: LanguageModelMessageContent[] = [{ type: 'text', value: modelText }];
        for (const att of pending) {
          parts.push({ type: 'image', value: await dataUrlToImageBitmap(att.dataUrl) });
        }
        partsToClose = parts;
        const stream = session.promptStreaming([{ role: 'user', content: parts }], {
          signal: ac.signal,
        });
        await consumeTextStream(
          stream,
          (chunk) => {
            acc += chunk;
            setMessages((prev) => {
              const out = prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m));
              saveMessages(activeSessionId, out);
              return out;
            });
          },
          ac.signal,
        );
      }
      const finalThread: ChatMessage[] = [...nextMsgs, { ...assistantShell, content: acc }];
      const userCount = nextMsgs.filter((m) => m.role === 'user').length;
      const interval = settings.chatTitleRefreshEveryUserMessages;
      if (shouldRefreshChatTitle(userCount, interval)) {
        const sid = activeSessionId;
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
              saveSessions(nextSess);
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
        setMessages((prev) => {
          const out = prev.filter((m) => m.id !== assistantId);
          saveMessages(activeSessionId, out);
          return out;
        });
      } else {
        const key =
          e instanceof Error && e.message === 'error.noLm' ? 'error.noLm' : 'error.generic';
        setError(t(key));
        setMessages((prev) => {
          const out = prev.filter((m) => m.id !== assistantId);
          saveMessages(activeSessionId, out);
          return out;
        });
      }
    } finally {
      if (partsToClose) closeImageBitmaps(partsToClose);
      setBusy(false);
      abortRef.current = null;
      setDownloadPct(null);
    }
  }, [
    activeSessionId,
    busy,
    imageInputSupported,
    input,
    lang,
    messages,
    nanoLmRuntimeOk,
    pendingImages,
    persistMessages,
    t,
  ]);

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
    (sessionId: string, sessionLabel: string, msgs: ChatMessage[]) => {
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
      if (!aborted) setSettingsRefineError(t('settings.refineFailed'));
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
      (input.trim().length > 0 || pendingImages.length > 0),
    [activeSessionId, busy, input, pendingImages.length],
  );

  const listableSessions = useMemo(
    () => sessions.filter((s) => sessionHasUserMessage(s.id)),
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
          <button
            type="button"
            className={`side-btn${aboutOpen ? ' side-btn-active' : ''}`}
            onClick={() => {
              setChatsOpen(false);
              setSettingsOpen(false);
              setAboutOpen(true);
            }}
            title={t('about.open')}
            aria-label={t('about.open')}
          >
            <HelpCircleIcon />
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
                        className="chat-dialog-icon-btn chat-dialog-icon-btn-ai"
                        disabled={busy || summaryInFlight}
                        onClick={() => {
                          closeChatsPanel();
                          openChatSummary(s.id, s.title, loadMessages(s.id));
                        }}
                        title={t('chat.summary.view')}
                        aria-label={t('chat.summary.view')}
                      >
                        <AiActionIcon size={15} />
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
                  {imageInputSupported ? <p>{t('empty.attachHint')}</p> : null}
                </div>
              ) : (
                messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  const streaming = m.role === 'assistant' && busy && isLast;
                  if (m.role === 'user') {
                    return (
                      <div key={m.id} className="msg-stack msg-user-align">
                        <div className="msg msg-user">
                          <div className="msg-user-topbar">
                            <div className="msg-user-topbar-leading">
                              <span className="msg-role">{t('chat.message.roleUser')}</span>
                              <MessageTimestamp createdAt={m.createdAt} lang={lang} t={t} />
                            </div>
                          </div>
                          {m.attachments?.length ? (
                            <div className="msg-attachments" aria-label={t('chat.attach.images')}>
                              {m.attachments.map((a) => (
                                <div key={a.id} className="msg-attachment-card">
                                  <img
                                    src={a.dataUrl}
                                    alt={a.name}
                                    className="msg-attachment-image"
                                  />
                                  <div className="msg-attachment-meta">
                                    <strong>{a.name}</strong>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {m.content.trim() ? <div className="msg-body">{m.content}</div> : null}
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
                className="composer-inner composer-inner--align-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canSendMessage) return;
                  void send();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="composer-file-input"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  onChange={(e) => void addImageFiles(e.target.files)}
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
                    {imageInputSupported ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon composer-rail-btn composer-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy || !activeSessionId}
                        title={t('chat.attach.images')}
                        aria-label={t('chat.attach.images')}
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
                  </div>
                </div>
                <div className="composer-field-wrap composer-input-shell">
                  {pendingImages.length ? (
                    <div className="composer-attachments" aria-label={t('chat.attach.images')}>
                      {pendingImages.map((a) => (
                        <div key={a.id} className="attachment-pill">
                          <img src={a.dataUrl} alt="" className="attachment-thumb" />
                          <span>{a.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingImages((prev) => prev.filter((x) => x.id !== a.id))
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
                <>
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
                </>
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
                <>
                  <h3 className="settings-vscode-pane-title">{t('settings.sectionData')}</h3>
                  <LocalStorageFootprintHint t={t} />
                  <div className="user-settings-privacy-danger-zone">
                    <button
                      type="button"
                      className="btn btn-ghost admin-danger"
                      disabled={busy}
                      onClick={() => setConfirmClearChatsOpen(true)}
                    >
                      {t('settings.clearChats')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost admin-danger"
                      disabled={busy}
                      onClick={() => setConfirmClearAllDataOpen(true)}
                    >
                      {t('settings.clearAllData')}
                    </button>
                  </div>
                </>
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

      <DraggableDialog
        open={aboutOpen}
        title={t('about.title')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={() => setAboutOpen(false)}
        width={420}
        variant="solid"
      >
        <div className="about-dialog">
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
      </DraggableDialog>
    </div>
  );
}
