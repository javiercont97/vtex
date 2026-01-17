import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

/**
 * Alternative PDF viewer that uses the browser's native PDF rendering
 * instead of PDF.js. This is simpler but provides less control.
 */
export class NativePDFPreview {
    private panels: Map<string, vscode.WebviewPanel> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    async showPDF(pdfPath: string): Promise<void> {
        this.logger.info(`Opening PDF with native viewer: ${pdfPath}`);

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
                // Panel exists, reveal it
                panel.reveal(vscode.ViewColumn.Beside, true);
                // Could reload content here if needed
                await this.updatePDFContent(panel, pdfPath);
            } else {
                // Create new panel
                panel = vscode.window.createWebviewPanel(
                    'vtexNativePdfPreview',
                    path.basename(pdfPath),
                    {
                        viewColumn: vscode.ViewColumn.Beside,
                        preserveFocus: true
                    },
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [vscode.Uri.file(path.dirname(pdfPath))]
                    }
                );

                this.panels.set(panelKey, panel);

                // Load PDF content
                await this.updatePDFContent(panel, pdfPath);

                // Handle cleanup
                panel.onDidDispose(() => {
                    this.panels.delete(panelKey);
                });
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to open PDF: ${error.message}`);
            this.logger.error(`Failed to open PDF: ${error.message}`);
        }
    }

    private async updatePDFContent(panel: vscode.WebviewPanel, pdfPath: string): Promise<void> {
        // Get PDF URI for webview
        const pdfUri = panel.webview.asWebviewUri(vscode.Uri.file(pdfPath));

        panel.webview.html = this.getWebviewContent(pdfUri.toString(), path.basename(pdfPath));
    }

    private getWebviewContent(pdfUri: string, fileName: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${pdfUri}; style-src 'unsafe-inline';">
    <title>${fileName}</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
    </style>
</head>
<body>
    <iframe src="${pdfUri}" type="application/pdf"></iframe>
</body>
</html>`;
    }

    /**
     * Close all open PDF previews
     */
    closeAll(): void {
        this.panels.forEach(panel => panel.dispose());
        this.panels.clear();
    }

    /**
     * Close specific PDF preview
     */
    close(pdfPath: string): void {
        const panel = this.panels.get(pdfPath);
        if (panel) {
            panel.dispose();
        }
    }
}
