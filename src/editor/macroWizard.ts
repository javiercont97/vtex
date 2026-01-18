import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

interface MacroDefinition {
    name: string;
    parameters: number;
    definition: string;
    description?: string;
}

/**
 * Wizard for creating custom LaTeX macros and commands
 */
export class MacroWizard {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger
    ) {}

    /**
     * Register macro wizard commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.createMacro', () => this.openWizard()),
            vscode.commands.registerCommand('vtex.insertCommonMacros', () => this.insertCommonMacros()),
            vscode.commands.registerCommand('vtex.extractMacro', () => this.extractMacro())
        ];
    }

    /**
     * Open macro creation wizard
     */
    private async openWizard(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file first');
            return;
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'macroWizard',
                'LaTeX Macro Wizard',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.webview.html = this.getWizardHtml();

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'create':
                            await this.createMacro(message.macro);
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }
    }

    /**
     * Create macro from wizard input
     */
    private async createMacro(macro: MacroDefinition): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const location = await vscode.window.showQuickPick([
            { label: 'In preamble', value: 'preamble' },
            { label: 'At cursor', value: 'cursor' },
            { label: 'In separate file', value: 'file' }
        ], { placeHolder: 'Where to place the macro definition?' });

        if (!location) {
            return;
        }

        const macroCode = this.generateMacroCode(macro);

        if (location.value === 'preamble') {
            await this.insertInPreamble(editor, macroCode);
        } else if (location.value === 'cursor') {
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, macroCode);
            });
        } else {
            await this.createMacroFile(macroCode);
        }

        vscode.window.showInformationMessage(`Macro \\${macro.name} created successfully`);
    }

    /**
     * Generate LaTeX macro code
     */
    private generateMacroCode(macro: MacroDefinition): string {
        let code = '';

        if (macro.description) {
            code += `% ${macro.description}\n`;
        }

        if (macro.parameters === 0) {
            code += `\\newcommand{\\${macro.name}}{${macro.definition}}\n`;
        } else {
            code += `\\newcommand{\\${macro.name}}[${macro.parameters}]{${macro.definition}}\n`;
        }

        return code;
    }

    /**
     * Insert macro in document preamble
     */
    private async insertInPreamble(editor: vscode.TextEditor, macroCode: string): Promise<void> {
        const document = editor.document;
        const text = document.getText();

        // Find \begin{document}
        const beginDocMatch = text.match(/\\begin\{document\}/);
        if (!beginDocMatch || beginDocMatch.index === undefined) {
            vscode.window.showErrorMessage('Could not find \\begin{document}');
            return;
        }

        const position = document.positionAt(beginDocMatch.index);
        
        await editor.edit(editBuilder => {
            editBuilder.insert(position, `${macroCode}\n`);
        });
    }

    /**
     * Create separate file for macros
     */
    private async createMacroFile(macroCode: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) {
            return;
        }

        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter filename for macros',
            value: 'macros.tex',
            placeHolder: 'macros.tex'
        });

        if (!fileName) {
            return;
        }

        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
        
        // Create or append to file
        try {
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(macroCode));
            
            // Suggest adding \input command
            const addInput = await vscode.window.showInformationMessage(
                `Created ${fileName}. Add \\input{${fileName}} to your document?`,
                'Yes', 'No'
            );

            if (addInput === 'Yes') {
                await this.insertInPreamble(editor, `\\input{${fileName.replace('.tex', '')}}\n`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${error}`);
        }
    }

    /**
     * Get HTML for macro wizard
     */
    private getWizardHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        h3 {
            margin-top: 0;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }

        input, textarea, select {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            box-sizing: border-box;
        }

        textarea {
            min-height: 100px;
            font-family: 'Courier New', monospace;
        }

        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }

        .preview {
            background: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            margin: 20px 0;
            white-space: pre-wrap;
        }

        .examples {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 10px;
            margin: 20px 0;
        }

        .example {
            margin: 10px 0;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>LaTeX Macro Wizard</h3>

        <div class="form-group">
            <label for="macroType">Macro Type:</label>
            <select id="macroType">
                <option value="simple">Simple Command (no parameters)</option>
                <option value="parametric">Parametric Command</option>
                <option value="environment">Custom Environment</option>
            </select>
        </div>

        <div class="form-group">
            <label for="name">Command Name:</label>
            <input type="text" id="name" placeholder="mycommand">
            <div class="help-text">Name without backslash (e.g., "mycommand" for \\mycommand)</div>
        </div>

        <div class="form-group" id="paramsGroup" style="display: none;">
            <label for="params">Number of Parameters:</label>
            <input type="number" id="params" min="1" max="9" value="1">
            <div class="help-text">Parameters are referenced as #1, #2, etc.</div>
        </div>

        <div class="form-group">
            <label for="definition">Definition:</label>
            <textarea id="definition" placeholder="\\textbf{#1}"></textarea>
            <div class="help-text">LaTeX code for the macro. Use #1, #2, etc. for parameters.</div>
        </div>

        <div class="form-group">
            <label for="description">Description (optional):</label>
            <input type="text" id="description" placeholder="Brief description of what this macro does">
        </div>

        <button id="createBtn">Create Macro</button>

        <h4>Preview</h4>
        <div class="preview" id="preview"></div>

        <div class="examples">
            <h4>Examples:</h4>
            <div class="example">
                <strong>Bold text macro:</strong><br>
                Name: important<br>
                Definition: \\textbf{#1}<br>
                Usage: \\important{text}
            </div>
            <div class="example">
                <strong>Vector notation:</strong><br>
                Name: vect<br>
                Definition: \\mathbf{#1}<br>
                Usage: $\\vect{v}$
            </div>
            <div class="example">
                <strong>Custom fraction:</strong><br>
                Name: myfrac<br>
                Parameters: 2<br>
                Definition: \\frac{\\displaystyle #1}{\\displaystyle #2}<br>
                Usage: $\\myfrac{a+b}{c+d}$
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const macroType = document.getElementById('macroType');
        const name = document.getElementById('name');
        const params = document.getElementById('params');
        const definition = document.getElementById('definition');
        const description = document.getElementById('description');
        const paramsGroup = document.getElementById('paramsGroup');
        const preview = document.getElementById('preview');
        const createBtn = document.getElementById('createBtn');

        macroType.addEventListener('change', () => {
            if (macroType.value === 'parametric') {
                paramsGroup.style.display = 'block';
            } else {
                paramsGroup.style.display = 'none';
            }
            updatePreview();
        });

        [name, params, definition, description].forEach(el => {
            el.addEventListener('input', updatePreview);
        });

        function updatePreview() {
            const macroName = name.value.trim();
            const macroParams = macroType.value === 'parametric' ? parseInt(params.value) : 0;
            const macroDef = definition.value.trim();
            const macroDesc = description.value.trim();

            let code = '';
            
            if (macroDesc) {
                code += \`% \${macroDesc}\\n\`;
            }

            if (macroType.value === 'environment') {
                code += '\\\\newenvironment{' + macroName + '}\\n{' + macroDef + '}\\n{}';
            } else {
                if (macroParams === 0) {
                    code += '\\\\newcommand{\\\\' + macroName + '}{' + macroDef + '}';
                } else {
                    code += '\\\\newcommand{\\\\' + macroName + '}[' + macroParams + ']{' + macroDef + '}';
                }
            }

            if (macroName) {
                code += \`\\n\\n% Usage example:\\n\`;
                if (macroType.value === 'environment') {
                    code += \`\\\\begin{\${macroName}}\\n...\\n\\\\end{\${macroName}}\`;
                } else if (macroParams > 0) {
                    const args = Array(macroParams).fill(null).map((_, i) => \`{arg\${i + 1}}\`).join('');
                    code += \`\\\\\${macroName}\${args}\`;
                } else {
                    code += \`\\\\\${macroName}\`;
                }
            }

            preview.textContent = code || 'Fill in the fields to see preview';
        }

        createBtn.addEventListener('click', () => {
            const macroName = name.value.trim();
            const macroParams = macroType.value === 'parametric' ? parseInt(params.value) : 0;
            const macroDef = definition.value.trim();
            const macroDesc = description.value.trim();

            if (!macroName || !macroDef) {
                alert('Please provide at least a name and definition');
                return;
            }

            vscode.postMessage({
                command: 'create',
                macro: {
                    name: macroName,
                    parameters: macroParams,
                    definition: macroDef,
                    description: macroDesc
                }
            });
        });

        updatePreview();
    </script>
</body>
</html>`;
    }

    /**
     * Insert common macros template
     */
    private async insertCommonMacros(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const macroSets = {
            'Math Notation': `% Common math notation macros
\\newcommand{\\vect}[1]{\\mathbf{#1}}
\\newcommand{\\abs}[1]{\\left|#1\\right|}
\\newcommand{\\norm}[1]{\\left\\|#1\\right\\|}
\\newcommand{\\inner}[2]{\\langle #1, #2 \\rangle}
\\newcommand{\\R}{\\mathbb{R}}
\\newcommand{\\C}{\\mathbb{C}}
\\newcommand{\\N}{\\mathbb{N}}
\\newcommand{\\Z}{\\mathbb{Z}}`,
            'Theorem Environments': `% Theorem-like environments
\\newcommand{\\theorem}[2]{\\begin{theorem}[#1]#2\\end{theorem}}
\\newcommand{\\lemma}[2]{\\begin{lemma}[#1]#2\\end{lemma}}
\\newcommand{\\proposition}[2]{\\begin{proposition}[#1]#2\\end{proposition}}
\\newcommand{\\corollary}[2]{\\begin{corollary}[#1]#2\\end{corollary}}`,
            'Text Formatting': `% Text formatting macros
\\newcommand{\\important}[1]{\\textbf{#1}}
\\newcommand{\\keyword}[1]{\\textit{#1}}
\\newcommand{\\code}[1]{\\texttt{#1}}
\\newcommand{\\todo}[1]{\\textcolor{red}{TODO: #1}}`,
            'Derivatives & Integrals': `% Calculus macros
\\newcommand{\\diff}[2]{\\frac{d#1}{d#2}}
\\newcommand{\\pdiff}[2]{\\frac{\\partial#1}{\\partial#2}}
\\newcommand{\\integral}[4]{\\int_{#1}^{#2} #3 \\, d#4}
\\newcommand{\\limit}[2]{\\lim_{#1 \\to #2}}`
        };

        const selected = await vscode.window.showQuickPick(Object.keys(macroSets), {
            placeHolder: 'Select macro set to insert'
        });

        if (!selected) {
            return;
        }

        await this.insertInPreamble(editor, macroSets[selected as keyof typeof macroSets] + '\n');
        vscode.window.showInformationMessage('Macros inserted in preamble');
    }

    /**
     * Extract repeated code into macro
     */
    private async extractMacro(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showInformationMessage('Please select the code you want to extract into a macro');
            return;
        }

        const selectedText = editor.document.getText(selection);

        const name = await vscode.window.showInputBox({
            prompt: 'Enter name for the new macro',
            placeHolder: 'mymacro'
        });

        if (!name) {
            return;
        }

        // Analyze selected text for potential parameters
        const suggestion = this.analyzePotentialParameters(selectedText);

        const macro: MacroDefinition = {
            name,
            parameters: 0,
            definition: selectedText
        };

        if (suggestion.parameters > 0) {
            const useParams = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Found ${suggestion.parameters} potential parameter(s). Use parameters?`
            });

            if (useParams === 'Yes') {
                macro.parameters = suggestion.parameters;
                macro.definition = suggestion.definition;
            }
        }

        // Create the macro
        await this.createMacro(macro);

        // Replace selection with macro usage
        await editor.edit(editBuilder => {
            const usage = macro.parameters > 0 
                ? `\\${name}${Array(macro.parameters).fill('{}').join('')}`
                : `\\${name}`;
            editBuilder.replace(selection, usage);
        });
    }

    /**
     * Analyze text for potential macro parameters
     */
    private analyzePotentialParameters(text: string): { parameters: number; definition: string } {
        // Simple heuristic: look for repeated patterns that could be parameters
        // For now, just return the text as-is
        return {
            parameters: 0,
            definition: text
        };
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
