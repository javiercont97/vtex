/**
 * Table Hover Provider
 * Provides hover previews for LaTeX tables
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { TablePreview } from '../figures/tablePreview';
import { TableParser } from './tableParser';

export class TableHoverProvider implements vscode.HoverProvider {
    private readonly logger: Logger;
    private readonly parser: TableParser;

    constructor(
        private context: vscode.ExtensionContext,
        private tablePreview: TablePreview,
        logger: Logger
    ) {
        this.logger = logger;
        this.parser = new TableParser();
    }

    /**
     * Provide hover information for tables
     */
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (document.languageId !== 'latex') {
            return undefined;
        }

        // Check if cursor is on a table
        const tableInfo = this.parser.findTableAtPosition(document, position);
        if (!tableInfo) {
            return undefined;
        }

        // Render table in background
        try {
            this.logger.info(`Rendering table preview...`);
            const pngBase64 = await this.tablePreview.compileTableToPng(
                tableInfo.content,
                document.uri
            );
            
            if (pngBase64) {
                this.logger.info(`Table rendered successfully`);
                return this.createHoverWithImage(pngBase64, tableInfo.range, tableInfo.environment);
            } else {
                this.logger.warn(`Table rendering returned empty PNG`);
                return this.createTextHover(tableInfo.content, tableInfo.range, tableInfo.environment);
            }
        } catch (error) {
            this.logger.error(`Failed to render table: ${error}`);
            // Fallback to text preview
            return this.createTextHover(tableInfo.content, tableInfo.range, tableInfo.environment);
        }
    }

    /**
     * Create hover with rendered table image
     */
    private createHoverWithImage(
        pngBase64: string,
        range: vscode.Range,
        environment: string
    ): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.supportHtml = true;
        markdown.isTrusted = true;
        
        // Get config for max dimensions
        const config = vscode.workspace.getConfiguration('vtex');
        const maxWidth = config.get<number>('table.maxPreviewWidth', 400);
        const maxHeight = config.get<number>('table.maxPreviewHeight', 300);
        
        // Show rendered table as image with max dimensions
        const dataUri = `data:image/png;base64,${pngBase64}`;
        markdown.appendMarkdown(
            `<img src="${dataUri}" style="max-width: ${maxWidth}px; max-height: ${maxHeight}px; object-fit: contain;" />\n\n`
        );
        markdown.appendMarkdown(`---\n\n`);
        markdown.appendMarkdown(`📊 **${environment}** environment\n\n`);
        markdown.appendMarkdown(`💡 *Click "✏️ Edit Table" CodeLens to open editor*`);
        
        return new vscode.Hover(markdown, range);
    }

    /**
     * Create fallback text hover
     */
    private createTextHover(
        tableCode: string,
        range: vscode.Range,
        environment: string
    ): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**LaTeX Table** (${environment})\n\n`);
        
        // Show first few lines
        const lines = tableCode.split('\n').slice(0, 5);
        const preview = lines.join('\n') + (tableCode.split('\n').length > 5 ? '\n...' : '');
        markdown.appendCodeblock(preview, 'latex');
        
        markdown.appendMarkdown(`\n\n---\n\n`);
        markdown.appendMarkdown(`💡 *Hover to preview table rendering*\n\n`);
        markdown.appendMarkdown(`✏️ *Use CodeLens to open table editor*`);
        
        return new vscode.Hover(markdown, range);
    }
}
