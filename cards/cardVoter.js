var cardVoter = {
    id: 'card_voter',
    icon: '🧠',
    description: 'Browser model that votes YES/NO on tool cards based on user input',
    
    // Model state
    _engine: null,
    _loaded: false,
    _loading: false,
    _loadProgress: 0,
    _modelName: 'SmolLM2-135M-Instruct-q4f16_1-MLC-1k',
    _modelLabel: 'SmolLM2 135M',
    _modelSize: '~86 MB',
    
    // Fallback tier if primary model fails
    _fallbackModel: 'Qwen2-0.5B-Instruct-q4f16_1-MLC-1k',
    _fallbackLabel: 'Qwen2 0.5B',
    
    init: function() {
        // Start loading in background — don't block the agent
        this._startLoad();
    },
    
    run: async function(context) {
        // This card is special — it's called by the agent BEFORE other cards
        // to vote on which cards should execute. It returns vote results.
        var input = context.input;
        var cards = context.cards || [];
        
        if (cards.length === 0) return { success: true, data: { votes: [] } };
        
        var votes = [];
        
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var vote = await this._vote(card, input);
            votes.push({
                card: card.name,
                match: vote.match,
                score: vote.score,
                method: vote.method
            });
        }
        
        return {
            success: true,
            data: {
                votes: votes,
                model_used: this._loaded ? this._modelLabel : 'heuristic',
                model_ready: this._loaded
            }
        };
    },
    
    _vote: async function(card, userInput) {
        // Tier 0: Browser model
        if (this._loaded && this._engine) {
            try {
                var prompt = 'Card: ' + card.name + '\n' +
                    'Description: ' + (card.description || 'No description') + '\n' +
                    'Match pattern: ' + (card.matchPattern || '') + '\n\n' +
                    'User input: "' + userInput + '"\n\n' +
                    'Does this card match the user\'s intent? Answer only YES or NO.';
                
                var result = await this._engine.chat.completions.create({
                    messages: [
                        { 
                            role: 'system', 
                            content: 'You are a card router for an AI agent named Artemis. Your only job is to decide if a tool card matches a user\'s request. Output ONLY "YES" or "NO". No explanations. No punctuation.' 
                        },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 3,
                    temperature: 0.1,
                    stream: false
                });
                
                var answer = '';
                if (result.choices && result.choices[0] && result.choices[0].message) {
                    answer = result.choices[0].message.content.trim().toUpperCase();
                }
                
                if (answer === 'YES') {
                    return { match: true, score: 0.9, method: 'browser_model' };
                } else if (answer === 'NO') {
                    return { match: false, score: 0.1, method: 'browser_model' };
                }
                
                // Model returned something unexpected — fall through to heuristic
                console.warn('[CardVoter] Unexpected model response: ' + answer);
                
            } catch (err) {
                console.warn('[CardVoter] Model voting failed: ' + err.message);
            }
        }
        
        // Tier 1: Heuristic fallback
        return this._heuristicVote(card, userInput);
    },
    
    _heuristicVote: function(card, userInput) {
        var lower = userInput.toLowerCase();
        var pattern = (card.matchPattern || '').toLowerCase();
        var desc = (card.description || '').toLowerCase();
        var name = card.name.toLowerCase();
        
        var score = 0;
        
        // Check card name keywords in input
        var nameWords = name.replace(/_/g, ' ').split(' ');
        for (var i = 0; i < nameWords.length; i++) {
            if (nameWords[i].length > 2 && lower.indexOf(nameWords[i]) > -1) {
                score += 0.25;
            }
        }
        
        // Check description keywords
        var descWords = desc.split(/\s+/).filter(function(w) { return w.length > 3; });
        var matchCount = 0;
        for (var j = 0; j < descWords.length; j++) {
            if (lower.indexOf(descWords[j]) > -1) matchCount++;
        }
        score += matchCount * 0.1;
        
        // Check match pattern keywords
        var patternWords = pattern.split(/\s+/).filter(function(w) { return w.length > 3; });
        var patternMatchCount = 0;
        for (var k = 0; k < patternWords.length; k++) {
            if (lower.indexOf(patternWords[k]) > -1) patternMatchCount++;
        }
        score += patternMatchCount * 0.15;
        
        // Clamp and threshold
        score = Math.min(score, 0.95);
        
        if (score >= 0.35) {
            return { match: true, score: score, method: 'heuristic' };
        }
        return { match: false, score: score, method: 'heuristic' };
    },
    
    _startLoad: function() {
        var self = this;
        if (this._loading || this._loaded) return;
        
        this._loading = true;
        console.log('[CardVoter] Loading decision model: ' + this._modelLabel + ' (' + this._modelSize + ')');
        
        this._ensureWebLLM().then(function() {
            var CreateMLCEngine = window.CreateMLCEngine;
            if (!CreateMLCEngine) {
                self._loading = false;
                console.warn('[CardVoter] WebLLM not available — using heuristic only');
                return;
            }
            
            CreateMLCEngine(self._modelName, {
                initProgressCallback: function(progress) {
                    self._loadProgress = progress.progress || 0;
                }
            }).then(function(engine) {
                self._engine = engine;
                self._loaded = true;
                self._loading = false;
                console.log('[CardVoter] Decision model ready: ' + self._modelLabel);
            }).catch(function(err) {
                console.warn('[CardVoter] Primary model failed: ' + err.message);
                // Try fallback
                self._tryFallbackModel();
            });
        }).catch(function(err) {
            self._loading = false;
            console.warn('[CardVoter] WebLLM import failed: ' + err.message);
        });
    },
    
    _tryFallbackModel: function() {
        var self = this;
        console.log('[CardVoter] Trying fallback: ' + this._fallbackLabel);
        
        window.CreateMLCEngine(this._fallbackModel, {
            initProgressCallback: function(progress) {
                self._loadProgress = progress.progress || 0;
            }
        }).then(function(engine) {
            self._engine = engine;
            self._loaded = true;
            self._loading = false;
            self._modelLabel = self._fallbackLabel;
            console.log('[CardVoter] Fallback model ready: ' + self._fallbackLabel);
        }).catch(function(err) {
            self._loading = false;
            console.warn('[CardVoter] All models failed — heuristic only');
        });
    },
    
    _ensureWebLLM: async function() {
        if (typeof window.CreateMLCEngine !== 'undefined') return;
        
        try {
            var webllm = await import('https://esm.run/@mlc-ai/web-llm');
            if (webllm.CreateMLCEngine) window.CreateMLCEngine = webllm.CreateMLCEngine;
            if (webllm.CreateWebWorkerEngine) window.CreateWebWorkerEngine = webllm.CreateWebWorkerEngine;
            if (webllm.hasModelInCache) window.hasModelInCache = webllm.hasModelInCache;
            console.log('[CardVoter] WebLLM loaded');
        } catch (err) {
            console.warn('[CardVoter] WebLLM import failed: ' + err.message);
            throw err;
        }
    },
    
    isReady: function() {
        return this._loaded;
    },
    
    getLoadProgress: function() {
        return this._loadProgress;
    }
};

// Auto-init on load
cardVoter.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = cardVoter;
}
