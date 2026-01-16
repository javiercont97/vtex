import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';

/**
 * Handles SyncTeX forward and inverse search between editor and PDF
 */
export class SyncTexHandler {
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private pdfPreview?: any // Will be injected
    ) {}

    /**
     * Set PDF preview reference for integration
     */
    public setPdfPreview(pdfPreview: any): void {
        this.pdfPreview = pdfPreview;
    }

    /**
     * Forward search: Jump from editor line to PDF position
     * @param document The active LaTeX document
     * @param line The line number in the editor (0-based)
     */
    public async forwardSearch(document: vscode.TextDocument, line: number): Promise<void> {
        try {
            const texPath = document.uri.fsPath;
            const pdfPath = this.getPdfPath(texPath);
            const synctexPath = this.getSynctexPath(texPath);

            if (!fs.existsSync(pdfPath)) {
                vscode.window.showWarningMessage('PDF file not found. Build the document first.');
                return;
            }

            if (!fs.existsSync(synctexPath)) {
                vscode.window.showWarningMessage('SyncTeX file not found. Ensure -synctex=1 is enabled in build settings.');
                return;
            }

            // Convert 0-based line to 1-based for SyncTeX
            const synctexLine = line + 1;

            // Query SyncTeX for PDF position
            const result = await this.querySyncTeX('view', {
                line: synctexLine,
                input: texPath,
                output: pdfPath
            });

            if (result) {
                // Send position to PDF viewer
                await this.sendToPdfViewer(pdfPath, result.page, result.x, result.y);
                this.logger.info(`Forward search: line ${synctexLine} → page ${result.page}`);
            }

        } catch (error) {
            this.logger.error(`Forward search failed: ${error}`);
            vscode.window.showErrorMessage(`Forward search failed: ${error}`);
        }
    }

    /**
     * Inverse search: Jump from PDF position to editor line
     * @param pdfPath Path to PDF file
     * @param page PDF page number
     * @param x X coordinate on page
     * @param y Y coordinate on page
     */
    public async inverseSearch(pdfPath: string, page: number, x: number, y: number): Promise<void> {
        try {
            const synctexPath = this.getSynctexPath(pdfPath);

            if (!fs.existsSync(synctexPath)) {
                vscode.window.showWarningMessage('SyncTeX file not found.');
                return;
            }

            // Query SyncTeX for source location
            const result = await this.querySyncTeX('edit', {
                page: page,
                x: x,
                y: y,
                output: pdfPath
            });

            if (result && result.input) {
                // Normalize the path - synctex might return relative paths or paths with different separators
                let inputPath = result.input;
                
                // If path is relative, resolve it relative to the PDF directory
                if (!path.isAbsolute(inputPath)) {
                    const pdfDir = path.dirname(pdfPath);
                    inputPath = path.resolve(pdfDir, inputPath);
                }
                
                // Normalize path separators for the current platform
                inputPath = path.normalize(inputPath);
                
                // Open the file and jump to line
                const uri = vscode.Uri.file(inputPath);
                const document = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(document);

                // Convert 1-based line to 0-based
                const line = Math.max(0, result.line - 1);
                const position = new vscode.Position(line, result.column || 0);
                
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );

                this.logger.info(`Inverse search: page ${page} → line ${result.line}`);
            }

        } catch (error) {
            this.logger.error(`Inverse search failed: ${error}`);
            vscode.window.showErrorMessage(`Inverse search failed: ${error}`);
        }
    }

    /**
     * Query SyncTeX using synctex command-line tool
     * Automatically uses Docker if build method is docker or if synctex is not available locally
     */
    private async querySyncTeX(
        mode: 'view' | 'edit',
        params: { line?: number; input?: string; page?: number; x?: number; y?: number; output: string }
    ): Promise<any> {
        // Check if we should use Docker
        const config = new Config();
        const buildMethod = config.getBuildMethod();
        const useDocker = buildMethod === 'docker';
        
        return new Promise((resolve, reject) => {
            let command: string;
            let baseCommand: string;

            if (mode === 'view') {
                // Forward search: source → PDF
                baseCommand = `synctex view -i "${params.line}:0:${params.input}" -o "${params.output}"`;
            } else {
                // Inverse search: PDF → source
                // Format: synctex edit -o page:x:y:file (not file:page:x:y)
                baseCommand = `synctex edit -o "${params.page}:${params.x}:${params.y}:${params.output}"`;
            }

            if (useDocker) {
                // Run in Docker container
                const docDir = path.dirname(params.output);
                const dockerImage = config.getDockerImage();
                command = `docker run --rm -v "${docDir}:${docDir}" -w "${docDir}" ${dockerImage} ${baseCommand}`;
            } else {
                command = baseCommand;
            }

            child_process.exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (stderr) {
                    this.logger.warn(`SyncTeX warning: ${stderr}`);
                }

                // Parse SyncTeX output
                const result = this.parseSyncTexOutput(stdout, mode);
                resolve(result);
            });
        });
    }

    /**
     * Parse SyncTeX command output
     */
    private parseSyncTexOutput(output: string, mode: 'view' | 'edit'): any {
        const lines = output.split('\n');
        const result: any = {};

        for (const line of lines) {
            if (line.startsWith('Page:')) {
                result.page = parseInt(line.split(':')[1].trim());
            } else if (line.startsWith('x:')) {
                result.x = parseFloat(line.split(':')[1].trim());
            } else if (line.startsWith('y:')) {
                result.y = parseFloat(line.split(':')[1].trim());
            } else if (line.startsWith('Input:')) {
                result.input = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('Line:')) {
                result.line = parseInt(line.split(':')[1].trim());
            } else if (line.startsWith('Column:')) {
                result.column = parseInt(line.split(':')[1].trim());
            }
        }

        return Object.keys(result).length > 0 ? result : null;
    }

    /**
     * Send position information to PDF viewer
     * This sends a custom message to the WebView
     */
    private async sendToPdfViewer(pdfPath: string, page: number, x: number, y: number): Promise<void> {
        if (this.pdfPreview) {
            // Use PDFPreview with position parameter
            const uri = vscode.Uri.file(pdfPath.replace(/\.pdf$/, '.tex'));
            await this.pdfPreview.showPDF(uri, { page, x, y });
        } else {
            // Fallback: just open the PDF without position
            const uri = vscode.Uri.file(pdfPath);
            await vscode.commands.executeCommand('vtex.viewPdf');
        }
    }

    /**
     * Get PDF path from TeX path
     */
    private getPdfPath(texPath: string): string {
        return texPath.replace(/\.tex$/, '.pdf');
    }

    /**
     * Get SyncTeX path from TeX or PDF path
     */
    private getSynctexPath(filePath: string): string {
        const base = filePath.replace(/\.(tex|pdf)$/, '');
        return `${base}.synctex.gz`;
    }

    /**
     * Check if SyncTeX is available
     */
    public async isSyncTexAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            child_process.exec('synctex --version', { timeout: 5000 }, (error) => {
                resolve(!error);
            });
        });
    }
}
