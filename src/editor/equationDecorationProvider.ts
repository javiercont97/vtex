import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * Provides gutter decorations (icons) for lines containing equations
 */
export class EquationDecorationProvider {
    private decorationType: vscode.TextEditorDecorationType;
    private readonly logger: Logger;
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.logger = logger;
        this.context = context;

        // Create initial decoration type
        this.decorationType = this.createDecorationType();

        // Recreate decoration when theme changes
        vscode.window.onDidChangeActiveColorTheme(() => {
            this.decorationType.dispose();
            this.decorationType = this.createDecorationType();
            // Refresh decorations
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'latex') {
                this.updateDecorations(editor);
            }
        }, null, context.subscriptions);

        // Update decorations when active editor changes
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'latex') {
                this.updateDecorations(editor);
            }
        }, null, context.subscriptions);

        // Update decorations when document changes
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document && editor.document.languageId === 'latex') {
                this.updateDecorations(editor);
            }
        }, null, context.subscriptions);

        // Initial decoration for active editor
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'latex') {
            this.updateDecorations(vscode.window.activeTextEditor);
        }
    }

    /**
     * Get appropriate color for current theme
     */
    private getThemeColor(): string {
        const theme = vscode.window.activeColorTheme;
		
		switch (theme.kind) {
			case vscode.ColorThemeKind.Light:
				return '#3c3c3c'; // Gray for light themes
			case vscode.ColorThemeKind.HighContrastLight:
				return '#000000'; // Black for light themes
			case vscode.ColorThemeKind.Dark:
				return '#a5a5a5'; // Gray for dark themes (common in Dark+ theme)
			case vscode.ColorThemeKind.HighContrast:
				return '#FFFFFF'; // White for high contrast
			default:
				return '#a5a5a5'; // Gray fallback
		}
    }

    /**
     * Create decoration type with theme-appropriate color
     */
    private createDecorationType(): vscode.TextEditorDecorationType {
        const color = this.getThemeColor();
        
        return vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.parse(
                'data:image/svg+xml;utf8,' + encodeURIComponent(
                    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">` +
                    `<text x="1" y="12" font-family="serif" font-size="11" fill="${color}" font-style="italic" font-weight="500">f(x)</text>` +
                    `</svg>`
                )
            ),
            gutterIconSize: 'contain'
        });
    }

    /**
     * Update decorations for the given editor
     */
    private updateDecorations(editor: vscode.TextEditor): void {
        const document = editor.document;
        const decorations: vscode.DecorationOptions[] = [];

        const text = document.getText();
        
        // Find all inline equations $...$
        const inlineRegex = /\$([^\$]+)\$/g;
        let match;
        while ((match = inlineRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            decorations.push({
                range: new vscode.Range(startPos, startPos)
            });
        }

        // Find all display math \[...\]
        const displayRegex = /\\\[([\s\S]*?)\\\]/g;
        while ((match = displayRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            decorations.push({
                range: new vscode.Range(startPos, startPos)
            });
        }

        // Find all equation environments
        const equationRegex = /\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g;
        while ((match = equationRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            decorations.push({
                range: new vscode.Range(startPos, startPos)
            });
        }

        // Apply decorations
        editor.setDecorations(this.decorationType, decorations);
    }

    /**
     * Dispose decoration type
     */
    dispose(): void {
        this.decorationType.dispose();
    }
}
