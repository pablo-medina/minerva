import { convertInitialPromptsToOpenAi, convertPromptInputToOpenAiUserRows } from './convertPrompt';
import { streamOpenAiChatCompletionDeltas } from './openAiHttp';
import type { OpenAiLmPolyfillStored } from './storage';
import { isOpenAiLmPolyfillConfigComplete, loadOpenAiLmPolyfillConfig } from './storage';

type OpenAiChatRow =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | unknown[] }
  | { role: 'assistant'; content: string };

function makeDownloadMonitor(cb?: CreateMonitorCallback): void {
  if (!cb) return;
  const mon = new EventTarget() as CreateMonitor;
  queueMicrotask(() => {
    try {
      mon.dispatchEvent(new ProgressEvent('downloadprogress', { loaded: 1, total: 1 }));
    } catch {
      /* ignore */
    }
  });
  cb(mon);
}

/**
 * Minimal `LanguageModel` stand-in: only what Minerva uses (`create`, `availability`,
 * `destroy`, `promptStreaming`, optional `prompt`). Other surface methods exist so
 * callers matching Chrome’s IDL do not crash.
 */
export class OpenAiPolyfillLanguageModel extends EventTarget {
  static readonly minervaPolyfillKind = 'openai-compatible' as const;

  static async availability(_options?: LanguageModelCreateCoreOptions): Promise<Availability> {
    return isOpenAiLmPolyfillConfigComplete(loadOpenAiLmPolyfillConfig()) ? 'available' : 'unavailable';
  }

  static async create(options?: LanguageModelCreateOptions): Promise<OpenAiPolyfillLanguageModel> {
    const cfg = loadOpenAiLmPolyfillConfig();
    if (!isOpenAiLmPolyfillConfigComplete(cfg)) {
      throw new Error('error.noLm');
    }
    const signal = options?.signal;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    makeDownloadMonitor(options?.monitor);
    const initial = await convertInitialPromptsToOpenAi(options?.initialPrompts, signal ?? new AbortController().signal);
    return new OpenAiPolyfillLanguageModel(cfg, initial);
  }

  static async params(): Promise<LanguageModelParams> {
    throw new DOMException('LanguageModel.params is not available in the OpenAI-compatible polyfill.', 'NotSupportedError');
  }

  readonly name: string;
  readonly topK = 0;
  readonly temperature = 0;
  readonly contextUsage = 0;
  readonly contextWindow = 131_072;
  /** @deprecated */
  readonly inputUsage = 0;
  /** @deprecated */
  readonly inputQuota = 131_072;

  private destroyed = false;
  private readonly messages: OpenAiChatRow[];

  private constructor(
    private readonly cfg: OpenAiLmPolyfillStored,
    initialRows: OpenAiChatRow[],
  ) {
    super();
    this.name = cfg.modelId;
    this.messages = initialRows;
  }

  destroy(): undefined {
    this.destroyed = true;
    this.messages.length = 0;
    return undefined;
  }

  private ensureAlive(): void {
    if (this.destroyed) throw new DOMException('LanguageModel session destroyed', 'InvalidStateError');
  }

  prompt(input: LanguageModelPrompt, options?: LanguageModelPromptOptions): Promise<string> {
    return (async () => {
      const stream = this.promptStreaming(input, options);
      const reader = stream.getReader();
      let acc = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) acc += value;
        }
      } finally {
        reader.releaseLock();
      }
      return acc;
    })();
  }

  promptStreaming(input: LanguageModelPrompt, options?: LanguageModelPromptOptions): ReadableStream<string> {
    const signal = options?.signal ?? new AbortController().signal;
    const cfg = this.cfg;
    const messages = this.messages;

    return new ReadableStream<string>({
      start: async (controller) => {
        try {
          this.ensureAlive();
          const newRows = await convertPromptInputToOpenAiUserRows(input, signal);
          for (const r of newRows) {
            messages.push(r);
          }
          let assistant = '';
          for await (const delta of streamOpenAiChatCompletionDeltas({
            cfg,
            messages: [...messages],
            signal,
          })) {
            assistant += delta;
            controller.enqueue(delta);
          }
          messages.push({ role: 'assistant', content: assistant });
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }

  async append(input: LanguageModelPrompt, options?: LanguageModelAppendOptions): Promise<undefined> {
    this.ensureAlive();
    const signal = options?.signal ?? new AbortController().signal;
    const rows = await convertPromptInputToOpenAiUserRows(input, signal);
    for (const r of rows) this.messages.push(r);
    return undefined;
  }

  async measureContextUsage(input: LanguageModelPrompt, options?: LanguageModelPromptOptions): Promise<number> {
    return this.measureUsageInner(input, options?.signal);
  }

  /** @deprecated */
  async measureInputUsage(input: LanguageModelPrompt, options?: LanguageModelPromptOptions): Promise<number> {
    return this.measureContextUsage(input, options);
  }

  private async measureUsageInner(input: LanguageModelPrompt, signal?: AbortSignal): Promise<number> {
    const rows = await convertPromptInputToOpenAiUserRows(input, signal ?? new AbortController().signal);
    const probe = [...this.messages, ...rows];
    return Math.ceil(JSON.stringify(probe).length / 4);
  }

  clone(_options?: LanguageModelCloneOptions): Promise<LanguageModel> {
    return Promise.reject(
      new DOMException('clone() is not supported in the OpenAI-compatible polyfill.', 'NotSupportedError'),
    );
  }
}
