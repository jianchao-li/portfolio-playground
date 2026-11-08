// Runs the web-llm engine off the main thread, so loading model weights and
// generating text don't block rendering or input.
import './window-shim'; // must come first
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
