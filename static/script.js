let currentPageIndex = 0;
let pages = [];
let presentationPageIndex = 0;
let isProcessing = false;
let imageQueue = [];
let isGeneratingImage = false;
let outlineMode = true; // Default to outline mode
let slideOnlyMode = false; // Shows just the slide without controls/TOC

// Chapter summary image state
let chapterSummaryImageData = null; // Base64 data URL of chapter summary image
let chapterNumber = null; // Detected chapter number from loaded file
let totalSlidesPlanned = 0; // Track total slides for determining "last" slide

// Style management state
let availableStyles = {};
let currentStylePreset = 'neuroscience';
let styleEditorOpen = false;

// Dual-style state
let dualStyleEnabled = true;
let dualStyleConfig = {
    primary: 'neuroscience',
    secondary: 'reboot'
};
let currentDisplayStyle = 'primary'; // 'primary' or 'secondary' - persists across slides

document.getElementById('process-btn').addEventListener('click', processText);
document.getElementById('clear-btn').addEventListener('click', clearInput);

// ============================================
// Style Management Functions
// ============================================

// Initialize style selector on page load
async function initializeStyleSelector() {
    try {
        // Fetch available styles from server
        const response = await fetch('/api/styles');
        if (!response.ok) throw new Error('Failed to load styles');
        
        const data = await response.json();
        availableStyles = data.styles;
        
        // Populate all select dropdowns
        populateStyleSelect();
        populateStyleSelectById('primary-style-select');
        populateStyleSelectById('secondary-style-select');
        
        // Get current style
        const currentResponse = await fetch('/api/current-style');
        if (currentResponse.ok) {
            const currentStyle = await currentResponse.json();
            currentStylePreset = currentStyle.preset || 'neuroscience';
        }
        
        // Initialize the prompt editors
        updatePrimaryPromptEditor();
        updateSecondaryPromptEditor();
        
        console.log('✓ Style selector initialized with', Object.keys(availableStyles).length, 'styles');
    } catch (error) {
        console.error('Error initializing style selector:', error);
    }
}

function populateStyleSelectById(selectId) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;
    
    // Remember current selection
    const currentValue = selectEl.value;
    
    // Clear and repopulate
    selectEl.innerHTML = '';
    
    // Group styles: built-in first, then custom
    const builtinStyles = [];
    const customStyles = [];
    
    for (const [name, style] of Object.entries(availableStyles)) {
        if (style.builtin) {
            builtinStyles.push({ name, ...style });
        } else {
            customStyles.push({ name, ...style });
        }
    }
    
    // Add built-in styles
    builtinStyles.forEach(style => {
        const option = document.createElement('option');
        option.value = style.name;
        option.textContent = formatStyleName(style.name);
        selectEl.appendChild(option);
    });
    
    // Add custom styles
    if (customStyles.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '── Custom Styles ──';
        selectEl.appendChild(separator);
        
        customStyles.forEach(style => {
            const option = document.createElement('option');
            option.value = style.name;
            option.textContent = formatStyleName(style.name) + ' ⭐';
            selectEl.appendChild(option);
        });
    }
    
    // Restore selection
    if (currentValue && availableStyles[currentValue]) {
        selectEl.value = currentValue;
    }
}

function populateStyleSelect() {
    const selectEl = document.getElementById('style-preset-select');
    if (!selectEl) return;
    
    // Clear existing options
    selectEl.innerHTML = '';
    
    // Group styles: built-in first, then custom
    const builtinStyles = [];
    const customStyles = [];
    
    for (const [name, style] of Object.entries(availableStyles)) {
        if (style.builtin) {
            builtinStyles.push({ name, ...style });
        } else {
            customStyles.push({ name, ...style });
        }
    }
    
    // Add built-in styles
    if (builtinStyles.length > 0) {
        const builtinGroup = document.createElement('optgroup');
        builtinGroup.label = 'Built-in Styles';
        
        builtinStyles.forEach(style => {
            const option = document.createElement('option');
            option.value = style.name;
            option.textContent = formatStyleName(style.name);
            if (style.name === currentStylePreset) option.selected = true;
            builtinGroup.appendChild(option);
        });
        
        selectEl.appendChild(builtinGroup);
    }
    
    // Add custom styles
    if (customStyles.length > 0) {
        const customGroup = document.createElement('optgroup');
        customGroup.label = 'Custom Styles';
        
        customStyles.forEach(style => {
            const option = document.createElement('option');
            option.value = style.name;
            option.textContent = formatStyleName(style.name) + ' ⭐';
            if (style.name === currentStylePreset) option.selected = true;
            customGroup.appendChild(option);
        });
        
        selectEl.appendChild(customGroup);
    }
}

function formatStyleName(name) {
    // Convert kebab-case or snake_case to Title Case
    return name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function updateStyleDescription(styleName) {
    const descEl = document.getElementById('style-description');
    if (!descEl || !availableStyles[styleName]) return;
    
    descEl.textContent = availableStyles[styleName].description || 'Image style preset';
}

function updateStyleEditor(styleName) {
    const editorEl = document.getElementById('style-prompt-editor');
    const deleteBtn = document.getElementById('delete-style-btn');
    
    if (!editorEl || !availableStyles[styleName]) return;
    
    editorEl.value = availableStyles[styleName].prompt || '';
    
    // Show/hide delete button based on whether it's a custom style
    if (deleteBtn) {
        if (availableStyles[styleName].builtin) {
            deleteBtn.classList.add('hidden');
        } else {
            deleteBtn.classList.remove('hidden');
        }
    }
}

async function onStyleSelectChange(event) {
    const styleName = event.target.value;
    currentStylePreset = styleName;
    
    updateStyleDescription(styleName);
    updateStyleEditor(styleName);
    
    // Apply the style on the server
    try {
        await fetch('/api/set-style', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preset: styleName })
        });
        console.log('Style changed to:', styleName);
    } catch (error) {
        console.error('Error setting style:', error);
    }
}

function toggleStyleEditor() {
    const panel = document.getElementById('style-editor-panel');
    const toggleBtn = document.getElementById('toggle-style-editor');
    
    if (!panel || !toggleBtn) return;
    
    styleEditorOpen = !styleEditorOpen;
    
    if (styleEditorOpen) {
        panel.classList.remove('hidden');
        toggleBtn.textContent = 'Hide Style Prompts';
        // Populate both prompt editors
        updatePrimaryPromptEditor();
        updateSecondaryPromptEditor();
    } else {
        panel.classList.add('hidden');
        toggleBtn.textContent = 'Edit Style Prompts';
    }
}

async function applyStyleChanges() {
    const editorEl = document.getElementById('style-prompt-editor');
    if (!editorEl) return;
    
    const customPrompt = editorEl.value.trim();
    
    if (!customPrompt) {
        alert('Please enter a style prompt.');
        return;
    }
    
    try {
        const response = await fetch('/api/set-style', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ custom_prompt: customPrompt })
        });
        
        if (!response.ok) throw new Error('Failed to apply style');
        
        console.log('Custom style applied');
        alert('Style changes applied! New images will use this prompt.');
    } catch (error) {
        console.error('Error applying style:', error);
        alert('Error applying style: ' + error.message);
    }
}

function resetStyleToDefault() {
    const selectEl = document.getElementById('style-preset-select');
    if (!selectEl) return;
    
    const styleName = selectEl.value;
    updateStyleEditor(styleName);
}

async function saveNewStyle() {
    const nameEl = document.getElementById('new-style-name');
    const descEl = document.getElementById('new-style-description');
    const editorEl = document.getElementById('style-prompt-editor');
    
    if (!nameEl || !editorEl) return;
    
    const name = nameEl.value.trim();
    const description = descEl ? descEl.value.trim() : '';
    const prompt = editorEl.value.trim();
    
    if (!name) {
        alert('Please enter a name for the new style.');
        nameEl.focus();
        return;
    }
    
    if (!prompt) {
        alert('Please enter a prompt for the style.');
        editorEl.focus();
        return;
    }
    
    // Validate name format
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
        alert('Style name must start with a letter and contain only letters, numbers, underscores, and hyphens.');
        nameEl.focus();
        return;
    }
    
    try {
        const response = await fetch('/api/save-style', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                prompt: prompt,
                description: description || `Custom style: ${name}`
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to save style');
        }
        
        // Update available styles
        availableStyles = data.styles;
        
        // Repopulate the select and set the new style as current
        populateStyleSelect();
        
        const selectEl = document.getElementById('style-preset-select');
        if (selectEl) {
            selectEl.value = name;
        }
        
        currentStylePreset = name;
        updateStyleDescription(name);
        
        // Clear the name input
        nameEl.value = '';
        if (descEl) descEl.value = '';
        
        alert(`Style "${name}" saved successfully!`);
        console.log('New style saved:', name);
    } catch (error) {
        console.error('Error saving style:', error);
        alert('Error saving style: ' + error.message);
    }
}

async function deleteCurrentStyle() {
    const selectEl = document.getElementById('style-preset-select');
    if (!selectEl) return;
    
    const styleName = selectEl.value;
    
    if (!styleName || !availableStyles[styleName]) return;
    
    // Check if it's a built-in style
    if (availableStyles[styleName].builtin) {
        alert('Cannot delete built-in styles.');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete the style "${styleName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/delete-style', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: styleName })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete style');
        }
        
        // Update available styles
        availableStyles = data.styles;
        
        // Reset to neuroscience and repopulate
        currentStylePreset = 'neuroscience';
        populateStyleSelect();
        
        selectEl.value = 'neuroscience';
        updateStyleDescription('neuroscience');
        updateStyleEditor('neuroscience');
        
        alert(`Style "${styleName}" deleted.`);
        console.log('Style deleted:', styleName);
    } catch (error) {
        console.error('Error deleting style:', error);
        alert('Error deleting style: ' + error.message);
    }
}

// Initialize style selector when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeStyleSelector();
    initializeDualStyleConfig();
    
    // Set up event listeners for style management
    const styleSelect = document.getElementById('style-preset-select');
    if (styleSelect) {
        styleSelect.addEventListener('change', onStyleSelectChange);
    }
    
    const toggleBtn = document.getElementById('toggle-style-editor');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleStyleEditor);
    }
    
    const applyBtn = document.getElementById('apply-style-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyStyleChanges);
    }
    
    const resetBtn = document.getElementById('reset-style-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetStyleToDefault);
    }
    
    const saveBtn = document.getElementById('save-style-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveNewStyle);
    }
    
    const deleteBtn = document.getElementById('delete-style-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteCurrentStyle);
    }
});

// ============================================
// Dual-Style Image Generation
// ============================================

async function initializeDualStyleConfig() {
    try {
        const response = await fetch('/api/dual-style-config');
        if (response.ok) {
            const config = await response.json();
            dualStyleEnabled = config.enabled;
            dualStyleConfig = {
                primary: config.primary.name,
                primaryDesc: config.primary.description,
                secondary: config.secondary.name,
                secondaryDesc: config.secondary.description
            };
            console.log('✓ Dual-style config loaded:', dualStyleConfig.primary, '+', dualStyleConfig.secondary);
            updateStyleToggleButton();
            updateDualStyleUI();
        }
        
        // Set up event listeners for dual-style UI
        setupDualStyleListeners();
    } catch (error) {
        console.error('Error loading dual-style config:', error);
    }
}

function setupDualStyleListeners() {
    // Dual mode toggle
    const dualToggle = document.getElementById('dual-style-toggle');
    if (dualToggle) {
        dualToggle.checked = dualStyleEnabled;
        dualToggle.addEventListener('change', function() {
            dualStyleEnabled = this.checked;
            updateDualStyleUI();
            saveDualStyleConfig();
        });
    }
    
    // Primary style select
    const primarySelect = document.getElementById('primary-style-select');
    if (primarySelect) {
        primarySelect.addEventListener('change', function() {
            dualStyleConfig.primary = this.value;
            updatePrimaryStyleDesc();
            updatePrimaryPromptEditor();
            updateStyleToggleButton();
            saveDualStyleConfig();
        });
    }
    
    // Secondary style select
    const secondarySelect = document.getElementById('secondary-style-select');
    if (secondarySelect) {
        secondarySelect.addEventListener('change', function() {
            dualStyleConfig.secondary = this.value;
            updateSecondaryStyleDesc();
            updateSecondaryPromptEditor();
            updateStyleToggleButton();
            saveDualStyleConfig();
        });
    }
}

async function saveDualStyleConfig() {
    try {
        const response = await fetch('/api/dual-style-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enabled: dualStyleEnabled,
                primary: dualStyleConfig.primary,
                secondary: dualStyleConfig.secondary
            })
        });
        
        if (response.ok) {
            console.log('Dual-style config saved:', dualStyleConfig.primary, '+', dualStyleConfig.secondary);
        }
    } catch (error) {
        console.error('Error saving dual-style config:', error);
    }
}

function updateDualStyleUI() {
    const secondaryGroup = document.getElementById('secondary-style-group');
    const dualHint = document.querySelector('.dual-style-hint');
    
    if (secondaryGroup) {
        if (dualStyleEnabled) {
            secondaryGroup.classList.remove('disabled');
        } else {
            secondaryGroup.classList.add('disabled');
        }
    }
    
    if (dualHint) {
        dualHint.textContent = dualStyleEnabled 
            ? 'Generate both styles for each slide (toggle to view either)'
            : 'Single style mode - only primary style will be generated';
    }
    
    // Update selects to match config
    const primarySelect = document.getElementById('primary-style-select');
    const secondarySelect = document.getElementById('secondary-style-select');
    
    if (primarySelect) primarySelect.value = dualStyleConfig.primary;
    if (secondarySelect) secondarySelect.value = dualStyleConfig.secondary;
    
    updatePrimaryStyleDesc();
    updateSecondaryStyleDesc();
}

function updatePrimaryStyleDesc() {
    const descEl = document.getElementById('primary-style-desc');
    const nameEl = document.getElementById('primary-style-name');
    if (descEl && availableStyles[dualStyleConfig.primary]) {
        descEl.textContent = availableStyles[dualStyleConfig.primary].description || '';
    }
    if (nameEl) nameEl.textContent = dualStyleConfig.primary;
}

function updateSecondaryStyleDesc() {
    const descEl = document.getElementById('secondary-style-desc');
    const nameEl = document.getElementById('secondary-style-name');
    if (descEl && availableStyles[dualStyleConfig.secondary]) {
        descEl.textContent = availableStyles[dualStyleConfig.secondary].description || '';
    }
    if (nameEl) nameEl.textContent = dualStyleConfig.secondary;
}

function updatePrimaryPromptEditor() {
    const editor = document.getElementById('primary-prompt-editor');
    if (editor && availableStyles[dualStyleConfig.primary]) {
        editor.value = availableStyles[dualStyleConfig.primary].prompt || '';
    }
}

function updateSecondaryPromptEditor() {
    const editor = document.getElementById('secondary-prompt-editor');
    if (editor && availableStyles[dualStyleConfig.secondary]) {
        editor.value = availableStyles[dualStyleConfig.secondary].prompt || '';
    }
}

function switchStyleTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.style-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update tab content
    document.getElementById('primary-prompt-tab').classList.toggle('hidden', tab !== 'primary');
    document.getElementById('primary-prompt-tab').classList.toggle('active', tab === 'primary');
    document.getElementById('secondary-prompt-tab').classList.toggle('hidden', tab !== 'secondary');
    document.getElementById('secondary-prompt-tab').classList.toggle('active', tab === 'secondary');
}

function toggleDisplayStyle() {
    currentDisplayStyle = currentDisplayStyle === 'primary' ? 'secondary' : 'primary';
    updateStyleToggleButton();
    updateAllSlideImages();
}

function updateStyleToggleButton() {
    const toggleBtns = document.querySelectorAll('.style-toggle-btn');
    toggleBtns.forEach(btn => {
        if (currentDisplayStyle === 'primary') {
            btn.innerHTML = `🎨 ${formatStyleName(dualStyleConfig.primary)}`;
            btn.title = `Currently showing ${dualStyleConfig.primary} style. Click to switch to ${dualStyleConfig.secondary}.`;
        } else {
            btn.innerHTML = `🎨 ${formatStyleName(dualStyleConfig.secondary)}`;
            btn.title = `Currently showing ${dualStyleConfig.secondary} style. Click to switch to ${dualStyleConfig.primary}.`;
        }
    });
}

function updateAllSlideImages() {
    // Update all visible slide images to show the current style
    pages.forEach((page, index) => {
        updateSlideImageDisplay(index);
    });
}

function updateSlideImageDisplay(index) {
    const viewer = document.getElementById(`viewer-${index}`);
    if (!viewer) return;
    
    const page = pages[index];
    if (!page) return;
    
    // Determine which image to show
    let imageUrl = null;
    if (currentDisplayStyle === 'primary' && page.primaryImageData) {
        imageUrl = page.primaryImageData;
    } else if (currentDisplayStyle === 'secondary' && page.secondaryImageData) {
        imageUrl = page.secondaryImageData;
    } else if (page.imageData) {
        // Fallback to single image if dual not available
        imageUrl = page.imageData;
    }
    
    if (imageUrl) {
        const existingImg = viewer.querySelector('.slide-image');
        if (existingImg) {
            existingImg.src = imageUrl;
        } else {
            viewer.innerHTML = `<img src="${imageUrl}" alt="Generated illustration" class="slide-image" id="img-${index}">`;
            initializeImageViewer(index);
        }
    }
}

// Queue dual image generation
function queueDualImageGeneration(index, prompt) {
    // Check if this is intro or summary slide and we have a chapter summary image
    const page = pages[index];
    const isIntroSlide = index === 0 || (page && page.slide_type === 'intro');
    const isSummarySlide = page && page.slide_type === 'summary';
    
    if (chapterSummaryImageData && (isIntroSlide || isSummarySlide)) {
        // Use the chapter summary image directly instead of generating
        const slideType = isIntroSlide ? 'intro' : 'summary';
        console.log(`Using chapter summary image for slide ${index + 1} (${slideType} slide)`);
        applyChapterSummaryImage(index);
        return;
    }
    
    if (dualStyleEnabled) {
        imageQueue.push({ index, prompt, dual: true });
    } else {
        imageQueue.push({ index, prompt, dual: false });
    }
    processImageQueue();
}

// Apply the chapter summary image to a slide
function applyChapterSummaryImage(index) {
    const viewer = document.getElementById(`viewer-${index}`);
    if (!viewer) return;
    
    // Set the image in the viewer
    viewer.innerHTML = `<img src="${chapterSummaryImageData}" alt="Chapter Summary" class="slide-image" id="img-${index}">`;
    
    // Store in pages array (same image for both styles)
    if (pages[index]) {
        pages[index].primaryImageData = chapterSummaryImageData;
        pages[index].secondaryImageData = chapterSummaryImageData;
        pages[index].imageData = chapterSummaryImageData;
        pages[index].primaryStyle = 'chapter-summary';
        pages[index].secondaryStyle = 'chapter-summary';
    }
    
    // Initialize viewer
    setTimeout(() => {
        initializeImageViewer(index);
        setTimeout(() => resetImage(index), 100);
    }, 50);
}

async function processImageQueue() {
    if (isGeneratingImage || imageQueue.length === 0) return;
    
    isGeneratingImage = true;
    const item = imageQueue.shift();
    
    try {
        if (item.dual) {
            await generateDualImagesForSlide(item.index, item.prompt);
        } else {
            await generateImageForSlide(item.index, item.prompt);
        }
    } catch (error) {
        console.error(`Error generating image for slide ${item.index}:`, error);
    }
    
    isGeneratingImage = false;
    
    // Process next in queue
    if (imageQueue.length > 0) {
        processImageQueue();
    } else {
        // Update the continue button when queue is empty
        updateContinueButton();
    }
}

async function generateDualImagesForSlide(index, prompt) {
    const viewer = document.getElementById(`viewer-${index}`);
    if (!viewer) return;
    
    // Show loading state
    viewer.innerHTML = `
        <div class="slide-image-generating">
            <div class="spinner"></div>
            <p>Generating dual-style images...</p>
            <p class="generating-styles">${formatStyleName(dualStyleConfig.primary)} + ${formatStyleName(dualStyleConfig.secondary)}</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/generate-dual-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, page_id: index })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate images');
        }
        
        const data = await response.json();
        
        // Store both images in the page data
        if (pages[index]) {
            if (data.primary && data.primary.image_url) {
                pages[index].primaryImageData = data.primary.image_url;
                pages[index].primaryStyle = data.primary.style;
            }
            if (data.secondary && data.secondary.image_url) {
                pages[index].secondaryImageData = data.secondary.image_url;
                pages[index].secondaryStyle = data.secondary.style;
            }
            // Also set imageData to primary for backwards compatibility
            pages[index].imageData = pages[index].primaryImageData || pages[index].secondaryImageData;
        }
        
        // Display the current style
        updateSlideImageDisplay(index);
        
        // Initialize viewer
        setTimeout(() => {
            initializeImageViewer(index);
            setTimeout(() => resetImage(index), 100);
        }, 50);
        
        // Log results
        const primaryOk = data.primary && data.primary.image_url ? '✓' : '✗';
        const secondaryOk = data.secondary && data.secondary.image_url ? '✓' : '✗';
        console.log(`Slide ${index}: Primary ${primaryOk}, Secondary ${secondaryOk}`);
        
    } catch (error) {
        viewer.innerHTML = `<div class="slide-image-placeholder">❌ Error: ${escapeHtml(error.message)}<br><button onclick="regenerateDualImages(${index})" class="btn btn-secondary btn-small">Retry</button></div>`;
    }
}

function regenerateDualImages(index) {
    if (index >= pages.length) return;
    
    const page = pages[index];
    const viewer = document.getElementById(`viewer-${index}`);
    
    if (viewer) {
        viewer.innerHTML = `
            <div class="slide-image-generating">
                <div class="spinner"></div>
                <p>Regenerating images...</p>
            </div>
        `;
    }
    
    // Get the prompt from the editor if available
    const promptTextarea = document.getElementById(`prompt-editor-${index}`);
    const prompt = promptTextarea ? promptTextarea.value.trim() : page.image_prompt;
    
    // Add to front of queue for immediate processing
    imageQueue.unshift({ index, prompt, dual: dualStyleEnabled });
    processImageQueue();
}

// Generate a new image prompt using AI based on slide content
async function generateNewPrompt(index) {
    if (index >= pages.length) return;
    
    const page = pages[index];
    const promptTextarea = document.getElementById(`prompt-editor-${index}`);
    const generateBtn = event.target;
    
    if (!promptTextarea) return;
    
    // Show loading state
    const originalText = generateBtn.textContent;
    generateBtn.textContent = '⏳ Generating...';
    generateBtn.disabled = true;
    
    try {
        const response = await fetch('/api/generate-image-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: page.title || '',
                topic: page.topic || '',
                subtopic: page.subtopic || '',
                main_points: page.main_points || [],
                current_prompt: promptTextarea.value.trim(),
                slide_type: page.slide_type || 'subtopic'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate prompt');
        }
        
        const data = await response.json();
        
        if (data.prompt) {
            // Update the textarea with the new prompt
            promptTextarea.value = data.prompt;
            
            // Also update the page data
            if (pages[index]) {
                pages[index].image_prompt = data.prompt;
            }
            
            console.log(`✓ Generated new prompt for slide ${index + 1}`);
        }
        
    } catch (error) {
        console.error('Error generating prompt:', error);
        alert('Failed to generate prompt: ' + error.message);
    } finally {
        generateBtn.textContent = originalText;
        generateBtn.disabled = false;
    }
}

// Generate new prompt AND immediately regenerate images
async function generatePromptAndRegenerate(index) {
    await generateNewPrompt(index);
    regenerateDualImages(index);
}

// Outline mode toggle
const outlineModeToggle = document.getElementById('outline-mode-toggle');
if (outlineModeToggle) {
    outlineModeToggle.addEventListener('change', function() {
        outlineMode = this.checked;
        updateOutlineModeUI();
    });
    // Initialize UI state
    updateOutlineModeUI();
}

// HTML file upload handler
const htmlFileInput = document.getElementById('html-file-input');
if (htmlFileInput) {
    htmlFileInput.addEventListener('change', handleHtmlFileUpload);
}

// Extract chapter number from filename or content
function extractChapterNumber(filename, htmlContent) {
    // Try to extract from filename first (e.g., "Chapter5.html", "Ch5.html", "chapter_5.html")
    const filenameMatch = filename.match(/chapter[_\s-]*(\d+)/i) || filename.match(/ch[_\s-]*(\d+)/i);
    if (filenameMatch) {
        return parseInt(filenameMatch[1], 10);
    }
    
    // Try to extract from HTML content (e.g., "Chapter 5 —" in title)
    const contentMatch = htmlContent.match(/chapter\s*(\d+)/i);
    if (contentMatch) {
        return parseInt(contentMatch[1], 10);
    }
    
    return null;
}

// Try to load the chapter summary image
async function loadChapterSummaryImage(chapterNum) {
    if (chapterNum === null) {
        console.log('No chapter number detected, skipping summary image load');
        chapterSummaryImageData = null;
        return false;
    }
    
    // Try to load the image from the server
    const imagePath = `/GeminiSummaryCh${chapterNum}.png`;
    
    try {
        const response = await fetch(imagePath);
        if (!response.ok) {
            console.log(`Chapter summary image not found: ${imagePath}`);
            chapterSummaryImageData = null;
            return false;
        }
        
        // Convert to base64 data URL
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                chapterSummaryImageData = reader.result;
                console.log(`✓ Loaded chapter summary image: ${imagePath} (${Math.round(chapterSummaryImageData.length / 1024)}KB)`);
                resolve(true);
            };
            reader.onerror = () => {
                console.error('Error reading chapter summary image');
                chapterSummaryImageData = null;
                resolve(false);
            };
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.log(`Could not load chapter summary image: ${error.message}`);
        chapterSummaryImageData = null;
        return false;
    }
}

async function handleHtmlFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show file name
    const fileNameDisplay = document.getElementById('file-name-display');
    if (fileNameDisplay) {
        fileNameDisplay.textContent = file.name;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const htmlContent = e.target.result;
        
        // Extract chapter number and try to load summary image
        chapterNumber = extractChapterNumber(file.name, htmlContent);
        if (chapterNumber !== null) {
            console.log(`Detected Chapter ${chapterNumber}`);
            await loadChapterSummaryImage(chapterNumber);
        } else {
            chapterSummaryImageData = null;
        }
        
        // Parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Extract title from <h1> or <title> tag
        let title = '';
        const h1Tag = doc.querySelector('h1');
        const titleTag = doc.querySelector('title');
        
        if (h1Tag) {
            title = h1Tag.textContent.trim();
        } else if (titleTag) {
            title = titleTag.textContent.trim();
            // Remove "Chapter X — " prefix if present
            title = title.replace(/^Chapter\s+\d+\s*[—-]\s*/i, '');
        }
        
        // Set title input
        const titleInput = document.getElementById('title-input');
        if (titleInput && title) {
            titleInput.value = title;
        }
        
        // Extract outline - look for "LECTURE OUTLINE" text in a container
        let outlineText = '';
        let outlineContainer = null;
        
        // Find the element containing "LECTURE OUTLINE"
        const allElements = doc.querySelectorAll('div, section, strong, b');
        for (const el of allElements) {
            // Check if this element directly contains "LECTURE OUTLINE" (not just a descendant)
            if (el.textContent.includes('LECTURE OUTLINE')) {
                // Find the containing div/section
                outlineContainer = el.closest('div[style], section');
                if (outlineContainer) {
                    // Make sure this container is specifically the outline box, not a huge parent
                    const containerText = outlineContainer.textContent;
                    // Outline box should be relatively small (under 3000 chars typically)
                    if (containerText.length < 5000 && containerText.includes('LECTURE OUTLINE')) {
                        outlineText = extractOutlineText(outlineContainer);
                        break;
                    }
                }
            }
        }
        
        // Set outline input
        const outlineInput = document.getElementById('outline-input');
        if (outlineInput && outlineText) {
            outlineInput.value = outlineText;
        }
        
        // Extract main content, discussion questions, and quiz questions
        let contentText = '';
        let discussionText = '';
        let quizText = '';
        const mainElement = doc.querySelector('main') || doc.body;
        
        if (mainElement) {
            const contentElements = mainElement.querySelectorAll('p, h2, h3, .stage, .lead, [class*="stage"]');
            const contentParts = [];
            const discussionParts = [];
            const quizParts = [];
            
            let inDiscussionSection = false;
            let inQuizSection = false;
            
            contentElements.forEach(el => {
                // Skip if it's inside the outline container
                if (outlineContainer && outlineContainer.contains(el)) return;
                
                // Skip elements that look like navigation or headers
                const parent = el.closest('header, nav, footer, .quiz-notice');
                if (parent) return;
                
                const text = el.textContent.trim();
                
                // Check for section markers
                if (text.includes('Thought Questions') || text.includes('Discussion')) {
                    inDiscussionSection = true;
                    inQuizSection = false;
                    return;
                }
                
                if (text.includes('Practice Questions') || text.includes('Fill-in') || 
                    text.match(/^•.*_+.*_+/m) || text.includes('_______')) {
                    inDiscussionSection = false;
                    inQuizSection = true;
                }
                
                // Check if this looks like a fill-in-the-blank question
                const isFillInBlank = text.includes('_______') || text.match(/^•.*_+/);
                
                // Skip navigation/preview elements
                if (text.startsWith('[VIEW') || text.startsWith('[SEARCH') || 
                    text.startsWith('[PREVIEW') || text.startsWith('Next:') ||
                    text.includes('Answer Key')) {
                    return;
                }
                
                // Skip very short elements
                if (text.length < 30) return;
                
                // Route to appropriate section
                if (isFillInBlank) {
                    quizParts.push(text);
                } else if (inQuizSection && !isFillInBlank) {
                    // End of quiz section
                    inQuizSection = false;
                } else if (inDiscussionSection) {
                    // Check if we've moved past discussion to quiz
                    if (text.includes('Practice Questions') || isFillInBlank) {
                        inDiscussionSection = false;
                        inQuizSection = true;
                        if (isFillInBlank) quizParts.push(text);
                    } else {
                        discussionParts.push(text);
                    }
                } else {
                    contentParts.push(text);
                }
            });
            
            contentText = contentParts.join('\n\n');
            discussionText = discussionParts.join('\n\n');
            quizText = quizParts.join('\n');
        }
        
        // Set content inputs
        const textInput = document.getElementById('text-input');
        if (textInput && contentText) {
            textInput.value = contentText;
        }
        
        const discussionInput = document.getElementById('discussion-input');
        if (discussionInput && discussionText) {
            discussionInput.value = discussionText;
        }
        
        const quizInput = document.getElementById('quiz-input');
        if (quizInput && quizText) {
            quizInput.value = quizText;
        }
        
        // Show success message
        const status = [];
        status.push(`Title: ${title ? '"' + title.substring(0, 40) + '..."' : 'Not found'}`);
        status.push(`Outline: ${outlineText ? outlineText.split('\n').length + ' lines' : 'Not found'}`);
        status.push(`Content: ${contentText ? contentText.length + ' chars' : 'Not found'}`);
        status.push(`Discussion: ${discussionText ? discussionParts.length + ' questions' : 'Not found'}`);
        status.push(`Quiz: ${quizText ? quizParts.length + ' questions' : 'Not found'}`);
        status.push(`Chapter Summary Image: ${chapterSummaryImageData ? '✓ Found (Ch.' + chapterNumber + ')' : 'Not found'}`);
        
        alert(`Loaded from ${file.name}:\n\n${status.join('\n')}`);
    };
    
    reader.readAsText(file);
}

function extractOutlineText(element) {
    // Get the HTML content and convert to structured text
    let html = element.innerHTML;
    
    // Replace <br> tags with newlines
    html = html.replace(/<br\s*\/?>/gi, '\n');
    
    // Replace &nbsp; with spaces  
    html = html.replace(/&nbsp;/g, '  '); // Use double space for indentation
    
    // Replace </strong> and </b> with newlines to separate topics
    html = html.replace(/<\/(strong|b)>/gi, '\n');
    
    // Remove all HTML tags but preserve text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    let text = tempDiv.textContent || tempDiv.innerText;
    
    // Clean up the text - preserve indentation for subtopics
    const lines = text.split('\n');
    const cleanedLines = [];
    
    for (let line of lines) {
        // Trim trailing whitespace but preserve leading whitespace/bullets
        line = line.trimEnd();
        
        // Skip empty lines
        if (!line.trim()) continue;
        
        // Skip the header line
        if (line.includes('LECTURE OUTLINE')) continue;
        
        // If line starts with bullet/dot, ensure consistent formatting
        const trimmed = line.trim();
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
            cleanedLines.push('  ' + trimmed); // Indent subtopics
        } else if (trimmed.match(/^[IVX]+\.|^\d+\./)) {
            // This is a main topic (Roman numeral or number)
            cleanedLines.push(trimmed);
        } else if (line.startsWith(' ') || line.startsWith('\t')) {
            // Already indented - it's a subtopic
            cleanedLines.push('  ' + trimmed);
        } else {
            cleanedLines.push(trimmed);
        }
    }
    
    return cleanedLines.join('\n').trim();
}

function updateOutlineModeUI() {
    const outlineSection = document.getElementById('outline-input-section');
    const textLabel = document.getElementById('text-input-label');
    const modeHint = document.getElementById('mode-hint');
    const textInput = document.getElementById('text-input');
    
    if (outlineMode) {
        if (outlineSection) outlineSection.classList.remove('hidden');
        if (textLabel) textLabel.textContent = 'Full Chapter Text:';
        if (modeHint) modeHint.textContent = 'Paste chapter outline + full text for structured slides';
        if (textInput) textInput.placeholder = 'Paste the full chapter text here. The system will match content to your outline sections.';
    } else {
        if (outlineSection) outlineSection.classList.add('hidden');
        if (textLabel) textLabel.textContent = 'Paste your lecture text here:';
        if (modeHint) modeHint.textContent = 'Auto-split text into paragraphs for slides';
        if (textInput) textInput.placeholder = 'Paste your textbook content, lecture notes, or any educational text here. The system will automatically organize it into pages with main points and generate illustrative images.';
    }
}

// Main process function - routes to appropriate handler
async function processText() {
    if (outlineMode) {
        await processOutlineBased();
    } else {
        await processTextProgressive();
    }
}

// New: Outline-based processing with progressive slide generation
async function processOutlineBased() {
    const outlineInput = document.getElementById('outline-input').value.trim();
    const textInput = document.getElementById('text-input').value.trim();
    const titleInput = document.getElementById('title-input');
    const chapterTitle = titleInput ? titleInput.value.trim() : '';
    
    // Get optional discussion and quiz questions
    const discussionInput = document.getElementById('discussion-input');
    const discussionQuestions = discussionInput ? discussionInput.value.trim() : '';
    
    const quizInput = document.getElementById('quiz-input');
    const quizQuestions = quizInput ? quizInput.value.trim() : '';
    
    if (!outlineInput) {
        showError('Please enter a chapter outline.');
        return;
    }
    
    if (!textInput) {
        showError('Please enter the chapter text.');
        return;
    }
    
    if (isProcessing) {
        alert('Already processing. Please wait.');
        return;
    }
    
    isProcessing = true;
    pages = [];
    imageQueue = [];
    presentationPageIndex = 0;
    
    // Hide error, show loading
    document.getElementById('error').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('pages-container').classList.add('hidden');
    
    try {
        // Step 1: Parse the outline to get structure
        const parseResponse = await fetch('/api/parse-outline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outline: outlineInput })
        });
        
        if (!parseResponse.ok) {
            const errorData = await parseResponse.json();
            throw new Error(errorData.error || 'Failed to parse outline');
        }
        
        const parseData = await parseResponse.json();
        const topics = parseData.topics;
        
        if (!topics || topics.length === 0) {
            throw new Error('Could not parse outline. Please check the format.');
        }
        
        // Build the slide plan
        const slidePlan = buildSlidePlan(topics, discussionQuestions, quizQuestions);
        
        document.getElementById('loading').classList.add('hidden');
        
        // Enter presentation mode with placeholders
        enterProgressivePresentationMode(slidePlan, chapterTitle);
        
        // Generate slides progressively
        await generateSlidesProgressively(slidePlan, textInput, chapterTitle, topics, discussionQuestions, quizQuestions);
        
    } catch (error) {
        showError(error.message);
        document.getElementById('loading').classList.add('hidden');
    } finally {
        isProcessing = false;
        updateProcessingStatus();
    }
}

// Build a plan of slides to generate
function buildSlidePlan(topics, discussionQuestions, quizQuestions) {
    const plan = [];
    
    // Intro slide
    plan.push({ type: 'intro', title: 'Chapter Introduction' });
    
    // Topics and subtopics
    topics.forEach((topicData, topicIndex) => {
        // Topic overview
        plan.push({ 
            type: 'topic_overview', 
            title: topicData.topic,
            topic: topicData.topic,
            subtopics: topicData.subtopics,
            topicIndex: topicIndex
        });
        
        // Subtopics
        topicData.subtopics.forEach((subtopic, subIndex) => {
            plan.push({
                type: 'subtopic',
                title: subtopic,
                topic: topicData.topic,
                subtopic: subtopic,
                topicIndex: topicIndex,
                subtopicIndex: subIndex
            });
        });
    });
    
    // Summary
    plan.push({ type: 'summary', title: 'Chapter Summary' });
    
    // Discussion (if provided)
    if (discussionQuestions) {
        plan.push({ type: 'discussion', title: 'Discussion Questions' });
    }
    
    // Quiz (if provided)
    if (quizQuestions) {
        plan.push({ type: 'quiz', title: 'Quiz Yourself' });
    }
    
    return plan;
}

// Enter presentation mode with placeholder slides
function enterProgressivePresentationMode(slidePlan, chapterTitle) {
    // Track total slides for first/last detection (used for chapter summary images)
    totalSlidesPlanned = slidePlan.length;
    
    const overlay = document.getElementById('presentation-overlay');
    const content = document.getElementById('presentation-content');
    const tocList = document.getElementById('toc-list');
    
    // Clear previous content
    content.innerHTML = '';
    tocList.innerHTML = '';
    
    presentationPageIndex = 0;
    
    // Track topic numbering
    let topicNumber = 0;
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    
    // Create placeholder TOC and slides
    slidePlan.forEach((item, index) => {
        // Create TOC item
        const tocItem = document.createElement('div');
        tocItem.id = `toc-item-${index}`;
        tocItem.onclick = () => jumpToSlide(index);
        
        let tocLabel = '';
        let tocClass = 'toc-item toc-loading';
        
        switch(item.type) {
            case 'intro':
                tocLabel = `<span class="toc-icon">📖</span> ${escapeHtml(chapterTitle || item.title)}`;
                tocClass += ' toc-intro';
                break;
            case 'topic_overview':
                topicNumber++;
                const numeral = romanNumerals[topicNumber - 1] || topicNumber;
                tocLabel = `<span class="toc-numeral">${numeral}.</span> ${escapeHtml(item.topic)}`;
                tocClass += ' toc-topic';
                break;
            case 'subtopic':
                tocLabel = `<span class="toc-bullet">•</span> ${escapeHtml(item.subtopic)}`;
                tocClass += ' toc-subtopic';
                break;
            case 'summary':
                tocLabel = `<span class="toc-icon">📝</span> ${escapeHtml(item.title)}`;
                tocClass += ' toc-summary';
                break;
            case 'discussion':
                tocLabel = `<span class="toc-icon">💭</span> ${escapeHtml(item.title)}`;
                tocClass += ' toc-discussion';
                break;
            case 'quiz':
                tocLabel = `<span class="toc-icon">✏️</span> ${escapeHtml(item.title)}`;
                tocClass += ' toc-quiz';
                break;
        }
        
        if (index === 0) tocClass = tocClass.replace('toc-loading', 'active');
        
        tocItem.className = tocClass;
        tocItem.innerHTML = `<span class="toc-item-title">${tocLabel}</span><span class="toc-loading-spinner">⏳</span>`;
        tocList.appendChild(tocItem);
        
        // Create placeholder slide
        const slide = document.createElement('div');
        slide.className = `slide ${index === 0 ? 'active' : ''}`;
        slide.id = `slide-${index}`;
        slide.innerHTML = `
            <div class="slide-loading-placeholder">
                <div class="spinner"></div>
                <p>Generating slide ${index + 1} of ${slidePlan.length}...</p>
                <p class="slide-loading-title">${escapeHtml(item.title || item.topic || item.subtopic)}</p>
            </div>
        `;
        content.appendChild(slide);
    });
    
    overlay.classList.remove('hidden');
    document.addEventListener('keydown', handlePresentationKeys);
    updateProgressCounter(0, slidePlan.length);
}

// Generate slides one at a time
async function generateSlidesProgressively(slidePlan, contentText, chapterTitle, topics, discussionQuestions, quizQuestions) {
    for (let i = 0; i < slidePlan.length; i++) {
        const item = slidePlan[i];
        
        try {
            // Build request based on slide type
            const requestBody = {
                slide_type: item.type,
                content: contentText,
                title: chapterTitle,
                topics: topics
            };
            
            if (item.type === 'topic_overview') {
                requestBody.topic = item.topic;
                requestBody.subtopics = item.subtopics;
            } else if (item.type === 'subtopic') {
                requestBody.topic = item.topic;
                requestBody.subtopic = item.subtopic;
            } else if (item.type === 'discussion') {
                requestBody.discussion_questions = discussionQuestions;
            } else if (item.type === 'quiz') {
                requestBody.quiz_questions = quizQuestions;
            }
            
            const response = await fetch('/api/generate-slide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to generate slide ${i + 1}`);
            }
            
            const slideData = await response.json();
            slideData.id = i + 1;
            slideData.slide_type = item.type;
            if (item.topic) slideData.topic = item.topic;
            if (item.subtopic) slideData.subtopic = item.subtopic;
            
            // Add to pages array
            pages[i] = slideData;
            
            // Update the slide in the DOM
            updateSlideContent(i, slideData);
            
            // Update TOC item to show completion
            updateTOCItemComplete(i, slideData.title);
            
            // Update progress counter
            updateProgressCounter(i + 1, slidePlan.length);
            
            // Queue image generation
            if (slideData.image_prompt) {
                queueImageGeneration(i, slideData.image_prompt);
            }
            
        } catch (error) {
            console.error(`Error generating slide ${i}:`, error);
            // Mark as error in TOC
            const tocItem = document.getElementById(`toc-item-${i}`);
            if (tocItem) {
                tocItem.classList.remove('toc-loading');
                tocItem.classList.add('toc-error');
            }
        }
    }
}

// Update a slide's content after it's generated
function updateSlideContent(index, slideData) {
    const slideElement = document.getElementById(`slide-${index}`);
    if (!slideElement) return;
    
    slideElement.innerHTML = `
        <h2 class="slide-title" onclick="editSlideTitle(${index})" title="Click to edit title">${escapeHtml(slideData.title)}</h2>
        
        <div class="slide-body">
            <div class="slide-left">
                <div class="slide-image-container">
                    <div class="slide-image-viewer" id="viewer-${index}">
                        <div class="slide-image-generating">
                            <div class="spinner"></div>
                            <p>Generating dual-style images...</p>
                        </div>
                    </div>
                    <div class="slide-image-controls">
                        <button onclick="toggleDisplayStyle()" class="style-toggle-btn btn-style-toggle">🎨 ${formatStyleName(dualStyleConfig.primary)}</button>
                        <button onclick="zoomImage(${index}, 1.2)">🔍+</button>
                        <button onclick="zoomImage(${index}, 0.8)">🔎-</button>
                        <button onclick="resetImage(${index})">↺</button>
                        <button onclick="regenerateDualImages(${index})" class="btn-regenerate" title="Regenerate images">🔄</button>
                        <button onclick="importImage(${index})" class="btn-import" title="Import your own image">📁</button>
                        <button onclick="toggleSlideOnlyMode()" class="btn-slide-only">${slideOnlyMode ? '◱' : '◳'}</button>
                    </div>
                    <div class="slide-image-prompt-editor">
                        <label><strong>Image Prompt:</strong> <button onclick="generateNewPrompt(${index})" class="btn-generate-prompt" title="Generate a new prompt based on slide content">✨ Generate</button></label>
                        <textarea id="prompt-editor-${index}" class="prompt-textarea">${escapeHtml(slideData.image_prompt || '')}</textarea>
                    </div>
                </div>
            </div>
            
            <div class="slide-resizer" onmousedown="startResize(event)"></div>
            
            <div class="slide-right" id="slide-right-${index}">
                ${slideData.main_points && slideData.main_points.length > 0 ? `
                    <div class="slide-main-points" id="main-points-${index}">
                        <ul>
                            ${slideData.main_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Update TOC item when slide is complete
function updateTOCItemComplete(index, title) {
    const tocItem = document.getElementById(`toc-item-${index}`);
    if (!tocItem) return;
    
    tocItem.classList.remove('toc-loading');
    
    // Remove the loading spinner
    const spinner = tocItem.querySelector('.toc-loading-spinner');
    if (spinner) spinner.remove();
}

// Update progress counter during generation
function updateProgressCounter(completed, total) {
    const counter = document.getElementById('present-counter');
    if (counter) {
        if (completed < total) {
            counter.textContent = `Generating: ${completed}/${total} slides ready`;
        } else {
            counter.textContent = `Slide ${presentationPageIndex + 1} of ${total}`;
        }
    }
}

// Enter presentation mode with pre-generated slides
function enterPresentationModeWithSlides(slidesData) {
    // Track total slides for first/last detection
    totalSlidesPlanned = slidesData.length;
    
    const overlay = document.getElementById('presentation-overlay');
    const content = document.getElementById('presentation-content');
    const tocList = document.getElementById('toc-list');
    
    // Clear previous content
    content.innerHTML = '';
    tocList.innerHTML = '';
    
    presentationPageIndex = 0;
    
    // Track topic numbering for hierarchical TOC
    let topicNumber = 0;
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    let subtopicCounters = {}; // Track subtopics per topic
    let currentTopic = '';
    
    // Build all slides at once
    slidesData.forEach((slideData, index) => {
        // Add to TOC with hierarchical structure
        const tocItem = document.createElement('div');
        tocItem.id = `toc-item-${index}`;
        tocItem.onclick = () => jumpToSlide(index);
        
        let tocLabel = '';
        let tocClass = 'toc-item';
        
        switch(slideData.slide_type) {
            case 'intro':
                tocLabel = `<span class="toc-icon">📖</span> ${escapeHtml(slideData.title)}`;
                tocClass += ' toc-intro';
                break;
                
            case 'topic_overview':
                topicNumber++;
                currentTopic = slideData.topic || slideData.title;
                subtopicCounters[currentTopic] = 0;
                const numeral = romanNumerals[topicNumber - 1] || topicNumber;
                tocLabel = `<span class="toc-numeral">${numeral}.</span> ${escapeHtml(slideData.title)}`;
                tocClass += ' toc-topic';
                break;
                
            case 'subtopic':
                subtopicCounters[currentTopic] = (subtopicCounters[currentTopic] || 0) + 1;
                tocLabel = `<span class="toc-bullet">•</span> ${escapeHtml(slideData.title)}`;
                tocClass += ' toc-subtopic';
                break;
                
            case 'summary':
                tocLabel = `<span class="toc-icon">📝</span> ${escapeHtml(slideData.title)}`;
                tocClass += ' toc-summary';
                break;
                
            case 'discussion':
                tocLabel = `<span class="toc-icon">💭</span> ${escapeHtml(slideData.title)}`;
                tocClass += ' toc-discussion';
                break;
                
            case 'quiz':
                tocLabel = `<span class="toc-icon">✏️</span> ${escapeHtml(slideData.title)}`;
                tocClass += ' toc-quiz';
                break;
                
            default:
                tocLabel = escapeHtml(slideData.title);
        }
        
        if (index === 0) tocClass += ' active';
        
        tocItem.className = tocClass;
        tocItem.innerHTML = `<span class="toc-item-title">${tocLabel}</span>`;
        tocList.appendChild(tocItem);
        
        // Add slide
        addSlideToPresentation(slideData, index);
    });
    
    overlay.classList.remove('hidden');
    document.addEventListener('keydown', handlePresentationKeys);
    updatePresentationCounter();
    updatePresentationButtons();
}
document.getElementById('prev-btn').addEventListener('click', () => navigatePage(-1));
document.getElementById('next-btn').addEventListener('click', () => navigatePage(1));
document.getElementById('save-btn').addEventListener('click', saveSlides);
document.getElementById('export-html-main-btn').addEventListener('click', exportAsHTML);
document.getElementById('present-btn').addEventListener('click', enterPresentationMode);
document.getElementById('exit-present-btn').addEventListener('click', exitPresentationMode);
document.getElementById('present-prev-btn').addEventListener('click', () => navigateSlide(-1));
document.getElementById('present-next-btn').addEventListener('click', () => navigateSlide(1));
document.getElementById('present-save-btn').addEventListener('click', saveSlides);
document.getElementById('export-html-btn').addEventListener('click', exportAsHTML);
document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
document.getElementById('print-btn').addEventListener('click', printSlides);
document.getElementById('load-file-input').addEventListener('change', loadSlidesFromFile);
document.getElementById('continue-gen-btn').addEventListener('click', continueImageGeneration);

// Continue generating images for slides that don't have them yet
function continueImageGeneration() {
    if (pages.length === 0) {
        alert('No slides loaded!');
        return;
    }
    
    // Find all slides without images
    const slidesNeedingImages = [];
    pages.forEach((page, index) => {
        const hasImage = page.primaryImageData || page.secondaryImageData || page.imageData;
        if (!hasImage && page.image_prompt) {
            slidesNeedingImages.push({ index, prompt: page.image_prompt });
        }
    });
    
    if (slidesNeedingImages.length === 0) {
        alert('All slides already have images!');
        return;
    }
    
    // Queue all slides for generation
    slidesNeedingImages.forEach(item => {
        if (dualStyleEnabled) {
            imageQueue.push({ index: item.index, prompt: item.prompt, dual: true });
        } else {
            imageQueue.push({ index: item.index, prompt: item.prompt, dual: false });
        }
    });
    
    alert(`Queued ${slidesNeedingImages.length} slides for image generation. This will run in the background.`);
    
    // Start processing
    processImageQueue();
}

// Check if there are slides needing images and show/hide the continue button
function updateContinueButton() {
    const btn = document.getElementById('continue-gen-btn');
    if (!btn || pages.length === 0) {
        if (btn) btn.classList.add('hidden');
        return;
    }
    
    const slidesNeedingImages = pages.filter(page => {
        const hasImage = page.primaryImageData || page.secondaryImageData || page.imageData;
        return !hasImage && page.image_prompt;
    });
    
    if (slidesNeedingImages.length > 0) {
        btn.classList.remove('hidden');
        btn.textContent = `🔄 Continue Image Generation (${slidesNeedingImages.length} remaining)`;
    } else {
        btn.classList.add('hidden');
    }
}

// Progressive processing - process slides one by one and show immediately
async function processTextProgressive() {
    const textInput = document.getElementById('text-input').value.trim();
    
    if (!textInput) {
        showError('Please enter some text to process.');
        return;
    }
    
    if (isProcessing) {
        alert('Already processing. Please wait.');
        return;
    }
    
    isProcessing = true;
    pages = [];
    imageQueue = [];
    presentationPageIndex = 0;
    
    // Hide error, show loading briefly
    document.getElementById('error').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('pages-container').classList.add('hidden');
    
    // Immediately enter presentation mode with empty state
    enterPresentationModeProgressive();
    
    try {
        // First, split text into sections on the server (fast, no AI)
        const sectionsResponse = await fetch('/api/split-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textInput })
        });
        
        if (!sectionsResponse.ok) {
            throw new Error('Failed to split text');
        }
        
        const sectionsData = await sectionsResponse.json();
        const sections = sectionsData.sections;
        
        document.getElementById('loading').classList.add('hidden');
        
        if (sections.length === 0) {
            throw new Error('No sections found in text.');
        }
        
        // Process each section progressively
        for (let i = 0; i < sections.length; i++) {
            await processOneSection(sections[i], i);
        }
        
    } catch (error) {
        showError(error.message);
        document.getElementById('loading').classList.add('hidden');
    } finally {
        isProcessing = false;
        updateProcessingStatus();
    }
}

async function processOneSection(sectionText, index) {
    try {
        // Add placeholder to TOC immediately
        addTOCPlaceholder(index);
        
        // Process this section (AI calls for title, main points, image prompt)
        const response = await fetch('/api/process-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sectionText, index: index })
        });
        
        if (!response.ok) {
            throw new Error('Failed to process section');
        }
        
        const slideData = await response.json();
        slideData.id = index + 1;
        
        // Add to pages array
        pages.push(slideData);
        
        // Update TOC with real title
        updateTOCItem(index, slideData.title);
        
        // Add slide to presentation
        addSlideToPresentation(slideData, index);
        
        // If this is the first slide, show it
        if (index === 0) {
            jumpToSlide(0);
        }
        
        // Queue image generation (auto-generate in background)
        queueImageGeneration(index, slideData.image_prompt);
        
        // Update counter
        updatePresentationCounter();
        
    } catch (error) {
        console.error(`Error processing section ${index}:`, error);
        // Add error placeholder
        updateTOCItem(index, `Section ${index + 1} (error)`);
    }
}

function addTOCPlaceholder(index) {
    const tocList = document.getElementById('toc-list');
    const tocItem = document.createElement('div');
    tocItem.className = 'toc-item loading';
    tocItem.id = `toc-item-${index}`;
    tocItem.innerHTML = `
        <span class="toc-item-number">${index + 1}.</span>
        <span class="toc-item-title">Processing...</span>
        <span class="toc-loading-spinner">⏳</span>
    `;
    tocList.appendChild(tocItem);
}

function updateTOCItem(index, title) {
    const tocItem = document.getElementById(`toc-item-${index}`);
    if (tocItem) {
        tocItem.className = `toc-item ${index === presentationPageIndex ? 'active' : ''}`;
        tocItem.innerHTML = `
            <span class="toc-item-number">${index + 1}.</span>
            <span class="toc-item-title">${escapeHtml(title)}</span>
        `;
        tocItem.onclick = () => jumpToSlide(index);
    }
}

function addSlideToPresentation(slideData, index) {
    const content = document.getElementById('presentation-content');
    
    const slide = document.createElement('div');
    slide.className = `slide ${pages.length === 1 ? 'active' : ''}`;
    slide.id = `slide-${index}`;
    
    slide.innerHTML = `
        <h2 class="slide-title" onclick="editSlideTitle(${index})" title="Click to edit title">${escapeHtml(slideData.title)}</h2>
        
        <div class="slide-body">
            <div class="slide-left">
                <div class="slide-image-container">
                    <div class="slide-image-viewer" id="viewer-${index}">
                        <div class="slide-image-generating">
                            <div class="spinner"></div>
                            <p>Generating dual-style images...</p>
                        </div>
                    </div>
                    <div class="slide-image-controls">
                        <button onclick="toggleDisplayStyle()" class="style-toggle-btn btn-style-toggle">🎨 ${formatStyleName(dualStyleConfig.primary)}</button>
                        <button onclick="zoomImage(${index}, 1.2)">🔍+</button>
                        <button onclick="zoomImage(${index}, 0.8)">🔎-</button>
                        <button onclick="resetImage(${index})">↺</button>
                        <button onclick="regenerateDualImages(${index})" class="btn-regenerate" title="Regenerate images">🔄</button>
                        <button onclick="importImage(${index})" class="btn-import" title="Import your own image">📁</button>
                        <button onclick="toggleSlideOnlyMode()" class="btn-slide-only">${slideOnlyMode ? '◱' : '◳'}</button>
                    </div>
                    <div class="slide-image-prompt-editor">
                        <label><strong>Image Prompt:</strong> <button onclick="generateNewPrompt(${index})" class="btn-generate-prompt" title="Generate a new prompt based on slide content">✨ Generate</button></label>
                        <textarea id="prompt-editor-${index}" class="prompt-textarea">${escapeHtml(slideData.image_prompt || '')}</textarea>
                    </div>
                </div>
            </div>
            
            <div class="slide-resizer" onmousedown="startResize(event)"></div>
            
            <div class="slide-right" id="slide-right-${index}">
                ${slideData.main_points && slideData.main_points.length > 0 ? `
                    <div class="slide-main-points" id="main-points-${index}">
                        <ul>
                            ${slideData.main_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    content.appendChild(slide);
}

// Image generation queue - process one at a time but auto-start
// Now uses dual-style generation by default
function queueImageGeneration(index, prompt) {
    queueDualImageGeneration(index, prompt);
}

async function generateImageForSlide(index, prompt) {
    const viewer = document.getElementById(`viewer-${index}`);
    if (!viewer) return;
    
    try {
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, page_id: index })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate image');
        }
        
        const data = await response.json();
        
        // Single high-quality image
        if (data.image_url) {
            viewer.innerHTML = `<img src="${data.image_url}" alt="Generated illustration" class="slide-image" id="img-${index}">`;
            
            if (pages[index]) {
                pages[index].imageData = data.image_url;
            }
            
            // Initialize with slight delay to ensure DOM is ready
            setTimeout(() => {
                initializeImageViewer(index);
                // Auto-fit on first load
                setTimeout(() => resetImage(index), 100);
            }, 50);
        } else {
            viewer.innerHTML = `<div class="slide-image-placeholder">⚠️ Image generation unavailable<br><button onclick="regenerateImage(${index})" class="btn btn-secondary btn-small">Retry</button></div>`;
        }
        
    } catch (error) {
        viewer.innerHTML = `<div class="slide-image-placeholder">❌ Error: ${escapeHtml(error.message)}<br><button onclick="regenerateImage(${index})" class="btn btn-secondary btn-small">Retry</button></div>`;
    }
}

function selectImage(slideIndex, imageIndex) {
    const page = pages[slideIndex];
    if (!page || !page.allImages) return;
    
    // Update selected image
    page.imageData = page.allImages[imageIndex];
    page.selectedImageIndex = imageIndex;
    
    // Update UI - highlight selected thumbnail
    const grid = document.getElementById(`grid-${slideIndex}`);
    if (grid) {
        grid.querySelectorAll('.image-option').forEach((opt, i) => {
            opt.classList.toggle('selected', i === imageIndex);
        });
    }
}

function maximizeImage(slideIndex, imageIndex) {
    const page = pages[slideIndex];
    if (!page || !page.allImages) return;
    
    const grid = document.getElementById(`grid-${slideIndex}`);
    const maximizedContainer = document.getElementById(`maximized-${slideIndex}`);
    
    if (!grid || !maximizedContainer) return;
    
    // Hide grid, show maximized view
    grid.style.display = 'none';
    maximizedContainer.style.display = 'block';
    
    maximizedContainer.innerHTML = `
        <div class="maximized-image-view">
            <div class="maximized-header">
                <button class="back-btn" onclick="minimizeImage(${slideIndex})">← Back to Grid</button>
                <span class="image-number">Image ${imageIndex + 1} of ${page.allImages.length}</span>
                <button class="select-btn" onclick="selectAndMinimize(${slideIndex}, ${imageIndex})">✓ Select This</button>
            </div>
            <div class="maximized-image-container" id="max-container-${slideIndex}">
                <img src="${page.allImages[imageIndex]}" alt="Image ${imageIndex + 1}" id="max-img-${slideIndex}">
            </div>
            <div class="slide-image-controls">
                <button onclick="zoomMaxImage(${slideIndex}, 1.2)">🔍 Zoom In</button>
                <button onclick="zoomMaxImage(${slideIndex}, 0.8)">🔎 Zoom Out</button>
                <button onclick="resetMaxImage(${slideIndex})">↺ Reset</button>
                <button onclick="prevMaxImage(${slideIndex}, ${imageIndex})">◀ Prev</button>
                <button onclick="nextMaxImage(${slideIndex}, ${imageIndex})">Next ▶</button>
                <button onclick="toggleSlideOnlyMode()" class="btn-slide-only">${slideOnlyMode ? '◱ Exit Slide Only' : '◳ Slide Only'}</button>
            </div>
        </div>
    `;
    
    // Initialize zoom/pan for maximized image
    initializeMaximizedImage(slideIndex);
}

function minimizeImage(slideIndex) {
    const grid = document.getElementById(`grid-${slideIndex}`);
    const maximizedContainer = document.getElementById(`maximized-${slideIndex}`);
    
    if (grid) grid.style.display = 'grid';
    if (maximizedContainer) maximizedContainer.style.display = 'none';
}

function selectAndMinimize(slideIndex, imageIndex) {
    selectImage(slideIndex, imageIndex);
    minimizeImage(slideIndex);
}

function prevMaxImage(slideIndex, currentIndex) {
    const page = pages[slideIndex];
    if (!page || !page.allImages) return;
    const newIndex = (currentIndex - 1 + page.allImages.length) % page.allImages.length;
    maximizeImage(slideIndex, newIndex);
}

function nextMaxImage(slideIndex, currentIndex) {
    const page = pages[slideIndex];
    if (!page || !page.allImages) return;
    const newIndex = (currentIndex + 1) % page.allImages.length;
    maximizeImage(slideIndex, newIndex);
}

// Maximized image zoom state
let maxImageState = { scale: 1, offsetX: 0, offsetY: 0 };

function initializeMaximizedImage(slideIndex) {
    const container = document.getElementById(`max-container-${slideIndex}`);
    const img = document.getElementById(`max-img-${slideIndex}`);
    if (!container || !img) return;
    
    maxImageState = { scale: 1, offsetX: 0, offsetY: 0, isDragging: false };
    
    container.addEventListener('mousedown', (e) => {
        maxImageState.isDragging = true;
        maxImageState.startX = e.clientX - maxImageState.offsetX;
        maxImageState.startY = e.clientY - maxImageState.offsetY;
        container.classList.add('grabbing');
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!maxImageState.isDragging) return;
        maxImageState.offsetX = e.clientX - maxImageState.startX;
        maxImageState.offsetY = e.clientY - maxImageState.startY;
        img.style.transform = `translate(${maxImageState.offsetX}px, ${maxImageState.offsetY}px) scale(${maxImageState.scale})`;
    });
    
    container.addEventListener('mouseup', () => {
        maxImageState.isDragging = false;
        container.classList.remove('grabbing');
    });
    
    container.addEventListener('mouseleave', () => {
        maxImageState.isDragging = false;
        container.classList.remove('grabbing');
    });
    
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomMaxImage(slideIndex, e.deltaY > 0 ? 0.9 : 1.1);
    });
}

function zoomMaxImage(slideIndex, factor) {
    const img = document.getElementById(`max-img-${slideIndex}`);
    if (!img) return;
    maxImageState.scale *= factor;
    maxImageState.scale = Math.max(0.1, Math.min(5, maxImageState.scale));
    img.style.transform = `translate(${maxImageState.offsetX}px, ${maxImageState.offsetY}px) scale(${maxImageState.scale})`;
}

function resetMaxImage(slideIndex) {
    const img = document.getElementById(`max-img-${slideIndex}`);
    if (!img) return;
    maxImageState = { scale: 1, offsetX: 0, offsetY: 0 };
    img.style.transform = '';
}

function regenerateImage(index) {
    if (index >= pages.length) return;
    
    const page = pages[index];
    const viewer = document.getElementById(`viewer-${index}`);
    
    if (viewer) {
        viewer.innerHTML = `
            <div class="slide-image-generating">
                <div class="spinner"></div>
                <p>Regenerating image...</p>
            </div>
        `;
    }
    
    // Add to front of queue for immediate processing
    imageQueue.unshift({ index, prompt: page.image_prompt });
    processImageQueue();
}

// ============================================
// Title Editing Functions
// ============================================

function makeSlideTitle(index, title) {
    // Return HTML for an editable title
    return `<h2 class="slide-title" onclick="editSlideTitle(${index})" title="Click to edit title">${escapeHtml(title)}</h2>`;
}

function editSlideTitle(index) {
    if (index >= pages.length) return;
    
    const slide = document.getElementById(`slide-${index}`);
    if (!slide) return;
    
    const titleEl = slide.querySelector('.slide-title');
    if (!titleEl || titleEl.classList.contains('editing')) return;
    
    const currentTitle = pages[index].title || '';
    
    // Replace title with input field
    titleEl.classList.add('editing');
    titleEl.innerHTML = `
        <input type="text" class="slide-title-input" value="${escapeHtml(currentTitle)}" 
               onblur="saveSlideTitle(${index})" 
               onkeydown="handleTitleKeydown(event, ${index})"
               id="title-input-${index}">
    `;
    
    // Focus and select the input
    const input = document.getElementById(`title-input-${index}`);
    if (input) {
        input.focus();
        input.select();
    }
}

function handleTitleKeydown(event, index) {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveSlideTitle(index);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelTitleEdit(index);
    }
}

function saveSlideTitle(index) {
    if (index >= pages.length) return;
    
    const input = document.getElementById(`title-input-${index}`);
    if (!input) return;
    
    const newTitle = input.value.trim();
    if (!newTitle) {
        cancelTitleEdit(index);
        return;
    }
    
    // Update the pages array
    pages[index].title = newTitle;
    
    // Update the slide title display
    const slide = document.getElementById(`slide-${index}`);
    if (slide) {
        const titleEl = slide.querySelector('.slide-title');
        if (titleEl) {
            titleEl.classList.remove('editing');
            titleEl.innerHTML = escapeHtml(newTitle);
        }
    }
    
    // Update the TOC
    updateTOCTitle(index, newTitle);
    
    console.log(`✓ Title updated for slide ${index}: "${newTitle}"`);
}

function cancelTitleEdit(index) {
    if (index >= pages.length) return;
    
    const slide = document.getElementById(`slide-${index}`);
    if (!slide) return;
    
    const titleEl = slide.querySelector('.slide-title');
    if (titleEl) {
        titleEl.classList.remove('editing');
        titleEl.innerHTML = escapeHtml(pages[index].title || '');
    }
}

function updateTOCTitle(index, newTitle) {
    const tocItem = document.getElementById(`toc-item-${index}`);
    if (!tocItem) return;
    
    const titleSpan = tocItem.querySelector('.toc-item-title');
    if (!titleSpan) return;
    
    // Preserve the icon/prefix but update the text
    const page = pages[index];
    const slideType = page.slide_type || inferSlideType(page, index);
    
    let tocLabel = '';
    switch(slideType) {
        case 'intro':
            tocLabel = `<span class="toc-icon">📖</span> ${escapeHtml(newTitle)}`;
            break;
        case 'topic_overview':
            // Find the roman numeral by counting topics before this index
            let topicNum = 0;
            for (let i = 0; i <= index; i++) {
                if (pages[i]?.slide_type === 'topic_overview') topicNum++;
            }
            const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
            const numeral = romanNumerals[topicNum - 1] || topicNum;
            tocLabel = `<span class="toc-numeral">${numeral}.</span> ${escapeHtml(newTitle)}`;
            break;
        case 'subtopic':
            tocLabel = `<span class="toc-bullet">•</span> ${escapeHtml(newTitle)}`;
            break;
        case 'summary':
            tocLabel = `<span class="toc-icon">📝</span> ${escapeHtml(newTitle)}`;
            break;
        case 'discussion':
            tocLabel = `<span class="toc-icon">💭</span> ${escapeHtml(newTitle)}`;
            break;
        case 'quiz':
            tocLabel = `<span class="toc-icon">✏️</span> ${escapeHtml(newTitle)}`;
            break;
        default:
            tocLabel = escapeHtml(newTitle);
    }
    
    titleSpan.innerHTML = tocLabel;
}

// ============================================
// Image Import Functions
// ============================================

function importImage(index) {
    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            loadImageFile(file, index);
        }
        document.body.removeChild(fileInput);
    };
    
    document.body.appendChild(fileInput);
    fileInput.click();
}

function loadImageFile(file, index) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        
        // Update the viewer
        const viewer = document.getElementById(`viewer-${index}`);
        if (viewer) {
            viewer.innerHTML = `<img src="${dataUrl}" alt="Imported image" class="slide-image" id="img-${index}">`;
            
            // Initialize viewer controls
            setTimeout(() => {
                initializeImageViewer(index);
                setTimeout(() => resetImage(index), 100);
            }, 50);
        }
        
        // Store in pages array based on current display style
        if (pages[index]) {
            if (currentDisplayStyle === 'primary') {
                pages[index].primaryImageData = dataUrl;
            } else {
                pages[index].secondaryImageData = dataUrl;
            }
            // Also store as the generic imageData for compatibility
            pages[index].imageData = dataUrl;
        }
        
        console.log(`✓ Image imported for slide ${index} (${currentDisplayStyle} style)`);
    };
    
    reader.onerror = () => {
        alert('Error reading image file');
    };
    
    reader.readAsDataURL(file);
}

// Regenerate image using the editable prompt textarea
function regenerateImageWithPrompt(index) {
    if (index >= pages.length) return;
    
    // Get the edited prompt from the textarea
    const promptTextarea = document.getElementById(`prompt-editor-${index}`);
    const editedPrompt = promptTextarea ? promptTextarea.value.trim() : '';
    
    if (!editedPrompt) {
        alert('Please enter an image prompt.');
        return;
    }
    
    // Update the stored prompt
    pages[index].image_prompt = editedPrompt;
    
    const viewer = document.getElementById(`viewer-${index}`);
    
    if (viewer) {
        viewer.innerHTML = `
            <div class="slide-image-generating">
                <div class="spinner"></div>
                <p>Regenerating image...</p>
            </div>
        `;
    }
    
    // Add to front of queue for immediate processing
    imageQueue.unshift({ index, prompt: editedPrompt });
    processImageQueue();
}

function enterPresentationModeProgressive() {
    const overlay = document.getElementById('presentation-overlay');
    const content = document.getElementById('presentation-content');
    const tocList = document.getElementById('toc-list');
    
    // Clear previous content
    content.innerHTML = '';
    tocList.innerHTML = '';
    
    presentationPageIndex = 0;
    overlay.classList.remove('hidden');
    
    // Add keyboard navigation
    document.addEventListener('keydown', handlePresentationKeys);
    
    // Show processing status
    updateProcessingStatus();
}

function updateProcessingStatus() {
    const counter = document.getElementById('present-counter');
    if (isProcessing) {
        counter.textContent = `Processing... ${pages.length} slides ready`;
    } else {
        counter.textContent = `Slide ${presentationPageIndex + 1} of ${pages.length}`;
    }
}

function initializeImageViewer(index) {
    const viewer = document.getElementById(`viewer-${index}`);
    const img = document.getElementById(`img-${index}`);
    
    if (!viewer || !img) return;
    
    imageStates[index] = {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        isDragging: false,
        startX: 0,
        startY: 0
    };
    
    // Fit image when loaded
    if (img.complete) {
        fitImageToViewer(index);
    } else {
        img.onload = () => fitImageToViewer(index);
    }
    
    // Pan functionality
    viewer.addEventListener('mousedown', (e) => {
        const state = imageStates[index];
        state.isDragging = true;
        state.startX = e.clientX - state.offsetX;
        state.startY = e.clientY - state.offsetY;
        viewer.classList.add('grabbing');
    });
    
    viewer.addEventListener('mousemove', (e) => {
        const state = imageStates[index];
        if (!state.isDragging) return;
        state.offsetX = e.clientX - state.startX;
        state.offsetY = e.clientY - state.startY;
        updateImageTransform(index);
    });
    
    viewer.addEventListener('mouseup', () => {
        imageStates[index].isDragging = false;
        viewer.classList.remove('grabbing');
    });
    
    viewer.addEventListener('mouseleave', () => {
        imageStates[index].isDragging = false;
        viewer.classList.remove('grabbing');
    });
    
    viewer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoomImage(index, delta);
    });
}

function fitImageToViewer(index) {
    const viewer = document.getElementById(`viewer-${index}`);
    const img = document.getElementById(`img-${index}`);
    
    if (!viewer || !img || !imageStates[index]) return;
    
    const viewerRect = viewer.getBoundingClientRect();
    
    // If viewer has no dimensions (hidden), use default scale of 1
    if (viewerRect.width === 0 || viewerRect.height === 0) {
        imageStates[index].scale = 1;
        imageStates[index].offsetX = 0;
        imageStates[index].offsetY = 0;
        updateImageTransform(index);
        return;
    }
    
    const scale = Math.min(
        viewerRect.width / img.naturalWidth,
        viewerRect.height / img.naturalHeight
    ) * 0.95;
    
    imageStates[index].scale = scale;
    imageStates[index].offsetX = 0;
    imageStates[index].offsetY = 0;
    updateImageTransform(index);
}

// Display pages in non-presentation view (for load functionality)
function displayPages() {
    const container = document.getElementById('pages-content');
    container.innerHTML = '';
    
    // Store page prompts globally for generate image buttons
    if (!window.pagePrompts || window.pagePrompts.length !== pages.length) {
        window.pagePrompts = pages.map(p => p.image_prompt);
    }
    
    pages.forEach((page, index) => {
        const pageDiv = document.createElement('div');
        pageDiv.className = `page ${index === 0 ? 'active' : ''}`;
        pageDiv.id = `page-${index}`;
        
        pageDiv.innerHTML = `
            <h2 class="page-title">${escapeHtml(page.title)}</h2>
            
            <div class="page-content">
                ${formatContent(page.content)}
            </div>
            
            ${page.main_points && page.main_points.length > 0 ? `
                <div class="main-points">
                    <ul>
                        ${page.main_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <div class="image-section">
                <div class="image-container" id="image-container-${index}">
                    ${page.imageData ? `
                        <img src="${page.imageData}" alt="Generated illustration" class="generated-image">
                    ` : `
                        <div class="image-placeholder">
                            🎨 Image will be generated here
                            <div class="image-prompt">
                                <strong>Image Prompt:</strong>
                                ${escapeHtml(page.image_prompt)}
                            </div>
                            <button class="btn btn-generate-image" data-page-index="${index}">
                                Generate Image
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
        
        container.appendChild(pageDiv);
    });
    
    currentPageIndex = 0;
    updatePageCounter();
    updateNavigationButtons();
    document.getElementById('pages-container').classList.remove('hidden');
    
    // Add event listeners to all generate image buttons
    document.querySelectorAll('.btn-generate-image').forEach(button => {
        button.addEventListener('click', function() {
            const pageIndex = parseInt(this.getAttribute('data-page-index'));
            const prompt = window.pagePrompts[pageIndex];
            generateImage(pageIndex, prompt);
        });
    });
}

function formatContent(content) {
    // Convert markdown-style formatting to HTML
    let html = escapeHtml(content);
    
    // Convert line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    
    // Convert markdown headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Convert bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function navigatePage(direction) {
    const newIndex = currentPageIndex + direction;
    
    if (newIndex >= 0 && newIndex < pages.length) {
        document.getElementById(`page-${currentPageIndex}`).classList.remove('active');
        currentPageIndex = newIndex;
        document.getElementById(`page-${currentPageIndex}`).classList.add('active');
        updatePageCounter();
        updateNavigationButtons();
        
        // Scroll to top of page
        document.getElementById('pages-container').scrollIntoView({ behavior: 'smooth' });
    }
}

function updatePageCounter() {
    document.getElementById('page-counter').textContent = 
        `Page ${currentPageIndex + 1} of ${pages.length}`;
}

function updateNavigationButtons() {
    document.getElementById('prev-btn').disabled = currentPageIndex === 0;
    document.getElementById('next-btn').disabled = currentPageIndex === pages.length - 1;
}

function clearInput() {
    document.getElementById('text-input').value = '';
    const outlineInput = document.getElementById('outline-input');
    if (outlineInput) outlineInput.value = '';
    const titleInput = document.getElementById('title-input');
    if (titleInput) titleInput.value = '';
    const discussionInput = document.getElementById('discussion-input');
    if (discussionInput) discussionInput.value = '';
    const quizInput = document.getElementById('quiz-input');
    if (quizInput) quizInput.value = '';
    const fileNameDisplay = document.getElementById('file-name-display');
    if (fileNameDisplay) fileNameDisplay.textContent = '';
    document.getElementById('pages-container').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    pages = [];
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function copyPrompt(prompt) {
    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = prompt;
    const decodedPrompt = textarea.value;
    
    // Copy to clipboard
    navigator.clipboard.writeText(decodedPrompt).then(() => {
        alert('Prompt copied to clipboard! You can now paste it into your favorite image generation tool.');
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback: select and copy
        textarea.value = decodedPrompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('Prompt copied to clipboard!');
    });
}

// Standard presentation mode (for loaded slides or after processing)
function enterPresentationMode() {
    if (pages.length === 0) return;
    
    const overlay = document.getElementById('presentation-overlay');
    const content = document.getElementById('presentation-content');
    
    // Build slides
    content.innerHTML = '';
    pages.forEach((page, index) => {
        const slide = document.createElement('div');
        slide.className = `slide ${index === 0 ? 'active' : ''}`;
        slide.id = `slide-${index}`;
        
        // Determine which image to show based on current display style
        let displayImage = null;
        if (currentDisplayStyle === 'primary' && page.primaryImageData) {
            displayImage = page.primaryImageData;
        } else if (currentDisplayStyle === 'secondary' && page.secondaryImageData) {
            displayImage = page.secondaryImageData;
        } else if (page.imageData) {
            displayImage = page.imageData;
        }
        
        let imageContent = '';
        if (displayImage) {
            imageContent = `
                <div class="slide-image-viewer" id="viewer-${index}">
                    <img src="${displayImage}" alt="Generated illustration" class="slide-image" id="img-${index}">
                </div>
            `;
        } else {
            // No image
            imageContent = `
                <div class="slide-image-viewer" id="viewer-${index}">
                    <div class="slide-image-placeholder">
                        🎨 No image generated yet
                        <button onclick="regenerateDualImages(${index})" class="btn btn-secondary">Generate Images</button>
                    </div>
                </div>
            `;
        }
        
        // Check if this slide has dual images
        const hasDual = page.primaryImageData && page.secondaryImageData;
        
        slide.innerHTML = `
            <h2 class="slide-title" onclick="editSlideTitle(${index})" title="Click to edit title">${escapeHtml(page.title)}</h2>
            
            <div class="slide-body">
                <div class="slide-left">
                    <div class="slide-image-container">
                        ${imageContent}
                        <div class="slide-image-controls">
                            <button onclick="toggleDisplayStyle()" class="style-toggle-btn btn-style-toggle" ${!hasDual ? 'disabled title="Only one style available"' : ''}>🎨 ${formatStyleName(currentDisplayStyle === 'primary' ? dualStyleConfig.primary : dualStyleConfig.secondary)}</button>
                            <button onclick="zoomImage(${index}, 1.2)">🔍+</button>
                            <button onclick="zoomImage(${index}, 0.8)">🔎-</button>
                            <button onclick="resetImage(${index})">↺</button>
                            <button onclick="regenerateDualImages(${index})" class="btn-regenerate" title="Regenerate images">🔄</button>
                            <button onclick="importImage(${index})" class="btn-import" title="Import your own image">📁</button>
                            <button onclick="toggleSlideOnlyMode()" class="btn-slide-only">${slideOnlyMode ? '◱' : '◳'}</button>
                        </div>
                        <div class="slide-image-prompt-editor">
                            <label><strong>Image Prompt:</strong> <button onclick="generateNewPrompt(${index})" class="btn-generate-prompt" title="Generate a new prompt based on slide content">✨ Generate</button></label>
                            <textarea id="prompt-editor-${index}" class="prompt-textarea">${escapeHtml(page.image_prompt || '')}</textarea>
                        </div>
                    </div>
                </div>
                
                <div class="slide-resizer" onmousedown="startResize(event)"></div>
                
                <div class="slide-right" id="slide-right-${index}">
                    ${page.main_points && page.main_points.length > 0 ? `
                        <div class="slide-main-points" id="main-points-${index}">
                            <ul>
                                ${page.main_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
        `;
        
        content.appendChild(slide);
    });

    presentationPageIndex = 0;
    updatePresentationCounter();
    updatePresentationButtons();
    updateStyleToggleButton();
    updateContinueButton();
    overlay.classList.remove('hidden');
    
    // Build table of contents
    buildTOC();
    
    // Add keyboard navigation
    document.addEventListener('keydown', handlePresentationKeys);
    
    // Initialize image pan/zoom for generated images
    initializeImageViewers();
}

function buildTOC() {
    const tocList = document.getElementById('toc-list');
    tocList.innerHTML = '';
    
    // Track topic numbering for hierarchical TOC
    let topicNumber = 0;
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    let currentTopic = '';
    
    pages.forEach((page, index) => {
        const tocItem = document.createElement('div');
        tocItem.id = `toc-item-${index}`;
        tocItem.onclick = () => jumpToSlide(index);
        
        let tocLabel = '';
        let tocClass = 'toc-item';
        
        // Determine type based on slide_type or infer from title
        const slideType = page.slide_type || inferSlideType(page, index);
        
        switch(slideType) {
            case 'intro':
                tocLabel = `<span class="toc-icon">📖</span> ${escapeHtml(page.title)}`;
                tocClass += ' toc-intro';
                break;
                
            case 'topic_overview':
                topicNumber++;
                currentTopic = page.topic || page.title;
                const numeral = romanNumerals[topicNumber - 1] || topicNumber;
                tocLabel = `<span class="toc-numeral">${numeral}.</span> ${escapeHtml(page.title)}`;
                tocClass += ' toc-topic';
                break;
                
            case 'subtopic':
                tocLabel = `<span class="toc-bullet">•</span> ${escapeHtml(page.title)}`;
                tocClass += ' toc-subtopic';
                break;
                
            case 'summary':
                tocLabel = `<span class="toc-icon">📝</span> ${escapeHtml(page.title)}`;
                tocClass += ' toc-summary';
                break;
                
            case 'discussion':
                tocLabel = `<span class="toc-icon">💭</span> ${escapeHtml(page.title)}`;
                tocClass += ' toc-discussion';
                break;
                
            case 'quiz':
                tocLabel = `<span class="toc-icon">✏️</span> ${escapeHtml(page.title)}`;
                tocClass += ' toc-quiz';
                break;
                
            default:
                // Fallback for old slides without slide_type
                tocLabel = `<span class="toc-item-number">${index + 1}.</span> ${escapeHtml(page.title)}`;
        }
        
        if (index === 0) tocClass += ' active';
        
        tocItem.className = tocClass;
        tocItem.innerHTML = `<span class="toc-item-title">${tocLabel}</span>`;
        tocList.appendChild(tocItem);
    });
}

// Infer slide type for older slides that don't have slide_type
function inferSlideType(page, index) {
    const title = (page.title || '').toLowerCase();
    if (index === 0 || title.includes('intro') || title.includes('chapter')) return 'intro';
    if (title.includes('summary') || title.includes('conclusion')) return 'summary';
    if (title.includes('discussion') || title.includes('thought')) return 'discussion';
    if (title.includes('quiz') || title.includes('test')) return 'quiz';
    return null; // Unknown type
}

function jumpToSlide(index) {
    if (index >= 0 && index < pages.length) {
        const currentSlide = document.getElementById(`slide-${presentationPageIndex}`);
        if (currentSlide) currentSlide.classList.remove('active');
        
        presentationPageIndex = index;
        
        const newSlide = document.getElementById(`slide-${presentationPageIndex}`);
        if (newSlide) newSlide.classList.add('active');
        
        updatePresentationCounter();
        updatePresentationButtons();
        updateTOCActive();
        
        // Auto-reset image to fit properly (with delay for DOM to update)
        setTimeout(() => resetImage(index), 50);
    }
}

function printSlides() {
    if (pages.length === 0) {
        alert('No slides to print!');
        return;
    }
    
    // Make sure we're in presentation mode for printing all slides
    const overlay = document.getElementById('presentation-overlay');
    const wasHidden = overlay.classList.contains('hidden');
    
    if (wasHidden) {
        // Temporarily enter presentation mode to print
        enterPresentationMode();
    }
    
    // Short delay to ensure DOM is ready
    setTimeout(() => {
        window.print();
        
        // If we temporarily entered presentation mode, exit after printing
        if (wasHidden) {
            setTimeout(() => {
                exitPresentationMode();
            }, 500);
        }
    }, 100);
}

// Image zoom and pan functionality
let imageStates = {};

function initializeImageViewers() {
    pages.forEach((page, index) => {
        initializeImageViewer(index);
    });
}

function zoomImage(index, factor) {
    const state = imageStates[index];
    if (!state) return;
    
    state.scale *= factor;
    state.scale = Math.max(0.1, Math.min(5, state.scale)); // Limit zoom
    updateImageTransform(index);
}

function resetImage(index) {
    const state = imageStates[index];
    const img = document.getElementById(`img-${index}`);
    
    if (!state || !img) return;
    
    // Reset position first
    state.offsetX = 0;
    state.offsetY = 0;
    
    // Fit to viewer (will handle hidden viewers gracefully)
    fitImageToViewer(index);
    
    // If viewer was hidden, try again after a delay
    const viewer = document.getElementById(`viewer-${index}`);
    if (viewer) {
        const viewerRect = viewer.getBoundingClientRect();
        if (viewerRect.width === 0 || viewerRect.height === 0) {
            setTimeout(() => fitImageToViewer(index), 100);
        }
    }
}

function updateImageTransform(index) {
    const img = document.getElementById(`img-${index}`);
    const state = imageStates[index];
    
    if (!img || !state) return;
    
    img.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
}

// Resizer functionality
let isResizing = false;
let startX = 0;
let startWidth = 0;

function startResize(e) {
    isResizing = true;
    startX = e.clientX;
    const slideLeft = e.target.previousElementSibling;
    startWidth = slideLeft.offsetWidth;
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
}

function handleResize(e) {
    if (!isResizing) return;
    
    const delta = e.clientX - startX;
    const slideBody = document.querySelector('.slide.active .slide-body');
    const slideLeft = slideBody.querySelector('.slide-left');
    const newWidth = startWidth + delta;
    const bodyWidth = slideBody.offsetWidth;
    const percentage = (newWidth / bodyWidth) * 100;
    
    // Limit between 30% and 85%
    if (percentage >= 30 && percentage <= 85) {
        slideLeft.style.flex = `0 0 ${percentage}%`;
    }
}

function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
}

function exitPresentationMode() {
    const overlay = document.getElementById('presentation-overlay');
    overlay.classList.add('hidden');
    
    // Reset slide-only mode
    slideOnlyMode = false;
    overlay.classList.remove('slide-only-mode');
    
    // Exit fullscreen if active
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    
    // Remove keyboard navigation
    document.removeEventListener('keydown', handlePresentationKeys);
    
    // Also update non-presentation view
    if (pages.length > 0) {
        displayPages();
    }
}

function navigateSlide(direction) {
    const newIndex = presentationPageIndex + direction;
    
    if (newIndex >= 0 && newIndex < pages.length) {
        const currentSlide = document.getElementById(`slide-${presentationPageIndex}`);
        if (currentSlide) currentSlide.classList.remove('active');
        
        presentationPageIndex = newIndex;
        
        const newSlide = document.getElementById(`slide-${presentationPageIndex}`);
        if (newSlide) newSlide.classList.add('active');
        
        updatePresentationCounter();
        updatePresentationButtons();
        updateTOCActive();
        
        // Auto-reset image to fit properly (with delay for DOM to update)
        setTimeout(() => resetImage(newIndex), 50);
    }
}

function updateTOCActive() {
    // Update active state in TOC
    document.querySelectorAll('.toc-item').forEach((item, index) => {
        if (index === presentationPageIndex) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function updatePresentationCounter() {
    const counter = document.getElementById('present-counter');
    const slideOnlyCounter = document.getElementById('slide-only-counter');
    
    if (isProcessing) {
        counter.textContent = `Processing... ${pages.length} slides ready`;
        if (slideOnlyCounter) slideOnlyCounter.textContent = `${pages.length} slides`;
    } else if (pages.length > 0) {
        counter.textContent = `Slide ${presentationPageIndex + 1} of ${pages.length}`;
        if (slideOnlyCounter) slideOnlyCounter.textContent = `${presentationPageIndex + 1} / ${pages.length}`;
    } else {
        counter.textContent = 'Loading...';
        if (slideOnlyCounter) slideOnlyCounter.textContent = '...';
    }
}

function updatePresentationButtons() {
    document.getElementById('present-prev-btn').disabled = presentationPageIndex === 0;
    document.getElementById('present-next-btn').disabled = presentationPageIndex === pages.length - 1;
}

function toggleFullscreen() {
    const overlay = document.getElementById('presentation-overlay');
    
    if (!document.fullscreenElement) {
        overlay.requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function toggleSlideOnlyMode() {
    slideOnlyMode = !slideOnlyMode;
    const overlay = document.getElementById('presentation-overlay');
    
    if (slideOnlyMode) {
        overlay.classList.add('slide-only-mode');
        // Also enter fullscreen if not already
        if (!document.fullscreenElement) {
            overlay.requestFullscreen().catch(err => {
                console.error('Error entering fullscreen:', err);
            });
        }
    } else {
        overlay.classList.remove('slide-only-mode');
    }
    
    // Update all button labels
    updateSlideOnlyButtons();
}

function updateSlideOnlyButtons() {
    const buttons = document.querySelectorAll('.btn-slide-only');
    buttons.forEach(btn => {
        btn.textContent = slideOnlyMode ? '◱ Exit Slide Only' : '◳ Slide Only';
    });
}

function handlePresentationKeys(e) {
    // Only allow PageUp, PageDown, and Escape to avoid interference with typing
    if (e.key === 'PageUp') {
        e.preventDefault();
        navigateSlide(-1);
    } else if (e.key === 'PageDown') {
        e.preventDefault();
        navigateSlide(1);
    } else if (e.key === 'Escape') {
        if (slideOnlyMode) {
            toggleSlideOnlyMode(); // Exit slide-only mode first
        } else {
            exitPresentationMode();
        }
    }
    // Removed: 'f'/'F' for fullscreen and 's'/'S' for slide-only mode
    // to allow typing in the window without keyboard shortcut interference
}

function saveSlides() {
    if (pages.length === 0) {
        alert('No slides to save!');
        return;
    }
    
    // Collect all generated images including dual-style
    const slidesData = pages.map((page, index) => {
        return {
            id: page.id,
            title: page.title,
            content: page.content,
            main_points: page.main_points,
            image_prompt: page.image_prompt,
            bracketed_terms: page.bracketed_terms,
            // Dual-style image data
            primaryImageData: page.primaryImageData || null,
            secondaryImageData: page.secondaryImageData || null,
            primaryStyle: page.primaryStyle || dualStyleConfig.primary,
            secondaryStyle: page.secondaryStyle || dualStyleConfig.secondary,
            // Backwards compatibility
            imageData: page.imageData || page.primaryImageData || null,
            slide_type: page.slide_type || null,
            topic: page.topic || null
        };
    });
    
    const saveData = {
        version: '3.0',  // Updated version for dual-style support
        timestamp: new Date().toISOString(),
        dualStyleConfig: dualStyleConfig,
        slides: slidesData
    };
    
    // Create blob and download
    const dataStr = JSON.stringify(saveData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `slides_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('Slides saved successfully!');
}

function loadSlidesFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.slides || !Array.isArray(data.slides)) {
                throw new Error('Invalid slides file format');
            }
            
            // Load dual-style config if present
            if (data.dualStyleConfig) {
                dualStyleConfig = data.dualStyleConfig;
                updateStyleToggleButton();
            }
            
            // Load the slides
            pages = data.slides;
            
            // Ensure backwards compatibility - if no dual images, use imageData
            pages.forEach(page => {
                if (!page.primaryImageData && page.imageData) {
                    page.primaryImageData = page.imageData;
                }
            });
            
            // Display the pages
            displayPages();
            
            // Check if there are slides needing images
            updateContinueButton();
            
            const dualCount = pages.filter(p => p.primaryImageData && p.secondaryImageData).length;
            const needingImages = pages.filter(p => !p.primaryImageData && !p.secondaryImageData && !p.imageData && p.image_prompt).length;
            let msg = `Loaded ${pages.length} slides successfully! (${dualCount} with dual-style images)`;
            if (needingImages > 0) {
                msg += `\n\n${needingImages} slides still need images. Click "Continue Image Generation" to generate them.`;
            }
            alert(msg);
            
            // Clear the file input so the same file can be loaded again
            event.target.value = '';
            
        } catch (error) {
            alert('Error loading slides: ' + error.message);
            console.error('Error loading slides:', error);
        }
    };
    
    reader.readAsText(file);
}

// Legacy function for non-progressive image generation
async function generateImage(pageIndex, prompt) {
    const container = document.getElementById(`image-container-${pageIndex}`);
    const placeholder = container.querySelector('.image-placeholder');
    
    // Show loading state
    placeholder.innerHTML = '<div class="spinner"></div><p>Generating image...</p>';
    
    try {
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                page_id: pageIndex
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate image');
        }
        
        const data = await response.json();
        
        if (data.image_url) {
            container.innerHTML = `
                <img src="${data.image_url}" alt="Generated illustration" class="generated-image">
                <div class="image-prompt">
                    <strong>Prompt used:</strong> ${escapeHtml(prompt)}
                </div>
            `;
            
            // Store in pages array
            if (pages[pageIndex]) {
                pages[pageIndex].imageData = data.image_url;
            }
        } else {
            placeholder.innerHTML = `
                <div class="image-prompt-box">
                    <strong>📝 Image Prompt Generated:</strong>
                    <div class="prompt-text">${escapeHtml(prompt)}</div>
                    <div class="info-message">
                        <small>${escapeHtml(data.note || 'Image generation is not yet configured.')}</small>
                    </div>
                </div>
            `;
        }
        
    } catch (error) {
        placeholder.innerHTML = `
            <div class="error">
                Error generating image: ${escapeHtml(error.message)}
                <br><br>
                <button class="btn btn-secondary" onclick="location.reload()">Try Again</button>
            </div>
        `;
    }
}

// Store page prompts globally for easy access
window.pagePrompts = [];

// Deduplicate images to reduce exported HTML file size
function deduplicateImages(slidesArray) {
    const imageLookup = {};
    const imageToHash = new Map();
    
    // Simple hash function for strings
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < Math.min(str.length, 1000); i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        // Add length to make hash more unique
        return Math.abs(hash).toString(36) + '_' + str.length.toString(36);
    }
    
    // First pass: collect all unique images
    slidesArray.forEach(slide => {
        ['primaryImageData', 'secondaryImageData', 'imageData'].forEach(field => {
            const imgData = slide[field];
            if (imgData && typeof imgData === 'string' && imgData.startsWith('data:image/')) {
                if (!imageToHash.has(imgData)) {
                    const hash = simpleHash(imgData);
                    imageToHash.set(imgData, hash);
                    imageLookup[hash] = imgData;
                }
            }
        });
    });
    
    // Second pass: replace image data with references
    const deduplicatedPages = slidesArray.map(slide => {
        const newSlide = {...slide};
        ['primaryImageData', 'secondaryImageData', 'imageData'].forEach(field => {
            const imgData = newSlide[field];
            if (imgData && imageToHash.has(imgData)) {
                newSlide[field] = 'IMG_REF:' + imageToHash.get(imgData);
            }
        });
        return newSlide;
    });
    
    const originalCount = slidesArray.length * 3; // 3 image fields per slide
    const uniqueCount = Object.keys(imageLookup).length;
    console.log(`Image deduplication: ${uniqueCount} unique images (was ${originalCount} total references)`);
    
    return { deduplicatedPages, imageLookup };
}

// Export slides as lightweight HTML wrapper that loads JSON
async function exportAsHTML() {
    if (pages.length === 0) {
        alert('No slides to export!');
        return;
    }
    
    // Determine filename from first slide title
    // Keep alphanumeric chars and ensure it ends with "Slides"
    let baseFilename = pages[0]?.title.replace(/[^a-z0-9]/gi, '') || 'Chapter';
    if (!baseFilename.toLowerCase().endsWith('slides')) {
        baseFilename += 'Slides';
    }
    const jsonFilename = baseFilename + '.json';
    const htmlFilename = baseFilename + '.html';
    
    // Save JSON file first (with all slide data)
    const jsonBlob = new Blob([JSON.stringify(pages, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = jsonFilename;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);
    
    // Fetch current CSS
    const cssResponse = await fetch('style.css');
    const cssContent = await cssResponse.text();
    
    // Fetch minimal JS (just the viewing/presentation logic, not the generation logic)
    const jsResponse = await fetch('script.js');
    let jsContent = await jsResponse.text();
    
    // Remove variable declarations that we'll redefine
    jsContent = jsContent.replace(/^let currentPageIndex = 0;?\s*/m, '');
    jsContent = jsContent.replace(/^let pages = \[\];?\s*/m, '');
    jsContent = jsContent.replace(/^let presentationPageIndex = 0;?\s*/m, '');
    jsContent = jsContent.replace(/^let isProcessing = false;?\s*/m, '');
    jsContent = jsContent.replace(/^let imageQueue = \[\];?\s*/m, '');
    jsContent = jsContent.replace(/^let isGeneratingImage = false;?\s*/m, '');
    
    // Remove event listeners for editing/generation features
    jsContent = jsContent.replace(/document\.getElementById\('process-btn'\).*?processText.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('clear-btn'\).*?clearInput.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('load-file-input'\).*?loadSlidesFromFile.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('export-html-main-btn'\).*?exportAsHTML.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('export-html-btn'\).*?exportAsHTML.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('save-btn'\).*?saveSlides.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('present-save-btn'\).*?saveSlides.*?\);?/g, '');
    
    // Remove the exportAsHTML function
    jsContent = jsContent.replace(/\/\/ Export slides as lightweight HTML wrapper[\s\S]*?alert\('HTML wrapper and JSON[^}]*\}\s*\n/m, '');
    
    // Create minimal HTML wrapper
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pages[0]?.title || 'Lecture Slides')} - Slides</title>
    <style>
${cssContent}
    
    /* Hide input/editing sections for exported version */
    .input-section,
    .btn-load,
    #load-file-input,
    #export-html-btn,
    #export-html-main-btn,
    #save-btn,
    #present-save-btn {
        display: none !important;
    }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📚 ${escapeHtml(pages[0]?.title || 'Lecture Slides')}</h1>
            <p class="subtitle">Interactive presentation</p>
        </header>

        <div class="input-section" style="display: none;"></div>

        <div id="loading" class="loading">
            <div class="spinner"></div>
            <p>Loading slides...</p>
        </div>

        <div id="pages-container" class="pages-container hidden">
            <div class="pages-header">
                <h2>Lecture Slides</h2>
                <div class="controls">
                    <button id="prev-btn" class="btn btn-nav">← Previous</button>
                    <span id="page-counter">Page 1 of 1</span>
                    <button id="next-btn" class="btn btn-nav">Next →</button>
                    <button id="present-btn" class="btn btn-present">🎬 Present Slides</button>
                </div>
            </div>
            
            <div id="pages-content"></div>
        </div>

        <!-- Presentation Mode Overlay -->
        <div id="presentation-overlay" class="presentation-overlay hidden">
            <!-- Permanent TOC Sidebar on Left -->
            <div id="toc-sidebar" class="toc-sidebar">
                <div class="toc-header">
                    <h3>Contents</h3>
                </div>
                <div id="toc-list" class="toc-list"></div>
            </div>
            
            <!-- Main presentation area -->
            <div class="presentation-main">
                <div class="presentation-controls">
                    <button id="present-prev-btn" class="btn btn-present-nav">← Prev</button>
                    <span id="present-counter">Slide 1 of 1</span>
                    <button id="present-next-btn" class="btn btn-present-nav">Next →</button>
                    <button id="global-style-toggle" class="btn btn-style-toggle style-toggle-btn" onclick="toggleDisplayStyle()">🎨 Style</button>
                    <button id="print-btn" class="btn btn-save">🖨️ Print/PDF</button>
                    <button id="fullscreen-btn" class="btn btn-fullscreen">⛶ Full</button>
                    <button id="exit-present-btn" class="btn btn-exit">✕ Exit</button>
                </div>
                
                <div id="presentation-content" class="presentation-content"></div>
            </div>
            
            <!-- Slide-only mode floating navigation -->
            <div class="slide-only-nav" id="slide-only-nav">
                <button onclick="navigateSlide(-1)">← Prev</button>
                <span class="nav-counter" id="slide-only-counter">1 / 1</span>
                <button onclick="navigateSlide(1)">Next →</button>
                <button onclick="toggleSlideOnlyMode()">✕ Exit Slide Only</button>
                <span class="nav-hint">(PgUp/PgDown to navigate, Esc to exit)</span>
            </div>
        </div>

        <div id="error" class="error hidden"></div>
    </div>

    <script>
// Initialize variables
let currentPageIndex = 0;
let pages = [];
let presentationPageIndex = 0;
let isProcessing = false;
let imageQueue = [];
let isGeneratingImage = false;

// Load slides from JSON file (auto-detects filename from HTML name)
async function loadSlidesFromJSON() {
    // Get JSON filename by replacing .html with .json in current page URL
    const htmlPath = window.location.pathname;
    const htmlFilename = htmlPath.substring(htmlPath.lastIndexOf('/') + 1);
    const jsonFilename = htmlFilename.replace(/\.html?$/i, '.json');
    
    try {
        const response = await fetch(jsonFilename);
        if (!response.ok) {
            throw new Error('Failed to load ' + jsonFilename + ': ' + response.statusText);
        }
        pages = await response.json();
        
        // Update page counter
        document.getElementById('page-counter').textContent = 'Page 1 of ' + pages.length;
        document.getElementById('present-counter').textContent = 'Slide 1 of ' + pages.length;
        document.getElementById('slide-only-counter').textContent = '1 / ' + pages.length;
        
        // Display pages
        displayPages();
        document.getElementById('pages-container').classList.remove('hidden');
        document.getElementById('loading').classList.add('hidden');
    } catch (error) {
        document.getElementById('loading').innerHTML = 
            '<div class="error">Error loading slides: ' + error.message + 
            '<br><br>Make sure <strong>' + jsonFilename + '</strong> is in the same folder as this HTML file.</div>';
        console.error('Error loading slides:', error);
    }
}

// Load slides when page loads
window.addEventListener('DOMContentLoaded', loadSlidesFromJSON);

${jsContent}
    </script>
</body>
</html>`;
    
    // Create and download HTML file
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    const htmlLink = document.createElement('a');
    htmlLink.href = htmlUrl;
    htmlLink.download = htmlFilename;
    document.body.appendChild(htmlLink);
    htmlLink.click();
    document.body.removeChild(htmlLink);
    URL.revokeObjectURL(htmlUrl);
    
    alert('HTML wrapper and JSON files exported!\n\nFiles created:\n• ' + htmlFilename + ' (lightweight wrapper)\n• ' + jsonFilename + ' (slide data)\n\nPlace both files in the same folder and open the HTML file in any browser.');
}

// Adjust text balance between main points and full text
function adjustTextBalance(slideIndex, value) {
    const mainPoints = document.getElementById(`main-points-${slideIndex}`);
    const fullText = document.getElementById(`full-text-${slideIndex}`);
    const label = document.getElementById(`balance-label-${slideIndex}`);
    
    if (!mainPoints || !fullText) return;
    
    // Convert 0-100 slider to flex values
    // 0 = all full text, 100 = all main points
    // Default 75 = 3:1 ratio (main points prioritized)
    const mainPointsFlex = value / 25; // 0 to 4
    const fullTextFlex = (100 - value) / 25; // 4 to 0
    
    mainPoints.style.flex = mainPointsFlex;
    fullText.style.flex = fullTextFlex;
    
    // Update label
    if (value > 80) {
        label.textContent = 'Main Points Only';
    } else if (value > 60) {
        label.textContent = 'Main Points ↔ Full Text';
    } else if (value > 40) {
        label.textContent = 'Balanced';
    } else if (value > 20) {
        label.textContent = 'Full Text ↔ Main Points';
    } else {
        label.textContent = 'Full Text Only';
    }
}
