import type { OpenAiDriverStored } from './storage';

export type OpenAiModelListItem = { id: string };

export async function fetchOpenAiLmModelIds(cfg: OpenAiDriverStored, signal?: AbortSignal): Promise<string[]> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/models`;
  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(url, { method: 'GET', headers, signal });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: OpenAiModelListItem[] };
  const ids = (json.data ?? []).map((m) => m.id).filter(Boolean);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export async function* streamOpenAiChatCompletionDeltas(opts: {
  cfg: OpenAiDriverStored;
  messages: unknown[];
  signal: AbortSignal;
}): AsyncGenerator<{ content?: string; reasoning?: string }> {
  const { cfg, messages, signal } = opts;
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: cfg.modelId,
      messages,
      stream: true,
      temperature: cfg.temperature,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `HTTP ${res.status}`);
  }
  const body = res.body;
  if (!body) throw new Error('No response body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      for (;;) {
        const sep = buffer.indexOf('\n\n');
        if (sep < 0) break;
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of block.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string | null;
                  reasoning?: string | null;
                  reasoning_content?: string | null;
                };
              }>;
            };
            const delta = json.choices?.[0]?.delta;
            const content = typeof delta?.content === 'string' && delta.content.length > 0 ? delta.content : undefined;
            const reasoning =
              typeof delta?.reasoning === 'string' && delta.reasoning.length > 0
                ? delta.reasoning
                : typeof delta?.reasoning_content === 'string' && delta.reasoning_content.length > 0
                  ? delta.reasoning_content
                  : undefined;
            if (content || reasoning) yield { content, reasoning };
          } catch {
            /* ignore malformed lines */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

