let currentPageIndex = 0;
let pages = [];
let presentationPageIndex = 0;
let isProcessing = false;
let imageQueue = [];
let isGeneratingImage = false;

document.getElementById('process-btn').addEventListener('click', processTextProgressive);
document.getElementById('clear-btn').addEventListener('click', clearInput);
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
        <h2 class="slide-title">${escapeHtml(slideData.title)}</h2>
        
        <div class="slide-body">
            <div class="slide-left">
                <div class="slide-image-container">
                    <div class="slide-image-viewer" id="viewer-${index}">
                        <div class="slide-image-generating">
                            <div class="spinner"></div>
                            <p>Generating image...</p>
                        </div>
                    </div>
                    <div class="slide-image-controls">
                        <button onclick="zoomImage(${index}, 1.2)">🔍 Zoom In</button>
                        <button onclick="zoomImage(${index}, 0.8)">🔎 Zoom Out</button>
                        <button onclick="resetImage(${index})">↺ Reset</button>
                        <button onclick="regenerateImage(${index})" class="btn-regenerate">🔄 Regenerate</button>
                    </div>
                    <div class="slide-image-prompt">
                        <strong>Image Prompt:</strong>
                        ${escapeHtml(slideData.image_prompt.substring(0, 200))}...
                    </div>
                </div>
            </div>
            
            <div class="slide-resizer" onmousedown="startResize(event)"></div>
            
            <div class="slide-right" id="slide-right-${index}">
                <div class="text-balance-control">
                    <label>Text Balance: <span id="balance-label-${index}">Main Points ↔ Full Text</span></label>
                    <input type="range" min="0" max="100" value="75" class="text-balance-slider" 
                           id="balance-slider-${index}" 
                           oninput="adjustTextBalance(${index}, this.value)">
                </div>
                
                ${slideData.main_points && slideData.main_points.length > 0 ? `
                    <div class="slide-main-points" id="main-points-${index}">
                        <ul>
                            ${slideData.main_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                <div class="slide-text" id="full-text-${index}">
                    <h3>Full Text</h3>
                    ${formatContent(slideData.content)}
                </div>
            </div>
        </div>
    `;
    
    content.appendChild(slide);
}

// Image generation queue - process one at a time but auto-start
function queueImageGeneration(index, prompt) {
    imageQueue.push({ index, prompt });
    processImageQueue();
}

async function processImageQueue() {
    if (isGeneratingImage || imageQueue.length === 0) return;
    
    isGeneratingImage = true;
    const { index, prompt } = imageQueue.shift();
    
    try {
        await generateImageForSlide(index, prompt);
    } catch (error) {
        console.error(`Error generating image for slide ${index}:`, error);
    }
    
    isGeneratingImage = false;
    
    // Process next in queue
    if (imageQueue.length > 0) {
        processImageQueue();
    }
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
        
        // Single image only
        let imageContent = '';
        if (page.imageData) {
            imageContent = `
                <div class="slide-image-viewer" id="viewer-${index}">
                    <img src="${page.imageData}" alt="Generated illustration" class="slide-image" id="img-${index}">
                </div>
            `;
        } else {
            // No image
            imageContent = `
                <div class="slide-image-viewer" id="viewer-${index}">
                    <div class="slide-image-placeholder">
                        🎨 No image generated yet
                        <button onclick="regenerateImage(${index})" class="btn btn-secondary">Generate Image</button>
                    </div>
                </div>
            `;
        }
        
        slide.innerHTML = `
            <h2 class="slide-title">${escapeHtml(page.title)}</h2>
            
            <div class="slide-body">
                <div class="slide-left">
                    <div class="slide-image-container">
                        ${imageContent}
                        <div class="slide-image-controls">
                            <button onclick="zoomImage(${index}, 1.2)">🔍 Zoom In</button>
                            <button onclick="zoomImage(${index}, 0.8)">🔎 Zoom Out</button>
                            <button onclick="resetImage(${index})">↺ Reset</button>
                            <button onclick="regenerateImage(${index})" class="btn-regenerate">🔄 Regenerate</button>
                        </div>
                        <div class="slide-image-prompt">
                            <strong>Image Prompt:</strong>
                            ${escapeHtml(page.image_prompt ? page.image_prompt.substring(0, 200) : '')}...
                        </div>
                    </div>
                </div>
                
                <div class="slide-resizer" onmousedown="startResize(event)"></div>
                
                <div class="slide-right" id="slide-right-${index}">
                    <div class="text-balance-control">
                        <label>Text Balance: <span id="balance-label-${index}">Main Points ↔ Full Text</span></label>
                        <input type="range" min="0" max="100" value="75" class="text-balance-slider" 
                               id="balance-slider-${index}" 
                               oninput="adjustTextBalance(${index}, this.value)">
                    </div>
                    
                    ${page.main_points && page.main_points.length > 0 ? `
                        <div class="slide-main-points" id="main-points-${index}">
                            <ul>
                                ${page.main_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div class="slide-text" id="full-text-${index}">
                        <h3>Full Text</h3>
                        ${formatContent(page.content)}
                    </div>
                </div>
        `;
        
        content.appendChild(slide);
    });
    
    presentationPageIndex = 0;
    updatePresentationCounter();
    updatePresentationButtons();
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
    
    pages.forEach((page, index) => {
        const tocItem = document.createElement('div');
        tocItem.className = `toc-item ${index === 0 ? 'active' : ''}`;
        tocItem.id = `toc-item-${index}`;
        tocItem.innerHTML = `
            <span class="toc-item-number">${index + 1}.</span>
            <span class="toc-item-title">${escapeHtml(page.title)}</span>
        `;
        tocItem.onclick = () => jumpToSlide(index);
        tocList.appendChild(tocItem);
    });
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
    if (isProcessing) {
        counter.textContent = `Processing... ${pages.length} slides ready`;
    } else if (pages.length > 0) {
        counter.textContent = `Slide ${presentationPageIndex + 1} of ${pages.length}`;
    } else {
        counter.textContent = 'Loading...';
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

function handlePresentationKeys(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        navigateSlide(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        navigateSlide(1);
    } else if (e.key === 'Escape') {
        exitPresentationMode();
    } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
    }
}

function saveSlides() {
    if (pages.length === 0) {
        alert('No slides to save!');
        return;
    }
    
    // Collect all generated images
    const slidesData = pages.map((page, index) => {
        return {
            id: page.id,
            title: page.title,
            content: page.content,
            main_points: page.main_points,
            image_prompt: page.image_prompt,
            bracketed_terms: page.bracketed_terms,
            imageData: page.imageData || null
        };
    });
    
    const saveData = {
        version: '2.0',  // Updated version for new format
        timestamp: new Date().toISOString(),
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
            
            // Load the slides
            pages = data.slides;
            
            // Display the pages
            displayPages();
            
            alert(`Loaded ${pages.length} slides successfully!`);
            
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

// Export slides as standalone HTML file
async function exportAsHTML() {
    if (pages.length === 0) {
        alert('No slides to export!');
        return;
    }
    
    // Fetch current CSS and JS
    const cssResponse = await fetch('style.css');
    const cssContent = await cssResponse.text();
    
    const jsResponse = await fetch('script.js');
    let jsContent = await jsResponse.text();
    
    // Remove the top-level variable declarations (we'll add them in the embedded section)
    jsContent = jsContent.replace(/^let currentPageIndex = 0;?\s*/m, '');
    jsContent = jsContent.replace(/^let pages = \[\];?\s*/m, '');
    jsContent = jsContent.replace(/^let presentationPageIndex = 0;?\s*/m, '');
    jsContent = jsContent.replace(/^let isProcessing = false;?\s*/m, '');
    jsContent = jsContent.replace(/^let imageQueue = \[\];?\s*/m, '');
    jsContent = jsContent.replace(/^let isGeneratingImage = false;?\s*/m, '');
    jsContent = jsContent.replace(/^let imageStates = \{\};?\s*/m, '');
    
    // Remove event listeners that reference non-existent elements in exported version
    jsContent = jsContent.replace(/document\.getElementById\('process-btn'\).*?processTextProgressive.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('clear-btn'\).*?clearInput.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('load-file-input'\).*?loadSlidesFromFile.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('export-html-main-btn'\).*?exportAsHTML.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('export-html-btn'\).*?exportAsHTML.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('save-btn'\).*?saveSlides.*?\);?/g, '');
    jsContent = jsContent.replace(/document\.getElementById\('present-save-btn'\).*?saveSlides.*?\);?/g, '');
    
    // Remove the exportAsHTML function itself (no recursion!)
    // Match from the comment before the function through the entire function body
    // Using a more specific pattern that matches the end of the function
    jsContent = jsContent.replace(/\/\/ Export slides as standalone HTML file[\s\S]*?alert\('Standalone HTML file exported[^}]*\}\s*\n/m, '');
    
    // Create HTML with embedded data
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pages[0]?.title || 'Lecture Slides'} - Slides</title>
    <style>
${cssContent}
    
    /* Hide input section for exported version */
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
            <p class="subtitle">${pages.length} slides - Interactive presentation</p>
        </header>

        <div class="input-section" style="display: none;"></div>

        <div id="loading" class="loading hidden">
            <div class="spinner"></div>
            <p>Loading slides...</p>
        </div>

        <div id="pages-container" class="pages-container">
            <div class="pages-header">
                <h2>Lecture Slides</h2>
                <div class="controls">
                    <button id="prev-btn" class="btn btn-nav">← Previous</button>
                    <span id="page-counter">Page 1 of ${pages.length}</span>
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
                    <span id="present-counter">Slide 1 of ${pages.length}</span>
                    <button id="present-next-btn" class="btn btn-present-nav">Next →</button>
                    <button id="print-btn" class="btn btn-save">🖨️ Print/PDF</button>
                    <button id="fullscreen-btn" class="btn btn-fullscreen">⛶ Full</button>
                    <button id="exit-present-btn" class="btn btn-exit">✕ Exit</button>
                </div>
                
                <div id="presentation-content" class="presentation-content"></div>
            </div>
        </div>

        <div id="error" class="error hidden"></div>
    </div>

    <script>
// Embedded slide data (all slides with images baked in)
const EMBEDDED_SLIDES_DATA = ${JSON.stringify(pages, null, 2)};

// Initialize variables
let currentPageIndex = 0;
let pages = [];
let presentationPageIndex = 0;
let isProcessing = false;
let imageQueue = [];
let isGeneratingImage = false;
let imageStates = {};

// Load embedded data on page load
window.addEventListener('DOMContentLoaded', function() {
    pages = EMBEDDED_SLIDES_DATA;
    displayPages();
    document.getElementById('pages-container').classList.remove('hidden');
});

${jsContent}
    </script>
</body>
</html>`;
    
    // Create and download HTML file
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = (pages[0]?.title.replace(/[^a-z0-9]/gi, '_') || 'slides') + '_' + new Date().toISOString().split('T')[0] + '.html';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('Standalone HTML file exported! You can open it directly in any browser.');
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
