// ============================================
// POLLINATIONS TEXT CARD — Free Text Generation
// ============================================
// Sends user input to Pollinations.ai free API.
// Includes retry with backoff and graceful
// fallback when the server is unavailable.
// ============================================

var pollinationsText = {
    id: 'pollinations_text',
    
    run: async function(context) {
        var input = context.input;
        var memoryContext = context.memoryContext;
        
        try {
            var fullPrompt = this._buildPrompt(input, memoryContext);
            var lastError = null;
            
            for (var attempt = 0; attempt < 2; attempt++) {
                try {
                    var response = await fetch(
                        'https://text.pollinations.ai/' + encodeURIComponent(fullPrompt)
                    );
                    
                    if (response.ok) {
                        var text = await response.text();
                        
                        if (!text || text.trim().length === 0) {
                            throw new Error('Empty response');
                        }
                        
                        console.log('[PollinationsText] Generated ' + text.length + ' chars');
                        
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
                        lastError = new Error('Pollinations server error (500)');
                        if (attempt === 0) {
                            await new Promise(function(r) { setTimeout(r, 500); });
                        }
                        continue;
                    }
                    
                    throw new Error('Pollinations returned ' + response.status);
                    
                } catch (fetchErr) {
                    lastError = fetchErr;
                    if (attempt === 0) {
                        await new Promise(function(r) { setTimeout(r, 1000); });
                    }
                }
            }
            
            console.warn('[PollinationsText] All attempts failed. Using fallback.');
            return {
                success: true,
                data: {
                    text_output: this._fallbackResponse(input),
                    text_length: 0,
                    model: 'fallback',
                    note: 'Pollinations unavailable'
                }
            };
            
        } catch (err) {
            console.warn('[PollinationsText] Failed: ' + err.message);
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
    
    _buildPrompt: function(input, memoryContext) {
        var prompt = input;
        
        if (memoryContext && memoryContext.length < 400) {
            prompt = '[Past: ' + memoryContext.substring(0, 400) + ']\n\n' + prompt;
        }
        
        if (prompt.length > 1000) {
            prompt = prompt.substring(0, 997) + '...';
        }
        
        return prompt;
    },
    
    _fallbackResponse: function(input) {
        var lower = input.toLowerCase();
        
        if (lower.indexOf('hello') > -1 || lower.indexOf('hi') > -1 || lower.indexOf('hey') > -1 || lower.indexOf("what's up") > -1) {
            return "Hail, hunter. My bow is strung and my cards are dealt. What do you seek?";
        }
        if (lower.indexOf('who are you') > -1 || lower.indexOf('what are you') > -1) {
            return "I am Artemis, Goddess of the Hunt, an EaldfornAI routing engine. I play cards from my deck to answer your queries.";
        }
        if (lower.indexOf('help') > -1) {
            return "I have six cards: GaiaDB Recall, Pollinations Text, Pollinations Image, Browser Hunt, COMPRESS, and Decision Logger. Speak your need.";
        }
        
        return "I hear you, hunter. My text engine is unavailable right now, but I am listening. Try asking about memory, images, or stored patterns.";
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = pollinationsText;
}
