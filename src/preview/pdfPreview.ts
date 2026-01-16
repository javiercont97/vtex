import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

export class PDFPreview {
    private panels: Map<string, vscode.WebviewPanel> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    async showPDF(documentUri: vscode.Uri): Promise<void> {
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
                // Panel exists, reveal it and update content
                panel.reveal(vscode.ViewColumn.Beside);
                this.updatePDFContent(panel, pdfPath);
            } else {
                // Create new panel
                panel = vscode.window.createWebviewPanel(
                    'vtexPdfPreview',
                    `PDF: ${docName}`,
                    vscode.ViewColumn.Beside,
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

            this.logger.info('PDF opened successfully');
        } catch (error) {
            this.logger.error(`Failed to open PDF: ${error}`);
            vscode.window.showErrorMessage(`Failed to open PDF: ${error}`);
        }
    }

    private updatePDFContent(panel: vscode.WebviewPanel, pdfPath: string): void {
        const pdfUri = panel.webview.asWebviewUri(vscode.Uri.file(pdfPath));
        panel.webview.html = this.getWebviewContent(pdfUri.toString());
    }

    private getWebviewContent(pdfUri: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; worker-src blob:;">
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
        <span id="pageInfo">Page <span id="currentPage">-</span> of <span id="totalPages">-</span></span>
        <button id="zoomOut" title="Zoom Out">−</button>
        <span id="zoomInfo"><span id="zoomLevel">100</span>%</span>
        <button id="zoomIn" title="Zoom In">+</button>
        <button id="fitWidth" title="Fit Width">Fit Width</button>
        <button id="refresh" title="Refresh PDF">⟳ Refresh</button>
    </div>
    
    <div id="pdfContainer">
        <canvas id="pdfCanvas"></canvas>
    </div>

    <script>
        const pdfUrl = '${pdfUri}';
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
                
                document.getElementById('currentPage').textContent = pageNum;
                currentPage = pageNum;
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
        }
        
        // Navigation
        document.getElementById('prevPage').addEventListener('click', () => {
            if (currentPage > 1) {
                renderPage(currentPage - 1);
                updateControls();
            }
        });
        
        document.getElementById('nextPage').addEventListener('click', () => {
            if (currentPage < pdfDoc.numPages) {
                renderPage(currentPage + 1);
                updateControls();
            }
        });
        
        // Zoom
        document.getElementById('zoomIn').addEventListener('click', () => {
            scale *= 1.2;
            renderPage(currentPage);
            updateControls();
        });
        
        document.getElementById('zoomOut').addEventListener('click', () => {
            scale /= 1.2;
            renderPage(currentPage);
            updateControls();
        });
        
        document.getElementById('fitWidth').addEventListener('click', () => {
            const containerWidth = container.clientWidth - 40;
            scale = containerWidth / (canvas.width / scale);
            renderPage(currentPage);
            updateControls();
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
        
        // Initial load
        loadPDF();
    </script>
</body>
</html>`;
    }
}
