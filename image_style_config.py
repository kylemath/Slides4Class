# Image Style Configuration
# Edit this file to change the style of generated images

import json
import os

# Choose your style preset: 'neuroscience', 'whiteboard', 'medical', 'minimal', 'no-labels', 'wakanda', 'custom'
STYLE_PRESET = 'neuroscience'

# Path for custom user styles
CUSTOM_STYLES_PATH = os.path.join(os.path.dirname(__file__), 'custom_styles.json')

STYLE_PRESETS = {
    'neuroscience': """Whiteboard-style neuroscience educational diagram with anatomical accuracy.

FORMAT: Wide horizontal 16:9 aspect ratio. Pure white background like a clean whiteboard - NO frame, NO border, NO room setting.

WHITEBOARD STYLE:
- Clean colored line art like hand-drawn on whiteboard by a professor
- Simple but accurate shapes, arrows, icons
- Multiple colors (blue, green, red, orange, purple) to distinguish different elements
- NO photorealism, NO 3D rendering, NO shadows, NO gradients

ANATOMICAL ACCURACY (CRITICAL):
- Brain structures must be anatomically correct and proportional
- Use standard neuroanatomy conventions (lateral view, sagittal section, coronal section as appropriate)
- Proper spatial relationships between structures
- Accurate gyri/sulci patterns when showing cortex
- Correct positioning of subcortical structures

TEXT & LABELS:
- Clear, legible handwriting-style or clean sans-serif labels
- Labels OUTSIDE the diagram with arrows/lines pointing to structures
- Maximum 5-7 labels per image
- Each label: 1-3 words, TRIPLE-CHECK SPELLING, use correct scientific terms
- Place labels consistently (all on same side when possible)

COLOR CODING:
- Motor areas/pathways: red or orange
- Sensory areas/pathways: blue or green  
- Limbic structures: purple
- Use color consistently throughout

DO NOT: No cartoon distortions, no artistic liberties with anatomy, no decorative elements, no cluttered labels.""",

    'medical': """Medical textbook illustration style.

FORMAT: 16:9 wide format. Clean white background.

ACCURACY: Anatomically precise, medical illustration quality. Proper proportions and spatial relationships. Suitable for medical education.

TEXT: Clear labels with leader lines. Sans-serif font. Scientific terminology. Maximum 6 labels. Spell each word correctly.

STYLE: Professional medical illustration. Subtle color gradients to show depth. Clean outlines. Standard anatomical coloring conventions.

DO NOT: No artistic interpretation, no cartoon elements, no decorative borders.""",

    'whiteboard': """Simple whiteboard-style educational diagram. 

FORMAT: Wide horizontal 16:9 aspect ratio. Pure white background filling entire canvas.

STYLE: Clean colored line art like hand-drawn on whiteboard. Simple shapes, arrows, icons. Multiple colors (blue, green, red, orange, purple) to distinguish different elements.

LABELS: Only label the 2-3 MOST IMPORTANT concepts with 1-3 words each. Triple-check spelling. Use arrows to connect related items. Place labels clearly outside diagram elements.

DO NOT: No photorealism, no 3D effects, no shadows, no decorative elements.""",
    
    'minimal': """Minimal educational diagram. 

FORMAT: Wide 16:9 format. Pure white background.

STYLE: Very simple, clean lines. Maximum 2-3 colors. Geometric shapes.

LABELS: Maximum 2 words each, only for key items. Clear readable font.

DO NOT: No complexity, no decorative elements.""",
    
    'no-labels': """Educational diagram with NO TEXT at all. 

FORMAT: Wide 16:9 format. Pure white background. 

STYLE: Explain concepts purely through colored shapes, arrows, and visual relationships. Simple clean line art style. Use color coding to distinguish elements.

DO NOT: Absolutely no text, no labels, no letters.""",

    'reboot': """PHOTOREALISTIC 3D scientific visualization - like a high-end medical textbook or museum exhibit.

FORMAT: Wide horizontal 16:9 aspect ratio. When helpful, show 2-3 coordinated viewpoints (front, side, cross-section) to reveal 3D spatial relationships.

RENDERING STYLE (CRITICAL - THIS IS NOT A DIAGRAM):
- PHOTOREALISTIC 3D renders that look like real photographs or CGI movie quality
- Actual 3D models with realistic lighting, shadows, depth, and materials
- Organic tissues should look WET, TEXTURED, and REAL (not plastic or simplified)
- Subsurface scattering for skin/tissue translucency
- Realistic surface details: blood vessels, texture, moisture, natural imperfections
- Think "Bodies exhibit" or "high-budget medical documentary" quality
- NOT symbolic icons, NOT simplified diagrams, NOT flat illustrations

BACKGROUND: Soft blurry bokeh backgrounds simulating macro photography:
- Natural gradient colors: forest greens, sky blues, soft pinks, bark browns, water teals
- Smoothly out-of-focus to make the photorealistic subject pop
- Creates professional, cinematic depth

TITLE: Include a clear, prominent title at the top. Use large, bold sans-serif text with high contrast (white text with dark outline, or dark text on light semi-transparent banner).

SCIENTIFIC & ANATOMICAL ACCURACY (CRITICAL):
- Brain structures must be anatomically correct with proper gyri/sulci patterns - REALISTIC texture
- Animal brains must look like ACTUAL animal brains (species-specific) - not simplified
- Proper scale, proportions, and spatial relationships
- Historical accuracy for case studies (e.g., Phineas Gage injury location)
- Show REAL anatomical detail, not symbolic representations

LABELS (LARGE, CLEAR, CONSISTENT):
- Maximum 5-7 labels identifying key structures
- LARGE, bold sans-serif text (24pt+ equivalent) with HIGH CONTRAST
- Choose ONE style: white text with black outline OR text on semi-transparent boxes
- Thin leader lines connecting to structures
- ALL labels must use the SAME style
- Correct scientific spelling

COLOR CODING:
- Motor pathways: warm tones (red, orange)
- Sensory pathways: cool tones (blue, green)
- Limbic structures: purple

ABSOLUTELY DO NOT:
- No flat 2D diagrams or whiteboard style
- No symbolic icons or simplified shapes
- No cartoon or hand-drawn aesthetics
- No abstract representations - show REAL structures
- No plastic-looking or oversimplified models
- No video game HUD elements""",
    
    'custom': """Put your own custom style prompt here."""
}

# Additional prompt enhancers for specific content types
CONTENT_ENHANCERS = {
    'brain': "Show accurate brain anatomy with proper gyri/sulci patterns. Use standard neuroanatomy orientation.",
    'neuron': "Show accurate neuron morphology with dendrites, soma, axon, and synaptic terminals clearly distinguished.",
    'pathway': "Use arrows to clearly show direction of signal flow. Color-code afferent (blue) vs efferent (red) pathways.",
    'comparison': "Use side-by-side or split-panel layout. Clearly label differences.",
    'process': "Use numbered steps or sequential arrows to show process flow.",
}

# Runtime state for current style (can be changed via API)
_current_style_preset = STYLE_PRESET
_current_style_prompt = None  # If set, overrides preset

# Dual-style generation settings
DUAL_STYLE_ENABLED = True
DUAL_STYLE_PRIMARY = 'neuroscience'  # Used for print/PDF
DUAL_STYLE_SECONDARY = 'reboot'       # Alternative style

def get_dual_style_config():
    """Get the dual-style generation configuration."""
    return {
        'enabled': DUAL_STYLE_ENABLED,
        'primary': DUAL_STYLE_PRIMARY,
        'secondary': DUAL_STYLE_SECONDARY,
        'primary_prompt': STYLE_PRESETS.get(DUAL_STYLE_PRIMARY, STYLE_PRESETS['neuroscience']),
        'secondary_prompt': STYLE_PRESETS.get(DUAL_STYLE_SECONDARY, STYLE_PRESETS['reboot'])
    }

def get_dual_style_prompts(content_prompt):
    """
    Get both style prompts for dual-style generation.
    Returns tuple: (primary_full_prompt, secondary_full_prompt)
    """
    config = get_dual_style_config()
    
    primary_style = config['primary_prompt']
    secondary_style = config['secondary_prompt']
    
    # Build enhanced prompts
    primary_full = f"{primary_style}\n\nCONTENT TO ILLUSTRATE:\n{content_prompt}"
    secondary_full = f"{secondary_style}\n\nCONTENT TO ILLUSTRATE:\n{content_prompt}"
    
    # Add content-specific enhancements
    content_lower = content_prompt.lower()
    enhancements = []
    for keyword, enhancement in CONTENT_ENHANCERS.items():
        if keyword in content_lower:
            enhancements.append(enhancement)
    
    if enhancements:
        enhancement_text = "\n\nADDITIONAL GUIDANCE:\n" + "\n".join(enhancements)
        primary_full += enhancement_text
        secondary_full += enhancement_text
    
    return (primary_full, secondary_full)

def load_custom_styles():
    """Load custom styles from JSON file."""
    if os.path.exists(CUSTOM_STYLES_PATH):
        try:
            with open(CUSTOM_STYLES_PATH, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not load custom styles: {e}")
    return {}

def save_custom_styles(styles):
    """Save custom styles to JSON file."""
    try:
        with open(CUSTOM_STYLES_PATH, 'w') as f:
            json.dump(styles, f, indent=2)
        return True
    except IOError as e:
        print(f"Error saving custom styles: {e}")
        return False

def get_all_styles():
    """Get all available styles (built-in + custom)."""
    all_styles = {}
    
    # Add built-in styles
    for name, prompt in STYLE_PRESETS.items():
        all_styles[name] = {
            'name': name,
            'prompt': prompt,
            'builtin': True,
            'description': get_style_description(name)
        }
    
    # Add custom styles
    custom_styles = load_custom_styles()
    for name, data in custom_styles.items():
        all_styles[name] = {
            'name': name,
            'prompt': data.get('prompt', ''),
            'builtin': False,
            'description': data.get('description', 'Custom style')
        }
    
    return all_styles

def get_style_description(name):
    """Get a short description for a built-in style."""
    descriptions = {
        'neuroscience': 'Whiteboard-style neuroscience diagrams with anatomical accuracy',
        'medical': 'Professional medical textbook illustration style',
        'whiteboard': 'Simple hand-drawn whiteboard diagrams',
        'minimal': 'Very simple, clean minimal diagrams',
        'no-labels': 'Visual diagrams with no text labels',
        'reboot': 'Photorealistic 3D renders with natural backgrounds and scientific accuracy',
        'custom': 'Your own custom style'
    }
    return descriptions.get(name, 'Image style preset')

def save_new_style(name, prompt, description='Custom style'):
    """Save a new custom style."""
    custom_styles = load_custom_styles()
    custom_styles[name] = {
        'prompt': prompt,
        'description': description
    }
    return save_custom_styles(custom_styles)

def delete_custom_style(name):
    """Delete a custom style."""
    custom_styles = load_custom_styles()
    if name in custom_styles:
        del custom_styles[name]
        return save_custom_styles(custom_styles)
    return False

def set_current_style(preset_name=None, custom_prompt=None):
    """Set the current style for image generation."""
    global _current_style_preset, _current_style_prompt
    
    if custom_prompt:
        _current_style_prompt = custom_prompt
        _current_style_preset = None
    elif preset_name:
        _current_style_preset = preset_name
        _current_style_prompt = None
    
def get_current_style_info():
    """Get info about the current style."""
    global _current_style_preset, _current_style_prompt
    
    if _current_style_prompt:
        return {
            'preset': None,
            'prompt': _current_style_prompt,
            'is_custom': True
        }
    
    preset = _current_style_preset or STYLE_PRESET
    all_styles = get_all_styles()
    
    if preset in all_styles:
        return {
            'preset': preset,
            'prompt': all_styles[preset]['prompt'],
            'is_custom': not all_styles[preset].get('builtin', True)
        }
    
    return {
        'preset': 'neuroscience',
        'prompt': STYLE_PRESETS['neuroscience'],
        'is_custom': False
    }

def get_style_prompt(preset_name=None):
    """Get the style prompt for a specific preset or the current style."""
    global _current_style_preset, _current_style_prompt
    
    # If a specific preset is requested
    if preset_name:
        all_styles = get_all_styles()
        if preset_name in all_styles:
            return all_styles[preset_name]['prompt']
        return STYLE_PRESETS.get(preset_name, STYLE_PRESETS['neuroscience'])
    
    # If custom prompt is set, use it
    if _current_style_prompt:
        return _current_style_prompt
    
    # Use current preset
    preset = _current_style_preset or STYLE_PRESET
    all_styles = get_all_styles()
    
    if preset in all_styles:
        return all_styles[preset]['prompt']
    
    return STYLE_PRESETS.get(preset, STYLE_PRESETS['neuroscience'])

def get_enhanced_prompt(base_prompt: str) -> str:
    """Enhance a prompt with style instructions and content-specific tips."""
    style = get_style_prompt()
    
    # Check for content-specific enhancements
    enhancements = []
    base_lower = base_prompt.lower()
    
    for keyword, enhancement in CONTENT_ENHANCERS.items():
        if keyword in base_lower:
            enhancements.append(enhancement)
    
    # Build final prompt
    final_prompt = f"{style}\n\nCONTENT TO ILLUSTRATE:\n{base_prompt}"
    
    if enhancements:
        final_prompt += f"\n\nADDITIONAL GUIDANCE:\n" + "\n".join(enhancements)
    
    return final_prompt
