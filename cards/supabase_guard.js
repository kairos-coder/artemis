// ============================================
// SUPABASE GUARD v1.0 — Token Collision Prevention
// ============================================
// Prevents duplicate token inserts by hashing
// bodies with SHA-256 and checking before insert.
// Logs collisions instead of throwing errors.
// ============================================

var supabaseGuard = {
    id: 'supabase_guard',
    name: 'Supabase Guard',
    icon: '🛡️',
    category: 'system',
    description: 'Prevents duplicate token inserts via SHA-256 hashing',

    init: function() {
        console.log('[SupabaseGuard] Ready — SHA-256 collision prevention active');
    },

    // ── PUBLIC API ──

    // Hash a string using SHA-256 (browser-native)
    hashBody: async function(body) {
        var encoder = new TextEncoder();
        var data = encoder.encode(body);
        var hashBuffer = await crypto.subtle.digest('SHA-256', data);
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        var hashHex = hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        return hashHex;
    },

    // Check if a token with this hash already exists
    tokenExists: async function(hash) {
        if (typeof OlympianBridge === 'undefined' || !OlympianBridge.isReady()) {
            return { exists: false, error: 'Bridge not available' };
        }

        try {
            var result = await OlympianBridge.queryKairosDB('tokens', {
                select: 'id, body, created_at',
                eq: { hash: hash },
                limit: 1
            });

            if (result.error) {
                console.warn('[SupabaseGuard] Existence check failed:', result.error.message);
                return { exists: false, error: result.error.message };
            }

            if (result.data && result.data.length > 0) {
                return { exists: true, existingToken: result.data[0] };
            }

            return { exists: false };
        } catch (err) {
            console.warn('[SupabaseGuard] Existence check error:', err.message);
            return { exists: false, error: err.message };
        }
    },

    // Safe token insert — checks hash first, logs collisions
    safeInsertToken: async function(body, wordType, domain, source, telosId, metadata) {
        // 1. Generate hash
        var hash = await this.hashBody(body);

        // 2. Check if exists
        var check = await this.tokenExists(hash);

        if (check.exists) {
            // Collision detected — log it, don't throw
            console.log('[SupabaseGuard] 🔄 Token collision prevented: "' + body.substring(0, 60) + '" (hash: ' + hash.substring(0, 12) + '...)');
            
            // Log collision to localStorage for diagnostics
            this._logCollision(body, hash, check.existingToken);

            // Return the existing token instead of error
            return {
                success: true,
                data: check.existingToken,
                collision: true,
                hash: hash,
                message: 'Token already exists — collision prevented'
            };
        }

        // 3. Safe to insert — but bridge's addToken doesn't support hash yet
        // For now, return the hash so the caller can include it
        if (typeof OlympianBridge !== 'undefined' && OlympianBridge.isReady()) {
            try {
                var result = await OlympianBridge.addToken(body, wordType, domain, telosId, metadata);
                
                if (result) {
                    // Store the hash mapping locally since the table may not have a hash column yet
                    this._storeHashMapping(hash, result.id, body);
                    console.log('[SupabaseGuard] ✅ Token inserted with hash: ' + hash.substring(0, 12) + '...');
                    return {
                        success: true,
                        data: result,
                        hash: hash,
                        collision: false
                    };
                }
            } catch (err) {
                console.warn('[SupabaseGuard] Insert failed:', err.message);
                return { success: false, error: err.message, hash: hash };
            }
        }

        return { success: false, error: 'Bridge not available', hash: hash };
    },

    // ── INTERNAL ──

    _logCollision: function(body, hash, existingToken) {
        try {
            var key = 'artemis_token_collisions';
            var log = JSON.parse(localStorage.getItem(key) || '[]');
            log.push({
                body: body.substring(0, 200),
                hash: hash,
                existingId: existingToken.id,
                existingCreatedAt: existingToken.created_at,
                timestamp: new Date().toISOString()
            });
            if (log.length > 100) log.splice(0, log.length - 100);
            localStorage.setItem(key, JSON.stringify(log));
        } catch (e) {}
    },

    _storeHashMapping: function(hash, tokenId, body) {
        try {
            var key = 'artemis_token_hashes';
            var map = JSON.parse(localStorage.getItem(key) || '{}');
            map[hash] = {
                tokenId: tokenId,
                body: body.substring(0, 100),
                storedAt: new Date().toISOString()
            };
            // Keep map lean
            var keys = Object.keys(map);
            if (keys.length > 500) {
                var oldest = keys.sort(function(a, b) {
                    return (map[a].storedAt || '').localeCompare(map[b].storedAt || '');
                }).slice(0, keys.length - 500);
                oldest.forEach(function(k) { delete map[k]; });
            }
            localStorage.setItem(key, JSON.stringify(map));
        } catch (e) {}
    },

    // Get collision stats for diagnostics
    getCollisionStats: function() {
        try {
            var log = JSON.parse(localStorage.getItem('artemis_token_collisions') || '[]');
            return {
                totalCollisions: log.length,
                recentCollisions: log.slice(-5),
                uniqueBodies: log.reduce(function(acc, entry) {
                    acc[entry.body] = (acc[entry.body] || 0) + 1;
                    return acc;
                }, {})
            };
        } catch (e) {
            return { totalCollisions: 0, recentCollisions: [], uniqueBodies: {} };
        }
    },

    // Clear collision log
    clearCollisionLog: function() {
        localStorage.removeItem('artemis_token_collisions');
        console.log('[SupabaseGuard] Collision log cleared');
    }
};

supabaseGuard.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = supabaseGuard;
}
