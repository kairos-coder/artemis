// ============================================
// POLLINATIONS IMAGE CARD — Free Image Generation
// ============================================

const pollinationsImage = {
    id: 'pollinations_image',
    
    async run(context) {
        const { input } = context;
        
        try {
            // Extract image description from input
            const imagePrompt = this._extractImagePrompt(input);
            
            if (!imagePrompt || imagePrompt.length < 3) {
                return {
                    success: false,
                    data: { image_url: null },
                    error: 'No valid image prompt extracted'
                };
            }
            
            const encodedPrompt = encodeURIComponent(imagePrompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true`;
            
            console.log('[PollinationsImage] Generated URL for:', imagePrompt.substring(0, 80));
            
            return {
                success: true,
                data: {
                    image_url: imageUrl,
                    image_prompt: imagePrompt
                }
            };
            
        } catch (err) {
            console.warn('[PollinationsImage] Failed:', err.message);
            return {
                success: false,
                data: { image_url: null },
                error: err.message
            };
        }
    },
    
    _extractImagePrompt(input) {
        // Try explicit tag first
        const tagMatch = input.match(/\[IMAGE:\s*(.+?)\]/i);
        if (tagMatch) return tagMatch[1].trim();
        
        // Try common patterns
        const patterns = [
            /generate (?:an? )?image (?:of|showing) (.+)/i,
            /create (?:an? )?image (?:of|showing) (.+)/i,
            /show me (?:an? )?(.+)/i,
            /draw (?:an? )?(.+)/i,
            /picture of (.+)/i
        ];
        
        for (const pattern of patterns) {
            const match = input.match(pattern);
            if (match) return match[1].trim();
        }
        
        // Fallback: use the whole input, stripped of "image" words
        return input.replace(/\b(image|picture|photo|generate|create)\b/gi, '').trim();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = pollinationsImage;
}
