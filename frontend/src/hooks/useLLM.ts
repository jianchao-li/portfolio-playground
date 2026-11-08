'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { PortfolioStats } from '@/lib/api';
import { formatPercent } from '@/lib/formatting';

export type LLMStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export interface LLMProgress {
  text: string;
  progress: number;
}

// Larger model for better accuracy
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const MODEL_DOWNLOAD_SIZE = '~900MB';

// Set after a successful download. Lets returning visitors auto-load the model
// from the browser cache without first-time visitors paying for the multi-MB
// web-llm bundle just to check the cache.
const CACHED_FLAG_KEY = 'llm-model-cached';

// System prompt for comparing multiple portfolios
const COMPARISON_SYSTEM_PROMPT = `You are a concise financial analyst. When given portfolio data, write a brief comparative analysis in 3-4 sentences. Focus on: which performed best, risk-adjusted returns (Sharpe ratio), and key trade-offs. Use the exact numbers provided. Do not give investment advice.`;

// System prompt for single portfolio analysis
const SINGLE_SYSTEM_PROMPT = `You are a concise financial analyst. When given portfolio data, write a brief analysis in 2-3 sentences covering performance, risk characteristics, and any notable observations. Use the exact numbers provided. Do not give investment advice.`;

const pct = (value: number) => formatPercent(value, 1);

function buildComparisonPrompt(portfolios: PortfolioStats[]): string {
  // Build clear data table
  const dataLines = portfolios.map(p =>
    `- ${p.name}: Total Return ${pct(p.total_return)}, Annualized ${pct(p.annualized_return)}, Volatility ${pct(p.volatility)}, Sharpe ${p.sharpe_ratio.toFixed(2)}, Max Drawdown ${pct(p.max_drawdown)}`
  ).join('\n');

  return `Compare these ${portfolios.length} investment portfolios:

${dataLines}

Write a 3-4 sentence comparison. Mention which had the highest return, best Sharpe ratio, and the key trade-offs between them.`;
}

function buildSinglePrompt(data: PortfolioStats): string {
  return `Analyze this portfolio:

${data.name}:
- Total Return: ${pct(data.total_return)}
- Annualized Return: ${pct(data.annualized_return)}
- Volatility: ${pct(data.volatility)}
- Sharpe Ratio: ${data.sharpe_ratio.toFixed(2)}
- Max Drawdown: ${pct(data.max_drawdown)}

Write a 2-3 sentence analysis of this portfolio's performance and risk characteristics.`;
}

// Dynamic import type for web-llm
type MLCEngine = Awaited<ReturnType<typeof import('@mlc-ai/web-llm')['CreateWebWorkerMLCEngine']>>;

function readCachedFlag(): boolean {
  try {
    return localStorage.getItem(CACHED_FLAG_KEY) === MODEL_ID;
  } catch {
    return false;
  }
}

function writeCachedFlag(cached: boolean) {
  try {
    if (cached) localStorage.setItem(CACHED_FLAG_KEY, MODEL_ID);
    else localStorage.removeItem(CACHED_FLAG_KEY);
  } catch {
    // Storage unavailable (e.g. private mode); auto-load just won't happen
  }
}

/** Run `callback` once the browser is idle, so it doesn't compete with first paint. */
function whenIdle(callback: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 2000);
  return () => clearTimeout(id);
}

export function useLLM() {
  const engineRef = useRef<MLCEngine | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const loadingRef = useRef(false);
  const [status, setStatus] = useState<LLMStatus>('idle');
  const [progress, setProgress] = useState<LLMProgress>({ text: '', progress: 0 });
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [supportsWebGPU, setSupportsWebGPU] = useState<boolean | null>(null);

  const loadModel = useCallback(async () => {
    if (loadingRef.current) return;
    if (engineRef.current) {
      // Already loaded (e.g. retrying after a generation error)
      setError(null);
      setStatus('ready');
      return;
    }
    loadingRef.current = true;

    setStatus('loading');
    setError(null);
    setProgress({ text: 'Loading AI model...', progress: 0 });

    try {
      // Dynamic import keeps web-llm out of the initial bundle (and avoids SSR issues)
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const worker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      // A crash inside the worker never settles the engine promise; surface it instead
      const workerCrashed = new Promise<never>((_, reject) => {
        worker.addEventListener('error', (e) => reject(new Error(e.message || 'AI worker failed to start')), { once: true });
      });

      const engine = await Promise.race([workerCrashed, CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: (report) => {
          // Transform technical messages into user-friendly ones
          let text = report.text;
          const lower = text.toLowerCase();
          if (lower.includes('start to fetch') || lower.includes('fetching param')) {
            text = `Downloading model (${MODEL_DOWNLOAD_SIZE}, one-time, may take a while)...`;
          } else if (lower.includes('loading model')) {
            text = 'Loading model into memory...';
          }
          setProgress({ text, progress: report.progress });
        },
      })]);

      engineRef.current = engine;
      writeCachedFlag(true);
      setStatus('ready');
      setProgress({ text: 'Model loaded', progress: 1 });
    } catch (err) {
      workerRef.current?.terminate();
      workerRef.current = null;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Check WebGPU support on mount. Auto-load the model only when it's already
  // in the browser cache; otherwise wait for the user to opt in to the download.
  useEffect(() => {
    let cancelled = false;
    let cancelIdle: (() => void) | undefined;

    const checkWebGPUAndInit = async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        setSupportsWebGPU(false);
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter = await (navigator as any).gpu.requestAdapter();
        const supported = adapter !== null;
        if (cancelled) return;
        setSupportsWebGPU(supported);
        if (!supported || !readCachedFlag()) return;

        cancelIdle = whenIdle(async () => {
          const { hasModelInCache } = await import('@mlc-ai/web-llm');
          const cached = await hasModelInCache(MODEL_ID);
          if (cancelled) return;
          if (cached) loadModel();
          else writeCachedFlag(false); // cache was cleared; ask before downloading again
        });
      } catch {
        if (!cancelled) setSupportsWebGPU(false);
      }
    };

    checkWebGPUAndInit();
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [loadModel]);

  // Stop the worker (and free GPU memory) when the component unmounts
  useEffect(() => () => {
    workerRef.current?.terminate();
  }, []);

  const generate = useCallback(async (portfolios: PortfolioStats[]) => {
    if (!engineRef.current || status !== 'ready' || portfolios.length === 0) return;

    setOutput('');
    setError(null);
    setStatus('generating');

    try {
      // Use comparison prompt for multiple portfolios, single prompt for one
      const isComparison = portfolios.length > 1;
      const systemPrompt = isComparison ? COMPARISON_SYSTEM_PROMPT : SINGLE_SYSTEM_PROMPT;
      const userPrompt = isComparison
        ? buildComparisonPrompt(portfolios)
        : buildSinglePrompt(portfolios[0]);

      const stream = await engineRef.current.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 400,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          setOutput((prev) => prev + content);
        }
      }

      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  }, [status]);

  const reset = useCallback(() => {
    setOutput('');
    setError(null);
  }, []);

  return {
    status,
    progress,
    output,
    error,
    supportsWebGPU,
    init: loadModel,
    generate,
    reset,
  };
}
