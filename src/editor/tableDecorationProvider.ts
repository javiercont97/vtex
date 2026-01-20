import * as vscode from 'vscode';

/**
 * Provides gutter decorations for table lines in LaTeX documents
 */
export class TableDecorationProvider {
    private decorationType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
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
        }, null, this.disposables);

        // Update decorations when document changes
        vscode.window.onDidChangeActiveTextEditor(
            editor => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            },
            null,
            this.disposables
        );

        vscode.workspace.onDidChangeTextDocument(
            event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    this.updateDecorations(editor);
                }
            },
            null,
            this.disposables
        );

        // Initial decoration
        if (vscode.window.activeTextEditor) {
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
                return '#a5a5a5'; // Gray for dark themes
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
                    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
                    `<path fill="${color}" d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 2h-4v3h4zm0 4h-4v3h4zm0 4h-4v3h3a1 1 0 0 0 1-1zm-5 3v-3H6v3zm-5 0v-3H1v2a1 1 0 0 0 1 1zm-4-4h4V8H1zm0-4h4V4H1zm5-3v3h4V4zm4 4H6v3h4z"/>` +
                    `</svg>`
                )
            ),
            gutterIconSize: 'contain'
        });
    }

    /**
     * Update decorations for table lines
     */
    private updateDecorations(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'latex') {
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];
        const text = editor.document.getText();
        const lines = text.split('\n');

        // Match \begin{table} lines
        const tableRegex = /\\begin\{table\}/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (tableRegex.test(line)) {
                const range = new vscode.Range(i, 0, i, 0);
                decorations.push({ range });
            }
        }

        editor.setDecorations(this.decorationType, decorations);
    }

    dispose() {
        this.decorationType.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
