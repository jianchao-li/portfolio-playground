'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

export type LLMStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export interface LLMProgress {
  text: string;
  progress: number;
}

export interface PortfolioData {
  name: string;
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

// Larger model for better accuracy
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

// System prompt for comparing multiple portfolios
const COMPARISON_SYSTEM_PROMPT = `You are a concise financial analyst. When given portfolio data, write a brief comparative analysis in 3-4 sentences. Focus on: which performed best, risk-adjusted returns (Sharpe ratio), and key trade-offs. Use the exact numbers provided. Do not give investment advice.`;

// System prompt for single portfolio analysis
const SINGLE_SYSTEM_PROMPT = `You are a concise financial analyst. When given portfolio data, write a brief analysis in 2-3 sentences covering performance, risk characteristics, and any notable observations. Use the exact numbers provided. Do not give investment advice.`;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildComparisonPrompt(portfolios: PortfolioData[]): string {
  // Build clear data table
  const dataLines = portfolios.map(p =>
    `- ${p.name}: Total Return ${formatPercent(p.total_return)}, Annualized ${formatPercent(p.annualized_return)}, Volatility ${formatPercent(p.volatility)}, Sharpe ${p.sharpe_ratio.toFixed(2)}, Max Drawdown ${formatPercent(p.max_drawdown)}`
  ).join('\n');

  return `Compare these ${portfolios.length} investment portfolios:

${dataLines}

Write a 3-4 sentence comparison. Mention which had the highest return, best Sharpe ratio, and the key trade-offs between them.`;
}

function buildSinglePrompt(data: PortfolioData): string {
  return `Analyze this portfolio:

${data.name}:
- Total Return: ${formatPercent(data.total_return)}
- Annualized Return: ${formatPercent(data.annualized_return)}
- Volatility: ${formatPercent(data.volatility)}
- Sharpe Ratio: ${data.sharpe_ratio.toFixed(2)}
- Max Drawdown: ${formatPercent(data.max_drawdown)}

Write a 2-3 sentence analysis of this portfolio's performance and risk characteristics.`;
}

// Dynamic import type for web-llm
type MLCEngine = Awaited<ReturnType<typeof import('@mlc-ai/web-llm')['CreateMLCEngine']>>;

export function useLLM() {
  const engineRef = useRef<MLCEngine | null>(null);
  const [status, setStatus] = useState<LLMStatus>('idle');
  const [progress, setProgress] = useState<LLMProgress>({ text: '', progress: 0 });
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [supportsWebGPU, setSupportsWebGPU] = useState<boolean | null>(null);

  // Check WebGPU support on mount
  useEffect(() => {
    const checkWebGPU = async () => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        setSupportsWebGPU(false);
        return;
      }

      if (!('gpu' in navigator)) {
        setSupportsWebGPU(false);
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gpu = (navigator as any).gpu;
        const adapter = await gpu.requestAdapter();
        setSupportsWebGPU(adapter !== null);
      } catch {
        setSupportsWebGPU(false);
      }
    };

    checkWebGPU();
  }, []);

  const init = useCallback(async () => {
    if (engineRef.current || status === 'loading') return;

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
          if (text.toLowerCase().includes('start to fetch') || text.toLowerCase().includes('fetching param')) {
            text = 'Downloading model (~900MB, may take a while)...';
          } else if (text.toLowerCase().includes('loading model')) {
            text = 'Loading model into memory...';
          }
          setProgress({
            text,
            progress: report.progress,
          });
        },
      });

      engineRef.current = engine;
      setStatus('ready');
      setProgress({ text: 'Model loaded', progress: 1 });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load model');
    }
  }, [status]);

  const generate = useCallback(async (portfolios: PortfolioData[]) => {
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

      // Debug: log the prompt being sent
      console.log('=== LLM Prompt Debug ===');
      console.log('Portfolios received:', portfolios);
      console.log('User prompt:', userPrompt);
      console.log('========================');

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
    init,
    generate,
    reset,
  };
}
