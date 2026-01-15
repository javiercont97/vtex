import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';

export class PDFPreview {
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    async showPDF(documentUri: vscode.Uri): Promise<void> {
        const docPath = documentUri.fsPath;
        const docDir = path.dirname(docPath);
        const docName = path.basename(docPath, '.tex');
        const pdfPath = path.join(docDir, `${docName}.pdf`);

        this.logger.info(`Opening PDF: ${pdfPath}`);

        try {
            const pdfUri = vscode.Uri.file(pdfPath);
            
            // Use VS Code's built-in PDF viewer
            await vscode.commands.executeCommand('vscode.open', pdfUri, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: false
            });

            this.logger.info('PDF opened successfully');
        } catch (error) {
            this.logger.error(`Failed to open PDF: ${error}`);
            vscode.window.showErrorMessage(`Failed to open PDF: ${error}`);
        }
    }
}
