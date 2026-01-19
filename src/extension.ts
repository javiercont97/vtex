import * as vscode from 'vscode';
import * as path from 'path';
import { BuildSystem } from './buildSystem/builder';
import { PDFPreview } from './preview/pdfPreview';
import { NativePDFPreview } from './preview/nativePdfPreview';
import { Config } from './utils/config';
import { Logger } from './utils/logger';
import { TexlabClient } from './lsp/texlabClient';
import { TexlabInstaller } from './lsp/texlabInstaller';
import { SyncTexHandler } from './synctex/synctexHandler';
import { TemplateManager } from './templates/templateManager';
import { PackageManager } from './buildSystem/packageManager';
import { ProjectManager } from './project/projectManager';
import { BibliographyManager } from './bibliography/bibliographyManager';
import { BibTeXEditor } from './bibliography/bibTeXEditor';
// Phase 4 imports
import { FigureManager } from './figures/figureManager';
import { TikZPreview } from './figures/tikzPreview';
import { PlotGenerator } from './figures/plotGenerator';
import { EquationEditor } from './editor/equationEditor';
import { GrammarChecker } from './editor/grammarChecker';
import { TableEditor } from './editor/tableEditor';
import { MacroWizard } from './editor/macroWizard';
import { PerformanceOptimizer } from './buildSystem/performanceOptimizer';
import { InlineDecorator } from './preview/inlineDecorator';
import { EquationCodeLensProvider } from './preview/equationCodeLens';
import { FigureCodeLensProvider } from './preview/figureCodeLens';
import { EquationHoverProvider } from './editor/equationHoverProvider';
import { EquationDecorationProvider } from './editor/equationDecorationProvider';
import { ImageHoverProvider } from './editor/imageHoverProvider';
import { ImageDecorationProvider } from './editor/imageDecorationProvider';
import { FigureEditor } from './editor/figureEditor';
import { TikZEditor } from './editor/tikzEditor';
import { TikZHoverProvider } from './editor/tikzHoverProvider';
// Table editor imports
import { TableHoverProvider } from './editor/tableHoverProvider';
import { TableCodeLensProvider } from './preview/tableCodeLens';
import { TablePreview } from './figures/tablePreview';

let buildSystem: BuildSystem;
let pdfPreview: PDFPreview;
let nativePdfPreview: NativePDFPreview;
let texlabClient: TexlabClient;
let synctexHandler: SyncTexHandler;
let templateManager: TemplateManager;
let packageManager: PackageManager;
let projectManager: ProjectManager;
let bibliographyManager: BibliographyManager;
let bibTeXEditor: BibTeXEditor;
// Phase 4 managers
let figureManager: FigureManager;
let tikzPreview: TikZPreview;
let plotGenerator: PlotGenerator;
let equationEditor: EquationEditor;
let grammarChecker: GrammarChecker;
let tableEditor: TableEditor;
let macroWizard: MacroWizard;
let performanceOptimizer: PerformanceOptimizer;
let inlineDecorator: InlineDecorator;
let equationCodeLensProvider: EquationCodeLensProvider;
let figureCodeLensProvider: FigureCodeLensProvider;
let equationHoverProvider: EquationHoverProvider;
let equationDecorationProvider: EquationDecorationProvider;
let imageHoverProvider: ImageHoverProvider;
let imageDecorationProvider: ImageDecorationProvider;
let figureEditor: FigureEditor;
let tikzEditor: TikZEditor;
let tikzHoverProvider: TikZHoverProvider;
// Table editor instances
let tableHoverProvider: TableHoverProvider;
let tableCodeLensProvider: TableCodeLensProvider;
let tablePreview: TablePreview;
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

    // Initialize PDF previews (both viewers)
    pdfPreview = new PDFPreview(context, logger);
    nativePdfPreview = new NativePDFPreview(context, logger);

    // Initialize SyncTeX handler
    synctexHandler = new SyncTexHandler(context, logger);
    synctexHandler.setPdfPreview(pdfPreview);

    // Set up inverse search callback (PDF → editor)
    pdfPreview.setInverseSearchCallback(async (pdfPath, page, x, y) => {
        await synctexHandler.inverseSearch(pdfPath, page, x, y);
    });

    // Initialize Phase 3 features
    templateManager = new TemplateManager(context, logger);
    packageManager = new PackageManager(logger);
    projectManager = new ProjectManager(config, logger);
    bibliographyManager = new BibliographyManager(logger);
    bibTeXEditor = new BibTeXEditor(context, logger, bibliographyManager);

    // Initialize Phase 4 features
    figureManager = new FigureManager(context, logger);
    tikzPreview = new TikZPreview(context, logger);
    tikzPreview.setBuildSystem(buildSystem); // Connect to build system
    plotGenerator = new PlotGenerator(context, logger);
    equationEditor = new EquationEditor(context, logger);
    grammarChecker = new GrammarChecker(context, logger);
    tableEditor = new TableEditor(context, logger);
    macroWizard = new MacroWizard(context, logger);
    performanceOptimizer = new PerformanceOptimizer(context, logger);
    inlineDecorator = new InlineDecorator(context, logger);
    equationCodeLensProvider = new EquationCodeLensProvider();
    figureCodeLensProvider = new FigureCodeLensProvider();
    equationHoverProvider = new EquationHoverProvider(context, logger);
    equationDecorationProvider = new EquationDecorationProvider(context, logger);
    imageHoverProvider = new ImageHoverProvider(context, logger);
    figureEditor = new FigureEditor(context, logger);
    tikzHoverProvider = new TikZHoverProvider(context, tikzPreview, logger);
    
    // Initialize table editor components
    tablePreview = new TablePreview(context, logger);
    tablePreview.setBuildSystem(buildSystem);
    tableHoverProvider = new TableHoverProvider(context, tablePreview, logger);
    tableCodeLensProvider = new TableCodeLensProvider(logger);
    tableEditor.setTablePreview(tablePreview);
    
    // Initialize experimental features if enabled
    if (config.getExperimentalTikZEditor()) {
        tikzEditor = new TikZEditor(context, logger);
        logger.info('TikZ Editor (experimental) initialized');
    }

    // Register inline decorator commands
    context.subscriptions.push(...inlineDecorator.registerCommands());
    
    // Register equation CodeLens provider
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'latex', scheme: 'file' },
            equationCodeLensProvider
        )
    );

    // Register figure CodeLens provider
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'latex', scheme: 'file' },
            figureCodeLensProvider
        )
    );

    // Register equation hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { language: 'latex', scheme: 'file' },
            equationHoverProvider
        )
    );

    // Register image hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { language: 'latex', scheme: 'file' },
            imageHoverProvider
        )
    );

    // Register TikZ hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { language: 'latex', scheme: 'file' },
            tikzHoverProvider
        )
    );

    // Register table hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { language: 'latex', scheme: 'file' },
            tableHoverProvider
        )
    );

    // Register table CodeLens provider
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'latex', scheme: 'file' },
            tableCodeLensProvider
        )
    );

    // Register equation decoration provider (gutter icons)
    context.subscriptions.push(equationDecorationProvider);

    // Initialize image decoration provider
    imageDecorationProvider = new ImageDecorationProvider(context);
    context.subscriptions.push(imageDecorationProvider);

    logger.info('Phase 4 features initialized');

    // Initialize texlab installer and prompt if needed (non-blocking)
    const texlabInstaller = new TexlabInstaller(context);
    texlabInstaller.promptInstallIfNeeded().catch(error => {
        logger.error(`Failed to prompt texlab installation: ${error}`);
    });

    // Initialize LSP client
    texlabClient = new TexlabClient(context, logger);
    texlabClient.start().catch(error => {
        logger.error(`Failed to start LSP client: ${error}`);
    });

    // Register custom editor for PDF files
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('vtex.pdfPreview', pdfPreview, {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        })
    );

    // Register commands
    registerCommands(context, config);

    // Set up auto-build on save
    setupAutoBuild(context, config);

    // Show status bar
    createStatusBar(context);

    logger.info('VTeX extension activated successfully');
}

function registerCommands(context: vscode.ExtensionContext, config: Config) {
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

    // Clean and build command
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.cleanBuild', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }
            
            logger.info('Cleaning and building...');
            await buildSystem.clean(editor.document.uri);
            await buildDocument(editor.document);
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
            
            await showPDFWithConfiguredViewer(editor.document.uri);
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

    // Install/Update texlab command
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.installTexlab', async () => {
            const installer = new TexlabInstaller(context);
            const currentVersion = installer.getInstalledVersion();
            
            let message = 'Install texlab LSP server?';
            if (currentVersion) {
                message = `texlab v${currentVersion} is currently installed. Update to latest version?`;
            }
            
            const choice = await vscode.window.showInformationMessage(
                message,
                'Install',
                'Cancel'
            );
            
            if (choice === 'Install') {
                const success = await installer.installOrUpdate();
                if (success) {
                    const action = await vscode.window.showInformationMessage(
                        'texlab installed successfully! Reload window to activate?',
                        'Reload',
                        'Later'
                    );
                    if (action === 'Reload') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                }
            }
        })
    );

    // Forward search (editor → PDF) with SyncTeX
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.synctex.forwardSearch', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }
            
            const line = editor.selection.active.line;
            await synctexHandler.forwardSearch(editor.document, line);
        })
    );

    // Phase 3: Project Templates
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.newFromTemplate', async () => {
            // Show template picker
            const templates = templateManager.getTemplates();
            const items = templates.map(t => ({
                label: t.name,
                description: t.category,
                detail: t.description,
                template: t
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a template'
            });

            if (!selected) {
                return;
            }

            // Ask for folder location
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Folder'
            });

            if (!folderUri || folderUri.length === 0) {
                return;
            }

            // Create project from template
            try {
                await templateManager.createFromTemplate(selected.template.id, folderUri[0]);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create project: ${error}`);
            }
        })
    );

    // Phase 3: Insert Citation
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.insertCitation', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }

            const key = await bibliographyManager.showCitationPicker();
            if (key) {
                await bibliographyManager.insertCitation(key);
            }
        })
    );

    // BibTeX Editor
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.editBibtexEntry', async () => {
            // Get active .bib file or let user choose
            const editor = vscode.window.activeTextEditor;
            let bibFile: string | undefined;
            
            if (editor && editor.document.fileName.endsWith('.bib')) {
                bibFile = editor.document.fileName;
            } else {
                // Find .bib files in workspace
                const bibFiles = await vscode.workspace.findFiles('**/*.bib');
                if (bibFiles.length === 0) {
                    vscode.window.showWarningMessage('No BibTeX files found in workspace');
                    return;
                }
                
                if (bibFiles.length === 1) {
                    bibFile = bibFiles[0].fsPath;
                } else {
                    const selected = await vscode.window.showQuickPick(
                        bibFiles.map(f => ({
                            label: vscode.workspace.asRelativePath(f),
                            file: f.fsPath
                        })),
                        { placeHolder: 'Select BibTeX file to edit' }
                    );
                    
                    if (!selected) {
                        return;
                    }
                    bibFile = selected.file;
                }
            }

            if (!bibFile) {
                return;
            }

            // Get entry to edit (if any)
            const entries = await bibliographyManager.parseBibFile(bibFile);
            if (entries.length > 0) {
                const items = [
                    { label: '$(add) Create New Entry', key: undefined },
                    ...entries.map(e => ({
                        label: `$(book) ${e.key}`,
                        description: e.type,
                        detail: e.fields['title'] || '',
                        key: e.key
                    }))
                ];

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select entry to edit or create new'
                });

                if (!selected) {
                    return;
                }

                await bibTeXEditor.openEditor(bibFile, selected.key);
            } else {
                // Empty file, create new entry
                await bibTeXEditor.openEditor(bibFile);
            }
        })
    );

    // Phase 3: Find Root File
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.findRootFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }

            const rootFile = await projectManager.findRootFile(editor.document);
            const relativePath = vscode.workspace.asRelativePath(rootFile);
            vscode.window.showInformationMessage(`Root file: ${relativePath}`);
        })
    );

    // Phase 3: Analyze Project
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.analyzeProject', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'latex') {
                vscode.window.showWarningMessage('No active LaTeX document');
                return;
            }

            const rootFile = await projectManager.findRootFile(editor.document);
            const structure = await projectManager.analyzeProject(rootFile);

            const message = `Project Analysis:\n` +
                `Root: ${vscode.workspace.asRelativePath(structure.rootFile)}\n` +
                `Included files: ${structure.includedFiles.length}\n` +
                `Bibliography files: ${structure.bibliographyFiles.length}\n` +
                `Image files: ${structure.imageFiles.length}`;

            vscode.window.showInformationMessage(message);
        })
    );

    // Register citation completion provider
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'latex',
            {
                async provideCompletionItems(document, position) {
                    const linePrefix = document.lineAt(position).text.substring(0, position.character);
                    
                    // Trigger after \cite{, \citep{, \citet{, etc.
                    if (linePrefix.match(/\\cite[a-z]*\{[^}]*$/)) {
                        return await bibliographyManager.provideCitationCompletions();
                    }
                    
                    return undefined;
                }
            },
            '{' // Trigger character
        )
    );

    // Phase 4: Figure Management
    context.subscriptions.push(...figureManager.registerCommands());

    // Phase 4: TikZ Preview
    context.subscriptions.push(...tikzPreview.registerCommands());

    // Phase 4: Plot Generator
    context.subscriptions.push(...plotGenerator.registerCommands());

    // Phase 4: Equation Editor
    context.subscriptions.push(...equationEditor.registerCommands());

    // Phase 4: TikZ Editor (Experimental)
    if (config.getExperimentalTikZEditor() && tikzEditor) {
        context.subscriptions.push(
            vscode.commands.registerCommand('vtex.openTikZEditor', async (uri?: vscode.Uri, range?: vscode.Range) => {
                if (uri && range) {
                    const document = await vscode.workspace.openTextDocument(uri);
                    const tikzCode = document.getText(range);
                    await tikzEditor.openEditor(tikzCode, range);
                } else {
                    await tikzEditor.openEditor();
                }
            })
        );
        logger.info('TikZ Editor command registered');
    }

    // Phase 4: Figure Editor
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.openFigureEditor', async (uri?: vscode.Uri, range?: vscode.Range) => {
            if (uri && range) {
                // Extract figure properties from the range
                const document = await vscode.workspace.openTextDocument(uri);
                const figureText = document.getText(range);
                
                // Parse figure properties
                const imageMatch = figureText.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
                const captionMatch = figureText.match(/\\caption\{([^}]*)\}/);
                const labelMatch = figureText.match(/\\label\{([^}]*)\}/);
                const widthMatch = figureText.match(/\[.*width=([^,\]]+).*\]/);
                
                const figureData = {
                    imagePath: imageMatch ? imageMatch[1] : '',
                    width: widthMatch ? widthMatch[1] : '',
                    caption: captionMatch ? captionMatch[1] : '',
                    label: labelMatch ? labelMatch[1] : ''
                };
                
                figureEditor.openEditor(figureData, range);
            } else {
                figureEditor.openEditor();
            }
        })
    );

    // Phase 4: Figure CodeLens commands
    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.editFigureCaption', async (uri: vscode.Uri, range: vscode.Range) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const figureText = document.getText(range);
            
            // Extract current caption
            const captionMatch = figureText.match(/\\caption\{([^}]*)\}/);
            const currentCaption = captionMatch ? captionMatch[1] : '';
            
            const newCaption = await vscode.window.showInputBox({
                prompt: 'Enter new caption',
                value: currentCaption,
                placeHolder: 'Figure caption'
            });
            
            if (newCaption !== undefined) {
                const editor = await vscode.window.showTextDocument(document);
                await editor.edit(editBuilder => {
                    if (captionMatch) {
                        // Replace existing caption
                        const captionStart = document.offsetAt(range.start) + figureText.indexOf(captionMatch[0]);
                        const captionRange = new vscode.Range(
                            document.positionAt(captionStart),
                            document.positionAt(captionStart + captionMatch[0].length)
                        );
                        editBuilder.replace(captionRange, `\\caption{${newCaption}}`);
                    } else {
                        // Add caption before \end{figure}
                        const endMatch = figureText.match(/\\end\{figure\}/);
                        if (endMatch) {
                            const insertPos = document.positionAt(
                                document.offsetAt(range.start) + figureText.indexOf(endMatch[0])
                            );
                            editBuilder.insert(insertPos, `    \\caption{${newCaption}}\n`);
                        }
                    }
                });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.changeImagePath', async (uri: vscode.Uri, range: vscode.Range) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText(range);
            
            // Browse for image
            const fileUris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Images': ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg']
                },
                title: 'Select image file'
            });
            
            if (fileUris && fileUris.length > 0) {
                const imagePath = fileUris[0].fsPath;
                const docPath = path.dirname(uri.fsPath);
                const relativePath = path.relative(docPath, imagePath).replace(/\\/g, '/');
                
                const editor = await vscode.window.showTextDocument(document);
                await editor.edit(editBuilder => {
                    // Find the \includegraphics command and its path
                    const pathMatch = text.match(/\\includegraphics(\[[^\]]*\])?\{([^}]+)\}/);
                    if (pathMatch) {
                        const fullMatch = pathMatch[0];
                        const options = pathMatch[1] || '';
                        const oldPath = pathMatch[2];
                        
                        // Replace only the path inside \includegraphics
                        const newCommand = `\\includegraphics${options}{${relativePath}}`;
                        
                        // Find the position of \includegraphics in the range
                        const startOffset = text.indexOf(fullMatch);
                        const matchStart = document.offsetAt(range.start) + startOffset;
                        const matchEnd = matchStart + fullMatch.length;
                        
                        const replaceRange = new vscode.Range(
                            document.positionAt(matchStart),
                            document.positionAt(matchEnd)
                        );
                        
                        editBuilder.replace(replaceRange, newCommand);
                    }
                });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.previewTikzInFigure', async (uri: vscode.Uri, range: vscode.Range) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const figureText = document.getText(range);
            
            // Extract TikZ code
            const tikzMatch = figureText.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
            if (tikzMatch) {
                await tikzPreview.previewTikzCode(tikzMatch[0], 'TikZ Preview (from Figure)');
            } else {
                vscode.window.showErrorMessage('No TikZ code found in this figure environment');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.previewTikzStandalone', async (uri: vscode.Uri, range: vscode.Range) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const tikzText = document.getText(range);
            
            // Verify it's a tikzpicture
            if (/\\begin\{tikzpicture\}/.test(tikzText)) {
                await tikzPreview.previewTikzCode(tikzText, 'TikZ Preview');
            } else {
                vscode.window.showErrorMessage('Selected range does not contain a TikZ environment');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.editTikz', async (uri: vscode.Uri, range: vscode.Range) => {
            vscode.window.showInformationMessage('TikZ editor coming soon! For now, use Preview TikZ to see your changes.');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vtex.wrapInFigure', async (uri: vscode.Uri, range: vscode.Range) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText(range);
            
            const position = await vscode.window.showQuickPick(['h', 't', 'b', 'p', 'H'], {
                placeHolder: 'Select figure position (h=here, t=top, b=bottom, p=page, H=exactly here)'
            });
            
            const wrappedContent = `\\begin{figure}[${position || 'h'}]\n    \\centering\n    ${content}\n    \\caption{}\n    \\label{fig:}\n\\end{figure}`;
            
            const editor = await vscode.window.showTextDocument(document);
            await editor.edit(editBuilder => {
                editBuilder.replace(range, wrappedContent);
            });
        })
    );

    // Phase 4: Grammar Checker
    context.subscriptions.push(...grammarChecker.registerCommands());

    // Phase 4: Table Editor
    context.subscriptions.push(...tableEditor.registerCommands());

    // Phase 4: Macro Wizard
    context.subscriptions.push(...macroWizard.registerCommands());

    // Phase 4: Performance Optimizer
    context.subscriptions.push(...performanceOptimizer.registerCommands());

    logger.info('Phase 4 commands registered');
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

/**
 * Helper to show PDF with the configured viewer
 */
async function showPDFWithConfiguredViewer(documentUri: vscode.Uri, position?: { page: number; x: number; y: number }): Promise<void> {
    const config = vscode.workspace.getConfiguration('vtex');
    const viewerType = config.get<string>('pdfViewer', 'pdfjs');

    if (viewerType === 'native') {
        // Use native viewer - extract PDF path from document URI
        const docPath = documentUri.fsPath;
        const docDir = require('path').dirname(docPath);
        const docName = require('path').basename(docPath, '.tex');
        const pdfPath = require('path').join(docDir, `${docName}.pdf`);
        await nativePdfPreview.showPDF(pdfPath);
        
        if (position) {
            logger.info('Native PDF viewer does not support SyncTeX positioning');
        }
    } else {
        // Use PDF.js viewer (default)
        await pdfPreview.showPDF(documentUri, position);
    }
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
        
        // Find root file for multi-file projects
        const rootFile = await projectManager.findRootFile(document);
        const docToBuild = rootFile.fsPath !== document.uri.fsPath ? rootFile : document.uri;
        
        const result = await buildSystem.build(docToBuild);
        
        if (result.success) {
            logger.info('Build completed successfully');
            
            // Check if there are warnings
            const warnings = result.errors.filter(e => e.severity === 'warning');
            if (warnings.length > 0) {
                logger.warn(`Build succeeded with ${warnings.length} warning(s)`);
            }
            
            // Auto-refresh PDF preview (without stealing focus)
            await showPDFWithConfiguredViewer(rootFile);
        } else {
            // Build failed, but check if PDF was generated
            if (result.pdfPath) {
                logger.warn('Build completed with errors, but PDF was generated');
                
                // Count fatal vs non-fatal errors
                const errors = result.errors.filter(e => e.severity === 'error');
                logger.error(`${errors.length} error(s) found`);
                
                // Still refresh PDF preview to show the partial result
                await showPDFWithConfiguredViewer(rootFile);
                
                // Show warning instead of error
                vscode.window.showWarningMessage(
                    `LaTeX build completed with ${errors.length} error(s). PDF may be incomplete. Check output for details.`
                );
            } else {
                logger.error('Build failed');
                logger.error(result.output);
            }
            
            // Check for missing packages
            const missingPackages = packageManager.detectMissingPackages(result.output);
            if (missingPackages.length > 0) {
                logger.info(`Detected ${missingPackages.length} missing packages`);
                await packageManager.offerPackageInstallation(missingPackages);
            } else if (!result.pdfPath) {
                // Only show generic error if no PDF and no missing packages
                vscode.window.showErrorMessage('LaTeX build failed. Check output for details.');
            }
        }
    } catch (error) {
        logger.error(`Build error: ${error}`);
        vscode.window.showErrorMessage(`Build error: ${error}`);
    }
}export function deactivate() {
    if (texlabClient) {
        texlabClient.stop();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
}
