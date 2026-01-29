import * as vscode from 'vscode';

/**
 * Provides CodeLens for figures with click-to-edit functionality
 */
export class FigureCodeLensProvider implements vscode.CodeLensProvider {
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
        
        // Check if TikZ editor experimental feature is enabled
        const config = vscode.workspace.getConfiguration('intex');
        const tikzEditorEnabled = config.get<boolean>('experimental.enableTikZEditor', false);

        // Find figure environments
        const figureRegex = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/g;
        let match: RegExpExecArray | null;
        
        while ((match = figureRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const fullRange = new vscode.Range(startPos, endPos);
            const codeLensRange = new vscode.Range(startPos, startPos);
            
            const figureContent = match[0];
            
            // Check what type of figure this is
            const hasIncludeGraphics = /\\includegraphics/.test(figureContent);
            const hasTikzpicture = /\\begin\{tikzpicture\}/.test(figureContent);
            
            // Edit Figure button - only for figures with includegraphics
            if (hasIncludeGraphics) {
                codeLenses.push(
                    new vscode.CodeLens(codeLensRange, {
                        title: '🖼️ Edit Figure',
                        tooltip: 'Open figure editor',
                        command: 'intex.openFigureEditor',
                        arguments: [document.uri, fullRange]
                    })
                );
            }
            
            // Additional buttons based on content
            if (hasTikzpicture) {
                // Only show TikZ editor if experimental feature is enabled
                if (tikzEditorEnabled) {
                    codeLenses.push(
                        new vscode.CodeLens(codeLensRange, {
                            title: '✏️ Edit TikZ',
                            tooltip: 'Open TikZ WYSIWYG editor (Experimental)',
                            command: 'intex.openTikZEditor',
                            arguments: [document.uri, fullRange]
                        })
                    );
                }
            }
            
            if (hasIncludeGraphics) {
                codeLenses.push(
                    new vscode.CodeLens(codeLensRange, {
                        title: '📂 Change Image',
                        tooltip: 'Browse and change image file',
                        command: 'intex.changeImagePath',
                        arguments: [document.uri, fullRange]
                    })
                );
            }
            
            // Caption editor
            codeLenses.push(
                new vscode.CodeLens(codeLensRange, {
                    title: '💬 Edit Caption',
                    tooltip: 'Edit figure caption',
                    command: 'intex.editFigureCaption',
                    arguments: [document.uri, fullRange]
                })
            );
        }

        // Also find standalone \includegraphics (not in figure environment)
        const includeGraphicsRegex = /\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/g;
        const figureMatches = new Set();
        
        // Collect all figure environment ranges
        let figMatch;
        const figReg = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/g;
        while ((figMatch = figReg.exec(text)) !== null) {
            figureMatches.add({ start: figMatch.index, end: figMatch.index + figMatch[0].length });
        }
        
        // Find standalone includegraphics
        while ((match = includeGraphicsRegex.exec(text)) !== null) {
            // Check if this includegraphics is inside a figure environment
            const isInFigure = Array.from(figureMatches).some((fig: any) => 
                match!.index >= fig.start && match!.index <= fig.end
            );
            
            if (!isInFigure) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const fullRange = new vscode.Range(startPos, endPos);
                const codeLensRange = new vscode.Range(startPos, startPos);
                
                codeLenses.push(
                    new vscode.CodeLens(codeLensRange, {
                        title: '🖼️ Wrap in Figure',
                        tooltip: 'Wrap image in figure environment',
                        command: 'intex.wrapInFigure',
                        arguments: [document.uri, fullRange]
                    })
                );
                
                codeLenses.push(
                    new vscode.CodeLens(codeLensRange, {
                        title: '📂 Change Image',
                        tooltip: 'Browse and change image file',
                        command: 'intex.changeImagePath',
                        arguments: [document.uri, fullRange]
                    })
                );
            }
        }

        // Find standalone tikzpicture (not in figure environment)
        const tikzRegex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;
        while ((match = tikzRegex.exec(text)) !== null) {
            // Check if this tikzpicture is inside a figure environment
            const isInFigure = Array.from(figureMatches).some((fig: any) => 
                match!.index >= fig.start && match!.index <= fig.end
            );
            
            if (!isInFigure) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const fullRange = new vscode.Range(startPos, endPos);
                const codeLensRange = new vscode.Range(startPos, startPos);
                
                // Only show TikZ editor if experimental feature is enabled
                if (tikzEditorEnabled) {
                    codeLenses.push(
                        new vscode.CodeLens(codeLensRange, {
                            title: '✏️ Edit TikZ',
                            tooltip: 'Open TikZ WYSIWYG editor (Experimental)',
                            command: 'intex.openTikZEditor',
                            arguments: [document.uri, fullRange]
                        })
                    );
                }
                
                codeLenses.push(
                    new vscode.CodeLens(codeLensRange, {
                        title: '🖼️ Wrap in Figure',
                        tooltip: 'Wrap TikZ in figure environment',
                        command: 'intex.wrapInFigure',
                        arguments: [document.uri, fullRange]
                    })
                );
            }
        }

        return codeLenses;
    }
}
