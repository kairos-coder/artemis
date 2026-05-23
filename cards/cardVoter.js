var cardVoter = {
    id: 'card_voter',
    icon: '🧠',
    description: 'Tiny browser model that votes YES/NO on tool cards — CPU-only via Transformers.js',
    
    _model: null,
    _loaded: false,
    _loading: false,
    _loadProgress: 0,
    _modelName: 'Xenova/LaMini-T5-223M',
    _modelLabel: 'LaMini-T5 223M',
    _modelSize: '~200 MB',
    
    init: function() {
        this._startLoad();
    },
    
    run: async function(context) {
        var input = context.input;
        var cards = context.cards || [];
        
        if (cards.length === 0) return { success: true, data: { votes: [] } };
        
        var votes = [];
        
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var vote = await this._vote(card, input);
            votes.push({
                card: card.name || card.id,
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
        // Tier 1: Browser model via Transformers.js
        if (this._loaded && this._model) {
            try {
                var cardName = card.name || card.id || 'unknown';
                var cardDesc = card.description || 'No description';
                
                var prompt = 'Card: ' + cardName + '\n' +
                    'Description: ' + cardDesc + '\n' +
                    'User: "' + userInput + '"\n\n' +
                    'Question: Does this card match the user\'s intent? Answer YES or NO.';
                
                var result = await this._model(prompt, {
                    max_new_tokens: 5,
                    temperature: 0.1,
                    do_sample: false
                });
                
                var answer = '';
                if (result && result[0] && result[0].generated_text) {
                    answer = result[0].generated_text.trim().toUpperCase();
                }
                
                // Parse the answer
                if (answer.indexOf('YES') > -1 && answer.indexOf('NO') === -1) {
                    return { match: true, score: 0.9, method: 'browser_model' };
                }
                if (answer.indexOf('NO') > -1 && answer.indexOf('YES') === -1) {
                    return { match: false, score: 0.1, method: 'browser_model' };
                }
                
                // Ambiguous — use heuristic
                console.warn('[CardVoter] Ambiguous model response: ' + answer);
                
            } catch (err) {
                console.warn('[CardVoter] Model voting failed: ' + err.message);
            }
        }
        
        // Tier 2: Heuristic fallback
        return this._heuristicVote(card, userInput);
    },
    
    _heuristicVote: function(card, userInput) {
        var lower = userInput.toLowerCase();
        var name = (card.name || card.id || '').toLowerCase();
        var desc = (card.description || '').toLowerCase();
        var patterns = card.matchPatterns || [];
        
        var score = 0;
        
        // Check card name keywords
        var nameWords = name.replace(/_/g, ' ').split(' ');
        for (var i = 0; i < nameWords.length; i++) {
            if (nameWords[i].length > 2 && lower.indexOf(nameWords[i]) > -1) {
                score += 0.25;
            }
        }
        
        // Check match patterns
        for (var j = 0; j < patterns.length; j++) {
            if (lower.indexOf(patterns[j].toLowerCase()) > -1) {
                score += 0.3;
            }
        }
        
        // Check description keywords
        var descWords = desc.split(/\s+/).filter(function(w) { return w.length > 3; });
        var matchCount = 0;
        for (var k = 0; k < descWords.length; k++) {
            if (lower.indexOf(descWords[k]) > -1) matchCount++;
        }
        score += matchCount * 0.08;
        
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
        console.log('[CardVoter] Loading: ' + this._modelLabel + ' (' + this._modelSize + ') — CPU only, no WebGPU');
        
        import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js')
            .then(function(module) {
                var pipeline = module.pipeline;
                var env = module.env;
                
                env.localModelPath = null;
                env.allowRemoteModels = true;
                env.useBrowserCache = true;
                env.remoteHost = 'https://huggingface.co';
                env.remotePathTemplate = '{model}/resolve/{revision}/';
                
                return pipeline('text2text-generation', self._modelName, {
                    quantized: true,
                    progress_callback: function(progress) {
                        if (progress.status === 'progress' && progress.total) {
                            self._loadProgress = progress.loaded / progress.total;
                        } else if (progress.status === 'done') {
                            self._loadProgress = 1;
                        }
                    }
                });
            })
            .then(function(model) {
                self._model = model;
                self._loaded = true;
                self._loading = false;
                console.log('[CardVoter] Model ready: ' + self._modelLabel);
            })
            .catch(function(err) {
                self._loading = false;
                console.warn('[CardVoter] Load failed: ' + err.message + ' — using heuristic');
            });
    },
    
    isReady: function() {
        return this._loaded;
    },
    
    getLoadProgress: function() {
        return this._loadProgress;
    }
};

cardVoter.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = cardVoter;
}
