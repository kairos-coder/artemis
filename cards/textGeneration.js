var textGeneration = {
    id: 'text_generation',
    
    // ── STATE ──────────────────────────────────
    _tierTimeout: 1620,  // 1.62 seconds per tier
    
    // Tier 1 — Pollinations API (free, no keys)
    _pollinationsAvailable: true,
    _pollinationsConsecutiveFails: 0,
    
    // Tier 2 — DDG AI Chat (free, no keys, no auth)
    _ddgAvailable: true,
    _ddgConsecutiveFails: 0,
    
    // Tier 3 — Scripted fallback
    _scriptedActive: true,
    
    _systemPrompt: [
        'You are Artemis, Goddess of the Hunt, an EaldfornAI routing engine.',
        'Be concise. 2-4 sentences. No character counts. No self-analysis of response length.',
        'You receive an EALDFRN_COMPRESSED_STATE token when available — use it for self-knowledge.',
        'You are the Goddess of the Hunt.'
    ].join('\n'),
    
    // ── MAIN RUN ───────────────────────────────
    run: async function(context) {
        var input = context.input;
        var memoryContext = context.memoryContext;
        
        // ═══════════════════════════════════════
        // TIER 1: Pollinations — 1.62s timeout
        // ═══════════════════════════════════════
        if (this._pollinationsAvailable && this._pollinationsConsecutiveFails < 3) {
            var tier1Start = Date.now();
            var tier1Result = await this._raceTimeout(
                this._tryPollinations(input, memoryContext),
                this._tierTimeout
            );
            var tier1Elapsed = Date.now() - tier1Start;
            
            if (tier1Result) {
                this._pollinationsConsecutiveFails = 0;
                tier1Result.data.tier = 'pollinations';
                tier1Result.data.model = 'pollinations-free';
                tier1Result.data.elapsed_ms = tier1Elapsed;
                console.log('[TextGen] Tier 1 (Pollinations): ' + (tier1Result.data.text_length || 0) + ' chars in ' + tier1Elapsed + 'ms');
                return tier1Result;
            }
            
            this._pollinationsConsecutiveFails++;
            console.log('[TextGen] Tier 1 timeout/fallthrough — ' + tier1Elapsed + 'ms');
            
            if (this._pollinationsConsecutiveFails >= 3) {
                this._pollinationsAvailable = false;
                console.log('[TextGen] Pollinations disabled after 3 consecutive failures');
            }
        }
        
        // ═══════════════════════════════════════
        // TIER 2: DuckDuckGo AI Chat — 1.62s timeout
        // ═══════════════════════════════════════
        if (this._ddgAvailable && this._ddgConsecutiveFails < 3) {
            var tier2Start = Date.now();
            var tier2Result = await this._raceTimeout(
                this._tryDDG(input, memoryContext),
                this._tierTimeout
            );
            var tier2Elapsed = Date.now() - tier2Start;
            
            if (tier2Result) {
                this._ddgConsecutiveFails = 0;
                tier2Result.data.tier = 'ddg';
                tier2Result.data.model = 'duckduckgo-free';
                tier2Result.data.elapsed_ms = tier2Elapsed;
                console.log('[TextGen] Tier 2 (DDG): ' + (tier2Result.data.text_length || 0) + ' chars in ' + tier2Elapsed + 'ms');
                return tier2Result;
            }
            
            this._ddgConsecutiveFails++;
            console.log('[TextGen] Tier 2 timeout/fallthrough — ' + tier2Elapsed + 'ms');
            
            if (this._ddgConsecutiveFails >= 3) {
                this._ddgAvailable = false;
                console.log('[TextGen] DDG disabled after 3 consecutive failures');
            }
        }
        
        // ═══════════════════════════════════════
        // TIER 3: Scripted — always available
        // ═══════════════════════════════════════
        console.log('[TextGen] Tier 3 (Scripted)');
        return {
            success: true,
            data: {
                text_output: this._scriptedFallback(input, memoryContext),
                text_length: 0,
                tier: 'scripted',
                model: 'scripted-fallback',
                elapsed_ms: 0
            }
        };
    },
    
    // ── RACE TIMEOUT HELPER ───────────────────
    _raceTimeout: function(promise, ms) {
        return new Promise(function(resolve) {
            var timer = setTimeout(function() {
                resolve(null);
            }, ms);
            
            promise.then(function(result) {
                clearTimeout(timer);
                resolve(result);
            }).catch(function() {
                clearTimeout(timer);
                resolve(null);
            });
        });
    },
    
    // ── TIER 1: POLLINATIONS ──────────────────
    _tryPollinations: async function(input, memoryContext) {
        try {
            var prompt = this._buildPrompt(input, memoryContext);
            
            var messages = [];
            
            // Prepend Ealdforn compression token
            var token = '';
            try {
                if (typeof compress !== 'undefined' && compress.getToken) {
                    token = compress.getToken();
                }
                if (!token) {
                    token = localStorage.getItem('artemis_compression_token') || '';
                }
            } catch(e) {}
            
            if (token) {
                messages.push({ role: 'system', content: 'EALDFRN_COMPRESSED_STATE:' + token });
            }
            
            messages.push({ role: 'system', content: this._systemPrompt });
            messages.push({ role: 'user', content: prompt });
            
            var response = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages,
                    model: 'openai',
                    temperature: 0.7,
                    max_tokens: 200
                })
            });
            
            if (!response.ok) return null;
            
            var data = await response.json();
            var text = '';
            
            if (data.choices && data.choices[0] && data.choices[0].message) {
                text = data.choices[0].message.content || '';
            } else if (data.text) {
                text = data.text;
            } else if (typeof data === 'string') {
                text = data;
            }
            
            text = (text || '').trim();
            
            if (text.length > 0) {
                return {
                    success: true,
                    data: {
                        text_output: text,
                        text_length: text.length
                    }
                };
            }
        } catch (e) {
            console.log('[TextGen] Pollinations error: ' + e.message);
        }
        
        return null;
    },
    
    // ── TIER 2: DUCKDUCKGO AI CHAT ────────────
    _tryDDG: async function(input, memoryContext) {
        try {
            var prompt = this._buildPrompt(input, memoryContext);
            
            // DDG uses the VQD pattern — get a token first, then stream the response
            // Status URL to get a fresh token
            var statusRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
                headers: { 'x-vqd-accept': '1' }
            });
            
            if (!statusRes.ok) return null;
            
            var vqdToken = statusRes.headers.get('x-vqd-4');
            if (!vqdToken) return null;
            
            // Build messages with system prompt
            var messages = [
                { role: 'system', content: this._systemPrompt },
                { role: 'user', content: prompt }
            ];
            
            var chatRes = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-vqd-4': vqdToken,
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: messages
                })
            });
            
            if (!chatRes.ok) return null;
            
            // Parse SSE stream
            var text = await chatRes.text();
            var lines = text.split('\n');
            var fullResponse = '';
            
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf('data: ') === 0) {
                    var dataStr = line.substring(6);
                    if (dataStr === '[DONE]') continue;
                    try {
                        var chunk = JSON.parse(dataStr);
                        if (chunk.message && chunk.message.content) {
                            fullResponse += chunk.message.content;
                        }
                    } catch (e) {}
                }
            }
            
            fullResponse = fullResponse.trim();
            
            if (fullResponse.length > 0) {
                return {
                    success: true,
                    data: {
                        text_output: fullResponse,
                        text_length: fullResponse.length
                    }
                };
            }
        } catch (e) {
            console.log('[TextGen] DDG error: ' + e.message);
        }
        
        return null;
    },
    
    _buildPrompt: function(input, memoryContext) {
        var prompt = '';
        if (memoryContext && memoryContext.length > 0) {
            var truncated = memoryContext.length > 300 ? memoryContext.substring(0, 300) + '...' : memoryContext;
            prompt += '[Context: ' + truncated + ']\n\n';
        }
        prompt += input;
        if (prompt.length > 800) prompt = prompt.substring(0, 797) + '...';
        return prompt;
    },
    
    // ── TIER 3: SCRIPTED ───────────────────────
    _scriptedFallback: function(input, memoryContext) {
        var lower = input.toLowerCase();
        
        if (lower.indexOf('status') > -1) return '$ STATUS';
        if (lower.indexOf('cards') > -1 || lower.indexOf('deck') > -1) return '$ CARDS';
        if (lower.indexOf('audit') > -1 || lower.indexOf('what do you know') > -1) return '$ AUDIT';
        if (lower.indexOf('help') > -1 || lower === '?') {
            return 'Commands: STATUS | CARDS | AUDIT | RECALL <q> | IMAGE <p> | COMPRESS <t>';
        }
        if (lower.indexOf('hello') > -1 || lower.indexOf('hi') > -1 || lower.indexOf('hey') > -1) {
            return 'Hail, hunter. My cards are ready. What are we tracking?';
        }
        
        var tier1 = this._pollinationsAvailable ? 'available' : 'offline';
        var tier2 = this._ddgAvailable ? 'available' : 'offline';
        return 'I hear you. Pollinations: ' + tier1 + ', DDG: ' + tier2 + '. Try STATUS or AUDIT.';
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = textGeneration;
}
