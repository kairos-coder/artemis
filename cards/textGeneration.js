var textGeneration = {
    id: 'text_generation',
    
    // Tier 1 state — Browser model via Transformers.js
    _browserModel: null,
    _browserModelLoaded: false,
    _browserModelLoading: false,
    _browserModelLoadProgress: 0,
    _browserModelName: 'Xenova/LaMini-T5-223M',
    _browserModelLabel: 'LaMini-T5 223M',
    _browserModelSize: '~200 MB',
    
    // Tier 2 state — Pollinations
    _pollinationsAvailable: true,
    _pollinationsConsecutiveFails: 0,
    
    // Tier 3 state — Scripted
    _scriptedActive: true,
    
    _systemPrompt: [
        'You are Artemis, Goddess of the Hunt, an EaldfornAI routing engine.',
        '',
        'You receive an EALDFRN_COMPRESSED_STATE token before every message when available.',
        'It encodes your system state: cards, database status, session, memory, model status.',
        'Use this to understand your capabilities.',
        '',
        'Be concise. 2-4 sentences. No character counts. No self-analysis of response length.',
        'If discussing your architecture, reference the compression token for accurate self-knowledge.',
        '',
        'You are the Goddess of the Hunt.'
    ].join('\n'),
    
    run: async function(context) {
        var input = context.input;
        var memoryContext = context.memoryContext;
        
        // === TIER 1: Browser model (Transformers.js — CPU, no WebGPU) ===
        if (this._browserModelLoaded && this._browserModel) {
            var browserResult = await this._tryBrowserModel(input, memoryContext);
            if (browserResult) return browserResult;
        }
        
        // Start loading if not already
        if (!this._browserModelLoaded && !this._browserModelLoading) {
            this._startBrowserModelLoad();
        }
        
        // If model is loading, show progress
        if (this._browserModelLoading) {
            return {
                success: true,
                data: {
                    text_output: '[Local model loading: ' + Math.round(this._browserModelLoadProgress * 100) + '% — ' + this._browserModelLabel + ']',
                    tier: 'loading',
                    model_loading: true
                }
            };
        }
        
        // === TIER 2: Pollinations API ===
        if (this._pollinationsAvailable && this._pollinationsConsecutiveFails < 3) {
            var pollResult = await this._tryPollinations(input, memoryContext);
            if (pollResult) {
                this._pollinationsConsecutiveFails = 0;
                return pollResult;
            }
            this._pollinationsConsecutiveFails++;
            if (this._pollinationsConsecutiveFails >= 3) {
                this._pollinationsAvailable = false;
                console.log('[TextGen] Pollinations disabled after 3 consecutive failures');
            }
        }
        
        // === TIER 3: Scripted fallback ===
        return {
            success: true,
            data: {
                text_output: this._scriptedFallback(input, memoryContext),
                tier: 'scripted',
                tier3_fallback: true
            }
        };
    },
    
    // ── TIER 1: BROWSER MODEL (Transformers.js) ─────
    _startBrowserModelLoad: function() {
        var self = this;
        if (this._browserModelLoading || this._browserModelLoaded) return;
        
        this._browserModelLoading = true;
        this._browserModelLoadProgress = 0;
        
        console.log('[TextGen] Tier 1: Loading browser model — ' + this._browserModelLabel + ' (' + this._browserModelSize + ')');
        
        // Dynamic import to avoid blocking
        import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js')
            .then(function(module) {
                var pipeline = module.pipeline;
                var env = module.env;
                
                // Force Hugging Face CDN
                env.localModelPath = null;
                env.allowRemoteModels = true;
                env.useBrowserCache = true;
                env.remoteHost = 'https://huggingface.co';
                env.remotePathTemplate = '{model}/resolve/{revision}/';
                
                return pipeline('text2text-generation', self._browserModelName, {
                    quantized: true,
                    progress_callback: function(progress) {
                        if (progress.status === 'progress' && progress.total) {
                            self._browserModelLoadProgress = progress.loaded / progress.total;
                        } else if (progress.status === 'done') {
                            self._browserModelLoadProgress = 1;
                        }
                    }
                });
            })
            .then(function(model) {
                self._browserModel = model;
                self._browserModelLoaded = true;
                self._browserModelLoading = false;
                console.log('[TextGen] Tier 1 ready: ' + self._browserModelLabel);
            })
            .catch(function(err) {
                self._browserModelLoading = false;
                console.warn('[TextGen] Tier 1 load failed: ' + err.message + ' — falling back to Pollinations');
            });
    },
    
    _tryBrowserModel: async function(input, memoryContext) {
        if (!this._browserModel) return null;
        
        try {
            var prompt = this._buildPrompt(input, memoryContext);
            
            // For LaMini-T5, use instruction format
            var fullPrompt = this._systemPrompt + '\n\nUser: ' + prompt + '\nArtemis:';
            
            var result = await this._browserModel(fullPrompt, {
                max_new_tokens: 150,
                temperature: 0.7,
                do_sample: true,
                no_repeat_ngram_size: 2
            });
            
            var text = (result[0] && result[0].generated_text) ? result[0].generated_text.trim() : '';
            
            // Clean up — remove the prompt if echoed back
            if (text.indexOf('Artemis:') > -1) {
                text = text.split('Artemis:').pop().trim();
            }
            if (text.indexOf('User:') > -1) {
                text = text.split('User:')[0].trim();
            }
            
            if (text.length > 0) {
                console.log('[TextGen] Tier 1 (Browser/' + this._browserModelLabel + '): ' + text.length + ' chars');
                return {
                    success: true,
                    data: {
                        text_output: text,
                        text_length: text.length,
                        tier: 'browser_model',
                        model: this._browserModelLabel
                    }
                };
            }
        } catch (err) {
            console.warn('[TextGen] Tier 1 generation failed: ' + err.message);
        }
        return null;
    },
    
    // ── TIER 2: POLLINATIONS ─────────────────────
    _tryPollinations: async function(input, memoryContext) {
        try {
            var prompt = this._buildPrompt(input, memoryContext);
            
            var controller = new AbortController();
            var timeout = setTimeout(function() { controller.abort(); }, 10000);
            
            var messages = [];
            
            // Prepend Ealdforn compression token if available
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
                    max_tokens: 250
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (response.ok) {
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
                    console.log('[TextGen] Tier 2 (Pollinations): ' + text.length + ' chars');
                    return {
                        success: true,
                        data: {
                            text_output: text,
                            text_length: text.length,
                            tier: 'pollinations',
                            model: 'pollinations-free'
                        }
                    };
                }
            } else {
                console.warn('[TextGen] Tier 2 returned status ' + response.status);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[TextGen] Tier 2 timeout after 10s');
            } else {
                console.log('[TextGen] Tier 2 failed: ' + err.message);
            }
        }
        return null;
    },
    
    _buildPrompt: function(input, memoryContext) {
        var prompt = '';
        
        if (memoryContext && memoryContext.length > 0) {
            var truncated = memoryContext.length > 400 ? memoryContext.substring(0, 400) + '...' : memoryContext;
            prompt += '[Context: ' + truncated + ']\n\n';
        }
        
        prompt += input;
        
        if (prompt.length > 1000) {
            prompt = prompt.substring(0, 997) + '...';
        }
        
        return prompt;
    },
    
    // ── TIER 3: SCRIPTED FALLBACK ────────────────
    _scriptedFallback: function(input, memoryContext) {
        var lower = input.toLowerCase();
        
        // System awareness
        if (lower.indexOf('your programming') > -1 || lower.indexOf('your code') > -1 ||
            lower.indexOf('your tools') > -1 || lower.indexOf('your cards') > -1 ||
            lower.indexOf('improve you') > -1 || lower.indexOf('your architecture') > -1 ||
            lower.indexOf('how you work') > -1) {
            return this._generateSelfReport();
        }
        
        // Knowledge audit
        if (lower.indexOf('what do you know') > -1 || lower.indexOf('audit') > -1) {
            return this._generateKnowledgeReport();
        }
        
        // Greetings
        if (lower.indexOf('hello') > -1 || lower.indexOf('hi') > -1 || lower.indexOf('hey') > -1 || 
            lower.indexOf("what's up") > -1 || lower.indexOf("whats up") > -1) {
            var msg = 'Hail, hunter. ';
            if (memoryContext) msg += 'I remember our past exchanges. ';
            msg += 'My cards are ready. What do you seek?';
            return msg;
        }
        
        // Status
        if (lower.indexOf('status') > -1) return '$ STATUS';
        
        // Cards
        if (lower.indexOf('cards') > -1 || lower.indexOf('deck') > -1) return '$ CARDS';
        
        // Help
        if (lower.indexOf('help') > -1 || lower === '?') {
            return 'Commands: STATUS | CARDS | WEIGHTS | HISTORY | RECALL <q> | IMAGE <p> | COMPRESS <t> | AUDIT | SAY <msg>';
        }
        
        // Default
        return 'I hear you, hunter. What are we tracking?';
    },
    
    _generateSelfReport: function() {
        var parts = [];
        parts.push('My current architecture:\n');
        
        // Token status
        var token = '';
        try { token = localStorage.getItem('artemis_compression_token') || ''; } catch(e) {}
        parts.push('Compression token: ' + (token ? 'active (' + token.length + ' chars)' : 'not generated'));
        
        // Tiers
        parts.push('Text tiers: Tier 1 Browser (' + this._browserModelLabel + ': ' + 
            (this._browserModelLoaded ? 'ready' : this._browserModelLoading ? 'loading' : 'not started') + 
            '), Tier 2 Pollinations (' + (this._pollinationsAvailable ? 'available' : 'offline') + '), Tier 3 Scripted');
        
        // Cards
        try {
            var cards = (typeof window.ArtemisAgent !== 'undefined' && window.ArtemisAgent.TOOL_CARDS) 
                ? window.ArtemisAgent.TOOL_CARDS.length : 'unknown';
            parts.push('Cards: ' + cards + ' in registry');
        } catch(e) {}
        
        parts.push('Monastery Phase-Lock: ACTIVE');
        return parts.join('\n');
    },
    
    _generateKnowledgeReport: function() {
        var parts = [];
        parts.push('Here is everything I know, hunter:\n');
        
        var sessionId = 'unknown';
        try { 
            sessionId = localStorage.getItem('artemis_session_id') || 
                        localStorage.getItem('apollo_session_token') || 'unknown';
        } catch(e) {}
        parts.push('Session: ' + (sessionId.length > 30 ? sessionId.substring(0, 30) + '...' : sessionId));
        
        try {
            var decisions = JSON.parse(localStorage.getItem('artemis_decision_history') || '[]');
            parts.push('Decisions: ' + decisions.length);
            if (decisions.length > 0) {
                var recent = decisions.slice(-3);
                for (var i = 0; i < recent.length; i++) {
                    parts.push('  "' + (recent[i].input_text || '').substring(0, 50) + '"');
                }
            }
        } catch(e) {}
        
        try {
            var patterns = JSON.parse(localStorage.getItem('artemis_patterns_local') || '[]');
            parts.push('Patterns: ' + patterns.length);
        } catch(e) {}
        
        parts.push('Tier 1: ' + (this._browserModelLoaded ? 'ready' : 'offline'));
        parts.push('Tier 2: Pollinations ' + (this._pollinationsAvailable ? 'available' : 'offline'));
        parts.push('Monastery Phase-Lock: ACTIVE');
        
        return parts.join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = textGeneration;
}
