var textGeneration = {
    id: 'text_generation',
    
    _tierTimeout: 3000,  // 3 seconds for Pollinations (was 1.62)
    _pollinationsAvailable: true,
    _pollinationsConsecutiveFails: 0,
    _pollinationsCooldown: false,
    _cooldownUntil: 0,
    
    _systemPrompt: [
        'You are Artemis, Goddess of the Hunt, an EaldfornAI routing engine.',
        'Be concise. 2-4 sentences. No character counts. No self-analysis of response length.',
        'You receive an EALDFRN_COMPRESSED_STATE token when available — use it for self-knowledge.',
        'You are the Goddess of the Hunt.'
    ].join('\n'),
    
    run: async function(context) {
        var input = context.input;
        var memoryContext = context.memoryContext;
        
        // Check cooldown
        if (this._pollinationsCooldown && Date.now() > this._cooldownUntil) {
            this._pollinationsCooldown = false;
            this._pollinationsAvailable = true;
            this._pollinationsConsecutiveFails = 0;
            console.log('[TextGen] Pollinations cooldown ended — re-enabled');
        }
        
        // Tier 1: Pollinations
        if (this._pollinationsAvailable && !this._pollinationsCooldown) {
            var result = await this._raceTimeout(
                this._tryPollinations(input, memoryContext),
                this._tierTimeout
            );
            
            if (result) {
                this._pollinationsConsecutiveFails = 0;
                result.data.tier = 'pollinations';
                console.log('[TextGen] Tier 1 (Pollinations): ' + (result.data.text_length || 0) + ' chars');
                return result;
            }
            
            this._pollinationsConsecutiveFails++;
            
            if (this._pollinationsConsecutiveFails >= 2) {
                this._pollinationsCooldown = true;
                this._cooldownUntil = Date.now() + 30000; // 30 second cooldown
                console.log('[TextGen] Pollinations on cooldown — retrying in 30s');
            }
        }
        
        // Tier 2: Scripted fallback
        if (this._pollinationsCooldown) {
            var remaining = Math.round((this._cooldownUntil - Date.now()) / 1000);
            return {
                success: true,
                data: {
                    text_output: this._scriptedFallback(input, memoryContext) + 
                        ' (Pollinations cooldown: ' + remaining + 's remaining)',
                    tier: 'scripted'
                }
            };
        }
        
        return {
            success: true,
            data: {
                text_output: this._scriptedFallback(input, memoryContext),
                tier: 'scripted'
            }
        };
    },
    
    _raceTimeout: function(promise, ms) {
        return new Promise(function(resolve) {
            var timer = setTimeout(function() { resolve(null); }, ms);
            promise.then(function(r) { clearTimeout(timer); resolve(r); })
                   .catch(function() { clearTimeout(timer); resolve(null); });
        });
    },
    
    _tryPollinations: async function(input, memoryContext) {
        try {
            var prompt = this._buildPrompt(input, memoryContext);
            var messages = [];
            
            var token = '';
            try {
                if (typeof compress !== 'undefined' && compress.getToken) token = compress.getToken();
                if (!token) token = localStorage.getItem('artemis_compression_token') || '';
            } catch(e) {}
            
            if (token) messages.push({ role: 'system', content: 'EALDFRN:' + token });
            messages.push({ role: 'system', content: this._systemPrompt });
            messages.push({ role: 'user', content: prompt });
            
            var response = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: messages, model: 'openai', temperature: 0.7, max_tokens: 200 })
            });
            
            if (response.status === 429) {
                console.warn('[TextGen] Pollinations rate limited (429)');
                return null;
            }
            if (!response.ok) return null;
            
            var data = await response.json();
            var text = (data.choices?.[0]?.message?.content || data.text || '').trim();
            
            if (text.length > 0) {
                return { success: true, data: { text_output: text, text_length: text.length } };
            }
        } catch(e) {}
        return null;
    },
    
    _buildPrompt: function(input, memoryContext) {
        var prompt = '';
        if (memoryContext && memoryContext.length > 0) {
            prompt += '[Context: ' + memoryContext.substring(0, 300) + ']\n\n';
        }
        prompt += input;
        return prompt.length > 800 ? prompt.substring(0, 797) + '...' : prompt;
    },
    
    _scriptedFallback: function(input, memoryContext) {
        var lower = input.toLowerCase();
        if (lower.indexOf('status') > -1) return '$ STATUS';
        if (lower.indexOf('cards') > -1 || lower.indexOf('deck') > -1) return '$ CARDS';
        if (lower.indexOf('audit') > -1 || lower.indexOf('what do you know') > -1) return '$ AUDIT';
        if (lower.indexOf('help') > -1) return 'Commands: STATUS | CARDS | AUDIT | RECALL <q> | IMAGE <p> | HUNT <pattern> | COMPRESS <t>';
        if (lower.indexOf('hello') > -1 || lower.indexOf('hi') > -1 || lower.indexOf('hey') > -1) {
            return 'Hail, hunter. What are we tracking?';
        }
        return 'I hear you. Say STATUS, AUDIT, or try rephrasing. (Pollinations may be on cooldown)';
    }
};
