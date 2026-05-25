var browserHunt = {
    id: 'browser_hunt',
    icon: '🏹',
    description: 'Hunt through kairos-coder repos — reads HTML, JS, CSS, MD, and JSON files',
    
    // Known repos to hunt through — ALLOWLIST (only repos that actually exist)
    _repos: [
        'artemis', 'demeter', 'hephaestus', 'apollo', 'athena',
        'poseidon', 'hermes', 'zeus', 'nexus', 'kairos-coder.github.io'
    ],
    
    // File types to check (in priority order)
    _fileTypes: ['index.html', 'chat.html', 'terminal.html', 'agent.js', 'config.js', 'README.md'],
    
    // Cache to avoid re-fetching
    _cache: {},
    _cacheTimeout: 300000, // 5 minutes
    
    run: async function(context) {
        var input = context.input || '';
        var pattern = this._extractHuntPattern(input);
        
        if (!pattern || pattern.length < 2) {
            return {
                success: true,
                data: {
                    text_output: 'No hunt pattern found. Try: "hunt for Apollo in the repos" or "find chat.html across all projects"'
                }
            };
        }
        
        console.log('[BrowserHunt] Hunting for: "' + pattern + '"');
        
        var results = [];
        var fetchPromises = [];
        var totalFilesChecked = 0;
        
        for (var r = 0; r < this._repos.length; r++) {
            var repo = this._repos[r];
            
            for (var f = 0; f < this._fileTypes.length; f++) {
                var file = this._fileTypes[f];
                var cacheKey = repo + '/' + file;
                var rawUrl = 'https://raw.githubusercontent.com/kairos-coder/' + repo + '/main/' + file;
                
                // Check cache first
                if (this._cache[cacheKey] && (Date.now() - this._cache[cacheKey].timestamp) < this._cacheTimeout) {
                    totalFilesChecked++;
                    var cachedContent = this._cache[cacheKey].content;
                    if (cachedContent && cachedContent.toLowerCase().indexOf(pattern.toLowerCase()) > -1) {
                        results.push({
                            repo: repo, 
                            file: file, 
                            url: 'https://github.com/kairos-coder/' + repo + '/blob/main/' + file,
                            rawUrl: rawUrl, 
                            matchType: 'content', 
                            cached: true
                        });
                    }
                    continue; 
                }
                
                // Setup async fetch
                var fetchPromise = (function(repoName, fileName, cacheId, url, self) {
                    return new Promise(async function(resolve) {
                        try {
                            var controller = new AbortController();
                            var timeout = setTimeout(function() { controller.abort(); }, 3000);
                            
                            var response = await fetch(url, { 
                                signal: controller.signal,
                                headers: { 'Accept': 'text/plain, text/html, application/javascript, text/css, application/json' }
                            });
                            
                            clearTimeout(timeout);
                            
                            if (response.ok) {
                                var content = await response.text();
                                self._cache[cacheId] = { content: content, timestamp: Date.now() };
                                
                                if (content.toLowerCase().indexOf(pattern.toLowerCase()) > -1) {
                                    var snippet = self._extractSnippet(content, pattern);
                                    results.push({
                                        repo: repoName, 
                                        file: fileName, 
                                        url: 'https://github.com/kairos-coder/' + repoName + '/blob/main/' + fileName,
                                        rawUrl: url, 
                                        matchType: 'content', 
                                        snippet: snippet, 
                                        cached: false
                                    });
                                }
                            }
                        } catch (err) {
                            // Silent fail for missing files
                        }
                        resolve(true);
                    });
                })(repo, file, cacheKey, rawUrl, this);
                
                fetchPromises.push(fetchPromise);
            }
        }
        
        // Wait for all requests
        var completedFetches = await Promise.all(fetchPromises);
        totalFilesChecked += completedFetches.length;
        
        // Build response
        var textOutput = '';
        if (results.length === 0) {
            textOutput = 'Hunt complete. Checked ' + totalFilesChecked + ' files across ' + this._repos.length + ' repos. Pattern "' + pattern + '" not found.';
        } else {
            textOutput = 'Hunt complete. Found "' + pattern + '" in ' + results.length + ' file(s):\n\n';
            for (var i = 0; i < results.length; i++) {
                var res = results[i];
                textOutput += (i + 1) + '. ' + res.repo + '/' + res.file + (res.cached ? ' (cached)' : '') + '\n';
                if (res.snippet) textOutput += '   "' + res.snippet + '"\n';
                textOutput += '   ' + res.rawUrl + '\n\n';
            }
        }
        
        console.log('[BrowserHunt] ' + results.length + ' matches in ' + totalFilesChecked + ' files');
        
        return {
            success: true,
            data: {
                text_output: textOutput,
                file_results: results.map(function(r) {
                    return {
                        path: r.repo + '/' + r.file,
                        excerpt: r.snippet || '',
                        url: r.rawUrl,
                        repo: r.repo,
                        file: r.file
                    };
                }),
                hunt_results: results,
                pattern: pattern,
                files_checked: totalFilesChecked,
                repos_searched: this._repos.length
            }
        };
    },
    
    _extractHuntPattern: function(input) {
        var cleaned = input
            .replace(/hunt|search|find|look for|track|locate|browser hunt/gi, '')
            .replace(/for |in |across |the |my |all /gi, '')
            .replace(/repos|repositories|code|files|html|projects/gi, '')
            .trim();
        
        if (!cleaned || cleaned.length < 2) {
            cleaned = input.trim();
        }
        
        var words = cleaned.split(/\s+/).filter(function(w) { 
            return w.length > 1 && 
                   w !== 'the' && w !== 'for' && w !== 'in' && w !== 'across';
        });
        
        return words.slice(0, 4).join(' ');
    },
    
    _extractSnippet: function(content, pattern) {
        var lower = content.toLowerCase();
        var idx = lower.indexOf(pattern.toLowerCase());
        
        if (idx === -1) return null;
        
        var start = Math.max(0, idx - 40);
        var end = Math.min(content.length, idx + pattern.length + 40);
        
        var snippet = content.substring(start, end).replace(/\s+/g, ' ').trim();
        
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
        
        return snippet;
    },
    
    huntFile: async function(repo, file) {
        var rawUrl = 'https://raw.githubusercontent.com/kairos-coder/' + repo + '/main/' + file;
        
        try {
            var response = await fetch(rawUrl);
            if (response.ok) {
                return await response.text();
            }
        } catch (err) {
            console.warn('[BrowserHunt] Direct fetch failed: ' + repo + '/' + file);
        }
        return null;
    },
    
    clearCache: function() {
        this._cache = {};
        console.log('[BrowserHunt] Cache cleared');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = browserHunt;
}
