import { convertInitialPromptsToOpenAi, convertPromptInputToOpenAiUserRows } from './convertPrompt';
import { streamOpenAiChatCompletionDeltas } from './openAiHttp';
import type { OpenAiDriverStored } from './storage';
import { isOpenAiConfigComplete } from './storage';

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

export class OpenAiLanguageModelDriver extends EventTarget {
  static readonly minervaDriverKind = 'openai-compatible' as const;

  static async availabilityWithConfig(cfg: OpenAiDriverStored | null | undefined): Promise<Availability> {
    return isOpenAiConfigComplete(cfg ?? null) ? 'available' : 'unavailable';
  }

  static async createWithConfig(
    cfg: OpenAiDriverStored,
    options?: LanguageModelCreateOptions,
  ): Promise<OpenAiLanguageModelDriver> {
    if (!isOpenAiConfigComplete(cfg)) throw new Error('error.noLm');
    const signal = options?.signal;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    makeDownloadMonitor(options?.monitor);
    const initial = await convertInitialPromptsToOpenAi(options?.initialPrompts, signal ?? new AbortController().signal);
    return new OpenAiLanguageModelDriver(cfg, initial);
  }

  readonly name: string;
  readonly topK = 0;
  readonly temperature: number;
  readonly contextUsage = 0;
  readonly contextWindow = 131_072;
  readonly inputUsage = 0;
  readonly inputQuota = 131_072;

  private destroyed = false;
  private readonly messages: OpenAiChatRow[];

  private constructor(private readonly cfg: OpenAiDriverStored, initialRows: OpenAiChatRow[]) {
    super();
    this.name = cfg.modelId;
    this.temperature = cfg.temperature;
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
          for (const r of newRows) messages.push(r);
          let assistant = '';
          let reasoning = '';
          for await (const delta of streamOpenAiChatCompletionDeltas({ cfg, messages: [...messages], signal })) {
            if (delta.reasoning) {
              reasoning += delta.reasoning;
              try {
                this.dispatchEvent(
                  new CustomEvent('minerva:reasoning-delta', {
                    detail: { delta: delta.reasoning, full: reasoning },
                  }),
                );
              } catch {
                /* ignore */
              }
            }
            if (delta.content) {
              assistant += delta.content;
              controller.enqueue(delta.content);
            }
          }
          if (reasoning) {
            try {
              this.dispatchEvent(new CustomEvent('minerva:reasoning-done', { detail: { full: reasoning } }));
            } catch {
              /* ignore */
            }
          }
          messages.push({ role: 'assistant', content: assistant });
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}

