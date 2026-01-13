from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import re
import google.generativeai as genai
from typing import List, Dict
import json

# Load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, will use system environment variables

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Configure Gemini API
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    print("✓ Gemini API key loaded successfully")
else:
    print("⚠ Warning: GEMINI_API_KEY not found. Image prompt generation will work, but some features may be limited.")

# Configure Image Generation (Nano Banana via Gemini)
IMAGE_GENERATION_ENABLED = False
gemini_image_client = None

if GEMINI_API_KEY:
    try:
        from google import genai as genai_client_module
        gemini_image_client = genai_client_module.Client(api_key=GEMINI_API_KEY)
        IMAGE_GENERATION_ENABLED = True
        print("✓ Image generation enabled (Nano Banana Pro)")
        print("  Model: gemini-3-pro-image-preview")
        print("  Aspect ratio: 16:9 (wide horizontal)")
        print("  Features: Advanced text rendering & professional quality")
    except Exception as e:
        print(f"⚠ Could not configure image generation: {e}")

if not IMAGE_GENERATION_ENABLED:
    print("⚠ Image generation disabled. Set GEMINI_API_KEY to enable.")

def is_table_of_contents(text: str) -> bool:
    """Detect if a paragraph is part of a table of contents."""
    text_lower = text.lower()
    
    # Check for TOC indicators
    if any(phrase in text_lower for phrase in ['table of contents', 'contents:', '## chapters', 'chapter list']):
        return True
    
    # Check if it's a list of numbered sections (common in TOC)
    lines = text.split('\n')
    numbered_lines = sum(1 for line in lines if re.match(r'^\s*\d+[\.\)]\s+', line) or re.match(r'^\s*chapter\s+\d+', line.lower()))
    
    # If more than 50% of lines are numbered, likely a TOC
    if len(lines) > 2 and numbered_lines / len(lines) > 0.5:
        return True
    
    return False

def is_section_header(para: str) -> bool:
    """Check if a paragraph is a section header."""
    # Headers are typically:
    # - Short (< 100 chars)
    # - ALL CAPS, start with #, end with :, or very few words
    # - Not just bracketed links
    if len(para) > 100:
        return False
    
    # Remove bracketed content to check actual text
    clean = re.sub(r'\[([^\]]+)\]', '', para).strip()
    if not clean:  # If only bracketed content, not a header
        return False
    
    return (clean.isupper() or 
            clean.startswith('#') or 
            clean.endswith(':') or 
            len(clean.split()) < 8)

def split_into_sections(text: str, max_length: int = 1000) -> List[str]:
    """Split text into logical sections, ignoring TOC and using headers intelligently."""
    # Split by double newlines (paragraphs)
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    
    # Filter out table of contents
    paragraphs = [p for p in paragraphs if not is_table_of_contents(p)]
    
    sections = []
    current_section = []
    current_length = 0
    current_header = None
    
    for para in paragraphs:
        # Check if this is a section header
        is_header = is_section_header(para)
        
        para_length = len(para)
        
        # If this is a header
        if is_header:
            # If we have accumulated content, save it as a section
            if current_section:
                # Add the previous header if we have one
                if current_header:
                    sections.append(current_header + '\n\n' + '\n\n'.join(current_section))
                else:
                    sections.append('\n\n'.join(current_section))
                current_section = []
                current_length = 0
            
            # Store this header for the next section
            current_header = para
            continue
        
        # Skip paragraphs that are only bracketed links
        if re.match(r'^\s*\[[^\]]+\]\s*$', para):
            continue
        
        # If adding this would exceed max_length, start a new section
        if current_length + para_length > max_length and current_section:
            # Save current section with its header
            if current_header:
                sections.append(current_header + '\n\n' + '\n\n'.join(current_section))
            else:
                sections.append('\n\n'.join(current_section))
            
            # Start new section (keep the same header)
            current_section = [para]
            current_length = para_length
        else:
            current_section.append(para)
            current_length += para_length
    
    # Add final section
    if current_section:
        if current_header:
            sections.append(current_header + '\n\n' + '\n\n'.join(current_section))
        else:
            sections.append('\n\n'.join(current_section))
    
    return sections if sections else [text]

def generate_short_title(text: str) -> str:
    """Generate a short 2-3 word title from text content using AI."""
    # Remove bracketed terms first
    cleaned_text, _ = extract_bracketed_terms(text)
    
    # Check if there's already a title-like line at the start
    lines = cleaned_text.split('\n')
    for line in lines[:2]:  # Check first two lines
        line = line.strip()
        if not line:
            continue
        # If it looks like a title (short, no punctuation at end)
        words = line.rstrip(':').strip().split()
        if 2 <= len(words) <= 5 and len(line) < 60:
            return ' '.join(words[:3])  # Take first 3 words max
    
    # Use AI to generate a concise title
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        prompt = f"""Read this educational text and create a concise 2-3 word title that captures the main topic.

Requirements:
- ONLY 2-3 words
- Clear and descriptive
- Like a chapter heading
- No punctuation
- Title case

Text:
{cleaned_text[:500]}

Title (2-3 words only):"""
        
        response = model.generate_content(prompt)
        title = response.text.strip().rstrip('.').rstrip(':')
        
        # Ensure it's actually 2-3 words
        words = title.split()
        if 1 <= len(words) <= 4:
            return ' '.join(words[:3])
        
    except Exception as e:
        print(f"Error generating title: {e}")
    
    # Fallback: use first few words
    words = cleaned_text.split()[:3]
    if words:
        return ' '.join(words).rstrip('.:,')
    
    return "Untitled Section"

def extract_main_points(text: str) -> List[str]:
    """Extract main points from text using AI to create grade 9 level summaries."""
    # Look for bullet points, numbered lists first
    points = []
    
    # Split by lines
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for bullet points
        if line.startswith(('•', '-', '*', '1.', '2.', '3.', '4.', '5.')):
            point = re.sub(r'^[•\-\*\d\.\s]+', '', line)
            if point and len(point) < 200:
                points.append(point)
    
    # If we found structured points, use them
    if points:
        return points[:10]
    
    # Otherwise, use AI to extract main points at grade 9 level
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        prompt = f"""Read this educational text and extract 3-5 main points. Write each point as a simple, clear phrase at a grade 9 reading level (ages 14-15).

Requirements:
- Use simple, direct language
- Keep each point to 1-2 sentences maximum
- Avoid negative constructions (don't say "X didn't do Y, it does Z" - just say "X does Z")
- Use active voice
- Focus on what IS, not what ISN'T
- Make points factual and concrete

Text:
{text[:1000]}

Main Points (one per line):"""
        
        response = model.generate_content(prompt)
        ai_points = [line.strip() for line in response.text.strip().split('\n') if line.strip() and not line.strip().startswith('#')]
        
        # Clean up any numbering or bullets from AI response
        ai_points = [re.sub(r'^[\d\.\-\*•\s]+', '', p).strip() for p in ai_points if p.strip()]
        
        return ai_points[:10] if ai_points else []
        
    except Exception as e:
        print(f"Error generating main points: {e}")
        # Fallback: extract key sentences
        sentences = re.split(r'[.!?]+', text)
        points = [s.strip() for s in sentences if 30 < len(s.strip()) < 200][:5]
        return points

def get_available_model():
    """Get an available Gemini model by listing available models first."""
    # First, try to list available models from the API
    try:
        models = genai.list_models()
        # Filter for models that support generateContent
        available = []
        for m in models:
            if 'generateContent' in m.supported_generation_methods:
                # Remove 'models/' prefix if present
                model_name = m.name.replace('models/', '')
                available.append(model_name)
        
        if available:
            # Prefer flash models (faster) over pro models
            flash_models = [m for m in available if 'flash' in m.lower()]
            pro_models = [m for m in available if 'pro' in m.lower() and 'flash' not in m.lower()]
            
            # Try flash first, then pro, then any other
            preferred = flash_models + pro_models + available
            if preferred:
                selected = preferred[0]
                print(f"Using model: {selected}")
                return genai.GenerativeModel(selected)
    except Exception as e:
        print(f"Could not list models: {e}")
    
    # Fallback: try common model names
    model_names = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-pro',
    ]
    
    for model_name in model_names:
        try:
            model = genai.GenerativeModel(model_name)
            print(f"Using model: {model_name}")
            return model
        except Exception:
            continue
    
    print("Warning: Could not find any available Gemini model")
    return None

def extract_bracketed_terms(text: str) -> tuple:
    """Extract [bracketed terms] from text and return cleaned text + terms.
    
    Separates image-related terms from link-style terms.
    Links (containing http, www, or looking like navigation) are discarded.
    """
    import re
    
    # Find all bracketed content
    all_bracketed = re.findall(r'\[([^\]]+)\]', text)
    
    # Filter out links and navigation elements
    image_terms = []
    for term in all_bracketed:
        term_lower = term.lower()
        # Skip if it looks like a link or navigation
        if any(indicator in term_lower for indicator in ['http', 'www.', 'click here', 'see more', 'read more', 'link to', 'chapter', 'section']):
            continue
        # Keep if it looks like an image description term
        if len(term.split()) <= 5:  # Short phrases are likely visual elements
            image_terms.append(term)
    
    # Remove all bracketed content from text
    cleaned_text = re.sub(r'\[([^\]]+)\]', '', text)
    # Clean up extra whitespace
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
    cleaned_text = re.sub(r'\n\s*\n\s*\n+', '\n\n', cleaned_text)
    
    return cleaned_text.strip(), image_terms

def generate_image_prompt(text: str) -> str:
    """Generate a prompt for image generation based on the text content."""
    # Extract bracketed terms that should be included in the prompt
    cleaned_text, bracketed_terms = extract_bracketed_terms(text)
    
    # Use Gemini to create an image prompt
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        additional_terms = ""
        if bracketed_terms:
            additional_terms = f"\n\nInclude these visual elements: {', '.join(bracketed_terms)}"
        
        prompt = f"""Create an image generation prompt for this educational content:

{cleaned_text[:1000]}{additional_terms}

Generate a clear, specific image prompt (2-3 sentences) describing what to illustrate:"""
        
        response = model.generate_content(prompt)
        return response.text.strip()
        
    except Exception as e:
        print(f"Error generating prompt: {e}")
        # Fallback: use keywords
        keywords = extract_keywords(cleaned_text)
        return f"Educational illustration showing: {', '.join(keywords[:5])}"

def extract_keywords(text: str) -> List[str]:
    """Extract important keywords from text."""
    # Simple keyword extraction
    words = re.findall(r'\b[A-Z][a-z]+\b|\b[a-z]{5,}\b', text.lower())
    # Filter common words
    stopwords = {'the', 'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should'}
    keywords = [w for w in words if w not in stopwords]
    # Get most common
    from collections import Counter
    return [word for word, count in Counter(keywords).most_common(10)]

def generate_single_image(prompt: str, variation: int = 0) -> str:
    """Generate a single image using Nano Banana Pro, return base64 data URL or None."""
    try:
        import base64
        
        # Add style instruction (simpler for single image)
        styled_prompt = f"Clear textbook style whiteboard diagram with anatomically accurate physiology and animal images. Keep it simple, focus on individual concepts. If showing multiple concepts, use separate labeled panels instead of a collage. Content: {prompt}"
        
        # Use Nano Banana Pro (gemini-3-pro-image-preview) with 16:9 aspect ratio
        response = gemini_image_client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=styled_prompt,
            config={
                "imageConfig": {
                    "aspectRatio": "16:9"
                }
            }
        )
        
        for part in response.parts:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                img_data = base64.b64encode(image_bytes).decode('utf-8')
                mime_type = part.inline_data.mime_type or 'image/png'
                return f'data:{mime_type};base64,{img_data}'
        return None
    except Exception as e:
        print(f"Error generating single image: {e}")
        return None

def generate_image_nano_banana(prompt: str, num_images: int = 1) -> Dict:
    """Generate a single high-quality image using Nano Banana Pro."""
    
    if not gemini_image_client:
        return {'error': 'Gemini API key not configured', 'prompt': prompt}
    
    print(f"Generating image with Nano Banana Pro (2K, 16:9)...")
    
    # Generate single image
    image_url = generate_single_image(prompt, 0)
    
    if image_url:
        print(f"✓ Generated 16:9 image with accurate text!")
        return {
            'image_url': image_url,
            'prompt': prompt,
            'method': 'nano-banana-pro'
        }
    
    return {'error': 'No image generated', 'prompt': prompt}

def generate_image(prompt: str) -> Dict:
    """Generate an image using Nano Banana."""
    if not IMAGE_GENERATION_ENABLED:
        return {
            'prompt': prompt,
            'status': 'unavailable',
            'note': 'Image generation not configured. Set GEMINI_API_KEY to enable.'
        }
    
    return generate_image_nano_banana(prompt)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

def generate_all_slides_at_once(text: str) -> List[Dict]:
    """Use AI to analyze entire text and generate all slides in one call."""
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        prompt = f"""You are an educational content analyzer. Read this lecture text and create a structured set of slides.

INSTRUCTIONS:
1. Skip any table of contents sections
2. Organize content into logical slides (aim for 1 slide per major concept/paragraph)
3. Each slide needs:
   - A SHORT 2-3 word title (like a chapter heading)
   - 3-5 main points in simple grade 9 language (avoid "didn't/wasn't" - use positive statements)
   - The full paragraph text (cleaned up, no [bracketed links])
   - A simple image generation prompt describing what to illustrate

4. For [bracketed terms] in text:
   - Remove navigation links like [Click here], [See Chapter X], [http://...]
   - Keep visual terms like [trilobite eyes], [neural circuits] and include them in image prompts
   - Remove ALL brackets from the displayed content

5. Output ONLY valid JSON in this exact format:
{{
  "slides": [
    {{
      "title": "Short Title",
      "content": "Full paragraph text without any [brackets]",
      "main_points": [
        "First simple point in active voice",
        "Second clear point",
        "Third concrete fact"
      ],
      "image_prompt": "Complete image generation prompt combining style + content description",
      "visual_terms": ["term1", "term2"]
    }}
  ]
}}

TEXT TO ANALYZE:
{text[:8000]}

OUTPUT (JSON only, no other text):"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON from response (sometimes AI adds markdown code blocks)
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        # Parse JSON
        result = json.loads(response_text)
        slides = result.get('slides', [])
        
        # Add IDs to slides
        for i, slide in enumerate(slides):
            slide['id'] = i + 1
            slide['bracketed_terms'] = slide.get('visual_terms', [])
        
        return slides
        
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        print(f"Response was: {response_text[:500]}...")
        raise Exception(f"AI returned invalid JSON. Please try again.")
    except Exception as e:
        print(f"Error in batch slide generation: {e}")
        raise

# NEW: Split text into sections only (fast, no AI calls)
@app.route('/api/split-text', methods=['POST'])
def split_text_endpoint():
    try:
        data = request.json
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        sections = split_into_sections(text)
        return jsonify({'sections': sections, 'count': len(sections)})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# NEW: Process a single section (title, main points, image prompt)
@app.route('/api/process-section', methods=['POST'])
def process_section_endpoint():
    try:
        data = request.json
        section_text = data.get('text', '')
        index = data.get('index', 0)
        
        if not section_text:
            return jsonify({'error': 'No text provided'}), 400
        
        # Remove bracketed terms from display content
        cleaned_section, bracketed_terms = extract_bracketed_terms(section_text)
        
        # Generate short title
        short_title = generate_short_title(section_text)
        
        # Extract main points
        main_points = extract_main_points(cleaned_section)
        # Remove title from main points if it appears
        main_points = [p for p in main_points if p.strip() != short_title.strip()]
        
        # Generate image prompt
        image_prompt = generate_image_prompt(section_text)
        
        # Remove title from content if it's the first line
        content_lines = cleaned_section.split('\n')
        if content_lines and content_lines[0].strip() == short_title.strip():
            cleaned_section = '\n'.join(content_lines[1:]).strip()
        
        return jsonify({
            'id': index + 1,
            'title': short_title,
            'content': cleaned_section,
            'main_points': main_points,
            'image_prompt': image_prompt,
            'bracketed_terms': bracketed_terms
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/process-text', methods=['POST'])
def process_text():
    try:
        data = request.json
        text = data.get('text', '')
        use_batch = data.get('use_batch', False)  # Default to paragraph-by-paragraph (more reliable for long texts)
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        if use_batch:
            # NEW: Single AI call to generate all slides at once
            try:
                pages = generate_all_slides_at_once(text)
                return jsonify({'pages': pages})
            except Exception as batch_error:
                print(f"Batch generation failed: {batch_error}")
                print("Falling back to individual processing...")
                # Fall through to original method
        
        # ORIGINAL: Process sections individually (fallback)
        sections = split_into_sections(text)
        
        pages = []
        for i, section in enumerate(sections):
            # Remove bracketed terms from display content
            cleaned_section, bracketed_terms = extract_bracketed_terms(section)
            
            # Generate short title
            short_title = generate_short_title(section)
            
            # Extract main points (skip if first point is the title)
            main_points = extract_main_points(cleaned_section)
            # Remove title from main points if it appears
            main_points = [p for p in main_points if p.strip() != short_title.strip()]
            
            image_prompt = generate_image_prompt(section)  # Use original with brackets for prompt
            
            # Remove title from content if it's the first line
            content_lines = cleaned_section.split('\n')
            if content_lines and content_lines[0].strip() == short_title.strip():
                cleaned_section = '\n'.join(content_lines[1:]).strip()
            
            page = {
                'id': i + 1,
                'title': short_title,
                'content': cleaned_section,  # Display cleaned version without title
                'main_points': main_points,
                'image_prompt': image_prompt,
                'bracketed_terms': bracketed_terms
            }
            pages.append(page)
        
        return jsonify({'pages': pages})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-image', methods=['POST'])
def generate_image_endpoint():
    try:
        data = request.json
        prompt = data.get('prompt', '')
        page_id = data.get('page_id')
        
        if not prompt:
            return jsonify({'error': 'No prompt provided'}), 400
        
        if not GEMINI_API_KEY:
            return jsonify({'error': 'Gemini API key not configured'}), 500
        
        # Generate image
        result = generate_image(prompt)
        result['page_id'] = page_id
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Use port 5001 by default to avoid conflict with macOS AirPlay Receiver on port 5000
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting server on http://localhost:{port}")
    app.run(debug=True, host='0.0.0.0', port=port)
