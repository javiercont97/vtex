import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { TikZParser, TikZGenerator, TikZNode, CoordinateMapper } from './tikzParser';
import { TikZPreview } from '../figures/tikzPreview';

/**
 * WYSIWYG Visual Editor for TikZ diagrams
 */
export class TikZEditor {
    private panel: vscode.WebviewPanel | undefined;
    private readonly logger: Logger;
    private sourceDocument: vscode.Uri | undefined;
    private tikzRange: vscode.Range | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private parser: TikZParser;
    private generator: TikZGenerator;
    private tikzPreview: TikZPreview;
    private isUpdating: boolean = false;

    constructor(private context: vscode.ExtensionContext, logger: Logger) {
        this.logger = logger;
        const coordinateMapper = new CoordinateMapper();
        this.parser = new TikZParser(coordinateMapper);
        this.generator = new TikZGenerator(coordinateMapper);
        this.tikzPreview = new TikZPreview(context, logger);
    }

    /**
     * Open the TikZ WYSIWYG editor
     */
    public async openEditor(tikzCode?: string, range?: vscode.Range) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.sourceDocument = editor.document.uri;
            this.tikzRange = range;
        }

        // If no code provided, extract from cursor position
        if (!tikzCode && editor) {
            tikzCode = this.extractTikzFromEditor(editor);
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'tikzEditor',
                '✏️ TikZ Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'resources')
                    ]
                }
            );

            this.panel.webview.html = this.getWebviewContent();
            
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

        // Send initial TikZ code to webview
        if (tikzCode && this.panel) {
            try {
                const ast = this.parser.parse(tikzCode);
                this.panel.webview.postMessage({
                    type: 'setTikZ',
                    code: tikzCode,
                    ast: ast
                });
            } catch (error) {
                this.logger.error('Failed to parse TikZ code: ' + (error as Error).message);
                vscode.window.showErrorMessage('Failed to parse TikZ code: ' + (error as Error).message);
            }
        }
    }

    /**
     * Extract TikZ code from editor
     */
    private extractTikzFromEditor(editor: vscode.TextEditor): string | undefined {
        const document = editor.document;
        const position = editor.selection.active;
        
        // Find tikzpicture environment around cursor
        let startLine = -1;
        let endLine = -1;
        
        // Search backwards for \begin{tikzpicture}
        for (let i = position.line; i >= 0; i--) {
            const line = document.lineAt(i).text;
            if (line.includes('\\begin{tikzpicture}')) {
                startLine = i;
                break;
            }
            if (line.includes('\\end{tikzpicture}')) {
                break; // Found another environment, stop
            }
        }
        
        // Search forwards for \end{tikzpicture}
        if (startLine >= 0) {
            for (let i = startLine; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                if (line.includes('\\end{tikzpicture}')) {
                    endLine = i;
                    break;
                }
            }
        }
        
        if (startLine >= 0 && endLine >= 0) {
            this.tikzRange = new vscode.Range(startLine, 0, endLine + 1, 0);
            return document.getText(this.tikzRange);
        }
        
        return undefined;
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any) {
        this.logger.info(`TikZ Editor received message: ${message.type}`);
        
        switch (message.type) {
            case 'insert':
                await this.insertTikZ(message.code, false);
                break;
                
            case 'update':
                // Auto-update with debounce
                if (this.updateTimeout) {
                    clearTimeout(this.updateTimeout);
                }
                this.updateTimeout = setTimeout(async () => {
                    await this.insertTikZ(message.code, true);
                }, 800);
                break;
                
            case 'visualUpdate':
                // User edited on canvas - regenerate TikZ code
                await this.handleVisualUpdate(message.elements);
                break;
                
            case 'compilePreview':
                await this.compilePreview(message.code);
                break;
                
            case 'parseCode':
                await this.parseAndSendAST(message.code);
                break;
                
            case 'ready':
                this.logger.info('Webview ready');
                break;
        }
    }

    /**
     * Handle visual updates from canvas
     */
    private async handleVisualUpdate(elements: any[]) {
        try {
            // Convert canvas elements to TikZ AST
            const nodes = this.canvasElementsToAST(elements);
            
            // Generate TikZ code
            const code = this.generator.generate(nodes);
            
            // Send back to webview code panel
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'codeUpdated',
                    code: code
                });
            }
            
            // Auto-update document if editing existing
            if (this.tikzRange) {
                if (this.updateTimeout) {
                    clearTimeout(this.updateTimeout);
                }
                this.updateTimeout = setTimeout(async () => {
                    await this.insertTikZ(code, true);
                }, 800);
            }
        } catch (error) {
            this.logger.error('Failed to handle visual update: ' + (error as Error).message);
        }
    }

    /**
     * Convert canvas elements to TikZ AST
     */
    private canvasElementsToAST(elements: any[]): TikZNode[] {
        const nodes: TikZNode[] = [];
        const mapper = this.parser.getCoordinateMapper();
        
        for (const element of elements) {
            try {
                switch (element.type) {
                    case 'line':
                        nodes.push({
                            type: 'draw',
                            options: this.fabricOptionsToTikZ(element),
                            path: [{
                                type: 'line',
                                to: mapper.canvasToTikZ({ x: element.x2, y: element.y2 })
                            }]
                        });
                        break;
                        
                    case 'circle':
                        const circleMapper = mapper;
                        const center = circleMapper.canvasToTikZ({ x: element.left + element.radius, y: element.top + element.radius });
                        const radius = element.radius / circleMapper.getScale();
                        nodes.push({
                            type: 'draw',
                            options: this.fabricOptionsToTikZ(element),
                            path: [{
                                type: 'circle',
                                center: center,
                                radius: radius
                            }]
                        });
                        break;
                        
                    case 'rect':
                        const corner1 = mapper.canvasToTikZ({ x: element.left, y: element.top });
                        const corner2 = mapper.canvasToTikZ({ x: element.left + element.width, y: element.top + element.height });
                        nodes.push({
                            type: 'draw',
                            options: this.fabricOptionsToTikZ(element),
                            path: [{
                                type: 'rectangle',
                                corner1: corner1,
                                corner2: corner2
                            }]
                        });
                        break;
                        
                    case 'text':
                    case 'i-text':
                        const textPos = mapper.canvasToTikZ({ x: element.left, y: element.top });
                        nodes.push({
                            type: 'node',
                            at: textPos,
                            content: element.text || '',
                            options: this.fabricOptionsToTikZ(element)
                        });
                        break;
                }
            } catch (error) {
                this.logger.error('Failed to convert element to AST: ' + (error as Error).message);
            }
        }
        
        return nodes;
    }

    /**
     * Convert Fabric.js options to TikZ options
     */
    private fabricOptionsToTikZ(element: any): any {
        const options: any = { raw: [] };
        
        if (element.stroke && element.stroke !== 'black') {
            options.draw = element.stroke;
            options.raw.push(`draw=${element.stroke}`);
        }
        
        if (element.fill && element.fill !== 'transparent' && element.fill !== 'rgba(0,0,0,0)') {
            options.fill = element.fill;
            options.raw.push(`fill=${element.fill}`);
        }
        
        if (element.strokeWidth > 1) {
            options.lineWidth = `${element.strokeWidth}pt`;
            options.raw.push(`line width=${element.strokeWidth}pt`);
        }
        
        if (element.opacity !== undefined && element.opacity < 1) {
            options.opacity = element.opacity;
            options.raw.push(`opacity=${element.opacity}`);
        }
        
        return options;
    }

    /**
     * Parse code and send AST to webview
     */
    private async parseAndSendAST(code: string) {
        try {
            const ast = this.parser.parse(code);
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'astParsed',
                    ast: ast,
                    success: true
                });
            }
        } catch (error) {
            this.logger.error('Failed to parse TikZ code: ' + (error as Error).message);
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'astParsed',
                    error: (error as Error).message,
                    success: false
                });
            }
        }
    }

    /**
     * Compile preview using existing TikZ preview system
     */
    private async compilePreview(code: string) {
        try {
            if (!this.panel) return;
            
            // Create a temporary compilation using direct LaTeX compilation
            // We'll reuse the TikZ compilation logic but inline here
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            const fs = require('fs');
            const os = require('os');
            const crypto = require('crypto');
            
            const tempDir = path.join(os.tmpdir(), 'vtex-tikz-editor');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            // Generate hash for caching
            const hash = crypto.createHash('md5').update(code).digest('hex');
            const tempTexFile = path.join(tempDir, `tikz_${hash}.tex`);
            const tempPdfFile = path.join(tempDir, `tikz_${hash}.pdf`);
            const tempSvgFile = path.join(tempDir, `tikz_${hash}.svg`);
            
            // Check cache
            if (fs.existsSync(tempSvgFile)) {
                const svg = fs.readFileSync(tempSvgFile, 'utf8');
                this.panel.webview.postMessage({
                    type: 'previewReady',
                    svg: svg
                });
                return;
            }
            
            // Create standalone LaTeX document
            const texContent = `\\documentclass[tikz,border=2pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{arrows,positioning,shapes,calc}
\\begin{document}
${code}
\\end{document}`;
            
            fs.writeFileSync(tempTexFile, texContent, 'utf8');
            
            // Compile
            const compileCmd = `pdflatex -interaction=nonstopmode -output-directory="${tempDir}" "${tempTexFile}"`;
            await execAsync(compileCmd);
            
            // Convert to SVG
            try {
                await execAsync(`pdf2svg "${tempPdfFile}" "${tempSvgFile}"`);
            } catch (err) {
                // Fallback to dvisvgm
                await execAsync(`dvisvgm --pdf "${tempPdfFile}" -o "${tempSvgFile}"`);
            }
            
            // Read and send SVG
            if (fs.existsSync(tempSvgFile)) {
                const svg = fs.readFileSync(tempSvgFile, 'utf8');
                this.panel.webview.postMessage({
                    type: 'previewReady',
                    svg: svg
                });
            } else {
                throw new Error('SVG file not generated');
            }
            
        } catch (error) {
            this.logger.error('Failed to compile TikZ preview: ' + (error as Error).message);
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'previewError',
                    error: (error as Error).message
                });
            }
        }
    }

    /**
     * Insert or update TikZ code in document
     */
    private async insertTikZ(code: string, isUpdate: boolean) {
        if (this.isUpdating) return;
        this.isUpdating = true;

        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                this.isUpdating = false;
                return;
            }

            // Ensure code has tikzpicture environment
            if (!code.includes('\\begin{tikzpicture}')) {
                code = `\\begin{tikzpicture}\n${code}\n\\end{tikzpicture}`;
            }

            await editor.edit(editBuilder => {
                if (this.tikzRange && isUpdate) {
                    // Update existing
                    editBuilder.replace(this.tikzRange, code);
                } else {
                    // Insert new
                    const position = editor.selection.active;
                    editBuilder.insert(position, code + '\n');
                }
            });

            // Update range for future updates
            if (!isUpdate && editor) {
                const document = editor.document;
                const position = editor.selection.active;
                const startLine = position.line;
                let endLine = startLine;
                
                // Find end of inserted code
                for (let i = startLine; i < document.lineCount; i++) {
                    if (document.lineAt(i).text.includes('\\end{tikzpicture}')) {
                        endLine = i + 1;
                        break;
                    }
                }
                
                this.tikzRange = new vscode.Range(startLine, 0, endLine, 0);
            }

        } catch (error) {
            this.logger.error('Failed to insert/update TikZ: ' + (error as Error).message);
            vscode.window.showErrorMessage('Failed to update TikZ code: ' + (error as Error).message);
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Generate webview HTML content
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TikZ Editor</title>
    <script src="https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
            height: 100vh;
        }
        
        .container {
            display: flex;
            height: 100vh;
            gap: 10px;
            padding: 10px;
        }
        
        .left-panel {
            flex: 2;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .right-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow-y: auto;
        }
        
        .toolbar {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .toolbar button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 13px;
            border-radius: 2px;
        }
        
        .toolbar button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .toolbar button.active {
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-button-border);
        }
        
        .canvas-container {
            flex: 1;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            position: relative;
            overflow: hidden;
        }
        
        #tikz-canvas {
            border: 1px solid var(--vscode-panel-border);
        }
        
        .panel-section {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
        }
        
        .panel-section h3 {
            margin-bottom: 10px;
            font-size: 14px;
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 5px;
        }
        
        .code-editor {
            min-height: 200px;
            flex: 1;
        }
        
        .code-editor textarea {
            width: 100%;
            height: 100%;
            min-height: 150px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            padding: 8px;
            resize: vertical;
        }
        
        .preview-area {
            min-height: 200px;
            max-height: 400px;
            overflow: auto;
            background: white;
            padding: 10px;
            border-radius: 2px;
        }
        
        .preview-area svg {
            max-width: 100%;
            height: auto;
        }
        
        .properties {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .property-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        
        .property-group label {
            font-size: 12px;
            color: var(--vscode-foreground);
        }
        
        .property-group input,
        .property-group select {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            font-size: 13px;
        }
        
        .action-buttons {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }
        
        .action-buttons button {
            flex: 1;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px;
            cursor: pointer;
            font-size: 13px;
            border-radius: 2px;
        }
        
        .action-buttons button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .status-bar {
            padding: 4px 8px;
            font-size: 11px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .separator {
            width: 1px;
            background: var(--vscode-panel-border);
            margin: 0 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Left Panel: Canvas -->
        <div class="left-panel">
            <div class="toolbar">
                <button id="btn-select" class="active" title="Select (V)">🔍 Select</button>
                <button id="btn-line" title="Draw Line (L)">📏 Line</button>
                <button id="btn-circle" title="Draw Circle (C)">⭕ Circle</button>
                <button id="btn-rectangle" title="Draw Rectangle (R)">▭ Rectangle</button>
                <button id="btn-node" title="Add Node (N)">📝 Node</button>
                <button id="btn-arrow" title="Draw Arrow (A)">➡️ Arrow</button>
                <div class="separator"></div>
                <button id="btn-delete" title="Delete (Del)">🗑️ Delete</button>
                <button id="btn-clear" title="Clear All">🧹 Clear</button>
                <div class="separator"></div>
                <button id="btn-grid" title="Toggle Grid (G)">⊞ Grid</button>
                <button id="btn-snap" title="Toggle Snap">🧲 Snap</button>
            </div>
            
            <div class="canvas-container">
                <canvas id="tikz-canvas" width="800" height="600"></canvas>
            </div>
            
            <div class="status-bar" id="status-bar">
                Ready | Mode: Select | Objects: 0
            </div>
        </div>
        
        <!-- Right Panel: Code & Properties -->
        <div class="right-panel">
            <!-- Properties -->
            <div class="panel-section properties" id="properties-panel">
                <h3>Properties</h3>
                <div id="properties-content">
                    <p style="color: var(--vscode-descriptionForeground); font-size: 12px;">
                        Select an object to edit its properties
                    </p>
                </div>
            </div>
            
            <!-- Code Editor -->
            <div class="panel-section code-editor">
                <h3>TikZ Code</h3>
                <textarea id="code-textarea" spellcheck="false">\\begin{tikzpicture}
  % Your TikZ code here
\\end{tikzpicture}</textarea>
                <div class="action-buttons">
                    <button id="btn-sync-from-code">⬅️ Load</button>
                    <button id="btn-sync-to-code">➡️ Generate</button>
                    <button id="btn-apply">✓ Apply</button>
                </div>
            </div>
            
            <!-- Preview -->
            <div class="panel-section">
                <h3>Compiled Preview</h3>
                <div class="preview-area" id="preview-area">
                    <p style="color: var(--vscode-descriptionForeground); font-size: 12px;">
                        Click "Generate" to compile preview
                    </p>
                </div>
                <div class="action-buttons">
                    <button id="btn-compile">🔄 Compile Preview</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Canvas and Fabric.js setup
        const canvas = new fabric.Canvas('tikz-canvas', {
            backgroundColor: '#ffffff',
            selection: true
        });
        
        let currentTool = 'select';
        let isDrawing = false;
        let drawingObject = null;
        let gridEnabled = false;
        let snapEnabled = false;
        
        // Tool buttons
        const tools = {
            'btn-select': 'select',
            'btn-line': 'line',
            'btn-circle': 'circle',
            'btn-rectangle': 'rectangle',
            'btn-node': 'node',
            'btn-arrow': 'arrow'
        };
        
        Object.entries(tools).forEach(([btnId, tool]) => {
            document.getElementById(btnId).addEventListener('click', () => {
                setTool(tool);
            });
        });
        
        function setTool(tool) {
            currentTool = tool;
            Object.keys(tools).forEach(btnId => {
                document.getElementById(btnId).classList.remove('active');
            });
            const btnId = Object.keys(tools).find(id => tools[id] === tool);
            if (btnId) {
                document.getElementById(btnId).classList.add('active');
            }
            canvas.isDrawingMode = false;
            canvas.selection = (tool === 'select');
            updateStatus();
        }
        
        // Canvas events for drawing
        canvas.on('mouse:down', function(options) {
            if (currentTool === 'select') return;
            
            isDrawing = true;
            const pointer = canvas.getPointer(options.e);
            const point = snapEnabled ? snapToGrid(pointer) : pointer;
            
            switch (currentTool) {
                case 'line':
                case 'arrow':
                    drawingObject = new fabric.Line([point.x, point.y, point.x, point.y], {
                        stroke: 'black',
                        strokeWidth: 2,
                        selectable: false
                    });
                    canvas.add(drawingObject);
                    break;
                    
                case 'circle':
                    drawingObject = new fabric.Circle({
                        left: point.x,
                        top: point.y,
                        radius: 1,
                        fill: 'transparent',
                        stroke: 'black',
                        strokeWidth: 2,
                        selectable: false
                    });
                    canvas.add(drawingObject);
                    break;
                    
                case 'rectangle':
                    drawingObject = new fabric.Rect({
                        left: point.x,
                        top: point.y,
                        width: 1,
                        height: 1,
                        fill: 'transparent',
                        stroke: 'black',
                        strokeWidth: 2,
                        selectable: false
                    });
                    canvas.add(drawingObject);
                    break;
                    
                case 'node':
                    const text = new fabric.IText('Text', {
                        left: point.x,
                        top: point.y,
                        fontSize: 14,
                        fill: 'black'
                    });
                    canvas.add(text);
                    canvas.setActiveObject(text);
                    text.enterEditing();
                    isDrawing = false;
                    setTool('select');
                    onCanvasModified();
                    break;
            }
        });
        
        canvas.on('mouse:move', function(options) {
            if (!isDrawing || !drawingObject) return;
            
            const pointer = canvas.getPointer(options.e);
            const point = snapEnabled ? snapToGrid(pointer) : pointer;
            
            switch (currentTool) {
                case 'line':
                case 'arrow':
                    drawingObject.set({ x2: point.x, y2: point.y });
                    break;
                    
                case 'circle':
                    const radius = Math.sqrt(
                        Math.pow(point.x - drawingObject.left, 2) +
                        Math.pow(point.y - drawingObject.top, 2)
                    );
                    drawingObject.set({ radius: radius });
                    break;
                    
                case 'rectangle':
                    const width = point.x - drawingObject.left;
                    const height = point.y - drawingObject.top;
                    drawingObject.set({ width: width, height: height });
                    break;
            }
            
            canvas.renderAll();
        });
        
        canvas.on('mouse:up', function() {
            if (isDrawing && drawingObject) {
                drawingObject.selectable = true;
                drawingObject.setCoords();
                isDrawing = false;
                drawingObject = null;
                setTool('select');
                onCanvasModified();
            }
        });
        
        // Canvas object events
        canvas.on('object:modified', onCanvasModified);
        canvas.on('object:added', updateStatus);
        canvas.on('object:removed', updateStatus);
        canvas.on('selection:created', onSelectionChanged);
        canvas.on('selection:updated', onSelectionChanged);
        canvas.on('selection:cleared', onSelectionChanged);
        
        function onCanvasModified() {
            updateStatus();
            // Send canvas state to extension
            const elements = serializeCanvas();
            vscode.postMessage({
                type: 'visualUpdate',
                elements: elements
            });
        }
        
        function onSelectionChanged() {
            const activeObject = canvas.getActiveObject();
            updatePropertiesPanel(activeObject);
            updateStatus();
        }
        
        function serializeCanvas() {
            return canvas.getObjects().map(obj => ({
                type: obj.type,
                left: obj.left,
                top: obj.top,
                width: obj.width,
                height: obj.height,
                radius: obj.radius,
                x1: obj.x1,
                y1: obj.y1,
                x2: obj.x2,
                y2: obj.y2,
                stroke: obj.stroke,
                fill: obj.fill,
                strokeWidth: obj.strokeWidth,
                opacity: obj.opacity,
                text: obj.text
            }));
        }
        
        function snapToGrid(point) {
            const gridSize = 20;
            return {
                x: Math.round(point.x / gridSize) * gridSize,
                y: Math.round(point.y / gridSize) * gridSize
            };
        }
        
        function updateStatus() {
            const objCount = canvas.getObjects().length;
            const selected = canvas.getActiveObject();
            const statusBar = document.getElementById('status-bar');
            statusBar.textContent = \`Ready | Mode: \${currentTool} | Objects: \${objCount}\${selected ? ' | Selected: 1' : ''}\`;
        }
        
        function updatePropertiesPanel(obj) {
            const panel = document.getElementById('properties-content');
            
            if (!obj) {
                panel.innerHTML = '<p style="color: var(--vscode-descriptionForeground); font-size: 12px;">Select an object to edit properties</p>';
                return;
            }
            
            panel.innerHTML = \`
                <div class="property-group">
                    <label>Stroke Color:</label>
                    <input type="color" id="prop-stroke" value="\${obj.stroke || '#000000'}">
                </div>
                <div class="property-group">
                    <label>Fill Color:</label>
                    <input type="color" id="prop-fill" value="\${obj.fill || '#ffffff'}">
                </div>
                <div class="property-group">
                    <label>Stroke Width:</label>
                    <input type="number" id="prop-stroke-width" value="\${obj.strokeWidth || 2}" min="1" max="20">
                </div>
                <div class="property-group">
                    <label>Opacity:</label>
                    <input type="range" id="prop-opacity" value="\${(obj.opacity || 1) * 100}" min="0" max="100">
                </div>
            \`;
            
            // Add event listeners
            document.getElementById('prop-stroke').addEventListener('change', (e) => {
                obj.set('stroke', e.target.value);
                canvas.renderAll();
                onCanvasModified();
            });
            
            document.getElementById('prop-fill').addEventListener('change', (e) => {
                obj.set('fill', e.target.value);
                canvas.renderAll();
                onCanvasModified();
            });
            
            document.getElementById('prop-stroke-width').addEventListener('change', (e) => {
                obj.set('strokeWidth', parseInt(e.target.value));
                canvas.renderAll();
                onCanvasModified();
            });
            
            document.getElementById('prop-opacity').addEventListener('input', (e) => {
                obj.set('opacity', parseFloat(e.target.value) / 100);
                canvas.renderAll();
                onCanvasModified();
            });
        }
        
        // Action buttons
        document.getElementById('btn-delete').addEventListener('click', () => {
            const active = canvas.getActiveObject();
            if (active) {
                canvas.remove(active);
                onCanvasModified();
            }
        });
        
        document.getElementById('btn-clear').addEventListener('click', () => {
            if (confirm('Clear all objects?')) {
                canvas.clear();
                canvas.backgroundColor = '#ffffff';
                onCanvasModified();
            }
        });
        
        document.getElementById('btn-grid').addEventListener('click', () => {
            gridEnabled = !gridEnabled;
            // TODO: Implement grid display
            document.getElementById('btn-grid').classList.toggle('active');
        });
        
        document.getElementById('btn-snap').addEventListener('click', () => {
            snapEnabled = !snapEnabled;
            document.getElementById('btn-snap').classList.toggle('active');
        });
        
        document.getElementById('btn-sync-from-code').addEventListener('click', () => {
            const code = document.getElementById('code-textarea').value;
            vscode.postMessage({
                type: 'parseCode',
                code: code
            });
        });
        
        document.getElementById('btn-sync-to-code').addEventListener('click', () => {
            const elements = serializeCanvas();
            vscode.postMessage({
                type: 'visualUpdate',
                elements: elements
            });
        });
        
        document.getElementById('btn-apply').addEventListener('click', () => {
            const code = document.getElementById('code-textarea').value;
            vscode.postMessage({
                type: 'update',
                code: code
            });
        });
        
        document.getElementById('btn-compile').addEventListener('click', () => {
            const code = document.getElementById('code-textarea').value;
            document.getElementById('preview-area').innerHTML = '<p>Compiling...</p>';
            vscode.postMessage({
                type: 'compilePreview',
                code: code
            });
        });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'setTikZ':
                    document.getElementById('code-textarea').value = message.code;
                    if (message.ast) {
                        loadASTToCanvas(message.ast);
                    }
                    break;
                    
                case 'codeUpdated':
                    document.getElementById('code-textarea').value = message.code;
                    break;
                    
                case 'astParsed':
                    if (message.success && message.ast) {
                        loadASTToCanvas(message.ast);
                    }
                    break;
                    
                case 'previewReady':
                    document.getElementById('preview-area').innerHTML = message.svg;
                    break;
                    
                case 'previewError':
                    document.getElementById('preview-area').innerHTML = \`<p style="color: red;">Error: \${message.error}</p>\`;
                    break;
            }
        });
        
        function loadASTToCanvas(ast) {
            canvas.clear();
            canvas.backgroundColor = '#ffffff';
            
            // TODO: Convert AST nodes to Fabric.js objects
            // This will be implemented based on the AST structure
            
            canvas.renderAll();
            updateStatus();
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const active = canvas.getActiveObject();
                if (active && !active.isEditing) {
                    canvas.remove(active);
                    onCanvasModified();
                    e.preventDefault();
                }
            } else if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey) {
                setTool('select');
            } else if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
                setTool('line');
            } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
                setTool('circle');
            } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
                setTool('rectangle');
            } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
                setTool('node');
            } else if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
                gridEnabled = !gridEnabled;
                document.getElementById('btn-grid').classList.toggle('active');
            }
        });
        
        // Notify extension that webview is ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
