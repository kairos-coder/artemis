var textGeneration = {
    id: 'text_generation',
    
    // ── STATE ──────────────────────────────────
    _tierTimeout: 1620,  // 1.62 seconds per tier
    
    // Tier 1 — Browser model (Transformers.js)
    _browserModel: null,
    _browserModelLoaded: false,
    _browserModelLoading: false,
    _browserModelFailed: false,
    _browserModelName: 'Xenova/LaMini-T5-223M',
    _browserModelLabel: 'LaMini-T5 223M',
    _browserModelSize: '~200 MB',
    
    // Tier 2 — Pollinations API
    _pollinationsAvailable: true,
    _pollinationsConsecutiveFails: 0,
    
    // Tier 3 — Scripted
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
        
        // Start loading the browser model in background if needed
        if (!this._browserModelLoaded && !this._browserModelLoading && !this._browserModelFailed) {
            this._startBrowserModelLoad();
        }
        
        // ═══════════════════════════════════════
        // TIER 1: Browser Model — 1.62s timeout
        // ═══════════════════════════════════════
        if (this._browserModelLoaded && this._browserModel) {
            var tier1Start = Date.now();
            var tier1Result = await this._raceTimeout(
                this._tryBrowserModel(input, memoryContext),
                this._tierTimeout
            );
            var tier1Elapsed = Date.now() - tier1Start;
            
            if (tier1Result) {
                tier1Result.data.tier = 'browser_model';
                tier1Result.data.model = this._browserModelLabel;
                tier1Result.data.elapsed_ms = tier1Elapsed;
                console.log('[TextGen] Tier 1 (Browser): ' + (tier1Result.data.text_length || 0) + ' chars in ' + tier1Elapsed + 'ms');
                return tier1Result;
            }
            console.log('[TextGen] Tier 1 timeout/fallthrough — ' + tier1Elapsed + 'ms');
        }
        
        // ═══════════════════════════════════════
        // TIER 2: Pollinations — 1.62s timeout
        // ═══════════════════════════════════════
        if (this._pollinationsAvailable && this._pollinationsConsecutiveFails < 3) {
            var tier2Start = Date.now();
            var tier2Result = await this._raceTimeout(
                this._tryPollinations(input, memoryContext),
                this._tierTimeout
            );
            var tier2Elapsed = Date.now() - tier2Start;
            
            if (tier2Result) {
                this._pollinationsConsecutiveFails = 0;
                tier2Result.data.tier = 'pollinations';
                tier2Result.data.model = 'pollinations-free';
                tier2Result.data.elapsed_ms = tier2Elapsed;
                console.log('[TextGen] Tier 2 (Pollinations): ' + (tier2Result.data.text_length || 0) + ' chars in ' + tier2Elapsed + 'ms');
                return tier2Result;
            }
            
            this._pollinationsConsecutiveFails++;
            console.log('[TextGen] Tier 2 timeout/fallthrough — ' + tier2Elapsed + 'ms');
            
            if (this._pollinationsConsecutiveFails >= 3) {
                this._pollinationsAvailable = false;
                console.log('[TextGen] Pollinations disabled after 3 consecutive failures');
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
    
    // ── TIER 1: BROWSER MODEL ─────────────────
    _startBrowserModelLoad: function() {
        var self = this;
        if (this._browserModelLoading || this._browserModelLoaded || this._browserModelFailed) return;
        
        this._browserModelLoading = true;
        console.log('[TextGen] Loading browser model: ' + this._browserModelLabel + ' (' + this._browserModelSize + ')');
        
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
                        if (!progress) return;
                        try {
                            if (progress.status === 'progress' && progress.loaded && progress.total) {
                                self._browserModelLoadProgress = Math.min(progress.loaded / progress.total, 0.99);
                            } else if (progress.status === 'done') {
                                self._browserModelLoadProgress = 1;
                            } else if (typeof progress === 'number') {
                                self._browserModelLoadProgress = progress;
                            } else if (progress.progress !== undefined) {
                                self._browserModelLoadProgress = progress.progress;
                            }
                        } catch(e) {
                            // Silently ignore progress errors
                        }
                    }
                });
            })
            .then(function(model) {
                self._browserModel = model;
                self._browserModelLoaded = true;
                self._browserModelLoading = false;
                console.log('[TextGen] Browser model ready: ' + self._browserModelLabel);
            })
            .catch(function(err) {
                self._browserModelLoading = false;
                self._browserModelFailed = true;
                console.warn('[TextGen] Browser model failed: ' + (err.message || 'unknown error'));
            });
    },
    
    _tryBrowserModel: async function(input, memoryContext) {
        if (!this._browserModel || !this._browserModelLoaded) return null;
        
        var prompt = this._buildPrompt(input, memoryContext);
        var fullPrompt = this._systemPrompt + '\n\nUser: ' + prompt + '\nArtemis:';
        
        var result = await this._browserModel(fullPrompt, {
            max_new_tokens: 100,
            temperature: 0.7,
            do_sample: true,
            no_repeat_ngram_size: 2
        });
        
        var text = '';
        if (result && result[0] && result[0].generated_text) {
            text = result[0].generated_text.trim();
        }
        
        // Clean echoed prompt
        if (text.indexOf('Artemis:') > -1) {
            text = text.split('Artemis:').pop().trim();
        }
        if (text.indexOf('User:') > -1) {
            text = text.split('User:')[0].trim();
        }
        
        if (text.length > 3) {
            return {
                success: true,
                data: {
                    text_output: text,
                    text_length: text.length
                }
            };
        }
        
        return null;
    },
    
    // ── TIER 2: POLLINATIONS ──────────────────
    _tryPollinations: async function(input, memoryContext) {
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
        
        var tier1 = this._browserModelLoaded ? 'ready' : this._browserModelFailed ? 'offline' : 'loading';
        var tier2 = this._pollinationsAvailable ? 'available' : 'offline';
        return 'I hear you. Browser model: ' + tier1 + ', Pollinations: ' + tier2 + '. Try STATUS or AUDIT.';
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = textGeneration;
}
