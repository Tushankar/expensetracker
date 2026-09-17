import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../lib/ApiError';

/**
 * The only place the Groq key is read, and the only place that talks to Groq.
 *
 * The key lives in the server's environment and never leaves it. The mobile app
 * calls this server; this server calls Groq. Shipping the key to a React Native
 * bundle would put it in every installed APK — `EXPO_PUBLIC_*` values are inlined
 * into the JavaScript, and a bundle is a zip anyone can open.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /**
   * An image for the model to look at, as an https URL or a `data:` URI.
   *
   * Only meaningful on a user message and only to a vision-capable model. Sent as
   * OpenAI-style content parts, which is what Groq speaks; the message keeps its
   * plain-string shape here so every non-vision caller is untouched.
   */
  imageUrl?: string;
};

export type CompletionOptions = {
  messages: ChatMessage[];
  /** Defaults to the conversational model; pass the fast one for JSON extraction. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Forces a JSON object reply. Used for intent extraction, never for prose. */
  json?: boolean;
  /**
   * How much the model thinks before answering.
   *
   * The gpt-oss models spend completion tokens on reasoning before they emit
   * anything, and that budget comes out of `maxTokens`. On a structured call
   * that can leave nothing for the answer — Groq then rejects its own output as
   * invalid JSON, with an empty generation. Classification and extraction do not
   * need deliberation, so they ask for less of it.
   */
  reasoning?: 'low' | 'medium' | 'high';
  /** Overrides `GROQ_TIMEOUT_MS`. Reading a receipt takes longer than writing a line. */
  timeoutMs?: number;
  /**
   * Whether a rate limit may fall back to the small model.
   *
   * False for vision: the fast model cannot see, so downgrading would turn "busy"
   * into a confidently wrong answer about an image it never received.
   */
  allowDowngrade?: boolean;
  signal?: AbortSignal;
};

export class AiUnavailableError extends Error {
  constructor(message = 'The assistant is unavailable right now') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export function isAiConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY);
}

/**
 * One completion, with a graceful climb down.
 *
 * Groq meters tokens per minute per model, and a busy screen can walk into that
 * limit — a summary, its insights and a question in quick succession. Rather than
 * give up straight away the request is retried once after the delay Groq itself
 * suggests, and if that is still refused it is tried on the smaller model, which
 * has its own budget. Only then does the caller fall back to the server's own
 * wording.
 *
 * So quality degrades one notch at a time — best model, smaller model, plain
 * computed text — instead of dropping to canned wording on the first 429.
 */
export async function complete(options: CompletionOptions): Promise<string> {
  const primary = options.model ?? env.GROQ_MODEL;

  try {
    return await attempt(options, primary);
  } catch (error) {
    if (!(error instanceof RateLimitedError)) throw error;

    // Groq reports how long to wait, usually a couple of seconds. Anything longer
    // than this and the person is better served by the instant plain answer.
    if (error.retryAfterMs > 0 && error.retryAfterMs <= 5_000) {
      await new Promise((resolve) => setTimeout(resolve, error.retryAfterMs));
      try {
        return await attempt(options, primary);
      } catch (retryError) {
        if (!(retryError instanceof RateLimitedError)) throw retryError;
      }
    }

    if (options.allowDowngrade !== false && primary !== env.GROQ_FAST_MODEL) {
      logger.info({ from: primary, to: env.GROQ_FAST_MODEL }, 'groq rate limited, downgrading');
      return attempt(options, env.GROQ_FAST_MODEL);
    }

    throw new AiUnavailableError('The assistant is busy. Try again in a moment.');
  }
}

/**
 * A message in the shape the API expects.
 *
 * Plain text stays a plain string — several Groq models reject the content-array
 * form outright, so promoting every message would break the assistant to support
 * a feature it does not use.
 */
function toWireMessage(message: ChatMessage): {
  role: string;
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
} {
  if (!message.imageUrl) return { role: message.role, content: message.content };

  return {
    role: message.role,
    content: [
      { type: 'text', text: message.content },
      { type: 'image_url', image_url: { url: message.imageUrl } },
    ],
  };
}

/** A 429 that is worth retrying, carrying the delay Groq asked for. */
class RateLimitedError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('rate limited');
    this.name = 'RateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Seconds from the `retry-after` header, or from Groq's own message. */
function retryDelay(header: string | null, body: string): number {
  const fromHeader = header ? Number(header) : Number.NaN;
  if (Number.isFinite(fromHeader)) return Math.ceil(fromHeader * 1000);

  const match = /try again in ([\d.]+)s/i.exec(body);
  const seconds = match?.[1] ? Number(match[1]) : Number.NaN;
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 200 : 0;
}

async function attempt(options: CompletionOptions, model: string): Promise<string> {
  if (!env.GROQ_API_KEY) {
    throw new AiUnavailableError('The assistant is not configured on this server');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? env.GROQ_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  const started = Date.now();

  try {
    const response = await fetch(`${env.GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages.map(toWireMessage),
        temperature: options.temperature ?? 0.2,
        max_completion_tokens: options.maxTokens ?? 500,
        ...(options.reasoning ? { reasoning_effort: options.reasoning } : {}),
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      /**
       * The upstream body can quote the prompt back, and for this app a prompt
       * contains someone's spending. It never reaches the response, and outside
       * development it does not reach the log either: a log aggregator is a copy
       * of your users' finances that nobody remembers taking.
       *
       * The status and the model are enough to diagnose a rate limit or a bad
       * model name, which is what these logs are actually read for.
       */
      logger.warn(
        {
          status: response.status,
          model,
          ...(env.isProduction ? {} : { body: text.slice(0, 500) }),
        },
        'groq request failed',
      );

      if (response.status === 429) {
        throw new RateLimitedError(retryDelay(response.headers.get('retry-after'), text));
      }
      throw new AiUnavailableError('The assistant could not answer just now');
    }

    const parsed = JSON.parse(text) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { total_tokens?: number };
    };

    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) throw new AiUnavailableError();

    logger.debug(
      {
        model,
        ms: Date.now() - started,
        tokens: parsed.usage?.total_tokens,
        finish: parsed.choices?.[0]?.finish_reason,
      },
      'groq completion',
    );

    return content;
  } catch (error) {
    if (error instanceof AiUnavailableError || error instanceof RateLimitedError) throw error;
    if (controller.signal.aborted) {
      throw new AiUnavailableError('The assistant took too long to answer');
    }
    logger.warn({ err: error }, 'groq request errored');
    throw new AiUnavailableError();
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Turns an `AiUnavailableError` into the API's own failure shape. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof AiUnavailableError) {
    return ApiError.serviceUnavailable(error.message);
  }
  return ApiError.internal('The assistant could not answer just now', error);
}
