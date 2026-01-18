import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { TikZPreview } from '../figures/tikzPreview';

/**
 * Provides hover previews for TikZ diagrams
 */
export class TikZHoverProvider implements vscode.HoverProvider {
    private readonly logger: Logger;

    constructor(
        private context: vscode.ExtensionContext,
        private tikzPreview: TikZPreview,
        logger: Logger
    ) {
        this.logger = logger;
    }

    /**
     * Provide hover information for TikZ diagrams
     */
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (document.languageId !== 'latex') {
            return undefined;
        }

        // Check if cursor is on a TikZ diagram
        const tikzInfo = this.findTikZAtPosition(document, position);
        if (!tikzInfo) {
            return undefined;
        }

        // Render TikZ diagram in background
        try {
            this.logger.info(`Rendering TikZ diagram...`);
            const pngBase64 = await this.tikzPreview.compileTikzToPng(tikzInfo.content, document.uri);
            
            if (pngBase64) {
                this.logger.info(`TikZ diagram rendered successfully`);
                return this.createHoverWithImage(pngBase64, tikzInfo.range);
            } else {
                this.logger.warn(`TikZ rendering returned empty PNG`);
                return this.createTextHover(tikzInfo.content, tikzInfo.range);
            }
        } catch (error) {
            this.logger.error(`Failed to render TikZ: ${error}`);
            // Fallback to text preview
            return this.createTextHover(tikzInfo.content, tikzInfo.range);
        }
    }

    /**
     * Create hover with rendered TikZ image
     */
    private createHoverWithImage(pngBase64: string, range: vscode.Range): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.supportHtml = true;
        markdown.isTrusted = true;
        
        // Show rendered diagram as image
        const dataUri = `data:image/png;base64,${pngBase64}`;
        markdown.appendMarkdown(`![tikz](${dataUri})\n\n`);
        markdown.appendMarkdown(`---\n\n`);
        
        // Check if TikZ editor is enabled
        const config = vscode.workspace.getConfiguration('vtex');
        const tikzEditorEnabled = config.get<boolean>('experimental.enableTikZEditor', false);
        
        if (tikzEditorEnabled) {
            markdown.appendMarkdown(`💡 *Click "✏️ Edit TikZ" CodeLens to edit*`);
        } else {
            markdown.appendMarkdown(`💡 *TikZ diagram preview*`);
        }
        
        return new vscode.Hover(markdown, range);
    }

    /**
     * Create fallback text hover
     */
    private createTextHover(tikzCode: string, range: vscode.Range): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**TikZ Diagram**\n\n`);
        markdown.appendCodeblock(tikzCode.substring(0, 200) + (tikzCode.length > 200 ? '...' : ''), 'latex');
        markdown.appendMarkdown(`\n\n---\n\n`);
        markdown.appendMarkdown(`💡 *Hover to preview TikZ diagram*`);
        
        return new vscode.Hover(markdown, range);
    }

    /**
     * Find TikZ diagram at cursor position
     */
    private findTikZAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): { content: string; range: vscode.Range } | undefined {
        const text = document.getText();
        
        // Find all tikzpicture environments
        const tikzRegex = /\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g;
        let match: RegExpExecArray | null;
        
        while ((match = tikzRegex.exec(text)) !== null) {
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            
            const cursorOffset = document.offsetAt(position);
            if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
                return {
                    content: match[0],
                    range: new vscode.Range(startPos, endPos)
                };
            }
        }

        return undefined;
    }
}
