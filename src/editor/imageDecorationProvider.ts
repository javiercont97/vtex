import * as vscode from 'vscode';

/**
 * Provides gutter decorations for image/figure lines in LaTeX documents
 */
export class ImageDecorationProvider {
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
                    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
                    `<path fill="${color}" d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>` +
                    `<path fill="${color}" d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1z"/>` +
                    `</svg>`
                )
            ),
            gutterIconSize: 'contain'
        });
    }

    /**
     * Update decorations for image/figure lines
     */
    private updateDecorations(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'latex') {
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];
        const text = editor.document.getText();
        const lines = text.split('\n');

        // Only match \begin{figure} to avoid duplicate icons
        // (since \includegraphics is typically inside figure environments)
        const figureRegex = /\\begin\{figure\}/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (figureRegex.test(line)) {
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
