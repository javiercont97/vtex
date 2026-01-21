import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import { BuildSystem } from '../buildSystem/builder';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Jimp } from 'jimp';

const execAsync = promisify(exec);

/**
 * Manages TikZ code preview and compilation
 */
export class TikZPreview {
    private previewPanel: vscode.WebviewPanel | undefined;
    private tikzCache: Map<string, { png: string; timestamp: number }> = new Map();
    private tempDir: string;
    private buildSystem: BuildSystem | null = null;
    private renderingPanel: vscode.WebviewPanel | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger
    ) {
        this.tempDir = path.join(os.tmpdir(), 'vtex-tikz');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Set the build system to use for compilation
     */
    public setBuildSystem(buildSystem: BuildSystem): void {
        this.buildSystem = buildSystem;
    }

    /**
     * Register TikZ preview commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.previewTikz', () => this.previewTikzAtCursor()),
            vscode.commands.registerCommand('vtex.compileTikzStandalone', () => this.compileTikzStandalone()),
            vscode.commands.registerCommand('vtex.insertTikzTemplate', () => this.insertTikzTemplate())
        ];
    }

    /**
     * Preview TikZ code directly
     */
    public async previewTikzCode(tikzCode: string, title: string = 'TikZ Preview'): Promise<void> {
        if (!tikzCode || !tikzCode.includes('\\begin{tikzpicture}')) {
            vscode.window.showErrorMessage('Invalid TikZ code provided');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Compiling TikZ preview...',
            cancellable: false
        }, async () => {
            try {
                const png = await this.compileTikzToPng(tikzCode);
                this.showPreview(png, title);
            } catch (error) {
                vscode.window.showErrorMessage(`TikZ compilation failed: ${error}`);
                this.logger.error(`TikZ compilation error: ${error}`);
            }
        });
    }

    /**
     * Preview TikZ code at cursor position
     */
    private async previewTikzAtCursor(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file first');
            return;
        }

        // Extract TikZ code at cursor
        const tikzCode = this.extractTikzCode(editor);
        if (!tikzCode) {
            vscode.window.showErrorMessage('No TikZ environment found at cursor. Place cursor inside \\begin{tikzpicture}...\\end{tikzpicture}');
            return;
        }

        // Show loading message
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Compiling TikZ preview...',
            cancellable: false
        }, async () => {
            try {
                const png = await this.compileTikzToPng(tikzCode);
                this.showPreview(png, 'TikZ Preview');
            } catch (error) {
                vscode.window.showErrorMessage(`TikZ compilation failed: ${error}`);
                this.logger.error(`TikZ compilation error: ${error}`);
            }
        });
    }

    /**
     * Extract TikZ code from current cursor position
     */
    private extractTikzCode(editor: vscode.TextEditor): string | null {
        const document = editor.document;
        const position = editor.selection.active;
        const text = document.getText();

        // Find tikzpicture environment containing cursor
        const beforeCursor = text.substring(0, document.offsetAt(position));
        const afterCursor = text.substring(document.offsetAt(position));

        // Find start of tikzpicture
        const beginMatches = Array.from(beforeCursor.matchAll(/\\begin\{tikzpicture\}/g));
        const endMatchesBefore = Array.from(beforeCursor.matchAll(/\\end\{tikzpicture\}/g));
        
        // Count nested environments
        const depth = beginMatches.length - endMatchesBefore.length;
        if (depth <= 0) {
            return null; // Cursor is not inside a tikzpicture
        }

        const lastBegin = beginMatches[beginMatches.length - 1];
        const startIndex = lastBegin.index!;

        // Find matching end
        const endMatch = afterCursor.match(/\\end\{tikzpicture\}/);
        if (!endMatch) {
            return null;
        }

        const endIndex = document.offsetAt(position) + endMatch.index! + endMatch[0].length;
        
        return text.substring(startIndex, endIndex);
    }

    /**
     * Compile TikZ code to PNG
     */
    public async compileTikzToPng(tikzCode: string, sourceDocumentUri?: vscode.Uri): Promise<string> {
        // Check cache
        const hash = crypto.createHash('md5').update(tikzCode).digest('hex');
        const cached = this.tikzCache.get(hash);
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached.png;
        }

        // Create temporary LaTeX file
        const tempBaseName = `tikz_${hash}`;
        const tempTexFile = path.join(this.tempDir, `${tempBaseName}.tex`);
        const tempPdfFile = path.join(this.tempDir, `${tempBaseName}.pdf`);
        const tempPngFile = path.join(this.tempDir, `${tempBaseName}.png`);

        // Detect file references in TikZ code and copy them to temp directory
        if (sourceDocumentUri) {
            const sourceDir = path.dirname(sourceDocumentUri.fsPath);
            const fileReferences = this.extractFileReferences(tikzCode);
            
            for (const fileRef of fileReferences) {
                const sourcePath = path.resolve(sourceDir, fileRef);
                const destPath = path.join(this.tempDir, path.basename(fileRef));
                
                if (fs.existsSync(sourcePath) && !fs.existsSync(destPath)) {
                    try {
                        fs.copyFileSync(sourcePath, destPath);
                        this.logger.info(`Copied referenced file: ${fileRef}`);
                    } catch (error) {
                        this.logger.warn(`Failed to copy file ${fileRef}: ${error}`);
                    }
                }
            }
        }

        // Detect if code uses pgfplots
        const usesPgfplots = /\\(addplot|begin\{axis\}|pgfplotstable)/.test(tikzCode);
        
        // Detect if code uses circuitikz
        const usesCircuitikz = /to\[(battery|resistor|capacitor|inductor|voltage|current|short|open|lamp|diode|led|transistor|op amp|european|american)/i.test(tikzCode) || 
                               /\\(ctikzset|circuitikz)/.test(tikzCode) ||
                               /\\begin\{circuitikz\}/.test(tikzCode);

        // Wrap TikZ code in standalone document
        const latexDoc = `\\documentclass[tikz,border=2pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{arrows,shapes,positioning,calc,decorations}
${usesPgfplots ? '\\usepackage{pgfplots}\n\\pgfplotsset{compat=newest}' : ''}
${usesCircuitikz ? '\\usepackage{circuitikz}' : ''}
\\begin{document}
${tikzCode}
\\end{document}`;

        fs.writeFileSync(tempTexFile, latexDoc);

        try {
            // Compile to PDF using build system
            if (this.buildSystem) {
                const tempUri = vscode.Uri.file(tempTexFile);
                const result = await this.buildSystem.build(tempUri);
                if (!result.success || !result.pdfPath) {
                    throw new Error(`PDF compilation failed: ${result.output}`);
                }
                // Copy PDF to expected location if needed
                if (result.pdfPath !== tempPdfFile && fs.existsSync(result.pdfPath)) {
                    fs.copyFileSync(result.pdfPath, tempPdfFile);
                }
            } else {
                // Fallback to direct pdflatex call if build system not available
                const compileCmd = `pdflatex -interaction=nonstopmode -output-directory="${this.tempDir}" "${tempTexFile}"`;
                await execAsync(compileCmd, { cwd: this.tempDir });
            }

            if (!fs.existsSync(tempPdfFile)) {
                throw new Error('PDF compilation failed - PDF file not found');
            }

            // Convert PDF to PNG using webview rendering
            const pngBase64 = await this.renderPdfToImage(tempPdfFile);

            // Cache result
            this.tikzCache.set(hash, { png: pngBase64, timestamp: Date.now() });

            // Cleanup temporary files
            this.cleanupTempFiles(tempBaseName);

            return pngBase64;
        } catch (error) {
            // Cleanup on error
            this.cleanupTempFiles(tempBaseName);
            throw error;
        }
    }

    /**
     * Render PDF to PNG image using webview + html2canvas
     */
    private async renderPdfToImage(pdfPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Store the currently active editor to restore focus later
            const activeEditor = vscode.window.activeTextEditor;

            // Create a hidden webview panel for rendering
            this.renderingPanel = vscode.window.createWebviewPanel(
                'tikzRenderer',
                'Rendering...',
                { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                {
                    enableScripts: true,
                    retainContextWhenHidden: false
                }
            );

            // Read PDF as base64
            const pdfData = fs.readFileSync(pdfPath);
            const pdfBase64 = pdfData.toString('base64');

            // Set up message handler
            this.renderingPanel.webview.onDidReceiveMessage(
                async (message) => {
                    if (message.type === 'imageRendered') {
                        try {
                            // Get base64 image data (remove data:image/png;base64, prefix)
                            const base64Data = message.data.replace(/^data:image\/png;base64,/, '');
                            
                            // Resize with smart sizing: 200px height, but limit width to 300px
                            const buffer = Buffer.from(base64Data, 'base64');
                            const image = await Jimp.read(buffer);
                            
                            // First resize to 200px height
                            const heightResized = image.clone();
                            await heightResized.resize({ h: 200 });
                            
                            // Check if width exceeds 300px
                            if (heightResized.width > 300) {
                                // Width is too large, resize by width instead
                                await image.resize({ w: 300 });
                            } else {
                                // Height-based resize is fine
                                image.bitmap = heightResized.bitmap;
                            }
                            
                            // Convert back to base64
                            const resizedBase64 = await image.getBase64('image/png');
                            const finalBase64 = resizedBase64.replace(/^data:image\/png;base64,/, '');

                            // Close rendering panel
                            this.renderingPanel?.dispose();
                            this.renderingPanel = undefined;

                            // Restore focus to original editor
                            if (activeEditor) {
                                await vscode.window.showTextDocument(activeEditor.document, activeEditor.viewColumn);
                            }

                            resolve(finalBase64);
                        } catch (error) {
                            this.renderingPanel?.dispose();
                            this.renderingPanel = undefined;
                            reject(error);
                        }
                    } else if (message.type === 'error') {
                        this.renderingPanel?.dispose();
                        this.renderingPanel = undefined;
                        reject(new Error(message.message));
                    }
                },
                undefined,
                this.context.subscriptions
            );

            // Set webview HTML
            this.renderingPanel.webview.html = this.getRenderingHtml(pdfBase64);
        });
    }

    /**
     * Get HTML for PDF rendering webview
     */
    private getRenderingHtml(pdfBase64: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: white;
        }
        #pdf-container {
            display: inline-block;
        }
    </style>
</head>
<body>
    <div id="pdf-container"></div>
    <script>
        const vscode = acquireVsCodeApi();
        
        // Configure PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        // Convert base64 to Uint8Array
        const pdfData = atob('${pdfBase64}');
        const pdfArray = new Uint8Array(pdfData.length);
        for (let i = 0; i < pdfData.length; i++) {
            pdfArray[i] = pdfData.charCodeAt(i);
        }
        
        // Load and render PDF
        pdfjsLib.getDocument({ data: pdfArray }).promise.then(async (pdf) => {
            try {
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.0 });
                
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                const context = canvas.getContext('2d');
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                
                document.getElementById('pdf-container').appendChild(canvas);
                
                // Wait a bit for rendering to complete
                setTimeout(async () => {
                    try {
                        // Capture the rendered PDF as image
                        const captureCanvas = await html2canvas(document.getElementById('pdf-container'), {
                            backgroundColor: '#ffffff',
                            scale: 1
                        });
                        
                        const imageData = captureCanvas.toDataURL('image/png');
                        vscode.postMessage({ type: 'imageRendered', data: imageData });
                    } catch (error) {
                        vscode.postMessage({ type: 'error', message: 'Failed to capture image: ' + error.message });
                    }
                }, 500);
            } catch (error) {
                vscode.postMessage({ type: 'error', message: 'Failed to render PDF: ' + error.message });
            }
        }).catch((error) => {
            vscode.postMessage({ type: 'error', message: 'Failed to load PDF: ' + error.message });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Extract file references from TikZ code (e.g., data files in pgfplots)
     */
    private extractFileReferences(tikzCode: string): string[] {
        const files: string[] = [];
        
        // Match: table[...]{filename} or table{filename}
        const tableRegex = /table(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
        let match;
        while ((match = tableRegex.exec(tikzCode)) !== null) {
            const filename = match[1].trim();
            // Exclude inline data (starts with newline or contains \\)
            if (!filename.startsWith('\n') && !filename.includes('\\\\')) {
                files.push(filename);
            }
        }
        
        // Match: \addplot[...] file{filename}
        const fileRegex = /\\addplot(?:\[[^\]]*\])?\s+file\s*\{([^}]+)\}/g;
        while ((match = fileRegex.exec(tikzCode)) !== null) {
            files.push(match[1].trim());
        }
        
        // Match: \pgfplotstableread{filename}
        const pgfplotstableRegex = /\\pgfplotstableread(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
        while ((match = pgfplotstableRegex.exec(tikzCode)) !== null) {
            files.push(match[1].trim());
        }
        
        return [...new Set(files)]; // Remove duplicates
    }

    /**
     * Cleanup temporary files
     */
    private cleanupTempFiles(baseName: string): void {
        const extensions = ['.tex', '.pdf', '.png', '.aux', '.log'];
        for (const ext of extensions) {
            const file = path.join(this.tempDir, `${baseName}${ext}`);
            if (fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    /**
     * Show PNG preview in webview panel
     */
    private showPreview(pngBase64: string, title: string): void {
        if (this.previewPanel) {
            this.previewPanel.title = title;
            this.previewPanel.webview.html = this.getPreviewHtml(pngBase64);
            this.previewPanel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.previewPanel = vscode.window.createWebviewPanel(
                'tikzPreview',
                title,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.previewPanel.webview.html = this.getPreviewHtml(pngBase64);

            this.previewPanel.onDidDispose(() => {
                this.previewPanel = undefined;
            });
        }
    }

    /**
     * Get HTML for PNG preview
     */
    private getPreviewHtml(pngBase64: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container {
            max-width: 90vw;
            max-height: 90vh;
            overflow: auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .controls {
            position: fixed;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 10px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
            transition: transform 0.2s;
        }
    </style>
</head>
<body>
    <div class="controls">
        <button onclick="zoom(1.2)">Zoom In</button>
        <button onclick="zoom(0.8)">Zoom Out</button>
        <button onclick="reset()">Reset</button>
    </div>
    <div class="container" id="container">
        <img id="preview-img" src="data:image/png;base64,${pngBase64}" alt="TikZ Preview" />
    </div>
    <script>
        let scale = 1;
        const img = document.getElementById('preview-img');
        
        function zoom(factor) {
            scale *= factor;
            img.style.transform = \`scale(\${scale})\`;
        }
        
        function reset() {
            scale = 1;
            img.style.transform = 'scale(1)';
        }
    </script>
</body>
</html>`;
    }

    /**
     * Compile TikZ code as standalone document
     */
    private async compileTikzStandalone(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const tikzCode = this.extractTikzCode(editor);
        if (!tikzCode) {
            vscode.window.showErrorMessage('No TikZ environment found at cursor');
            return;
        }

        const outputPath = await vscode.window.showSaveDialog({
            filters: { 'PDF Files': ['pdf'], 'PNG Files': ['png'] },
            defaultUri: vscode.Uri.file(path.join(
                path.dirname(editor.document.uri.fsPath),
                'tikz-output.pdf'
            ))
        });

        if (!outputPath) {
            return;
        }

        const ext = path.extname(outputPath.fsPath);
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Compiling TikZ standalone...',
            cancellable: false
        }, async () => {
            try {
                if (ext === '.png') {
                    const pngBase64 = await this.compileTikzToPng(tikzCode);
                    const pngBuffer = Buffer.from(pngBase64, 'base64');
                    fs.writeFileSync(outputPath.fsPath, pngBuffer);
                } else {
                    // Compile to PDF
                    const hash = crypto.createHash('md5').update(tikzCode).digest('hex');
                    const tempTexFile = path.join(this.tempDir, `standalone_${hash}.tex`);
                    const tempPdfFile = path.join(this.tempDir, `standalone_${hash}.pdf`);

                    const latexDoc = `\\documentclass[tikz,border=2pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{arrows,shapes,positioning,calc,decorations}
\\begin{document}
${tikzCode}
\\end{document}`;

                    fs.writeFileSync(tempTexFile, latexDoc);
                    await execAsync(`pdflatex -interaction=nonstopmode -output-directory="${this.tempDir}" "${tempTexFile}"`);
                    fs.copyFileSync(tempPdfFile, outputPath.fsPath);
                }

                vscode.window.showInformationMessage(`TikZ exported to ${outputPath.fsPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Export failed: ${error}`);
            }
        });
    }

    /**
     * Insert TikZ template at cursor
     */
    private async insertTikzTemplate(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const templates = {
            'Basic Figure': `\\begin{tikzpicture}
    \\draw (0,0) circle (1cm);
\\end{tikzpicture}`,
            'Node Diagram': `\\begin{tikzpicture}[node distance=2cm]
    \\node (a) [draw, circle] {A};
    \\node (b) [draw, circle, right of=a] {B};
    \\draw[->] (a) -- (b);
\\end{tikzpicture}`,
            'Graph': `\\begin{tikzpicture}
    \\draw[->] (0,0) -- (5,0) node[right] {$x$};
    \\draw[->] (0,0) -- (0,4) node[above] {$y$};
    \\draw[domain=0:4,smooth,variable=\\x,blue] plot ({\\x},{\\x*\\x/4});
\\end{tikzpicture}`,
            'Flowchart': `\\begin{tikzpicture}[node distance=1.5cm]
    \\node (start) [draw, rectangle, rounded corners] {Start};
    \\node (process) [draw, rectangle, below of=start] {Process};
    \\node (end) [draw, rectangle, rounded corners, below of=process] {End};
    \\draw[->] (start) -- (process);
    \\draw[->] (process) -- (end);
\\end{tikzpicture}`
        };

        const selected = await vscode.window.showQuickPick(Object.keys(templates), {
            placeHolder: 'Select a TikZ template'
        });

        if (!selected) {
            return;
        }

        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, templates[selected as keyof typeof templates]);
        });
    }

    public dispose(): void {
        if (this.previewPanel) {
            this.previewPanel.dispose();
        }
        // Cleanup temp directory
        try {
            if (fs.existsSync(this.tempDir)) {
                fs.rmSync(this.tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }
}
