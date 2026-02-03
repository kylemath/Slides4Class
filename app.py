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
print(f"API Key loaded: {GEMINI_API_KEY[:10]}..." if GEMINI_API_KEY else "No API key found")

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

def parse_outline(outline_text: str) -> List[Dict]:
    """
    Parse outline text into hierarchical structure using AI.
    
    Handles various formats:
    - Roman numerals (I., II., III.)
    - Numbers (1., 2., 3.)
    - Bullets (-, •, *)
    - Any indentation style
    
    Returns: [
        {"topic": "Topic 1", "subtopics": ["Subtopic A", "Subtopic B"]},
        {"topic": "Topic 2", "subtopics": ["Subtopic C"]}
    ]
    """
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        prompt = f"""Parse this lecture outline into a structured format. 
Identify the main topics (usually marked with Roman numerals, numbers, or bold text) and their subtopics (usually indented, bulleted, or marked with letters).

OUTLINE:
{outline_text}

Return ONLY valid JSON in this exact format - an array of topic objects:
[
  {{"topic": "Main Topic 1 Name (without numbering)", "subtopics": ["Subtopic A", "Subtopic B"]}},
  {{"topic": "Main Topic 2 Name (without numbering)", "subtopics": ["Subtopic C", "Subtopic D"]}}
]

Rules:
- Remove Roman numerals, numbers, timing info like "(12 min)" from topic names
- Remove bullet points, dashes, and numbering from subtopics
- Keep the descriptive text only
- Preserve the hierarchical structure
- Return valid JSON array only, no other text"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON from response
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        topics = json.loads(response_text)
        
        # Validate structure
        if not isinstance(topics, list):
            raise ValueError("Expected a list of topics")
        
        for topic in topics:
            if 'topic' not in topic:
                topic['topic'] = 'Unnamed Topic'
            if 'subtopics' not in topic:
                topic['subtopics'] = []
        
        print(f"Successfully parsed outline: {len(topics)} topics")
        return topics
        
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        print(f"Response was: {response_text[:500] if 'response_text' in dir() else 'No response'}")
        raise ValueError(f"Failed to parse AI response as JSON: {e}")
    except Exception as e:
        print(f"Error parsing outline with AI: {e}")
        import traceback
        traceback.print_exc()
        raise ValueError(f"Failed to parse outline: {e}")


def generate_intro_slide(content_text: str, chapter_title: str = None) -> Dict:
    """Generate an intro slide from the opening paragraphs of the content."""
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        # Take first ~2000 chars for intro content
        intro_content = content_text[:2000]
        
        prompt = f"""Create a chapter introduction slide from this opening content.

CONTENT:
{intro_content}

Generate a JSON response with:
- "title": A short 2-4 word chapter title (or use "{chapter_title}" if provided and appropriate)
- "main_points": 3-5 key themes or learning objectives for this chapter (simple grade 9 language)
- "image_prompt": A prompt for an engaging illustration that represents the chapter's main theme

Output ONLY valid JSON:
{{"title": "...", "main_points": ["...", "..."], "image_prompt": "..."}}"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(response_text)
        return {
            'slide_type': 'intro',
            'title': result.get('title', chapter_title or 'Chapter Introduction'),
            'main_points': result.get('main_points', []),
            'content': '',
            'image_prompt': result.get('image_prompt', 'Educational chapter introduction illustration')
        }
        
    except Exception as e:
        print(f"Error generating intro slide: {e}")
        return {
            'slide_type': 'intro',
            'title': chapter_title or 'Chapter Introduction',
            'main_points': ['Welcome to this chapter'],
            'content': '',
            'image_prompt': 'Educational chapter introduction illustration'
        }


def generate_topic_overview_slide(topic: str, subtopics: List[str], content_text: str) -> Dict:
    """Generate an overview slide for a topic that summarizes its subtopics."""
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        subtopics_str = '\n'.join(f"- {st}" for st in subtopics)
        
        prompt = f"""Create an overview slide for the topic "{topic}" that introduces these subtopics:
{subtopics_str}

Using this chapter content for context:
{content_text[:3000]}

Generate a JSON response with:
- "title": The topic name (keep it short, 2-4 words)
- "main_points": 3-5 bullet points that preview/summarize what will be covered in the subtopics (simple grade 9 language, active voice)
- "image_prompt": A prompt for an illustration that represents the overall topic theme

Output ONLY valid JSON:
{{"title": "...", "main_points": ["...", "..."], "image_prompt": "..."}}"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(response_text)
        return {
            'slide_type': 'topic_overview',
            'title': result.get('title', topic),
            'main_points': result.get('main_points', [f"Covers: {', '.join(subtopics)}"]),
            'content': f"This section covers: {', '.join(subtopics)}",
            'image_prompt': result.get('image_prompt', f'Educational illustration about {topic}'),
            'topic': topic,
            'subtopics': subtopics
        }
        
    except Exception as e:
        print(f"Error generating topic overview slide: {e}")
        return {
            'slide_type': 'topic_overview',
            'title': topic,
            'main_points': [f"Covers: {', '.join(subtopics)}"],
            'content': f"This section covers: {', '.join(subtopics)}",
            'image_prompt': f'Educational illustration about {topic}',
            'topic': topic,
            'subtopics': subtopics
        }


def generate_subtopic_slide(topic: str, subtopic: str, content_text: str) -> Dict:
    """Generate a detailed slide for a subtopic by matching and synthesizing relevant content."""
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        prompt = f"""Create a detailed educational slide about "{subtopic}" (under the topic "{topic}").

Search through this content and extract ALL relevant information about "{subtopic}":
{content_text[:6000]}

Generate a JSON response with:
- "title": A clear 2-4 word title for this subtopic
- "main_points": 4-6 key facts and concepts about this subtopic (simple grade 9 language, active voice, avoid negatives)
- "content": A 2-3 paragraph summary of the most important information about this subtopic
- "image_prompt": A detailed description of what to illustrate - describe the key anatomical structures, concepts, or processes to show (DO NOT specify artistic style - just describe the subject matter)

Output ONLY valid JSON:
{{"title": "...", "main_points": ["...", "..."], "content": "...", "image_prompt": "..."}}"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(response_text)
        return {
            'slide_type': 'subtopic',
            'title': result.get('title', subtopic),
            'main_points': result.get('main_points', []),
            'content': result.get('content', ''),
            'image_prompt': result.get('image_prompt', f'Illustration showing key concepts of {subtopic}'),
            'topic': topic,
            'subtopic': subtopic
        }
        
    except Exception as e:
        print(f"Error generating subtopic slide for {subtopic}: {e}")
        return {
            'slide_type': 'subtopic',
            'title': subtopic,
            'main_points': [f'Key information about {subtopic}'],
            'content': '',
            'image_prompt': f'Illustration showing key concepts of {subtopic}',
            'topic': topic,
            'subtopic': subtopic
        }


def generate_discussion_slide(discussion_text: str, chapter_title: str = '') -> Dict:
    """Generate a slide summarizing discussion questions."""
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        prompt = f"""Create a "Discussion Questions" slide that summarizes these thought-provoking questions for classroom discussion.

DISCUSSION QUESTIONS:
{discussion_text}

Generate a JSON response with:
- "title": "Discussion Questions" or similar
- "main_points": 3-5 bullet points that capture the essence of each discussion question in a brief, engaging way (make students curious to discuss)
- "image_prompt": A creative prompt for an illustration showing students/people engaged in thoughtful discussion or debate, with visual elements related to the topics (e.g., brain imagery if about neuroscience)

Output ONLY valid JSON:
{{"title": "...", "main_points": ["...", "..."], "image_prompt": "..."}}"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(response_text)
        return {
            'slide_type': 'discussion',
            'title': result.get('title', 'Discussion Questions'),
            'main_points': result.get('main_points', []),
            'content': discussion_text,
            'image_prompt': result.get('image_prompt', 'Students engaged in thoughtful classroom discussion')
        }
        
    except Exception as e:
        print(f"Error generating discussion slide: {e}")
        return {
            'slide_type': 'discussion',
            'title': 'Discussion Questions',
            'main_points': ['Think critically about today\'s topics', 'Consider multiple perspectives', 'Apply concepts to real-world scenarios'],
            'content': discussion_text,
            'image_prompt': 'Students engaged in thoughtful classroom discussion about science'
        }


def generate_quiz_slide(quiz_text: str, chapter_title: str = '') -> Dict:
    """Generate a visual quiz infographic slide with fill-in-the-blank questions."""
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        prompt = f"""Create a "Quiz Yourself" infographic slide from these fill-in-the-blank questions.

QUIZ QUESTIONS:
{quiz_text}

Generate a JSON response with:
- "title": "Quiz Yourself" or "Test Your Knowledge" or similar
- "main_points": The quiz questions reformatted as clear bullet points (keep the blanks as _______, DO NOT fill in the answers)
- "image_prompt": Describe what visual hints/clues to show for each quiz answer WITHOUT revealing the actual answer. For each blank, describe a small illustration or icon that hints at the concept. Describe the subject matter only - DO NOT specify artistic style.

Example: "Show visual hints arranged in panels: [panel 1: icon/image hinting at answer 1], [panel 2: icon/image hinting at answer 2], etc. Include labels pointing to key visual elements."

Output ONLY valid JSON:
{{"title": "...", "main_points": ["...", "..."], "image_prompt": "..."}}"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(response_text)
        return {
            'slide_type': 'quiz',
            'title': result.get('title', 'Quiz Yourself'),
            'main_points': result.get('main_points', []),
            'content': quiz_text,
            'image_prompt': result.get('image_prompt', 'Visual hints and icons representing the quiz question answers without revealing them')
        }
        
    except Exception as e:
        print(f"Error generating quiz slide: {e}")
        # Parse questions manually as fallback
        questions = [q.strip() for q in quiz_text.split('•') if q.strip() and '_' in q]
        return {
            'slide_type': 'quiz',
            'title': 'Quiz Yourself',
            'main_points': questions[:7] if questions else ['Test your knowledge with these questions'],
            'content': quiz_text,
            'image_prompt': 'Visual hints and icons representing the quiz question answers without revealing them'
        }


def generate_summary_slide(content_text: str, topics: List[Dict]) -> Dict:
    """Generate a summary/conclusion slide from the ending paragraphs."""
    try:
        model = get_available_model()
        if not model:
            raise Exception("No available Gemini model found")
        
        # Take last ~2000 chars for conclusion content
        conclusion_content = content_text[-2000:]
        
        # Build topics summary
        topics_summary = []
        for t in topics:
            topics_summary.append(f"{t['topic']}: {', '.join(t['subtopics'])}")
        topics_str = '\n'.join(topics_summary)
        
        prompt = f"""Create a chapter summary/conclusion slide.

Topics covered in this chapter:
{topics_str}

Conclusion content from the chapter:
{conclusion_content}

Generate a JSON response with:
- "title": "Chapter Summary" or similar
- "main_points": 4-6 key takeaways that summarize the most important concepts from the chapter (simple grade 9 language)
- "image_prompt": A prompt for an illustration that ties together the chapter's main themes

Output ONLY valid JSON:
{{"title": "...", "main_points": ["...", "..."], "image_prompt": "..."}}"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(response_text)
        return {
            'slide_type': 'summary',
            'title': result.get('title', 'Chapter Summary'),
            'main_points': result.get('main_points', []),
            'content': '',
            'image_prompt': result.get('image_prompt', 'Educational chapter summary illustration')
        }
        
    except Exception as e:
        print(f"Error generating summary slide: {e}")
        return {
            'slide_type': 'summary',
            'title': 'Chapter Summary',
            'main_points': ['Review the key concepts from this chapter'],
            'content': '',
            'image_prompt': 'Educational chapter summary illustration'
        }


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
        from image_style_config import get_enhanced_prompt
        
        # Get enhanced prompt with style instructions and content-specific guidance
        styled_prompt = get_enhanced_prompt(prompt)
        
        print(f"Generating image with enhanced prompt ({len(styled_prompt)} chars)...")
        
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


def generate_image_with_style(content_prompt: str, style_prompt: str) -> str:
    """Generate an image with a specific style prompt, return base64 data URL or None."""
    try:
        import base64
        from image_style_config import CONTENT_ENHANCERS
        
        # Build the full prompt
        full_prompt = f"{style_prompt}\n\nCONTENT TO ILLUSTRATE:\n{content_prompt}"
        
        # Add content-specific enhancements
        content_lower = content_prompt.lower()
        enhancements = []
        for keyword, enhancement in CONTENT_ENHANCERS.items():
            if keyword in content_lower:
                enhancements.append(enhancement)
        
        if enhancements:
            full_prompt += "\n\nADDITIONAL GUIDANCE:\n" + "\n".join(enhancements)
        
        print(f"Generating styled image ({len(full_prompt)} chars)...")
        
        # Use Nano Banana Pro with 16:9 aspect ratio
        response = gemini_image_client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=full_prompt,
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
        print(f"Error generating styled image: {e}")
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

@app.route('/GeminiSummaryCh<int:chapter_num>.png')
def serve_chapter_summary_image(chapter_num):
    """Serve chapter summary images from the root directory."""
    filename = f'GeminiSummaryCh{chapter_num}.png'
    try:
        return send_from_directory('.', filename)
    except Exception as e:
        print(f"Chapter summary image not found: {filename}")
        return '', 404

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
   - An image content description (describe WHAT to show, not the artistic style)

4. For [bracketed terms] in text:
   - Remove navigation links like [Click here], [See Chapter X], [http://...]
   - Keep visual terms like [trilobite eyes], [neural circuits] and include them in image prompts
   - Remove ALL brackets from the displayed content

5. IMAGE PROMPT RULES:
   - Describe the subject matter only (anatomical structures, concepts, processes)
   - DO NOT specify artistic style (no "whiteboard", "diagram", "cartoon", "3D render", etc.)
   - Include specific structures and labels to show
   - Be scientifically accurate

6. Output ONLY valid JSON in this exact format:
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
      "image_prompt": "Description of what to illustrate - structures, concepts, labels (NO style)",
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

@app.route('/api/process-outline-based', methods=['POST'])
def process_outline_based():
    """Process text using outline-driven slide generation."""
    try:
        data = request.json
        outline_text = data.get('outline', '')
        content_text = data.get('content', '')
        chapter_title = data.get('title', '')
        discussion_questions = data.get('discussion_questions', '')
        quiz_questions = data.get('quiz_questions', '')
        
        if not outline_text:
            return jsonify({'error': 'No outline provided'}), 400
        if not content_text:
            return jsonify({'error': 'No content provided'}), 400
        
        # Parse the outline into hierarchical structure
        topics = parse_outline(outline_text)
        
        if not topics:
            return jsonify({'error': 'Could not parse outline. Please check the format.'}), 400
        
        slides = []
        slide_id = 1
        
        # 1. Generate intro slide
        intro_slide = generate_intro_slide(content_text, chapter_title)
        intro_slide['id'] = slide_id
        intro_slide['bracketed_terms'] = []
        slides.append(intro_slide)
        slide_id += 1
        
        # 2. Generate slides for each topic and its subtopics
        for topic_data in topics:
            topic = topic_data['topic']
            subtopics = topic_data['subtopics']
            
            # Generate topic overview slide
            overview_slide = generate_topic_overview_slide(topic, subtopics, content_text)
            overview_slide['id'] = slide_id
            overview_slide['bracketed_terms'] = []
            slides.append(overview_slide)
            slide_id += 1
            
            # Generate slide for each subtopic
            for subtopic in subtopics:
                subtopic_slide = generate_subtopic_slide(topic, subtopic, content_text)
                subtopic_slide['id'] = slide_id
                subtopic_slide['bracketed_terms'] = []
                slides.append(subtopic_slide)
                slide_id += 1
        
        # 3. Generate summary slide
        summary_slide = generate_summary_slide(content_text, topics)
        summary_slide['id'] = slide_id
        summary_slide['bracketed_terms'] = []
        slides.append(summary_slide)
        slide_id += 1
        
        # 4. Generate discussion questions slide (if provided)
        if discussion_questions:
            discussion_slide = generate_discussion_slide(discussion_questions, chapter_title)
            discussion_slide['id'] = slide_id
            discussion_slide['bracketed_terms'] = []
            slides.append(discussion_slide)
            slide_id += 1
        
        # 5. Generate quiz infographic slide (if provided)
        if quiz_questions:
            quiz_slide = generate_quiz_slide(quiz_questions, chapter_title)
            quiz_slide['id'] = slide_id
            quiz_slide['bracketed_terms'] = []
            slides.append(quiz_slide)
        
        return jsonify({
            'pages': slides,
            'outline_parsed': topics,
            'mode': 'outline-based'
        })
    
    except Exception as e:
        print(f"Error in outline-based processing: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/parse-outline', methods=['POST'])
def parse_outline_endpoint():
    """Parse outline and return the structure (for preview)."""
    try:
        data = request.json
        outline_text = data.get('outline', '')
        
        if not outline_text:
            return jsonify({'error': 'No outline provided'}), 400
        
        print(f"Parsing outline ({len(outline_text)} chars)...")
        print(f"Outline preview: {outline_text[:200]}...")
        
        topics = parse_outline(outline_text)
        
        if not topics:
            return jsonify({'error': 'Could not parse any topics from the outline. Please check the format.'}), 400
        
        # Calculate expected slide count
        slide_count = 1  # intro
        for t in topics:
            slide_count += 1  # topic overview
            slide_count += len(t['subtopics'])  # subtopic slides
        slide_count += 1  # summary
        
        print(f"Parsed {len(topics)} topics, expecting {slide_count} slides")
        
        return jsonify({
            'topics': topics,
            'expected_slides': slide_count
        })
    
    except ValueError as e:
        print(f"ValueError in parse_outline_endpoint: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Error in parse_outline_endpoint: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500


@app.route('/api/generate-slide', methods=['POST'])
def generate_single_slide():
    """Generate a single slide - used for progressive loading."""
    try:
        data = request.json
        slide_type = data.get('slide_type', '')
        content_text = data.get('content', '')
        chapter_title = data.get('title', '')
        
        if slide_type == 'intro':
            slide = generate_intro_slide(content_text, chapter_title)
            
        elif slide_type == 'topic_overview':
            topic = data.get('topic', '')
            subtopics = data.get('subtopics', [])
            slide = generate_topic_overview_slide(topic, subtopics, content_text)
            
        elif slide_type == 'subtopic':
            topic = data.get('topic', '')
            subtopic = data.get('subtopic', '')
            slide = generate_subtopic_slide(topic, subtopic, content_text)
            
        elif slide_type == 'summary':
            topics = data.get('topics', [])
            slide = generate_summary_slide(content_text, topics)
            
        elif slide_type == 'discussion':
            discussion_text = data.get('discussion_questions', '')
            slide = generate_discussion_slide(discussion_text, chapter_title)
            
        elif slide_type == 'quiz':
            quiz_text = data.get('quiz_questions', '')
            slide = generate_quiz_slide(quiz_text, chapter_title)
            
        else:
            return jsonify({'error': f'Unknown slide type: {slide_type}'}), 400
        
        slide['bracketed_terms'] = []
        return jsonify(slide)
    
    except Exception as e:
        print(f"Error generating slide: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-image-prompt', methods=['POST'])
def generate_image_prompt_endpoint():
    """Generate or improve an image prompt for a slide based on title/topic."""
    try:
        data = request.json
        title = data.get('title', '')
        topic = data.get('topic', '')
        subtopic = data.get('subtopic', '')
        main_points = data.get('main_points', [])
        current_prompt = data.get('current_prompt', '')
        slide_type = data.get('slide_type', 'subtopic')
        
        model = get_available_model()
        if not model:
            return jsonify({'error': 'No AI model available'}), 500
        
        # Build context from available information
        context_parts = []
        if title:
            context_parts.append(f"Slide Title: {title}")
        if topic:
            context_parts.append(f"Topic: {topic}")
        if subtopic:
            context_parts.append(f"Subtopic: {subtopic}")
        if main_points:
            context_parts.append(f"Key Points: {', '.join(main_points[:5])}")
        if current_prompt:
            context_parts.append(f"Current Prompt (to improve): {current_prompt}")
        
        context = '\n'.join(context_parts) if context_parts else "Educational slide"
        
        # Different prompt strategies based on slide type - describe WHAT to show, not HOW to style it
        if slide_type == 'intro':
            content_guidance = "Describe a visual that introduces the chapter themes and draws students in."
        elif slide_type == 'summary':
            content_guidance = "Describe a visual showing the main concepts and their interconnections."
        elif slide_type == 'quiz':
            content_guidance = "Describe visual hints and clues for the quiz questions without revealing answers."
        elif slide_type == 'discussion':
            content_guidance = "Describe people engaged in discussion or debate about the topic."
        else:
            content_guidance = "Describe the key anatomical structures, concepts, or processes to illustrate."
        
        prompt = f"""You are an expert at creating image generation prompts for educational slides.

SLIDE CONTEXT:
{context}

CONTENT GUIDANCE:
{content_guidance}

Generate a detailed, specific image prompt (3-5 sentences) describing WHAT to illustrate. The prompt should:
1. Be visually specific - describe exactly what structures, concepts, or scenes should be shown
2. Include key anatomical structures, diagrams, or visual elements that explain the topic
3. Mention any text labels that should appear in the image (e.g., structure names)
4. Be scientifically/anatomically accurate for university-level education
5. DO NOT specify artistic style (no "whiteboard", "cartoon", "3D render", etc.) - just describe the subject matter

Image Content Description:"""
        
        response = model.generate_content(prompt)
        generated_prompt = response.text.strip()
        
        # Clean up any quotes or prefixes
        generated_prompt = generated_prompt.strip('"\'')
        if generated_prompt.lower().startswith('image prompt:'):
            generated_prompt = generated_prompt[13:].strip()
        if generated_prompt.lower().startswith('image generation prompt:'):
            generated_prompt = generated_prompt[24:].strip()
        
        return jsonify({
            'prompt': generated_prompt,
            'context_used': context
        })
        
    except Exception as e:
        print(f"Error generating image prompt: {e}")
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


# ============================================
# Style Management API Endpoints
# ============================================

@app.route('/api/styles', methods=['GET'])
def get_styles():
    """Get all available styles (built-in + custom)."""
    try:
        from image_style_config import get_all_styles
        styles = get_all_styles()
        return jsonify({'styles': styles})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/current-style', methods=['GET'])
def get_current_style():
    """Get the current style configuration."""
    try:
        from image_style_config import get_current_style_info
        style_info = get_current_style_info()
        return jsonify(style_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/set-style', methods=['POST'])
def set_style():
    """Set the current style for image generation."""
    try:
        from image_style_config import set_current_style, get_current_style_info
        
        data = request.json
        preset_name = data.get('preset')
        custom_prompt = data.get('custom_prompt')
        
        set_current_style(preset_name=preset_name, custom_prompt=custom_prompt)
        
        # Return the updated style info
        style_info = get_current_style_info()
        return jsonify({
            'success': True,
            'current_style': style_info
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/save-style', methods=['POST'])
def save_style():
    """Save a new custom style."""
    try:
        from image_style_config import save_new_style, get_all_styles
        
        data = request.json
        name = data.get('name', '').strip()
        prompt = data.get('prompt', '').strip()
        description = data.get('description', 'Custom style').strip()
        
        if not name:
            return jsonify({'error': 'Style name is required'}), 400
        if not prompt:
            return jsonify({'error': 'Style prompt is required'}), 400
        
        # Validate name (alphanumeric, underscores, hyphens)
        import re
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9_-]*$', name):
            return jsonify({'error': 'Style name must start with a letter and contain only letters, numbers, underscores, and hyphens'}), 400
        
        success = save_new_style(name, prompt, description)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Style "{name}" saved successfully',
                'styles': get_all_styles()
            })
        else:
            return jsonify({'error': 'Failed to save style'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/delete-style', methods=['POST'])
def delete_style():
    """Delete a custom style."""
    try:
        from image_style_config import delete_custom_style, get_all_styles, STYLE_PRESETS
        
        data = request.json
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({'error': 'Style name is required'}), 400
        
        # Cannot delete built-in styles
        if name in STYLE_PRESETS:
            return jsonify({'error': 'Cannot delete built-in styles'}), 400
        
        success = delete_custom_style(name)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Style "{name}" deleted',
                'styles': get_all_styles()
            })
        else:
            return jsonify({'error': 'Style not found or could not be deleted'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/style/<style_name>', methods=['GET'])
def get_style_prompt_endpoint(style_name):
    """Get the prompt for a specific style."""
    try:
        from image_style_config import get_style_prompt, get_all_styles
        
        all_styles = get_all_styles()
        if style_name not in all_styles:
            return jsonify({'error': f'Style "{style_name}" not found'}), 404
        
        style_info = all_styles[style_name]
        return jsonify({
            'name': style_name,
            'prompt': style_info['prompt'],
            'description': style_info.get('description', ''),
            'builtin': style_info.get('builtin', False)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# Dual-Style Image Generation API
# ============================================

@app.route('/api/dual-style-config', methods=['GET'])
def get_dual_style_config_endpoint():
    """Get the dual-style generation configuration."""
    try:
        from image_style_config import get_dual_style_config, get_style_description
        
        config = get_dual_style_config()
        return jsonify({
            'enabled': config['enabled'],
            'primary': {
                'name': config['primary'],
                'description': get_style_description(config['primary'])
            },
            'secondary': {
                'name': config['secondary'],
                'description': get_style_description(config['secondary'])
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dual-style-config', methods=['POST'])
def set_dual_style_config_endpoint():
    """Update the dual-style generation configuration."""
    try:
        import image_style_config
        
        data = request.json
        
        if 'enabled' in data:
            image_style_config.DUAL_STYLE_ENABLED = bool(data['enabled'])
        
        if 'primary' in data:
            image_style_config.DUAL_STYLE_PRIMARY = data['primary']
        
        if 'secondary' in data:
            image_style_config.DUAL_STYLE_SECONDARY = data['secondary']
        
        # Return updated config
        config = image_style_config.get_dual_style_config()
        return jsonify({
            'success': True,
            'enabled': config['enabled'],
            'primary': config['primary'],
            'secondary': config['secondary']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-dual-images', methods=['POST'])
def generate_dual_images_endpoint():
    """Generate both primary and secondary style images for a prompt."""
    try:
        from image_style_config import get_dual_style_config, STYLE_PRESETS, load_custom_styles
        
        data = request.json
        content_prompt = data.get('prompt', '')
        page_id = data.get('page_id')
        
        if not content_prompt:
            return jsonify({'error': 'No prompt provided'}), 400
        
        if not GEMINI_API_KEY:
            return jsonify({'error': 'Gemini API key not configured'}), 500
        
        config = get_dual_style_config()
        
        # Get style prompts
        all_presets = {**STYLE_PRESETS, **{k: v['prompt'] for k, v in load_custom_styles().items()}}
        primary_style = all_presets.get(config['primary'], STYLE_PRESETS['neuroscience'])
        secondary_style = all_presets.get(config['secondary'], STYLE_PRESETS['reboot'])
        
        result = {
            'page_id': page_id,
            'prompt': content_prompt,
            'primary': {
                'style': config['primary'],
                'image_url': None,
                'error': None
            },
            'secondary': {
                'style': config['secondary'],
                'image_url': None,
                'error': None
            }
        }
        
        # Generate primary style image
        print(f"Generating primary ({config['primary']}) image...")
        try:
            primary_image = generate_image_with_style(content_prompt, primary_style)
            if primary_image:
                result['primary']['image_url'] = primary_image
                print(f"✓ Primary image generated")
            else:
                result['primary']['error'] = 'No image generated'
        except Exception as e:
            result['primary']['error'] = str(e)
            print(f"✗ Primary image error: {e}")
        
        # Generate secondary style image
        print(f"Generating secondary ({config['secondary']}) image...")
        try:
            secondary_image = generate_image_with_style(content_prompt, secondary_style)
            if secondary_image:
                result['secondary']['image_url'] = secondary_image
                print(f"✓ Secondary image generated")
            else:
                result['secondary']['error'] = 'No image generated'
        except Exception as e:
            result['secondary']['error'] = str(e)
            print(f"✗ Secondary image error: {e}")
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-image-styled', methods=['POST'])
def generate_image_styled_endpoint():
    """Generate a single image with a specific style."""
    try:
        from image_style_config import STYLE_PRESETS, load_custom_styles
        
        data = request.json
        content_prompt = data.get('prompt', '')
        style_name = data.get('style', 'neuroscience')
        page_id = data.get('page_id')
        
        if not content_prompt:
            return jsonify({'error': 'No prompt provided'}), 400
        
        if not GEMINI_API_KEY:
            return jsonify({'error': 'Gemini API key not configured'}), 500
        
        # Get the style prompt
        all_presets = {**STYLE_PRESETS, **{k: v['prompt'] for k, v in load_custom_styles().items()}}
        style_prompt = all_presets.get(style_name, STYLE_PRESETS['neuroscience'])
        
        # Generate image
        image_url = generate_image_with_style(content_prompt, style_prompt)
        
        if image_url:
            return jsonify({
                'page_id': page_id,
                'style': style_name,
                'image_url': image_url,
                'prompt': content_prompt
            })
        else:
            return jsonify({
                'page_id': page_id,
                'style': style_name,
                'error': 'No image generated',
                'prompt': content_prompt
            })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Use port 5001 by default to avoid conflict with macOS AirPlay Receiver on port 5000
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting server on http://localhost:{port}")
    app.run(debug=True, host='0.0.0.0', port=port)
