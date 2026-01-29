import * as vscode from 'vscode';

/**
 * Provides CodeLens for equations with click-to-edit functionality
 */
export class EquationCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {}

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (document.languageId !== 'latex') {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();

        // Find equations
        const patterns = [
            { regex: /\\begin\{equation\}[\s\S]*?\\end\{equation\}/g, type: 'equation' },
            { regex: /\\\[[\s\S]*?\\\]/g, type: 'display' },
            { regex: /\$\$[\s\S]*?\$\$/g, type: 'display' },
            { regex: /\$[^$\n]+\$/g, type: 'inline' }
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const fullRange = new vscode.Range(startPos, endPos);
                const codeLensRange = new vscode.Range(startPos, startPos);
                
                // Extract equation content
                let equation = match[0];
                if (pattern.type === 'equation') {
                    equation = equation.replace(/\\begin\{equation\}|\\end\{equation\}/g, '').trim();
                } else if (pattern.type === 'display') {
                    equation = equation.replace(/\\\[|\\\]|\$\$/g, '').trim();
                } else {
                    equation = equation.replace(/\$/g, '').trim();
                }
                
                const codeLens = new vscode.CodeLens(codeLensRange, {
                    title: '✏️ Edit Equation',
                    command: 'intex.openEquationEditor',
                    arguments: [equation, fullRange, pattern.type]
                });
                
                codeLenses.push(codeLens);
            }
        }

        return codeLenses;
    }
}
