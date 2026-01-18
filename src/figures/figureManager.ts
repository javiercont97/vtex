import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

/**
 * Manages LaTeX figures including image previews and insertions
 */
export class FigureManager {
    private readonly supportedImageFormats = ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg'];
    private decorationType: vscode.TextEditorDecorationType;
    private imageCache: Map<string, string> = new Map();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger
    ) {
        // Create decoration type for inline image previews
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 1em',
                height: '100px',
                width: '100px',
            }
        });

        // Watch for document changes to update previews
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'latex') {
                this.updateImagePreviews(vscode.window.activeTextEditor);
            }
        });

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'latex') {
                this.updateImagePreviews(editor);
            }
        });
    }

    /**
     * Register figure management commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.insertFigure', () => this.insertFigure()),
            vscode.commands.registerCommand('vtex.previewFigure', () => this.previewFigure()),
            vscode.commands.registerCommand('vtex.showAllFigures', () => this.showAllFigures()),
            vscode.commands.registerCommand('vtex.toggleInlinePreviews', () => this.toggleInlinePreviews())
        ];
    }

    /**
     * Insert a figure at the current cursor position
     */
    private async insertFigure(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file first');
            return;
        }

        // Get workspace folder
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Find image files in workspace
        const imageFiles = await this.findImageFiles(workspaceFolder.uri.fsPath);
        
        if (imageFiles.length === 0) {
            const create = await vscode.window.showInformationMessage(
                'No image files found in workspace',
                'Browse for Image'
            );
            if (create) {
                await this.browseForImage(editor);
            }
            return;
        }

        // Show quick pick for image selection
        const selected = await vscode.window.showQuickPick(
            imageFiles.map(f => ({
                label: path.basename(f),
                description: path.dirname(f),
                detail: f
            })),
            { placeHolder: 'Select an image to insert' }
        );

        if (!selected) {
            return;
        }

        // Get figure options
        const caption = await vscode.window.showInputBox({
            prompt: 'Enter figure caption',
            placeHolder: 'My figure caption'
        });

        const label = await vscode.window.showInputBox({
            prompt: 'Enter figure label (for references)',
            placeHolder: 'fig:my-figure',
            value: 'fig:' + path.basename(selected.detail, path.extname(selected.detail)).replace(/[^a-zA-Z0-9]/g, '-')
        });

        const width = await vscode.window.showQuickPick(
            ['0.5\\textwidth', '0.75\\textwidth', '\\textwidth', '\\linewidth', 'custom'],
            { placeHolder: 'Select figure width' }
        );

        let finalWidth = width;
        if (width === 'custom') {
            finalWidth = await vscode.window.showInputBox({
                prompt: 'Enter custom width',
                placeHolder: '5cm'
            });
        }

        // Generate LaTeX code
        const relativePath = this.getRelativePath(editor.document.uri.fsPath, selected.detail);
        const figureCode = this.generateFigureCode(relativePath, caption || '', label || '', finalWidth || '\\textwidth');

        // Insert at cursor
        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, figureCode);
        });

        this.logger.info(`Inserted figure: ${relativePath}`);
    }

    /**
     * Browse for an image file outside workspace
     */
    private async browseForImage(editor: vscode.TextEditor): Promise<void> {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg']
            },
            title: 'Select Image File'
        });

        if (!files || files.length === 0) {
            return;
        }

        const imagePath = files[0].fsPath;
        const relativePath = this.getRelativePath(editor.document.uri.fsPath, imagePath);
        
        const figureCode = this.generateFigureCode(relativePath, 'Caption', 'fig:label', '0.8\\textwidth');
        
        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, figureCode);
        });
    }

    /**
     * Generate LaTeX figure code
     */
    private generateFigureCode(imagePath: string, caption: string, label: string, width: string): string {
        return `\\begin{figure}[htbp]
    \\centering
    \\includegraphics[width=${width}]{${imagePath}}
    \\caption{${caption}}
    \\label{${label}}
\\end{figure}\n`;
    }

    /**
     * Preview figure at cursor
     */
    private async previewFigure(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const line = editor.document.lineAt(editor.selection.active.line);
        const match = line.text.match(/\\includegraphics(?:\[.*?\])?\{(.+?)\}/);
        
        if (!match) {
            vscode.window.showInformationMessage('No image found at cursor. Place cursor on \\includegraphics line.');
            return;
        }

        const imagePath = match[1];
        const absolutePath = this.resolveImagePath(editor.document.uri.fsPath, imagePath);

        if (!fs.existsSync(absolutePath)) {
            vscode.window.showErrorMessage(`Image not found: ${absolutePath}`);
            return;
        }

        // Show in webview panel
        const panel = vscode.window.createWebviewPanel(
            'figurePreview',
            `Preview: ${path.basename(imagePath)}`,
            vscode.ViewColumn.Beside,
            { enableScripts: false }
        );

        const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(absolutePath));
        
        panel.webview.html = this.getPreviewHtml(imageUri.toString(), path.basename(imagePath));
    }

    /**
     * Show all figures in the current document
     */
    private async showAllFigures(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const figures: Array<{ line: number; path: string; caption?: string }> = [];
        const text = editor.document.getText();
        
        // Find all \includegraphics
        const regex = /\\includegraphics(?:\[.*?\])?\{(.+?)\}/g;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            const position = editor.document.positionAt(match.index);
            const imagePath = match[1];
            
            // Try to find caption
            const lineText = editor.document.lineAt(position.line).text;
            const captionMatch = text.substring(match.index, match.index + 500).match(/\\caption\{(.+?)\}/);
            
            figures.push({
                line: position.line + 1,
                path: imagePath,
                caption: captionMatch ? captionMatch[1] : undefined
            });
        }

        if (figures.length === 0) {
            vscode.window.showInformationMessage('No figures found in document');
            return;
        }

        // Show quick pick
        const selected = await vscode.window.showQuickPick(
            figures.map(f => ({
                label: path.basename(f.path),
                description: `Line ${f.line}`,
                detail: f.caption || f.path,
                line: f.line
            })),
            { placeHolder: `Found ${figures.length} figure(s)` }
        );

        if (selected) {
            // Jump to figure
            const position = new vscode.Position(selected.line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
    }

    /**
     * Toggle inline image previews
     */
    private async toggleInlinePreviews(): Promise<void> {
        const config = vscode.workspace.getConfiguration('vtex');
        const current = config.get('figureInlinePreviews', false);
        await config.update('figureInlinePreviews', !current, vscode.ConfigurationTarget.Global);
        
        if (!current) {
            this.updateImagePreviews(vscode.window.activeTextEditor);
            vscode.window.showInformationMessage('Inline figure previews enabled');
        } else {
            vscode.window.activeTextEditor?.setDecorations(this.decorationType, []);
            vscode.window.showInformationMessage('Inline figure previews disabled');
        }
    }

    /**
     * Update inline image previews in editor
     */
    private updateImagePreviews(editor: vscode.TextEditor | undefined): void {
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const config = vscode.workspace.getConfiguration('vtex');
        if (!config.get('figureInlinePreviews', false)) {
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];
        const text = editor.document.getText();
        const regex = /\\includegraphics(?:\[.*?\])?\{(.+?)\}/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const imagePath = match[1];
            const absolutePath = this.resolveImagePath(editor.document.uri.fsPath, imagePath);
            
            if (fs.existsSync(absolutePath)) {
                const position = editor.document.positionAt(match.index + match[0].length);
                const imageUri = vscode.Uri.file(absolutePath);
                
                decorations.push({
                    range: new vscode.Range(position, position),
                    renderOptions: {
                        after: {
                            contentIconPath: imageUri,
                        }
                    }
                });
            }
        }

        editor.setDecorations(this.decorationType, decorations);
    }

    /**
     * Find all image files in workspace
     */
    private async findImageFiles(workspacePath: string): Promise<string[]> {
        const images: string[] = [];
        const pattern = '**/*.{png,jpg,jpeg,pdf,eps,svg}';
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
        
        return files.map(f => f.fsPath);
    }

    /**
     * Resolve image path relative to document
     */
    private resolveImagePath(docPath: string, imagePath: string): string {
        const docDir = path.dirname(docPath);
        
        // Try different extensions if no extension provided
        if (!path.extname(imagePath)) {
            for (const ext of this.supportedImageFormats) {
                const fullPath = path.resolve(docDir, imagePath + ext);
                if (fs.existsSync(fullPath)) {
                    return fullPath;
                }
            }
        }
        
        return path.resolve(docDir, imagePath);
    }

    /**
     * Get relative path from document to image
     */
    private getRelativePath(fromPath: string, toPath: string): string {
        const from = path.dirname(fromPath);
        let relative = path.relative(from, toPath);
        
        // Convert to forward slashes for LaTeX
        relative = relative.replace(/\\/g, '/');
        
        // Keep extension to avoid ambiguity
        return relative;
    }

    /**
     * Get HTML for image preview
     */
    private getPreviewHtml(imageUri: string, title: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: var(--vscode-editor-background);
        }
        img {
            max-width: 100%;
            max-height: 90vh;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h2 {
            position: fixed;
            top: 10px;
            left: 20px;
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }
    </style>
</head>
<body>
    <h2>${title}</h2>
    <img src="${imageUri}" alt="${title}">
</body>
</html>`;
    }

    public dispose(): void {
        this.decorationType.dispose();
    }
}
