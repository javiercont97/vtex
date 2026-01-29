import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

/**
 * Provides inline decorations for equations and images
 */
export class InlineDecorator {
    private equationDecorationType: vscode.TextEditorDecorationType;
    private imageDecorationType: vscode.TextEditorDecorationType;
    private isActive: boolean = false;
    private updateTimeout: NodeJS.Timeout | undefined;

    constructor(private context: vscode.ExtensionContext, private logger: Logger) {
        // Create decoration types
        this.equationDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 1em',
                contentText: '📐'
            }
        });

        this.imageDecorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: context.asAbsolutePath('resources/image-icon.svg'),
            gutterIconSize: 'contain'
        });
    }

    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('intex.toggleInlineDecorations', () => this.toggle()),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (this.isActive && e.document.languageId === 'latex') {
                    this.scheduleUpdate();
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (this.isActive && editor && editor.document.languageId === 'latex') {
                    this.updateDecorations(editor);
                }
            })
        ];
    }

    private toggle(): void {
        this.isActive = !this.isActive;
        
        if (this.isActive) {
            vscode.window.showInformationMessage('Inline decorations enabled');
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'latex') {
                this.updateDecorations(editor);
            }
        } else {
            vscode.window.showInformationMessage('Inline decorations disabled');
            vscode.window.visibleTextEditors.forEach(editor => {
                editor.setDecorations(this.equationDecorationType, []);
                editor.setDecorations(this.imageDecorationType, []);
            });
        }
    }

    private scheduleUpdate(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        this.updateTimeout = setTimeout(() => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'latex') {
                this.updateDecorations(editor);
            }
        }, 500);
    }

    private updateDecorations(editor: vscode.TextEditor): void {
        const document = editor.document;
        const equationDecorations: vscode.DecorationOptions[] = [];
        const imageDecorations: vscode.DecorationOptions[] = [];

        // Find equations
        const equationPatterns = [
            /\\begin\{equation\}[\s\S]*?\\end\{equation\}/g,
            /\\\[[\s\S]*?\\\]/g,
            /\$\$[\s\S]*?\$\$/g,
            /\$[^$\n]+\$/g
        ];

        for (const pattern of equationPatterns) {
            const text = document.getText();
            let match;
            
            while ((match = pattern.exec(text)) !== null) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);
                
                // Create inline decoration with click-to-edit code lens
                equationDecorations.push({
                    range,
                    hoverMessage: new vscode.MarkdownString(`**Equation**: ${match[0]}\n\n_Click to edit_`)
                });
            }
        }

        // Find images
        const imagePattern = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
        const text = document.getText();
        let match;

        while ((match = imagePattern.exec(text)) !== null) {
            const imagePath = match[1];
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            
            // Resolve image path
            const docDir = path.dirname(document.uri.fsPath);
            const fullImagePath = this.resolveImagePath(docDir, imagePath);
            
            if (fs.existsSync(fullImagePath)) {
                const imageUri = vscode.Uri.file(fullImagePath);
                
                imageDecorations.push({
                    range,
                    hoverMessage: new vscode.MarkdownString(`![Image](${imageUri.toString()}|width=200)`)
                });
            }
        }

        // Apply decorations
        editor.setDecorations(this.equationDecorationType, equationDecorations);
        editor.setDecorations(this.imageDecorationType, imageDecorations);
        
        this.logger.info(`Applied ${equationDecorations.length} equation and ${imageDecorations.length} image decorations`);
    }

    private resolveImagePath(docDir: string, imagePath: string): string {
        // Handle relative paths
        if (!path.isAbsolute(imagePath)) {
            imagePath = path.join(docDir, imagePath);
        }
        
        // Try common extensions if no extension provided
        if (!path.extname(imagePath)) {
            for (const ext of ['.png', '.jpg', '.jpeg', '.pdf', '.svg']) {
                const tryPath = imagePath + ext;
                if (fs.existsSync(tryPath)) {
                    return tryPath;
                }
            }
        }
        
        return imagePath;
    }

    public dispose(): void {
        this.equationDecorationType.dispose();
        this.imageDecorationType.dispose();
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
    }
}
