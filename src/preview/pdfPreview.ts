import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

export class PDFPreview {
    private panels: Map<string, vscode.WebviewPanel> = new Map();
    private inverseSearchCallback?: (pdfPath: string, page: number, x: number, y: number) => Promise<void>;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    /**
     * Set callback for inverse search (PDF → editor)
     */
    public setInverseSearchCallback(callback: (pdfPath: string, page: number, x: number, y: number) => Promise<void>): void {
        this.inverseSearchCallback = callback;
    }

    async showPDF(documentUri: vscode.Uri, position?: { page: number; x: number; y: number }): Promise<void> {
        const docPath = documentUri.fsPath;
        const docDir = path.dirname(docPath);
        const docName = path.basename(docPath, '.tex');
        const pdfPath = path.join(docDir, `${docName}.pdf`);

        this.logger.info(`Opening PDF: ${pdfPath}`);

        try {
            // Check if PDF exists
            if (!fs.existsSync(pdfPath)) {
                vscode.window.showErrorMessage(`PDF not found: ${pdfPath}`);
                return;
            }

            // Get or create panel for this PDF
            const panelKey = pdfPath;
            let panel = this.panels.get(panelKey);

            if (panel) {
                // Panel exists, reveal it and update content (without stealing focus)
                panel.reveal(vscode.ViewColumn.Beside, true);
                this.updatePDFContent(panel, pdfPath);
            } else {
                // Create new panel (without stealing focus)
                panel = vscode.window.createWebviewPanel(
                    'vtexPdfPreview',
                    `PDF: ${docName}`,
                    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [vscode.Uri.file(docDir)]
                    }
                );

                this.panels.set(panelKey, panel);

                // Clean up when panel is disposed
                panel.onDidDispose(() => {
                    this.panels.delete(panelKey);
                });

                // Set initial content
                this.updatePDFContent(panel, pdfPath);
            }

            // Handle messages from webview (for inverse search)
            // Register this every time to ensure it works with reused panels
            panel.webview.onDidReceiveMessage(
                async (message) => {
                    if (message.type === 'inverseSearch' && this.inverseSearchCallback) {
                        await this.inverseSearchCallback(pdfPath, message.page, message.x, message.y);
                    } else if (message.type === 'triggerForwardSearch') {
                        // Trigger forward search from the active editor
                        await vscode.commands.executeCommand('vtex.forwardSearch');
                    }
                },
                undefined,
                this.context.subscriptions
            );
            
            // If position provided, send it to webview after content loads
            if (position && panel) {
                setTimeout(() => {
                    panel.webview.postMessage({
                        type: 'scrollToPosition',
                        page: position.page,
                        x: position.x,
                        y: position.y
                    });
                }, 500); // Small delay to ensure PDF is loaded
            }

            this.logger.info('PDF opened successfully');
        } catch (error) {
            this.logger.error(`Failed to open PDF: ${error}`);
            vscode.window.showErrorMessage(`Failed to open PDF: ${error}`);
        }
    }

    private updatePDFContent(panel: vscode.WebviewPanel, pdfPath: string): void {
        try {
            // Read PDF file as base64 to work with WSL and cross-platform scenarios
            const pdfBuffer = fs.readFileSync(pdfPath);
            const pdfBase64 = pdfBuffer.toString('base64');
            const pdfDataUri = `data:application/pdf;base64,${pdfBase64}`;
            
            panel.webview.html = this.getWebviewContent(pdfDataUri);
            this.logger.info(`PDF loaded: ${pdfPath} (${pdfBuffer.length} bytes)`);
        } catch (error) {
            this.logger.error(`Failed to read PDF file: ${error}`);
            panel.webview.html = this.getErrorContent(`Failed to read PDF: ${error}`);
        }
    }

    private getWebviewContent(pdfDataUri: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; worker-src blob:; img-src data:; connect-src data:;">
    <title>PDF Preview</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #525252;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        #controls {
            background-color: #333;
            color: white;
            padding: 10px;
            display: flex;
            align-items: center;
            gap: 15px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            z-index: 10;
        }
        
        #controls button {
            background-color: #007acc;
            color: white;
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 14px;
        }
        
        #controls button:hover {
            background-color: #005a9e;
        }
        
        #controls button:disabled {
            background-color: #555;
            cursor: not-allowed;
        }
        
        #pageInfo {
            flex-grow: 1;
            text-align: center;
            font-size: 14px;
        }
        
        #zoomInfo {
            font-size: 14px;
        }
        
        #pdfContainer {
            flex: 1;
            overflow: auto;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 20px;
        }
        
        #pdfCanvas {
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
            background: white;
            max-width: 100%;
            height: auto;
        }
        
        .loading {
            color: white;
            text-align: center;
            padding: 50px;
            font-size: 18px;
        }
        
        .error {
            color: #ff6b6b;
            text-align: center;
            padding: 50px;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div id="controls">
        <button id="prevPage" title="Previous Page">← Prev</button>
        <button id="nextPage" title="Next Page">Next →</button>
        <span id="pageInfo">Page <input type="number" id="pageInput" min="1" value="1" style="width: 60px; text-align: center;"> of <span id="totalPages">-</span></span>
        <button id="zoomOut" title="Zoom Out">−</button>
        <span id="zoomInfo"><span id="zoomLevel">100</span>%</span>
        <button id="zoomIn" title="Zoom In">+</button>
        <button id="resetZoom" title="Reset Zoom to 100%">Reset Zoom</button>
        <button id="fitWidth" title="Fit Width">Fit Width</button>
        <button id="forwardSearch" title="Forward Search (Ctrl+Alt+J)">Editor → PDF</button>
        <button id="refresh" title="Refresh PDF">⟳ Refresh</button>
    </div>
    
    <div id="pdfContainer">
        <canvas id="pdfCanvas"></canvas>
    </div>

    <script>
        // Acquire VS Code API once and reuse it
        const vscode = acquireVsCodeApi();
        
        const pdfUrl = '${pdfDataUri}';
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        let pdfDoc = null;
        let currentPage = 1;
        let scale = 1.5;
        let rendering = false;
        
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        const container = document.getElementById('pdfContainer');
        
        // Load PDF
        async function loadPDF() {
            try {
                pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
                document.getElementById('totalPages').textContent = pdfDoc.numPages;
                renderPage(currentPage);
                updateControls();
            } catch (error) {
                container.innerHTML = '<div class="error">Failed to load PDF: ' + error.message + '</div>';
                console.error('Error loading PDF:', error);
            }
        }
        
        // Render page
        async function renderPage(pageNum) {
            if (rendering) return;
            rendering = true;
            
            try {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: scale });
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                currentPage = pageNum;
                updateControls();
            } catch (error) {
                console.error('Error rendering page:', error);
            } finally {
                rendering = false;
            }
        }
        
        function updateControls() {
            document.getElementById('prevPage').disabled = currentPage <= 1;
            document.getElementById('nextPage').disabled = currentPage >= pdfDoc.numPages;
            document.getElementById('zoomLevel').textContent = Math.round(scale * 100);
            document.getElementById('pageInput').value = currentPage;
            document.getElementById('pageInput').max = pdfDoc.numPages;
        }
        
        // Navigation
        document.getElementById('prevPage').addEventListener('click', () => {
            if (currentPage > 1) {
                renderPage(currentPage - 1);
            }
        });
        
        document.getElementById('nextPage').addEventListener('click', () => {
            if (currentPage < pdfDoc.numPages) {
                renderPage(currentPage + 1);
            }
        });

        // Page input handler
        document.getElementById('pageInput').addEventListener('change', (e) => {
            let pageNum = parseInt(e.target.value);
            if (pageNum < 1) pageNum = 1;
            if (pageNum > pdfDoc.numPages) pageNum = pdfDoc.numPages;
            renderPage(pageNum);
        });

        document.getElementById('pageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let pageNum = parseInt(e.target.value);
                if (pageNum < 1) pageNum = 1;
                if (pageNum > pdfDoc.numPages) pageNum = pdfDoc.numPages;
                renderPage(pageNum);
                e.target.blur();
            }
        });
        
        // Zoom
        document.getElementById('zoomIn').addEventListener('click', () => {
            scale *= 1.2;
            renderPage(currentPage);
        });
        
        document.getElementById('zoomOut').addEventListener('click', () => {
            scale /= 1.2;
            renderPage(currentPage);
        });
        
        document.getElementById('fitWidth').addEventListener('click', () => {
            const containerWidth = container.clientWidth - 40;
            scale = containerWidth / (canvas.width / scale);
            renderPage(currentPage);
        });

        document.getElementById('resetZoom').addEventListener('click', () => {
            scale = 1.0;
            renderPage(currentPage);
        });

        // Forward search button
        document.getElementById('forwardSearch').addEventListener('click', () => {
            vscode.postMessage({ type: 'triggerForwardSearch' });
        });
        
        // Refresh
        document.getElementById('refresh').addEventListener('click', () => {
            loadPDF();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                document.getElementById('prevPage').click();
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                document.getElementById('nextPage').click();
            } else if (e.key === '+' || e.key === '=') {
                document.getElementById('zoomIn').click();
            } else if (e.key === '-' || e.key === '_') {
                document.getElementById('zoomOut').click();
            }
        });
        
        // Listen for SyncTeX position messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'scrollToPosition') {
                // Navigate to the specified page
                if (message.page && message.page !== currentPage) {
                    renderPage(message.page);
                }
                // TODO: Scroll to exact x,y position within page if needed
                // This would require calculating viewport coordinates from PDF coordinates
            }
        });

        // Inverse search: Ctrl+Click on PDF → jump to source
        canvas.addEventListener('click', async (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                
                // Get click coordinates relative to canvas
                const rect = canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                
                // Convert canvas coordinates to PDF coordinates
                const page = await pdfDoc.getPage(currentPage);
                const viewport = page.getViewport({ scale: scale });
                
                // PDF.js uses bottom-left origin, so we need to flip Y
                const pdfX = x / scale;
                const pdfY = viewport.height / scale - (y / scale);
                
                // Send inverse search request to extension
                vscode.postMessage({
                    type: 'inverseSearch',
                    page: currentPage,
                    x: pdfX,
                    y: pdfY
                });
            }
        });

        // Initial load
        loadPDF();
    </script>
</body>
</html>`;
    }

    private getErrorContent(errorMessage: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Preview Error</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #1e1e1e;
            color: #cccccc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        
        .error-container {
            text-align: center;
            padding: 40px;
            max-width: 600px;
        }
        
        .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        
        h1 {
            color: #f48771;
            margin-bottom: 20px;
        }
        
        p {
            line-height: 1.6;
            margin-bottom: 10px;
        }
        
        .error-message {
            background-color: #2d2d2d;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
            font-family: monospace;
            font-size: 14px;
            word-break: break-word;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">📄❌</div>
        <h1>Failed to Load PDF</h1>
        <p>The PDF file could not be loaded.</p>
        <div class="error-message">${errorMessage}</div>
        <p style="margin-top: 30px;">
            Make sure the LaTeX document compiled successfully and try building again.
        </p>
    </div>
</body>
</html>`;
    }
}
