/**
 * Table Preview Service
 * Renders LaTeX tables to PNG for preview
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import { BuildSystem } from '../buildSystem/builder';
import { Jimp } from 'jimp';


export class TablePreview {
    private buildSystem: BuildSystem | undefined;
    private preambleCache: Map<string, string> = new Map();
    private tableCache: Map<string, { png: string; timestamp: number }> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    /**
     * Set build system reference
     */
    setBuildSystem(buildSystem: BuildSystem): void {
        this.buildSystem = buildSystem;
    }

    /**
     * Compile table code to PNG image
     */
    async compileTableToPng(
        tableCode: string,
        documentUri: vscode.Uri
    ): Promise<string | null> {
        if (!this.buildSystem) {
            this.logger.error('Build system not initialized');
            return null;
        }

        // Check cache first
        const hash = crypto.createHash('md5').update(tableCode).digest('hex');
        const cached = this.tableCache.get(hash);
        if (cached && Date.now() - cached.timestamp < 60000) {
            this.logger.info('Using cached table preview');
            return cached.png;
        }

        try {
            this.logger.info('Compiling table to PNG...');
            
            // Extract document preamble
            const preamble = await this.extractPreamble(documentUri);
            
            // Create standalone document
            const texContent = this.createStandaloneDocument(tableCode, preamble);
            
            // Create temp directory
            const tempDir = await fs.promises.mkdtemp(
                path.join(os.tmpdir(), 'vtex-table-')
            );
            
            try {
                // Write TeX file
                const texPath = path.join(tempDir, 'table.tex');
                await fs.promises.writeFile(texPath, texContent, 'utf-8');
                
                // Compile to PDF
                const pdfPath = await this.compileToPdf(texPath);
                if (!pdfPath) {
                    return null;
                }
                
                // Convert PDF to PNG
                const pngBase64 = await this.convertPdfToPng(pdfPath, tempDir);
                
                // Cache result
                this.tableCache.set(hash, { png: pngBase64, timestamp: Date.now() });
                
                return pngBase64;
            } finally {
                // Cleanup temp directory
                try {
                    await fs.promises.rm(tempDir, { recursive: true, force: true });
                } catch (error) {
                    this.logger.warn(`Failed to cleanup temp directory: ${error}`);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to compile table: ${error}`);
            return null;
        }
    }

    /**
     * Extract preamble from document (packages, custom commands)
     */
    private async extractPreamble(documentUri: vscode.Uri): Promise<string> {
        // Check cache
        const cacheKey = documentUri.toString();
        if (this.preambleCache.has(cacheKey)) {
            return this.preambleCache.get(cacheKey)!;
        }

        try {
            const document = await vscode.workspace.openTextDocument(documentUri);
            const text = document.getText();
            
            // Extract everything between \documentclass and \begin{document}
            const preambleMatch = text.match(/\\documentclass[\s\S]*?(?=\\begin\{document\})/);
            if (preambleMatch) {
                const preamble = preambleMatch[0];
                this.preambleCache.set(cacheKey, preamble);
                return preamble;
            }
        } catch (error) {
            this.logger.warn(`Failed to extract preamble: ${error}`);
        }

        // Return default preamble with common table packages
        // Use standalone class for tight-fitting output
        const defaultPreamble = `\\documentclass[border=2pt]{standalone}
\\usepackage{array}
\\usepackage{booktabs}
\\usepackage{multirow}
\\usepackage{tabularx}
\\usepackage{longtable}
\\usepackage{xcolor}`;
        
        return defaultPreamble;
    }

    /**
     * Create standalone LaTeX document for table
     */
    private createStandaloneDocument(tableCode: string, preamble: string): string {
        // If preamble doesn't include documentclass, use standalone for tight fit
        let fullPreamble = preamble;
        if (!preamble.includes('\\documentclass')) {
            fullPreamble = `\\documentclass[border=2pt]{standalone}\n${preamble}`;
        } else {
            // If using article or other class, try to use standalone instead
            fullPreamble = fullPreamble.replace(/\\documentclass(?:\[[^\]]*\])?\{article\}/, '\\documentclass[border=2pt]{standalone}');
        }

        // Ensure required packages are included
        const requiredPackages = ['array', 'booktabs', 'multirow', 'tabularx'];
        for (const pkg of requiredPackages) {
            if (!fullPreamble.includes(`\\usepackage{${pkg}}`)) {
                fullPreamble += `\n\\usepackage{${pkg}}`;
            }
        }

        // Remove geometry package if present (not needed with standalone)
        fullPreamble = fullPreamble.replace(/\\usepackage(?:\[[^\]]*\])?\{geometry\}\n?/g, '');

        // Strip table environment wrapper if present (standalone doesn't support floats)
        let processedTableCode = tableCode;
        
        // Check if the table code contains \begin{table}
        if (processedTableCode.includes('\\begin{table}')) {
            // Extract the content between \begin{table} and \end{table}
            const tableMatch = processedTableCode.match(/\\begin\{table\}[\s\S]*?\\end\{table\}/);
            if (tableMatch) {
                let tableContent = tableMatch[0];
                
                // Remove \begin{table}[options]
                tableContent = tableContent.replace(/\\begin\{table\}(?:\[[^\]]*\])?/, '');
                
                // Remove \end{table}
                tableContent = tableContent.replace(/\\end\{table\}/, '');
                
                // Remove \caption and \label commands
                tableContent = tableContent.replace(/\\caption(?:\[[^\]]*\])?\{[^}]*\}/g, '');
                tableContent = tableContent.replace(/\\label\{[^}]*\}/g, '');
                
                // Remove centering if present
                tableContent = tableContent.replace(/\\centering\s*/g, '');
                
                processedTableCode = tableContent.trim();
            }
        }

        return `${fullPreamble}

\\begin{document}

${processedTableCode}

\\end{document}`;
    }

    /**
     * Compile TeX to PDF
     */
    private async compileToPdf(texPath: string): Promise<string | null> {
        if (!this.buildSystem) {
            return null;
        }

        try {
            const texUri = vscode.Uri.file(texPath);
            const result = await this.buildSystem.build(texUri);
            
            if (result.success && result.pdfPath) {
                return result.pdfPath;
            } else {
                this.logger.error(`PDF compilation failed: ${result.output}`);
                return null;
            }
        } catch (error) {
            this.logger.error(`Compilation error: ${error}`);
            return null;
        }
    }

    /**
     * Convert PDF to PNG using webview rendering (same approach as TikZ preview)
     */
    private async convertPdfToPng(pdfPath: string, tempDir: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Store the currently active editor to restore focus later
            const activeEditor = vscode.window.activeTextEditor;

            // Create a hidden webview panel for rendering
            const renderingPanel = vscode.window.createWebviewPanel(
                'tableRenderer',
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
            renderingPanel.webview.onDidReceiveMessage(
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
                            renderingPanel.dispose();

                            // Restore focus to original editor
                            if (activeEditor) {
                                await vscode.window.showTextDocument(activeEditor.document, activeEditor.viewColumn);
                            }

                            resolve(finalBase64);
                        } catch (error) {
                            renderingPanel.dispose();
                            reject(error);
                        }
                    } else if (message.type === 'error') {
                        renderingPanel.dispose();
                        reject(new Error(message.message));
                    }
                },
                undefined,
                this.context.subscriptions
            );

            // Set webview HTML with PDF.js rendering
            renderingPanel.webview.html = this.getRenderingHtml(pdfBase64);
        });
    }

    /**
     * Get HTML for PDF rendering webview using PDF.js
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
                        
                        // Convert to base64
                        const imageData = captureCanvas.toDataURL('image/png');
                        
                        // Send back to extension
                        vscode.postMessage({
                            type: 'imageRendered',
                            data: imageData
                        });
                    } catch (error) {
                        vscode.postMessage({
                            type: 'error',
                            message: 'Failed to capture image: ' + error.message
                        });
                    }
                }, 500);
            } catch (error) {
                vscode.postMessage({
                    type: 'error',
                    message: 'Failed to render PDF: ' + error.message
                });
            }
        }).catch((error) => {
            vscode.postMessage({
                type: 'error',
                message: 'Failed to load PDF: ' + error.message
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Clear all caches
     */
    clearCache(): void {
        this.preambleCache.clear();
        this.tableCache.clear();
    }
}
