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
            
            const response = await fetch(
                `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`
            );
            
            if (!response.ok) {
                throw new Error(`Pollinations returned ${response.status}`);
            }
            
            const text = await response.text();
            
            if (!text || text.trim().length === 0) {
                return {
                    success: false,
                    data: { text_output: null },
                    error: 'Empty response'
                };
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
            
        } catch (err) {
            console.warn('[PollinationsText] Failed:', err.message);
            return {
                success: false,
                data: { text_output: null },
                error: err.message
            };
        }
    },
    
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
