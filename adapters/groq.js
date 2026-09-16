/**
 * Groq Provider Adapter for BillAI Gateway
 */

module.exports = {
  provider: 'groq',

  /**
   * Target URL for forwarding Groq completions requests
   */
  forwardUrl: 'https://api.groq.com/openai/v1/chat/completions',

  /**
   * Extracts usage metadata (prompt_tokens, completion_tokens, model) from provider's response body
   * @param {Object} responseBody - Parsed JSON response body from Groq
   * @returns {{ promptTokens: number, completionTokens: number, model: string }}
   */
  extractUsage: (responseBody) => {
    if (!responseBody) {
      return { promptTokens: 0, completionTokens: 0, model: 'unknown' };
    }

    const usage = responseBody.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const model = responseBody.model || 'unknown';

    return {
      promptTokens,
      completionTokens,
      model,
    };
  },
};
