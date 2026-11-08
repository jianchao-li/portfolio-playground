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
type MLCEngine = Awaited<ReturnType<typeof import('@mlc-ai/web-llm')['CreateMLCEngine']>>;

export function useLLM() {
  const engineRef = useRef<MLCEngine | null>(null);
  const loadingRef = useRef(false);
  const [status, setStatus] = useState<LLMStatus>('idle');
  const [progress, setProgress] = useState<LLMProgress>({ text: '', progress: 0 });
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [supportsWebGPU, setSupportsWebGPU] = useState<boolean | null>(null);

  const loadModel = useCallback(async () => {
    if (engineRef.current || loadingRef.current) return;
    loadingRef.current = true;

    setStatus('loading');
    setError(null);
    setProgress({ text: 'Loading AI model (~900MB, may take a while)...', progress: 0 });

    try {
      // Dynamic import to avoid SSR issues
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

      const engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report) => {
          // Transform technical messages into user-friendly ones
          let text = report.text;
          const lower = text.toLowerCase();
          if (lower.includes('start to fetch') || lower.includes('fetching param')) {
            text = 'Downloading model (~900MB, may take a while)...';
          } else if (lower.includes('loading model')) {
            text = 'Loading model into memory...';
          }
          setProgress({ text, progress: report.progress });
        },
      });

      engineRef.current = engine;
      setStatus('ready');
      setProgress({ text: 'Model loaded', progress: 1 });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Check WebGPU support on mount and auto-load model if supported
  useEffect(() => {
    const checkWebGPUAndInit = async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        setSupportsWebGPU(false);
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter = await (navigator as any).gpu.requestAdapter();
        const supported = adapter !== null;
        setSupportsWebGPU(supported);
        if (supported) loadModel();
      } catch {
        setSupportsWebGPU(false);
      }
    };

    checkWebGPUAndInit();
  }, [loadModel]);

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
