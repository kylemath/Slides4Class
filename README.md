# Lecture Pages Generator

A web application that transforms long-form text into illustrated lecture pages with automatically extracted main points and AI-generated images.

## Features

- **Text Processing**: Automatically splits long text into logical sections/pages
- **Main Points Extraction**: Identifies and extracts key points from each section
- **Image Generation**: Generates illustrative images using Google's Gemini API (Nano Banana Pro)
- **Clean Interface**: Modern, student-friendly page layout
- **Navigation**: Easy page-by-page navigation through generated content

## Setup

### 1. Install Dependencies

Create a virtual environment and install requirements:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Gemini API Key

**Option 1: Using a .env file (Recommended)**

1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and add your API key:
   ```
   GEMINI_API_KEY=your-actual-api-key-here
   ```

**Option 2: Using environment variables**

Set the environment variable in your terminal:

```bash
export GEMINI_API_KEY='your-api-key-here'
```

Or for a single command:
```bash
GEMINI_API_KEY='your-api-key-here' python app.py
```

**Note:** The `.env` file is already in `.gitignore`, so your API key won't be committed to version control.

### 3. Run the Application

```bash
python app.py
```

The application will be available at `http://localhost:5001`

(Note: Port 5001 is used by default to avoid conflicts with macOS AirPlay Receiver on port 5000. You can change this by setting the `PORT` environment variable.)

## Usage

### Creating New Slides

1. Open the web interface in your browser
2. Paste your lecture text, textbook content, or any educational material
   - **Table of Contents:** Automatically detected and skipped
   - **Section Headers:** Used to organize slides, don't become separate slides
   - **[Bracketed terms]:** Use for visual elements you want in images
   - **[Links]:** Automatically removed (http, www, navigation links ignored)
3. Click "Generate Pages"
   - ⚡ **Fast:** Single AI call analyzes entire text and generates all slides at once
   - 🎯 **Smart:** AI sees full context for better organization
   - 🛡️ **Reliable:** Automatic fallback if batch processing fails

**Text Format Example:**
```
# Overall Title

## Table of Contents
1. Section One
2. Section Two
(This will be skipped)

## Section Header
This paragraph becomes a slide with the header as its title.
[trilobite compound eyes] - included in image prompt
[Click here to learn more] - automatically removed

Another paragraph under the same header.
```
4. Navigate through the generated pages using the Previous/Next buttons
5. Click "Generate Image" on each page to create illustrations
6. Each page includes:
   - A short 2-3 word title
   - Main points (simplified to grade 9 reading level)
   - The full content
   - An AI-generated illustration (16:9 aspect ratio)

### Presentation Mode

1. Click "🎬 Present Slides" to enter full-screen presentation mode
2. Features:
   - Image on left (70% of screen, resizable)
   - Main points and text on right
   - Zoom and pan images
   - Table of Contents sidebar (click "☰ Contents")
   - Keyboard navigation (arrows, space, F for fullscreen, Esc to exit)

### Saving & Loading Slides

1. **Save slides:** Click "💾 Save Slides" button
   - Downloads a `.json` file with all content and images
   - File includes: titles, content, main points, image prompts, and generated images
   - Filename: `slides_YYYY-MM-DD.json`

2. **Load slides:** Click "📂 Load Saved Slides" on main page
   - Select a previously saved `.json` file
   - All pages and images are restored instantly
   - No need to regenerate images!

This is perfect for:
- Preparing slides ahead of time
- Sharing slides with colleagues
- Reusing slides for multiple classes
- Backing up your work

## Image Generation

The application supports **automatic image generation** using your Gemini API key!

### Image Style Configuration

**To change image style**, edit `image_style_config.py`:

```python
STYLE_PRESET = 'whiteboard'  # or 'minimal', 'no-labels', 'custom'
```

**Available presets:**

1. **`whiteboard`** (Default) - Colorful whiteboard-style drawings, minimal labels
2. **`minimal`** - Simple diagrams, only essential labels (max 2 words)
3. **`no-labels`** - Pure visual explanations, NO TEXT at all
4. **`custom`** - Define your own style in the config file

**Why these options?**
- AI-generated text in images often has spelling errors
- Visual-only explanations can be clearer
- You can always explain labels verbally during lecture

After changing the preset, restart the Flask server.

## Image Generation

### Method 1: Nano Banana (Default - Recommended!)

Uses Google's Nano Banana (Gemini image generation) with your existing Gemini API key.

**Setup:**
Already configured! Just make sure `IMAGE_GENERATION_METHOD=nano-banana` is in your `.env` file.

**Pros:**
- ✅ Uses your existing Gemini API key (no new signup needed)
- ✅ High quality educational images
- ✅ Fast cloud-based generation
- ✅ Integrated with your lecture text analysis

**Cost:**
- 💰 ~$0.10 per 1024x1024 image
- First-time Google AI Studio users may get free credits

### Method 2: OpenAI DALL-E 3 (Alternative)

Uses OpenAI's DALL-E 3 API for cloud-based generation.

**Setup:**
1. Get an API key from https://platform.openai.com/api-keys
2. In your `.env` file, set:
   ```
   IMAGE_GENERATION_METHOD=openai
   OPENAI_API_KEY=your-key-here
   ```
3. Restart the Flask server

**Cost:**
- 💰 ~$0.04 per 1024x1024 image (slightly cheaper than Nano Banana)

### How It Works

1. You paste your lecture text
2. The app uses Gemini to generate detailed, educational image prompts
3. When you click "Generate Image", Nano Banana creates the image
4. Images are displayed directly in the page as base64-encoded data

### Manual Alternative

If you don't want to use API-based generation, the app will show:
- 📋 A "Copy Prompt" button to copy the AI-generated prompt
- 🎨 A "Generate with Bing" button to use Microsoft's free image creator

This way you can still get high-quality images using external tools at no cost.

## Project Structure

```
Slides4Class/
├── app.py                 # Flask backend server
├── requirements.txt       # Python dependencies
├── README.md             # This file
└── static/
    ├── index.html        # Main web interface
    ├── style.css         # Styling
    └── script.js         # Frontend JavaScript
```

## Notes

- The text processing uses simple heuristics to split content into sections
- Main points are extracted using pattern matching (bullet points, numbered lists, short sentences)
- Image prompts are generated using Gemini to create better, more specific prompts
- The application is designed to be simple and fast for lecture preparation

## License

This project is for educational use.
