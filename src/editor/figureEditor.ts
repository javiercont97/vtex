import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Jimp } from 'jimp';
import { Logger } from '../utils/logger';

/**
 * Visual editor for LaTeX figures
 */
export class FigureEditor {
    private panel: vscode.WebviewPanel | undefined;
    private readonly logger: Logger;
    private sourceDocument: vscode.Uri | undefined;
    private figureStartLine: number | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;

    constructor(private context: vscode.ExtensionContext, logger: Logger) {
        this.logger = logger;
    }

    /**
     * Open the figure editor
     */
    public openEditor(figure?: { imagePath: string; width?: string; caption?: string; label?: string }, range?: vscode.Range) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.sourceDocument = editor.document.uri;
            // Store just the starting line number
            if (range) {
                this.figureStartLine = range.start.line;
            } else {
                this.figureStartLine = undefined;
            }
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'figureEditor',
                '🖼️ Figure Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'resources')
                    ]
                }
            );

            this.panel.webview.html = this.getWebviewContent(figure);
            
            this.panel.webview.onDidReceiveMessage(
                message => this.handleMessage(message),
                undefined,
                this.context.subscriptions
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
                if (this.updateTimeout) {
                    clearTimeout(this.updateTimeout);
                }
            });
        }

        // Send initial data if provided
        if (figure && this.panel) {
            this.panel.webview.postMessage({
                type: 'setFigure',
                figure: figure
            });
        }
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any) {
        this.logger.info(`Received message: ${message.type}`);
        switch (message.type) {
            case 'insert':
                this.insertFigure(message.figure, false);
                break;
            case 'browse':
                await this.browseImage();
                break;
            case 'scanImages':
                this.logger.info('Handling scanImages message');
                await this.scanForImages();
                break;
            case 'update':
                // Auto-update with debounce
                if (this.updateTimeout) {
                    clearTimeout(this.updateTimeout);
                }
                this.updateTimeout = setTimeout(async () => {
                    await this.insertFigure(message.figure, true);
                }, 800);
                break;
        }
    }

    /**
     * Browse for image file
     */
    private async browseImage() {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'pdf', 'svg', 'eps']
            },
            title: 'Select Image'
        });

        if (result && result[0] && this.panel) {
            if (!this.sourceDocument) {
                this.logger.error('No source document tracked');
                return;
            }

            // Find the editor with our tracked document
            const editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === this.sourceDocument!.toString()
            );
            
            if (editor) {
                const docDir = path.dirname(editor.document.uri.fsPath);
                const imagePath = result[0].fsPath;
                const relativePath = path.relative(docDir, imagePath).replace(/\\/g, '/');
                
                this.panel.webview.postMessage({
                    type: 'setImagePath',
                    path: relativePath
                });
            } else {
                this.logger.error('Source editor not found in visible editors');
            }
        }
    }

    /**
     * Scan workspace for images and send to webview
     */
    private async scanForImages() {
        this.logger.info('scanForImages() called');
        
        if (!this.panel) {
            this.logger.error('No panel available');
            return;
        }

        // Use tracked document instead of activeTextEditor (which is undefined when webview has focus)
        if (!this.sourceDocument) {
            this.logger.error('No source document tracked');
            return;
        }

        // Find the editor with our tracked document
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === this.sourceDocument!.toString()
        );
        
        if (!editor) {
            this.logger.error('Source editor not found in visible editors');
            return;
        }

        const docDir = path.dirname(editor.document.uri.fsPath);
        this.logger.info(`Document directory: ${docDir}`);
        
        try {
            this.logger.info('Starting workspace.findFiles...');
            
            // Use simple glob pattern like figureManager
            const pattern = '**/*.{png,jpg,jpeg,pdf,eps,svg}';
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
            
            this.logger.info(`Found ${files.length} image files`);
            
            if (files.length === 0) {
                this.logger.info('No image files found in workspace');
                this.panel.webview.postMessage({
                    type: 'setImages',
                    images: []
                });
                return;
            }
            
            const images: { path: string; name: string; uri: string }[] = [];
            
            this.logger.info(`Processing ${files.length} files...`);
            
            for (const file of files) {
                const relativePath = path.relative(docDir, file.fsPath).replace(/\\/g, '/');
                const fileName = path.basename(file.fsPath);
                const ext = path.extname(file.fsPath).toLowerCase();
                
                this.logger.info(`Processing: ${fileName} (${ext})`);
                
                let dataUri = '';
                
                // Create thumbnails for raster images using jimp
                if (['.png', '.jpg', '.jpeg'].includes(ext)) {
                    try {
                        const image = await Jimp.read(file.fsPath);
                        
                        // Resize to max 120px height for carousel
                        if (image.height > 120) {
                            await image.resize({ h: 120 });
                        }
                        
                        // Convert to JPEG data URI
                        const buffer = await image.getBuffer('image/jpeg', { quality: 80 });
                        dataUri = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                        this.logger.info(`Created thumbnail for ${fileName}: ${dataUri.length} bytes`);
                    } catch (error) {
                        this.logger.error(`Failed to create thumbnail for ${file.fsPath}: ${error}`);
                    }
                }
                
                images.push({
                    path: relativePath,
                    name: fileName,
                    uri: dataUri
                });
            }
            
            this.logger.info(`Processed ${images.length} images, preparing to send to webview`);
            this.logger.info(`Images array: ${JSON.stringify(images.map(i => ({ name: i.name, path: i.path, hasUri: !!i.uri })))}`);
            
            if (!this.panel) {
                this.logger.error('Panel became undefined before postMessage');
                return;
            }
            
            this.panel.webview.postMessage({
                type: 'setImages',
                images: images.slice(0, 100) // Limit to 100 total images
            });
            
            this.logger.info('Successfully posted setImages message to webview');
        } catch (error) {
            this.logger.error(`Error scanning for images: ${error}`);
            if (error instanceof Error) {
                this.logger.error(`Stack trace: ${error.stack}`);
            }
        }
    }

    /**
     * Insert or update figure in document
     */
    private async insertFigure(figure: { imagePath: string; width?: string; caption?: string; label?: string }, isAuto: boolean = false) {
        if (!this.sourceDocument) {
            if (!isAuto) {
                vscode.window.showErrorMessage('No source document available');
            }
            return;
        }

        // Find the text editor with matching document URI
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === this.sourceDocument!.toString()
        );

        if (!editor) {
            if (!isAuto) {
                vscode.window.showErrorMessage('Source document not found');
            }
            return;
        }

        // Generate LaTeX figure code
        const figureCode = this.generateFigureCode(figure);

        await editor.edit(editBuilder => {
            if (this.figureStartLine !== undefined) {
                // Update existing figure - figureStartLine is where \begin{figure} is located
                const document = editor.document;
                const maxLine = document.lineCount - 1;
                
                // Verify we're at \begin{figure}
                const beginLineText = document.lineAt(this.figureStartLine).text;
                if (!/\\begin\{figure\}/.test(beginLineText)) {
                    this.logger.error(`Line ${this.figureStartLine} does not contain \\begin{figure}: ${beginLineText}`);
                    return;
                }
                
                // Search forward from begin line to find \end{figure}
                let figureEndLine = this.figureStartLine;
                let foundEnd = false;
                
                for (let i = this.figureStartLine; i <= Math.min(maxLine, this.figureStartLine + 30); i++) {
                    const lineText = document.lineAt(i).text;
                    if (/\\end\{figure\}/.test(lineText)) {
                        figureEndLine = i;
                        foundEnd = true;
                        break;
                    }
                }
                
                if (!foundEnd) {
                    this.logger.error(`Could not find \\end{figure} after line ${this.figureStartLine}`);
                    return;
                }
                
                // Delete from start of \begin{figure} line to start of line after \end{figure}
                const deleteRange = new vscode.Range(
                    new vscode.Position(this.figureStartLine, 0),
                    figureEndLine < maxLine 
                        ? new vscode.Position(figureEndLine + 1, 0)
                        : new vscode.Position(figureEndLine, document.lineAt(figureEndLine).text.length)
                );
                
                // Replace the entire range with new figure code
                const codeToInsert = figureEndLine < maxLine ? figureCode + '\n' : figureCode;
                editBuilder.replace(deleteRange, codeToInsert);
                
                // figureStartLine stays the same since we're replacing at the same position
            } else {
                // Insert new figure at cursor
                editBuilder.insert(editor.selection.active, figureCode);
            }
        });

        if (!isAuto) {
            vscode.window.showInformationMessage('Figure inserted successfully');
        }
    }

    /**
     * Generate LaTeX figure code
     */
    private generateFigureCode(figure: { imagePath: string; width?: string; caption?: string; label?: string }): string {
        let code = '\\begin{figure}[htbp]\n';
        code += '    \\centering\n';
        
        // Build includegraphics command
        if (figure.width) {
            code += `    \\includegraphics[width=${figure.width}]{${figure.imagePath}}\n`;
        } else {
            code += `    \\includegraphics{${figure.imagePath}}\n`;
        }
        
        if (figure.caption) {
            code += `    \\caption{${figure.caption}}\n`;
        }
        
        if (figure.label) {
            code += `    \\label{${figure.label}}\n`;
        }
        
        code += '\\end{figure}';
        
        return code;
    }

    /**
     * Get webview HTML content
     */
    private getWebviewContent(figure?: { imagePath: string; width?: string; caption?: string; label?: string }): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        input, textarea {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            box-sizing: border-box;
        }
        textarea {
            min-height: 60px;
            resize: vertical;
            font-family: monospace;
        }
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .preview {
            margin-top: 30px;
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
        }
        .preview h3 {
            margin-top: 0;
            color: var(--vscode-foreground);
        }
        .preview pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 3px;
            overflow-x: auto;
            font-size: 13px;
        }
        .browse-btn {
            margin-top: 5px;
        }
        .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 3px;
        }
        .image-selector {
            margin-top: 20px;
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
        }
        .image-selector h3 {
            margin-top: 0;
            margin-bottom: 10px;
        }
        .image-dropdown {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            margin-bottom: 15px;
        }
        .carousel {
            display: flex;
            overflow-x: auto;
            gap: 10px;
            padding: 10px 0;
            max-height: 200px;
        }
        .carousel-item {
            flex-shrink: 0;
            width: 150px;
            cursor: pointer;
            border: 2px solid transparent;
            border-radius: 4px;
            overflow: hidden;
            transition: border-color 0.2s;
        }
        .carousel-item:hover {
            border-color: var(--vscode-focusBorder);
        }
        .carousel-item.selected {
            border-color: var(--vscode-button-background);
        }
        .carousel-item img {
            width: 100%;
            height: 120px;
            object-fit: cover;
            display: block;
        }
        .carousel-item .name {
            padding: 5px;
            font-size: 11px;
            text-align: center;
            background: var(--vscode-input-background);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .no-images {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <h2>🖼️ Figure Editor</h2>
    
    <div class="image-selector">
        <h3>📁 Select from Workspace</h3>
        <select id="imageDropdown" class="image-dropdown" onchange="selectFromDropdown()">
            <option value="">-- Select an image --</option>
        </select>
        <div id="carousel" class="carousel">
            <div class="no-images">Loading images...</div>
        </div>
    </div>

    <div class="form-group">
        <label for="imagePath">Image Path *</label>
        <input type="text" id="imagePath" placeholder="img/figure.png" value="${figure?.imagePath || ''}" />
        <button class="browse-btn secondary" onclick="browseImage()">📁 Browse File System...</button>
        <div class="help-text">Relative path from your LaTeX document</div>
    </div>

    <div class="form-group">
        <label for="width">Width</label>
        <input type="text" id="width" placeholder="0.8\\textwidth" value="${figure?.width || ''}" />
        <div class="help-text">e.g., 0.8\\textwidth, 10cm, 300px (leave empty for natural size)</div>
    </div>

    <div class="form-group">
        <label for="caption">Caption</label>
        <textarea id="caption" placeholder="Figure caption">${figure?.caption || ''}</textarea>
    </div>

    <div class="form-group">
        <label for="label">Label</label>
        <input type="text" id="label" placeholder="fig:my-figure" value="${figure?.label || ''}" />
        <div class="help-text">For cross-references with \\ref{label}</div>
    </div>

    <div class="button-group">
        <button onclick="insertFigure()">✅ Insert Figure</button>
        <button class="secondary" onclick="clearForm()">🗑️ Clear</button>
    </div>

    <div class="preview">
        <h3>📄 LaTeX Preview</h3>
        <pre id="preview"></pre>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Get form elements
        const imagePathInput = document.getElementById('imagePath');
        const widthInput = document.getElementById('width');
        const captionInput = document.getElementById('caption');
        const labelInput = document.getElementById('label');
        const previewEl = document.getElementById('preview');

        // Update preview on input
        [imagePathInput, widthInput, captionInput, labelInput].forEach(input => {
            input.addEventListener('input', updatePreview);
        });

        // Real-time update
        [imagePathInput, widthInput, captionInput, labelInput].forEach(input => {
            input.addEventListener('input', () => {
                vscode.postMessage({
                    type: 'update',
                    figure: getFigureData()
                });
            });
        });

        function getFigureData() {
            return {
                imagePath: imagePathInput.value.trim(),
                width: widthInput.value.trim(),
                caption: captionInput.value.trim(),
                label: labelInput.value.trim()
            };
        }

        function updatePreview() {
            const figure = getFigureData();
            
            if (!figure.imagePath) {
                previewEl.textContent = '// Enter an image path to see preview';
                return;
            }

            let code = '\\\\begin{figure}[htbp]\\n';
            code += '    \\\\centering\\n';
            
            if (figure.width) {
                code += \`    \\\\includegraphics[width=\${figure.width}]{\${figure.imagePath}}\\n\`;
            } else {
                code += \`    \\\\includegraphics{\${figure.imagePath}}\\n\`;
            }
            
            if (figure.caption) {
                code += \`    \\\\caption{\${figure.caption}}\\n\`;
            }
            
            if (figure.label) {
                code += \`    \\\\label{\${figure.label}}\\n\`;
            }
            
            code += '\\\\end{figure}';
            
            previewEl.textContent = code;
        }

        function insertFigure() {
            const figure = getFigureData();
            
            if (!figure.imagePath) {
                alert('Please enter an image path');
                return;
            }
            
            vscode.postMessage({
                type: 'insert',
                figure: figure,
                isAuto: false
            });
        }

        function browseImage() {
            vscode.postMessage({ type: 'browse' });
        }

        function clearForm() {
            imagePathInput.value = '';
            widthInput.value = '';
            captionInput.value = '';
            labelInput.value = '';
            updatePreview();
        }

        // Image carousel and dropdown
        let workspaceImages = [];

        function selectFromDropdown() {
            const dropdown = document.getElementById('imageDropdown');
            const selectedPath = dropdown.value;
            if (selectedPath) {
                imagePathInput.value = selectedPath;
                updatePreview();
                // Trigger real-time update
                vscode.postMessage({
                    type: 'update',
                    figure: getFigureData()
                });
                // Highlight in carousel
                highlightCarouselItem(selectedPath);
            }
        }

        function selectFromCarousel(imagePath) {
            imagePathInput.value = imagePath;
            updatePreview();
            // Trigger real-time update
            vscode.postMessage({
                type: 'update',
                figure: getFigureData()
            });
            // Update dropdown
            const dropdown = document.getElementById('imageDropdown');
            dropdown.value = imagePath;
            // Highlight in carousel
            highlightCarouselItem(imagePath);
        }

        function highlightCarouselItem(imagePath) {
            document.querySelectorAll('.carousel-item').forEach(item => {
                if (item.dataset.path === imagePath) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        function renderCarousel(images) {
            console.log('renderCarousel called with:', images);
            const carousel = document.getElementById('carousel');
            const dropdown = document.getElementById('imageDropdown');
            
            if (!carousel) {
                console.error('Carousel element not found!');
                return;
            }
            
            if (!dropdown) {
                console.error('Dropdown element not found!');
                return;
            }
            
            if (!images || images.length === 0) {
                console.log('No images to display');
                carousel.innerHTML = '<div class="no-images">No images found in workspace</div>';
                return;
            }

            workspaceImages = images;
            
            // Populate dropdown
            dropdown.innerHTML = '<option value="">-- Select an image --</option>';
            images.forEach(img => {
                const option = document.createElement('option');
                option.value = img.path;
                option.textContent = img.path;
                dropdown.appendChild(option);
            });
            
            // Populate carousel
            carousel.innerHTML = '';
            images.forEach(img => {
                const item = document.createElement('div');
                item.className = 'carousel-item';
                item.dataset.path = img.path;
                item.onclick = () => selectFromCarousel(img.path);
                
                if (img.uri) {
                    const imgEl = document.createElement('img');
                    imgEl.src = img.uri;
                    imgEl.alt = img.name;
                    item.appendChild(imgEl);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.style.cssText = 'width:100%;height:120px;background:var(--vscode-input-background);display:flex;align-items:center;justify-content:center;';
                    placeholder.textContent = '📄';
                    item.appendChild(placeholder);
                }
                
                const nameEl = document.createElement('div');
                nameEl.className = 'name';
                nameEl.textContent = img.name;
                nameEl.title = img.path;
                item.appendChild(nameEl);
                
                carousel.appendChild(item);
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Webview received message:', message.type, message);
            if (message.type === 'setFigure') {
                const figure = message.figure;
                imagePathInput.value = figure.imagePath || '';
                widthInput.value = figure.width || '';
                captionInput.value = figure.caption || '';
                labelInput.value = figure.label || '';
                updatePreview();
            } else if (message.type === 'setImagePath') {
                imagePathInput.value = message.path;
                updatePreview();
                // Trigger real-time update
                vscode.postMessage({
                    type: 'update',
                    figure: getFigureData()
                });
            } else if (message.type === 'setImages') {
                console.log('Calling renderCarousel with', message.images?.length, 'images');
                renderCarousel(message.images);
            }
        });

        // Initial preview and scan for images
        console.log('Webview initialized, requesting image scan...');
        updatePreview();
        vscode.postMessage({ type: 'scanImages' });
    </script>
</body>
</html>`;
    }
}
