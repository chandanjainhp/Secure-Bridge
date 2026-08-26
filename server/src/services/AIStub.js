/** Development AI adapter used when no external AI service is configured. */
class AIStub {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    this.initialized = true;
    return true;
  }

  isInitialized() {
    return this.initialized;
  }

  async chatWithEncryptedContext(message) {
    return { text: `Simulation response for: ${message}`, provider: "stub", simulated: true };
  }

  async processHomomorphicResult(result, query, context = {}) {
    return {
      text: `Simulation analysis for: ${query}`,
      operation: result.operation,
      contextKeys: Object.keys(context),
      provider: "stub",
      simulated: true,
    };
  }
}

export default AIStub;
