# Image Style Configuration
# Edit this file to change the style of generated images

# Choose your style preset: 'whiteboard', 'minimal', 'no-labels'
STYLE_PRESET = 'whiteboard'

STYLE_PRESETS = {
    'whiteboard': """Simple whiteboard-style educational diagram. 
FORMAT: Wide horizontal 16:9 aspect ratio. Pure white background filling entire canvas - NO frame, NO border, NO room, NO wooden edges.
STYLE: Clean colored line art like hand-drawn on whiteboard. Simple shapes, arrows, icons. Multiple colors (blue, green, red, orange, purple) to distinguish different elements.
LABELS: Only label the 2-3 MOST IMPORTANT concepts with 1-3 words each. Triple-check spelling. Use arrows to connect related items.
DO NOT: No photorealism, no 3D effects, no shadows, no decorative elements, no artistic flourishes. Keep it simple and educational.""",
    
    'minimal': """Minimal educational diagram. Wide 16:9 format. Pure white background - NO frame. Very few labels (max 2 words each, only for key items). Simple colored shapes and arrows. Clean flat style.""",
    
    'no-labels': """Educational diagram with NO TEXT at all. Wide 16:9 format. Pure white background. Explain concepts purely through colored shapes, arrows, and visual relationships. Simple line art style.""",
    
    'custom': """Put your own custom style prompt here."""
}

def get_style_prompt():
    """Get the current style prompt."""
    return STYLE_PRESETS.get(STYLE_PRESET, STYLE_PRESETS['whiteboard'])
