import {
  getClaudeBrowserProxy,
  resetClaudeBrowserProxy,
  scheduleClaudeBrowserIdleClose,
} from "./browser-proxy.mjs";

export class ClaudeChatClient {
  constructor({ debug = false, proxyFactory = getClaudeBrowserProxy } = {}) {
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
    } catch (err) {
      resetClaudeBrowserProxy();
      throw err;
    } finally {
      scheduleClaudeBrowserIdleClose();
    }
  }
}
