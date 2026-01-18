import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GrammarError {
    line: number;
    column: number;
    length: number;
    message: string;
    suggestions: string[];
    rule: string;
}

/**
 * Grammar and style checking for LaTeX documents
 */
export class GrammarChecker {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private isChecking: boolean = false;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('vtex-grammar');
        
        // Auto-check on save if enabled
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'latex') {
                const config = vscode.workspace.getConfiguration('vtex');
                if (config.get('grammarCheckOnSave', false)) {
                    this.checkDocument(document);
                }
            }
        });
    }

    /**
     * Register grammar checking commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.checkGrammar', () => this.checkCurrentDocument()),
            vscode.commands.registerCommand('vtex.clearGrammarErrors', () => this.clearErrors()),
            vscode.commands.registerCommand('vtex.toggleGrammarCheck', () => this.toggleAutoCheck())
        ];
    }

    /**
     * Check current document for grammar errors
     */
    private async checkCurrentDocument(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file first');
            return;
        }

        await this.checkDocument(editor.document);
    }

    /**
     * Check document for grammar and style errors
     */
    private async checkDocument(document: vscode.TextDocument): Promise<void> {
        if (this.isChecking) {
            return;
        }

        this.isChecking = true;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Checking grammar...',
            cancellable: false
        }, async () => {
            try {
                // Check if LanguageTool is available
                const hasLanguageTool = await this.checkLanguageTool();
                
                if (!hasLanguageTool) {
                    vscode.window.showWarningMessage(
                        'LanguageTool not found. Grammar checking requires LanguageTool CLI or server.',
                        'Learn More'
                    ).then(selection => {
                        if (selection === 'Learn More') {
                            vscode.env.openExternal(vscode.Uri.parse('https://languagetool.org/'));
                        }
                    });
                    return;
                }

                // Extract text content (remove LaTeX commands)
                const text = this.extractTextContent(document.getText());
                
                // Check with LanguageTool
                const errors = await this.checkWithLanguageTool(text, document);
                
                // Convert to diagnostics
                const diagnostics = this.convertToDiagnostics(errors);
                this.diagnosticCollection.set(document.uri, diagnostics);
                
                if (errors.length > 0) {
                    vscode.window.showInformationMessage(`Found ${errors.length} grammar/style issue(s)`);
                } else {
                    vscode.window.showInformationMessage('No grammar issues found');
                }

            } catch (error) {
                vscode.window.showErrorMessage(`Grammar check failed: ${error}`);
                this.logger.error(`Grammar check error: ${error}`);
            } finally {
                this.isChecking = false;
            }
        });
    }

    /**
     * Check if LanguageTool is available
     */
    private async checkLanguageTool(): Promise<boolean> {
        try {
            // Check for languagetool CLI
            await execAsync('languagetool --version');
            return true;
        } catch {
            try {
                // Check for languagetool-commandline
                await execAsync('languagetool-commandline.jar --version');
                return true;
            } catch {
                // Check if server is running
                const config = vscode.workspace.getConfiguration('vtex');
                const serverUrl = config.get('languageToolServer', 'http://localhost:8081');
                
                try {
                    const response = await fetch(serverUrl + '/v2/check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'text=test&language=en-US'
                    });
                    return response.ok;
                } catch {
                    return false;
                }
            }
        }
    }

    /**
     * Check text with LanguageTool
     */
    private async checkWithLanguageTool(text: string, document: vscode.TextDocument): Promise<GrammarError[]> {
        const config = vscode.workspace.getConfiguration('vtex');
        const language = config.get('grammarCheckLanguage', 'en-US');
        const serverUrl = config.get('languageToolServer', 'http://localhost:8081');

        try {
            // Try server first
            const response = await fetch(serverUrl + '/v2/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `text=${encodeURIComponent(text)}&language=${language}`
            });

            if (response.ok) {
                const data = await response.json();
                return this.parseLanguageToolResponse(data, document);
            }
        } catch {
            // Fallback to CLI
            try {
                const { stdout } = await execAsync(
                    `echo "${text.replace(/"/g, '\\"')}" | languagetool -l ${language} --json -`
                );
                const data = JSON.parse(stdout);
                return this.parseLanguageToolResponse(data, document);
            } catch (error) {
                this.logger.error(`LanguageTool CLI error: ${error}`);
            }
        }

        return [];
    }

    /**
     * Parse LanguageTool JSON response
     */
    private parseLanguageToolResponse(data: any, document: vscode.TextDocument): GrammarError[] {
        const errors: GrammarError[] = [];

        if (!data.matches || !Array.isArray(data.matches)) {
            return errors;
        }

        for (const match of data.matches) {
            const offset = match.offset;
            const position = document.positionAt(offset);
            
            errors.push({
                line: position.line,
                column: position.character,
                length: match.length,
                message: match.message,
                suggestions: match.replacements?.map((r: any) => r.value) || [],
                rule: match.rule?.id || 'unknown'
            });
        }

        return errors;
    }

    /**
     * Extract text content from LaTeX (remove commands)
     */
    private extractTextContent(latex: string): string {
        let text = latex;

        // Remove comments
        text = text.replace(/%.*$/gm, '');

        // Remove common environments to skip
        text = text.replace(/\\begin\{(equation|align|lstlisting|verbatim)\}[\s\S]*?\\end\{\1\}/g, '');

        // Remove math mode
        text = text.replace(/\$\$[\s\S]*?\$\$/g, '');
        text = text.replace(/\$[^\$]*?\$/g, '');
        text = text.replace(/\\\[[\s\S]*?\\\]/g, '');
        text = text.replace(/\\\(.*?\\\)/g, '');

        // Remove LaTeX commands but keep their content
        text = text.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1');
        text = text.replace(/\\[a-zA-Z]+/g, '');

        // Remove special characters
        text = text.replace(/[{}\\]/g, '');

        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();

        return text;
    }

    /**
     * Convert grammar errors to VS Code diagnostics
     */
    private convertToDiagnostics(errors: GrammarError[]): vscode.Diagnostic[] {
        return errors.map(error => {
            const range = new vscode.Range(
                error.line,
                error.column,
                error.line,
                error.column + error.length
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                error.message,
                vscode.DiagnosticSeverity.Information
            );

            diagnostic.source = 'vtex-grammar';
            diagnostic.code = error.rule;

            // Add code actions for suggestions
            if (error.suggestions.length > 0) {
                diagnostic.relatedInformation = error.suggestions.map(suggestion => ({
                    location: new vscode.Location(
                        vscode.window.activeTextEditor!.document.uri,
                        range
                    ),
                    message: `Suggestion: ${suggestion}`
                }));
            }

            return diagnostic;
        });
    }

    /**
     * Clear all grammar errors
     */
    private clearErrors(): void {
        this.diagnosticCollection.clear();
        vscode.window.showInformationMessage('Grammar errors cleared');
    }

    /**
     * Toggle automatic grammar checking
     */
    private async toggleAutoCheck(): Promise<void> {
        const config = vscode.workspace.getConfiguration('vtex');
        const current = config.get('grammarCheckOnSave', false);
        await config.update('grammarCheckOnSave', !current, vscode.ConfigurationTarget.Global);
        
        if (!current) {
            vscode.window.showInformationMessage('Auto grammar check enabled');
        } else {
            vscode.window.showInformationMessage('Auto grammar check disabled');
        }
    }

    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
