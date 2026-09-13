import {
  getGrokBrowserProxy,
  resetGrokBrowserProxy,
  scheduleGrokBrowserIdleClose,
} from "./browser-proxy.mjs";

export class GrokChatClient {
  constructor({ debug = false, proxyFactory = getGrokBrowserProxy } = {}) {
    this.debug = debug;
    this.proxyFactory = proxyFactory;
  }

  async complete({ prompt, model = null, onText = null, signal = null }) {
    try {
      const proxy = await this.proxyFactory({ debug: this.debug });
      const result = await proxy.sendChat({
        prompt,
        model,
        signal,
        onDelta: (delta, fullText) => {
          if (onText) onText(delta, fullText);
        },
      });
      return result;
    } finally {
      scheduleGrokBrowserIdleClose();
    }
  }
}
