var cardVoter = {
    id: 'card_voter',
    icon: '🧠',
    category: 'meta',
    description: 'Votes YES/NO on cards using ModelDeck or heuristic fallback',
    
    init: function() {
        console.log('[CardVoter] Ready — will use ModelDeck if available');
    },
    
    run: async function(context) {
        // Card voter runs as auto-trigger in Phase 7
        // It can update weights based on outcomes
        return { success: true, data: {} };
    },
    
    // Called by agent during classifyInput if model voting is enabled
    voteOnCard: async function(card, userInput) {
        // Try ModelDeck first
        if (typeof modelDeck !== 'undefined' && modelDeck.isCapabilityReady('card_voting')) {
            var result = await modelDeck.voteOnCard(card, userInput);
            if (result) return result;
        }
        
        // Try direct shared model
        if (window.__artemisTextModelReady && window.__artemisTextModel) {
            try {
                var prompt = 'Card: ' + (card.name || card.id) + '\n' +
                    'Description: ' + (card.description || '') + '\n' +
                    'User: "' + userInput + '"\n\n' +
                    'Does this card match? YES or NO:';
                
                var modelResult = await window.__artemisTextModel(prompt, {
                    max_new_tokens: 5,
                    temperature: 0.1,
                    do_sample: false
                });
                
                var answer = (modelResult?.[0]?.generated_text || '').trim().toUpperCase();
                if (answer === 'YES') return { match: true, score: 0.9, method: 'browser_model' };
                if (answer === 'NO') return { match: false, score: 0.1, method: 'browser_model' };
            } catch (err) {
                console.warn('[CardVoter] Model vote failed:', err.message);
            }
        }
        
        return null; // Heuristic will handle it
    }
};

cardVoter.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = cardVoter;
}
