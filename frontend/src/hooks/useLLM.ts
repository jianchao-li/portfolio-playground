'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

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
  holdings: Array<{ symbol: string; weight: number }>;
}

const MODEL_ID = "SmolLM2-360M-Instruct-q4f16_1-MLC";

const SYSTEM_PROMPT = `You are a portfolio analysis assistant. Given portfolio metrics, provide a brief, factual summary. Structure your response as:

**Summary**: 1-2 sentence overview of performance

**Strengths**:
- Point 1
- Point 2

**Considerations**:
- Point 1
- Point 2

Rules:
- Be concise (under 200 words)
- Base all statements on the provided metrics
- Do not provide investment advice
- Use plain language`;

function buildPrompt(data: PortfolioData): string {
  const holdingsList = data.holdings
    .map((h) => `- ${h.symbol}: ${(h.weight * 100).toFixed(0)}%`)
    .join("\n");

  return `Analyze this portfolio:

Portfolio: ${data.name}

Performance Metrics:
- Total Return: ${(data.total_return * 100).toFixed(1)}%
- Annualized Return: ${(data.annualized_return * 100).toFixed(1)}%
- Volatility: ${(data.volatility * 100).toFixed(1)}%
- Sharpe Ratio: ${data.sharpe_ratio.toFixed(2)}
- Max Drawdown: ${(data.max_drawdown * 100).toFixed(1)}%

Holdings:
${holdingsList}

Provide a brief analysis.`;
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
    setProgress({ text: 'Initializing...', progress: 0 });

    try {
      // Dynamic import to avoid SSR issues
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

      const engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report) => {
          setProgress({
            text: report.text,
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

  const generate = useCallback(async (data: PortfolioData) => {
    if (!engineRef.current || status !== 'ready') return;

    setOutput('');
    setError(null);
    setStatus('generating');

    try {
      const prompt = buildPrompt(data);

      const stream = await engineRef.current.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 350,
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
