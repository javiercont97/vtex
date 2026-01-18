import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * Provides hover previews for LaTeX equations using pre-rendered images
 */
export class EquationHoverProvider implements vscode.HoverProvider {
    private readonly logger: Logger;
    private renderCache: Map<string, string> = new Map(); // equation -> SVG data URI

    constructor(private context: vscode.ExtensionContext, logger: Logger) {
        this.logger = logger;
    }

    /**
     * Provide hover information for equations
     */
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (document.languageId !== 'latex') {
            return undefined;
        }

        // Check if cursor is on an equation
        const equation = this.findEquationAtPosition(document, position);
        if (!equation) {
            return undefined;
        }

        // Create cache key
        const cacheKey = `${equation.type}:${equation.content}`;

        // Check cache first
        if (this.renderCache.has(cacheKey)) {
            const svgDataUri = this.renderCache.get(cacheKey)!;
            return this.createHoverWithImage(svgDataUri, equation.content, equation.type, equation.range);
        }

        // Render equation in background
        try {
            this.logger.info(`Rendering equation: ${equation.content.substring(0, 50)}...`);
            const svgDataUri = await this.renderEquation(equation.content, equation.type);
            if (svgDataUri) {
                this.logger.info(`Equation rendered successfully`);
                this.renderCache.set(cacheKey, svgDataUri);
                return this.createHoverWithImage(svgDataUri, equation.content, equation.type, equation.range);
            } else {
                this.logger.warn(`Equation rendering returned empty SVG`);
                return this.createTextHover(equation.content, equation.type, equation.range);
            }
        } catch (error) {
            this.logger.error(`Failed to render equation: ${error}`);
            // Fallback to text preview
            return this.createTextHover(equation.content, equation.type, equation.range);
        }
    }

    /**
     * Create hover with rendered equation image
     */
    private createHoverWithImage(svgDataUri: string, equation: string, type: string, range: vscode.Range): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.supportHtml = true;
        markdown.isTrusted = true;
        
        // Show rendered equation as image
        markdown.appendMarkdown(`![equation](${svgDataUri})\n\n`);
        markdown.appendMarkdown(`---\n\n`);
        markdown.appendMarkdown(`💡 *Click "✏️ Edit Equation" CodeLens to edit*`);
        
        return new vscode.Hover(markdown, range);
    }

    /**
     * Create fallback text hover
     */
    private createTextHover(equation: string, type: string, range: vscode.Range): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**LaTeX Equation** (${type})\n\n`);
        markdown.appendCodeblock(equation, 'latex');
        markdown.appendMarkdown(`\n\n---\n\n`);
        markdown.appendMarkdown(`💡 *Click "✏️ Edit Equation" CodeLens to edit*`);
        
        return new vscode.Hover(markdown, range);
    }

    /**
     * Render equation to SVG using hidden webview
     */
    private renderEquation(equation: string, type: 'inline' | 'display' | 'equation'): Promise<string> {
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36);
            let isResolved = false;
            
            // Create render panel in background (will be disposed after rendering)
            // Note: Panel will briefly appear but is quickly disposed after rendering
            const renderPanel = vscode.window.createWebviewPanel(
                'equationRenderer',
                'Equation Renderer',
                vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: false
                }
            );

            renderPanel.webview.html = this.getRenderPanelHtml();
            
            // Immediately hide the panel
            renderPanel.dispose = (() => {
                const originalDispose = renderPanel.dispose.bind(renderPanel);
                return () => {
                    if (!isResolved) {
                        isResolved = true;
                    }
                    originalDispose();
                };
            })();

            // Handle messages from webview
            const messageHandler = renderPanel.webview.onDidReceiveMessage(message => {
                if (message.type === 'ready') {
                    // Webview is ready, now send render request
                    const displayMode = type !== 'inline';
                    renderPanel.webview.postMessage({
                        type: 'render',
                        requestId: requestId,
                        equation: equation,
                        displayMode: displayMode
                    });
                } else if (message.type === 'rendered' && message.requestId === requestId) {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(message.svg);
                        messageHandler.dispose();
                        renderPanel.dispose();
                    }
                } else if (message.type === 'error' && message.requestId === requestId) {
                    if (!isResolved) {
                        isResolved = true;
                        this.logger.error(`Render error: ${message.error}`);
                        resolve('');
                        messageHandler.dispose();
                        renderPanel.dispose();
                    }
                }
            });

            // Timeout and cleanup after 5 seconds
            setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    this.logger.warn(`Equation rendering timed out after 5s`);
                    messageHandler.dispose();
                    renderPanel.dispose();
                    reject(new Error('Rendering timeout'));
                }
            }, 5000);
        });
    }

    /**
     * Get HTML for hidden render panel
     */
    private getRenderPanelHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
    <style>
        body { 
            margin: 0; 
            padding: 10px;
            background: transparent;
        }
        #container { 
            display: inline-block;
            color: var(--vscode-editor-foreground, #333);
        }
        .katex { color: inherit; }
    </style>
</head>
<body>
    <div id="container"></div>
    <script>
        const vscode = acquireVsCodeApi();
        
        // Signal that webview is ready
        vscode.postMessage({ type: 'ready' });
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'render') {
                const container = document.getElementById('container');
                container.innerHTML = '';
                
                try {
                    katex.render(message.equation, container, {
                        displayMode: message.displayMode,
                        throwOnError: false,
                        output: 'html'
                    });
                    
                    // Get theme color and apply to container
                    const computedStyle = window.getComputedStyle(document.body);
                    const foregroundColor = computedStyle.getPropertyValue('--vscode-editor-foreground') || '#d4d4d4';
                    container.style.color = foregroundColor;
                    container.style.fontSize = '1em';
                    container.style.padding = '10px';
                    
                    // Use html2canvas to convert the rendered equation to PNG
                    html2canvas(container, {
                        backgroundColor: null,
                        scale: 2,
                        logging: false,
                        allowTaint: true,
                        useCORS: true
                    }).then(canvas => {
                        const pngDataUri = canvas.toDataURL('image/png');
                        
                        vscode.postMessage({
                            type: 'rendered',
                            requestId: message.requestId,
                            svg: pngDataUri
                        });
                    }).catch(error => {
                        vscode.postMessage({
                            type: 'error',
                            requestId: message.requestId,
                            error: error.message
                        });
                    });
                } catch (error) {
                    vscode.postMessage({
                        type: 'error',
                        requestId: message.requestId,
                        error: error.message
                    });
                }
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Find equation at cursor position
     */
    private findEquationAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { content: string; type: 'inline' | 'display' | 'equation'; range: vscode.Range } | undefined {
        const line = document.lineAt(position.line);
        const lineText = line.text;
        const cursorPos = position.character;

        // Check for inline math $...$
        const inlineRegex = /\$([^\$]+)\$/g;
        let match;
        while ((match = inlineRegex.exec(lineText)) !== null) {
            const startPos = match.index;
            const endPos = match.index + match[0].length;
            if (cursorPos >= startPos && cursorPos <= endPos) {
                return {
                    content: match[1].trim(),
                    type: 'inline',
                    range: new vscode.Range(
                        position.line,
                        startPos,
                        position.line,
                        endPos
                    )
                };
            }
        }

        // Check for display math \[...\]
        const text = document.getText();
        const displayRegex = /\\\[([\s\S]*?)\\\]/g;
        while ((match = displayRegex.exec(text)) !== null) {
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            
            const cursorOffset = document.offsetAt(position);
            if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
                return {
                    content: match[1].trim(),
                    type: 'display',
                    range: new vscode.Range(startPos, endPos)
                };
            }
        }

        // Check for equation environment \begin{equation}...\end{equation}
        const equationRegex = /\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g;
        while ((match = equationRegex.exec(text)) !== null) {
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            
            const cursorOffset = document.offsetAt(position);
            if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
                return {
                    content: match[1].trim(),
                    type: 'equation',
                    range: new vscode.Range(startPos, endPos)
                };
            }
        }

        return undefined;
    }
}
