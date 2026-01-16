import * as vscode from 'vscode';
import { BuildSystem } from './buildSystem/builder';
import { PDFPreview } from './preview/pdfPreview';
import { Config } from './utils/config';
import { Logger } from './utils/logger';

let buildSystem: BuildSystem;
let pdfPreview: PDFPreview;
let outputChannel: vscode.OutputChannel;
let logger: Logger;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize output channel and logger
    outputChannel = vscode.window.createOutputChannel('VTeX');
    logger = new Logger(outputChannel);
    logger.info('VTeX extension activating...');

    // Initialize configuration
    const config = new Config();

    // Initialize build system
    buildSystem = new BuildSystem(config, logger, context);
    
    // Initialize build system asynchronously (don't block activation)
    buildSystem.initialize().catch(error => {
        logger.error(`Failed to initialize build system: ${error}`);
        vscode.window.showErrorMessage(`VTeX: Failed to initialize build system. ${error}`);
    });

    // Initialize PDF preview
    pdfPreview = new PDFPreview(context, logger);

    // Register commands
    registerCommands(context);

    // Set up auto-build on save
    setupAutoBuild(context, config);

    // Show status bar
    createStatusBar(context);

    logger.info('VTeX extension activated successfully');
}

function registerCommands(context: vscode.ExtensionContext) {
    // Build command
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.build', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }
            
            await buildDocument(editor.document);
        })
    );

    // Clean command
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.clean', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }
            
            await buildSystem.clean(editor.document.uri);
            vscode.window.showInformationMessage('Auxiliary files cleaned');
        })
    );

    // View PDF command
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.viewPdf', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }
            
            await pdfPreview.showPDF(editor.document.uri);
        })
    );

    // Select builder command
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.selectBuilder', async () => {
            const options = ['auto', 'local', 'docker'];
            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select build method'
            });
            
            if (selected) {
                await vscode.workspace.getConfiguration('vtex').update(
                    'buildMethod',
                    selected,
                    vscode.ConfigurationTarget.Workspace
                );
                await buildSystem.initialize();
                vscode.window.showInformationMessage(`Build method set to: ${selected}`);
            }
        })
    );

    // Detect environment command
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.detectEnvironment', async () => {
            const info = await buildSystem.getEnvironmentInfo();
            vscode.window.showInformationMessage(info);
        })
    );
}

function setupAutoBuild(context: vscode.ExtensionContext, config: Config) {
    let buildTimeout: NodeJS.Timeout | undefined;

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId !== 'latex') {
                return;
            }

            if (!config.getBuildOnSave()) {
                return;
            }

            // Debounce builds
            if (buildTimeout) {
                clearTimeout(buildTimeout);
            }

            buildTimeout = setTimeout(async () => {
                await buildDocument(document);
            }, 500);
        })
    );
}

function createStatusBar(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.command = 'vtex.build';
    statusBarItem.text = '$(tools) VTeX: Build';
    statusBarItem.tooltip = 'Build LaTeX document';
    statusBarItem.show();

    context.subscriptions.push(statusBarItem);

    // Update status bar based on active editor
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.languageId === 'latex') {
                statusBarItem.show();
            } else {
                statusBarItem.hide();
            }
        })
    );
}

async function buildDocument(document: vscode.TextDocument): Promise<void> {
    // Save document if dirty
    if (document.isDirty) {
        await document.save();
    }

    try {
        logger.info(`Building ${document.fileName}...`);
        const result = await buildSystem.build(document.uri);
        
        if (result.success) {
            logger.info('Build completed successfully');
            // Don't show notification to avoid stealing focus
            // Success is indicated in status bar and output channel
            
            // Auto-refresh PDF preview if it's already open (without stealing focus)
            await pdfPreview.showPDF(document.uri);
        } else {
            logger.error('Build failed');
            logger.error(result.output);
            vscode.window.showErrorMessage('LaTeX build failed. Check output for details.');
        }
    } catch (error) {
        logger.error(`Build error: ${error}`);
        vscode.window.showErrorMessage(`Build error: ${error}`);
    }
}

export function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
}
