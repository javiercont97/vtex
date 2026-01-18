import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Manages TikZ code preview and compilation
 */
export class TikZPreview {
    private previewPanel: vscode.WebviewPanel | undefined;
    private tikzCache: Map<string, { svg: string; timestamp: number }> = new Map();
    private tempDir: string;

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
                const svg = await this.compileTikzToSvg(tikzCode);
                this.showPreview(svg, 'TikZ Preview');
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
        let depth = beginMatches.length - endMatchesBefore.length;
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
     * Compile TikZ code to SVG
     */
    private async compileTikzToSvg(tikzCode: string): Promise<string> {
        // Check cache
        const hash = crypto.createHash('md5').update(tikzCode).digest('hex');
        const cached = this.tikzCache.get(hash);
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached.svg;
        }

        // Create temporary LaTeX file
        const tempBaseName = `tikz_${hash}`;
        const tempTexFile = path.join(this.tempDir, `${tempBaseName}.tex`);
        const tempPdfFile = path.join(this.tempDir, `${tempBaseName}.pdf`);
        const tempSvgFile = path.join(this.tempDir, `${tempBaseName}.svg`);

        // Wrap TikZ code in standalone document
        const latexDoc = `\\documentclass[tikz,border=2pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{arrows,shapes,positioning,calc,decorations}
\\begin{document}
${tikzCode}
\\end{document}`;

        fs.writeFileSync(tempTexFile, latexDoc);

        try {
            // Compile to PDF
            const compileCmd = `pdflatex -interaction=nonstopmode -output-directory="${this.tempDir}" "${tempTexFile}"`;
            await execAsync(compileCmd, { cwd: this.tempDir });

            if (!fs.existsSync(tempPdfFile)) {
                throw new Error('PDF compilation failed');
            }

            // Convert PDF to SVG using pdf2svg or dvisvgm
            try {
                await execAsync(`pdf2svg "${tempPdfFile}" "${tempSvgFile}"`);
            } catch {
                // Fallback to dvisvgm if pdf2svg not available
                try {
                    await execAsync(`dvisvgm --pdf "${tempPdfFile}" -o "${tempSvgFile}"`);
                } catch {
                    throw new Error('Neither pdf2svg nor dvisvgm found. Please install one of them for TikZ preview.');
                }
            }

            if (!fs.existsSync(tempSvgFile)) {
                throw new Error('SVG conversion failed');
            }

            // Read SVG content
            const svg = fs.readFileSync(tempSvgFile, 'utf-8');

            // Cache result
            this.tikzCache.set(hash, { svg, timestamp: Date.now() });

            // Cleanup temporary files
            this.cleanupTempFiles(tempBaseName);

            return svg;
        } catch (error) {
            // Cleanup on error
            this.cleanupTempFiles(tempBaseName);
            throw error;
        }
    }

    /**
     * Cleanup temporary files
     */
    private cleanupTempFiles(baseName: string): void {
        const extensions = ['.tex', '.pdf', '.svg', '.aux', '.log'];
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
     * Show SVG preview in webview
     */
    private showPreview(svgContent: string, title: string): void {
        if (this.previewPanel) {
            this.previewPanel.title = title;
            this.previewPanel.webview.html = this.getPreviewHtml(svgContent);
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

            this.previewPanel.webview.html = this.getPreviewHtml(svgContent);

            this.previewPanel.onDidDispose(() => {
                this.previewPanel = undefined;
            });
        }
    }

    /**
     * Get HTML for SVG preview
     */
    private getPreviewHtml(svgContent: string): string {
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
        svg {
            display: block;
            margin: 0 auto;
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
    </style>
</head>
<body>
    <div class="controls">
        <button onclick="zoom(1.2)">Zoom In</button>
        <button onclick="zoom(0.8)">Zoom Out</button>
        <button onclick="reset()">Reset</button>
    </div>
    <div class="container" id="container">
        ${svgContent}
    </div>
    <script>
        let scale = 1;
        const container = document.getElementById('container');
        const svg = container.querySelector('svg');
        
        function zoom(factor) {
            scale *= factor;
            svg.style.transform = \`scale(\${scale})\`;
        }
        
        function reset() {
            scale = 1;
            svg.style.transform = 'scale(1)';
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
            filters: { 'PDF Files': ['pdf'], 'SVG Files': ['svg'] },
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
                if (ext === '.svg') {
                    const svg = await this.compileTikzToSvg(tikzCode);
                    fs.writeFileSync(outputPath.fsPath, svg);
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
