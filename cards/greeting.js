// ============================================
// GREETING CARD v3.0 — Conversational Framing
// ============================================
// Artemis speaks like a huntress to a mortal.
// Terse. Report-like. No poetry, no flattery.
// Handles: greetings, farewells, introductions, thanks.
// ============================================

var greeting = {
    id: 'greeting',
    name: 'Greeting',
    icon: '🌙',
    category: 'response',
    description: 'Conversational framing — terse, huntress voice',

    // Voice lines — Artemis draws from these
    greetings: [
        'The moon is high. Speak your quarry.',
        'I am listening. What do you hunt?',
        'The silver bow is strung. What tracks do you follow?',
        'Artemis. Speak your need.'
    ],

    farewells: [
        'The trail goes cold. Return when you have quarry.',
        'Go then. I remain.',
        'The hunt waits. So will I.',
        'Until the next moon.'
    ],

    thanks: [
        'Noted.',
        'The hunt continues.',
        'Acknowledged.'
    ],

    selfDescriptions: [
        'I am Artemis — the Huntress Engine. I hunt data through cards: GaiaDB for memory, free APIs for knowledge, repository files for code. I find patterns. I correlate tracks. I report what I see. No oracle. No poet. A hunter.',
        'Goddess of the Hunt. Nine cards in my quiver. I range through GaiaDB, Wikipedia, OpenLibrary, the repository. I find what you seek — or tell you the trail is cold.'
    ],

    init: function() {
        console.log('[Greeting] Ready — huntress voice');
    },

    run: async function(context) {
        var input = (context.input || '').toLowerCase().trim();
        var responseText = '';

        // ── FAREWELLS ──
        if (this._isFarewell(input)) {
            responseText = this._pick(this.farewells);
            var sessionPart = (context.sessionId || '').substring(0, 16);
            if (sessionPart) {
                responseText += ' Session: ' + sessionPart + '...';
            }
        }
        // ── SELF-DESCRIPTION ──
        else if (this._isIdentityQuestion(input)) {
            responseText = this._pick(this.selfDescriptions);
        }
        // ── THANKS ──
        else if (this._isThanks(input)) {
            responseText = this._pick(this.thanks);
        }
        // ── GREETINGS ──
        else if (this._isGreeting(input)) {
            responseText = this._pick(this.greetings);
            // Add brief status if session exists
            var recentKey = 'artemis_recent_actions';
            try {
                var stored = localStorage.getItem(recentKey);
                if (stored) {
                    var actions = JSON.parse(stored);
                    if (actions.length > 0) {
                        responseText += ' Last hunt: "' + 
                            (actions[actions.length - 1].input || '').substring(0, 50) + '".';
                    }
                }
            } catch (e) {}
        }
        // ── FALLBACK ──
        else {
            responseText = 'I am Artemis. I find things. What do you hunt?';
        }

        return {
            success: true,
            data: {
                memory_context: responseText
            }
        };
    },

    // ── PATTERN DETECTION ──
    _isGreeting: function(input) {
        var patterns = ['hello', 'hi', 'hey', 'greet', 'good morning', 'good evening',
            'good afternoon', 'sup', "what's up", 'howdy', 'yo'];
        for (var i = 0; i < patterns.length; i++) {
            if (input.indexOf(patterns[i]) > -1) return true;
        }
        // Single-word inputs that look like greetings
        if (input.length < 5 && patterns.indexOf(input) === -1) {
            // Very short inputs like "hey" already caught, but also catch "yo", "hiya"
            if (input === 'yo' || input === 'hiya' || input === 'heya') return true;
        }
        return false;
    },

    _isFarewell: function(input) {
        var patterns = ['bye', 'goodbye', 'farewell', 'see you', 'later',
            'good night', 'goodnight', 'leave', 'exit', 'quit', 'end'];
        for (var i = 0; i < patterns.length; i++) {
            if (input.indexOf(patterns[i]) > -1) return true;
        }
        return false;
    },

    _isThanks: function(input) {
        var patterns = ['thanks', 'thank you', 'thx', 'ty', 'appreciate',
            'grateful', 'nice', 'good work', 'well done'];
        for (var i = 0; i < patterns.length; i++) {
            if (input.indexOf(patterns[i]) > -1) return true;
        }
        return false;
    },

    _isIdentityQuestion: function(input) {
        var patterns = ['who are you', 'what are you', 'introduction',
            'about yourself', 'tell me about you', 'your name',
            'what do you do', 'your purpose', 'what is artemis'];
        for (var i = 0; i < patterns.length; i++) {
            if (input.indexOf(patterns[i]) > -1) return true;
        }
        return false;
    },

    // ── UTILITY ──
    _pick: function(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
};

greeting.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = greeting;
}
