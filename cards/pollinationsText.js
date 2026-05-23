// ============================================
// POLLINATIONS TEXT CARD — Free Text Generation
// ============================================
// Patched: sends user input directly, skips system
// prompt to avoid Pollinations 500 on long URLs.
// ============================================

const pollinationsText = {
    id: 'pollinations_text',
    
    async run(context) {
    const { input, memoryContext } = context;
    
    try {
        const fullPrompt = this._buildPrompt(input, memoryContext);
        
        // Try up to 2 times with backoff
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await fetch(
                    `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`
                );
                
                if (response.ok) {
                    const text = await response.text();
                    
                    if (!text || text.trim().length === 0) {
                        throw new Error('Empty response');
                    }
                    
                    console.log('[PollinationsText] Generated', text.length, 'chars');
                    
                    return {
                        success: true,
                        data: {
                            text_output: text.trim(),
                            text_length: text.trim().length,
                            model: 'pollinations-free'
                        }
                    };
                }
                
                if (response.status === 500) {
                    lastError = new Error('Pollinations server error (500) — may be overloaded');
                    // Wait 1 second before retry
                    if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                
                throw new Error(`Pollinations returned ${response.status}`);
                
            } catch (fetchErr) {
                lastError = fetchErr;
                if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        // All retries exhausted — return graceful fallback
        console.warn('[PollinationsText] All attempts failed. Returning fallback.');
        return {
            success: true,
            data: {
                text_output: this._fallbackResponse(input),
                text_length: 0,
                model: 'fallback',
                note: 'Pollinations unavailable — using local fallback'
            }
        };
        
    } catch (err) {
        console.warn('[PollinationsText] Failed:', err.message);
        return {
            success: true,
            data: {
                text_output: this._fallbackResponse(input),
                text_length: 0,
                model: 'fallback'
            }
        };
    }
},

_fallbackResponse(input) {
    // Simple pattern-matched responses when Pollinations is down
    const lower = input.toLowerCase();
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes("what's up")) {
        return "Hail, hunter. My bow is strung and my cards are dealt. What do you seek?";
    }
    if (lower.includes('who are you') || lower.includes('what are you')) {
        return "I am Artemis, Goddess of the Hunt, an EaldfornAI routing engine. I play cards from my deck — memory, generation, retrieval — to answer your queries.";
    }
    if (lower.includes('help')) {
        return "I have six cards in my deck: GaiaDB Recall, Pollinations Text, Pollinations Image, Browser Hunt, COMPRESS, and Decision Logger. Speak your need and I will play the right ones.";
    }
    return "I hear you, hunter. My primary text engine is unavailable at the moment, but I am listening. Try asking about memory, images, or patterns.";
}
    
    _buildPrompt(input, memoryContext) {
        // Keep it SHORT — Pollinations free tier 500s on long prompts
        let prompt = input;
        
        // Only attach memory context if it's brief
        if (memoryContext && memoryContext.length < 400) {
            prompt = `[Past: ${memoryContext.substring(0, 400)}]\n\n${prompt}`;
        }
        
        // Hard cap at 1000 chars to prevent 500 errors
        if (prompt.length > 1000) {
            prompt = prompt.substring(0, 997) + '...';
        }
        
        return prompt;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = pollinationsText;
}
