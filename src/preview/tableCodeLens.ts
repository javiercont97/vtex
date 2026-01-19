/**
 * Table CodeLens Provider
 * Provides "Edit Table" CodeLens above table environments
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export class TableCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private logger: Logger) {}

    /**
     * Provide CodeLenses for table environments
     */
    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (document.languageId !== 'latex') {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const tables = this.findTables(document);

        for (const table of tables) {
            // Add "Edit Table" CodeLens
            const editLens = new vscode.CodeLens(table.range, {
                title: '✏️ Edit Table',
                command: 'vtex.openTableEditor',
                arguments: [table.content, table.range]
            });
            codeLenses.push(editLens);
        }

        return codeLenses;
    }

    /**
     * Find all tables in document
     */
    private findTables(document: vscode.TextDocument): Array<{
        content: string;
        range: vscode.Range;
        environment: string;
    }> {
        const tables: Array<{ content: string; range: vscode.Range; environment: string }> = [];
        const text = document.getText();

        // First, find all table environments (wrapper)
        const tableWrapperRegex = /\\begin\{table\}[\s\S]*?\\end\{table\}/g;
        let wrapperMatch: RegExpExecArray | null;
        const processedRanges: Array<{ start: number; end: number }> = [];

        while ((wrapperMatch = tableWrapperRegex.exec(text)) !== null) {
            const startPos = document.positionAt(wrapperMatch.index);
            const endPos = document.positionAt(wrapperMatch.index + wrapperMatch[0].length);
            
            // Position CodeLens on the line before \begin{table}
            const codeLensLine = Math.max(0, startPos.line - 1);
            const codeLensPos = new vscode.Position(codeLensLine, 0);
            const range = new vscode.Range(codeLensPos, codeLensPos);

            tables.push({
                content: wrapperMatch[0],
                range: new vscode.Range(startPos, endPos),
                environment: 'table'
            });
            
            // Track this range so we don't add tabular again
            processedRanges.push({ start: wrapperMatch.index, end: wrapperMatch.index + wrapperMatch[0].length });
        }

        // Then find standalone tabular environments (not inside table)
        const tabularRegex = /\\begin\{(tabular\*?|tabularx|longtable|array|tabu)\}[\s\S]*?\\end\{\1\}/g;
        let match: RegExpExecArray | null;

        while ((match = tabularRegex.exec(text)) !== null) {
            // Check if this tabular is inside a table environment we already found
            const isInsideTable = processedRanges.some(range => 
                match!.index >= range.start && match!.index < range.end
            );
            
            if (isInsideTable) {
                continue; // Skip, already handled by table environment
            }
            
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            
            // Position CodeLens on the line before \begin
            const codeLensLine = Math.max(0, startPos.line - 1);
            const codeLensPos = new vscode.Position(codeLensLine, 0);
            const range = new vscode.Range(codeLensPos, codeLensPos);

            tables.push({
                content: match[0],
                range: new vscode.Range(startPos, endPos),
                environment: match[1]
            });
        }

        return tables;
    }

    /**
     * Refresh CodeLenses
     */
    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
