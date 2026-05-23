// ============================================
// POLLINATIONS TEXT CARD — Free Text Generation
// ============================================

const pollinationsText = {
    id: 'pollinations_text',
    
    async run(context) {
        const { input, systemPrompt, memoryContext } = context;
        
        try {
            const fullPrompt = this._buildPrompt(input, systemPrompt, memoryContext);
            
            const response = await fetch(
                `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`
            );
            
            if (!response.ok) {
                throw new Error(`Pollinations returned ${response.status}`);
            }
            
            const text = await response.text();
            
            // Validate output
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
    
    _buildPrompt(input, systemPrompt, memoryContext) {
        let prompt = '';
        
        if (systemPrompt) {
            prompt += `[System: ${systemPrompt}]\n\n`;
        }
        
        if (memoryContext) {
            prompt += `[Relevant past context:\n${memoryContext}]\n\n`;
        }
        
        prompt += input;
        return prompt;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = pollinationsText;
}
