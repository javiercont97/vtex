import * as vscode from 'vscode';
import * as path from 'path';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    Executable
} from 'vscode-languageclient/node';
import { Logger } from '../utils/logger';

export class TexlabClient {
    private client: LanguageClient | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    async start(): Promise<void> {
        try {
            // Check if texlab is available
            const texlabPath = await this.findTexlab();
            
            if (!texlabPath) {
                vscode.window.showWarningMessage(
                    'texlab LSP server not found. Language features will be limited. Install texlab for auto-completion and navigation.',
                    'Install Guide'
                ).then(selection => {
                    if (selection === 'Install Guide') {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/latex-lsp/texlab/releases'));
                    }
                });
                return;
            }

            this.logger.info(`Found texlab at: ${texlabPath}`);

            // Configure the server
            const serverOptions: ServerOptions = {
                run: { command: texlabPath } as Executable,
                debug: { command: texlabPath } as Executable
            };

            // Configure the client
            const clientOptions: LanguageClientOptions = {
                documentSelector: [
                    { scheme: 'file', language: 'latex' },
                    { scheme: 'file', language: 'bibtex' }
                ],
                synchronize: {
                    fileEvents: [
                        vscode.workspace.createFileSystemWatcher('**/*.tex'),
                        vscode.workspace.createFileSystemWatcher('**/*.bib'),
                        vscode.workspace.createFileSystemWatcher('**/*.aux')
                    ]
                },
                initializationOptions: {
                    build: {
                        executable: 'latexmk',
                        args: [
                            '-pdf',
                            '-interaction=nonstopmode',
                            '-synctex=1',
                            '%f'
                        ],
                        onSave: false, // We handle this ourselves
                        forwardSearchAfter: false
                    },
                    chktex: {
                        onEdit: false,
                        onOpenAndSave: false
                    },
                    diagnosticsDelay: 300,
                    formatterLineLength: 80,
                    latexFormatter: 'latexindent',
                    latexindent: {
                        local: null,
                        modifyLineBreaks: false
                    }
                },
                outputChannel: this.logger.getOutputChannel()
            };

            // Create the language client
            this.client = new LanguageClient(
                'texlab',
                'TeXLab Language Server',
                serverOptions,
                clientOptions
            );

            // Start the client
            await this.client.start();
            this.logger.info('texlab LSP server started successfully');

        } catch (error) {
            this.logger.error(`Failed to start texlab: ${error}`);
            vscode.window.showErrorMessage(`Failed to start LaTeX language server: ${error}`);
        }
    }

    async stop(): Promise<void> {
        if (this.client) {
            await this.client.stop();
            this.client = null;
            this.logger.info('texlab LSP server stopped');
        }
    }

    private async findTexlab(): Promise<string | null> {
        // Check if user has configured a custom path
        const config = vscode.workspace.getConfiguration('vtex');
        const customPath = config.get<string>('texlab.path');
        if (customPath && await this.fileExists(customPath)) {
            return customPath;
        }

        // Check bundled texlab in extension directory
        const bundledPath = path.join(this.context.extensionPath, 'bin', 'texlab');
        if (await this.fileExists(bundledPath)) {
            return bundledPath;
        }

        // Try to find texlab in PATH
        try {
            const { execFile } = require('child_process');
            const { promisify } = require('util');
            const execFileAsync = promisify(execFile);

            // Check if texlab command exists
            const isWindows = process.platform === 'win32';
            const command = isWindows ? 'where' : 'which';
            
            try {
                const { stdout } = await execFileAsync(command, ['texlab']);
                const texlabPath = stdout.trim().split('\n')[0];
                if (texlabPath) {
                    return texlabPath;
                }
            } catch {
                // texlab not in PATH
            }

            return null;
        } catch (error) {
            this.logger.error(`Error finding texlab: ${error}`);
            return null;
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const fs = require('fs').promises;
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    getClient(): LanguageClient | null {
        return this.client;
    }

    isActive(): boolean {
        return this.client !== null;
    }
}
