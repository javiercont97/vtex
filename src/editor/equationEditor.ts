import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

interface MathSymbol {
    symbol: string;
    latex: string;
    category: string;
}

/**
 * Visual equation editor for LaTeX
 */
export class EquationEditor {
    private panel: vscode.WebviewPanel | undefined;
    private currentEquation: string = '';
    private sourceRange: vscode.Range | undefined; // Track where equation came from
    private sourceMode: 'inline' | 'display' | 'equation' = 'display';
    private sourceDocument: vscode.Uri | undefined; // Track which document the equation is in

    private readonly mathSymbols: MathSymbol[] = [
        // Greek letters
        { symbol: 'α', latex: '\\alpha', category: 'Greek' },
        { symbol: 'β', latex: '\\beta', category: 'Greek' },
        { symbol: 'γ', latex: '\\gamma', category: 'Greek' },
        { symbol: 'δ', latex: '\\delta', category: 'Greek' },
        { symbol: 'ε', latex: '\\epsilon', category: 'Greek' },
        { symbol: 'θ', latex: '\\theta', category: 'Greek' },
        { symbol: 'λ', latex: '\\lambda', category: 'Greek' },
        { symbol: 'μ', latex: '\\mu', category: 'Greek' },
        { symbol: 'π', latex: '\\pi', category: 'Greek' },
        { symbol: 'σ', latex: '\\sigma', category: 'Greek' },
        { symbol: 'φ', latex: '\\phi', category: 'Greek' },
        { symbol: 'ω', latex: '\\omega', category: 'Greek' },
        // Operators
        { symbol: '∫', latex: '\\int', category: 'Operators' },
        { symbol: '∑', latex: '\\sum', category: 'Operators' },
        { symbol: '∏', latex: '\\prod', category: 'Operators' },
        { symbol: '√', latex: '\\sqrt{}', category: 'Operators' },
        { symbol: '∂', latex: '\\partial', category: 'Operators' },
        { symbol: '∇', latex: '\\nabla', category: 'Operators' },
        // Relations
        { symbol: '≤', latex: '\\leq', category: 'Relations' },
        { symbol: '≥', latex: '\\geq', category: 'Relations' },
        { symbol: '≠', latex: '\\neq', category: 'Relations' },
        { symbol: '≈', latex: '\\approx', category: 'Relations' },
        { symbol: '∈', latex: '\\in', category: 'Relations' },
        { symbol: '⊂', latex: '\\subset', category: 'Relations' },
        { symbol: '→', latex: '\\to', category: 'Relations' },
        { symbol: '⇒', latex: '\\Rightarrow', category: 'Relations' },
        // Arrows
        { symbol: '←', latex: '\\leftarrow', category: 'Arrows' },
        { symbol: '→', latex: '\\rightarrow', category: 'Arrows' },
        { symbol: '↔', latex: '\\leftrightarrow', category: 'Arrows' },
        { symbol: '⇐', latex: '\\Leftarrow', category: 'Arrows' },
        { symbol: '⇒', latex: '\\Rightarrow', category: 'Arrows' },
        { symbol: '⇔', latex: '\\Leftrightarrow', category: 'Arrows' },
        // Misc
        { symbol: '∞', latex: '\\infty', category: 'Misc' },
        { symbol: '∅', latex: '\\emptyset', category: 'Misc' },
        { symbol: '∀', latex: '\\forall', category: 'Misc' },
        { symbol: '∃', latex: '\\exists', category: 'Misc' },
    ];

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger
    ) {}

    /**
     * Register equation editor commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.openEquationEditor', (equation?: string, range?: vscode.Range, mode?: 'inline' | 'display' | 'equation') => 
                this.openEditor(equation, range, mode)),
            vscode.commands.registerCommand('vtex.insertMathSymbol', () => this.insertMathSymbol()),
            vscode.commands.registerCommand('vtex.wrapInMath', () => this.wrapInMath())
        ];
    }

    /**
     * Open equation editor panel
     */
    private async openEditor(equation?: string, range?: vscode.Range, mode?: 'inline' | 'display' | 'equation'): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file first');
            return;
        }

        // Set equation and range from parameters or selection
        if (equation !== undefined) {
            this.currentEquation = equation;
            this.sourceRange = range;
            this.sourceMode = mode || 'display';
            this.sourceDocument = editor.document.uri;
        } else {
            const selection = editor.selection;
            if (!selection.isEmpty) {
                this.currentEquation = editor.document.getText(selection);
                this.sourceRange = selection;
            } else {
                this.currentEquation = '';
                this.sourceRange = undefined;
                this.sourceDocument = undefined;
            }
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'equationEditor',
                'LaTeX Equation Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.webview.html = this.getEditorHtml();

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'insert':
                            await this.insertEquation(message.equation, message.mode || 'display', message.auto);
                            break;
                        case 'preview':
                            // Update preview (handled in webview)
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

        // Send initial equation and mode
        if (this.currentEquation) {
            this.panel.webview.postMessage({
                command: 'setEquation',
                equation: this.currentEquation,
                mode: this.sourceMode
            });
        }
    }

    /**
     * Insert equation into document
     */
    private async insertEquation(equation: string, mode: 'inline' | 'display' | 'equation', isAuto: boolean = false): Promise<void> {
        // Get the correct editor - either from stored document or active editor
        let editor: vscode.TextEditor | undefined;
        
        if (this.sourceDocument) {
            // Find editor with the source document
            editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === this.sourceDocument!.toString());
        }
        
        if (!editor) {
            // Fallback to active editor
            editor = vscode.window.activeTextEditor;
        }
        
        if (!editor) {
            vscode.window.showErrorMessage('Could not find the document to insert equation');
            return;
        }

        let formatted: string;
        if (mode === 'inline') {
            formatted = `$${equation}$`;
        } else if (mode === 'display') {
            formatted = `\\[\n    ${equation}\n\\]\n`;
        } else {
            formatted = `\\begin{equation}\n    ${equation}\n\\end{equation}\n`;
        }

        const wasUpdate = !!this.sourceRange;
        const oldRange = this.sourceRange;

        await editor.edit(editBuilder => {
            if (this.sourceRange) {
                // Replace existing equation
                editBuilder.replace(this.sourceRange, formatted);
            } else if (editor.selection.isEmpty) {
                // Insert at cursor
                editBuilder.insert(editor.selection.active, formatted);
            } else {
                // Replace selection
                editBuilder.replace(editor.selection, formatted);
            }
        });

        // Update source range to the new equation location for future edits
        if (oldRange) {
            const startPos = oldRange.start;
            const lines = formatted.split('\n').filter(l => l.length > 0); // Filter empty lines
            const numLines = lines.length;
            const lastLine = formatted.endsWith('\n') ? '' : lines[lines.length - 1];
            const endLine = startPos.line + (formatted.endsWith('\n') ? numLines : numLines - 1);
            const endChar = formatted.endsWith('\n') ? 0 : lastLine.length;
            this.sourceRange = new vscode.Range(startPos, new vscode.Position(endLine, endChar));
        } else if (!editor.selection.isEmpty) {
            // Track the newly inserted range from selection
            const startPos = editor.selection.start;
            const lines = formatted.split('\n').filter(l => l.length > 0);
            const numLines = lines.length;
            const lastLine = formatted.endsWith('\n') ? '' : lines[lines.length - 1];
            const endLine = startPos.line + (formatted.endsWith('\n') ? numLines : numLines - 1);
            const endChar = formatted.endsWith('\n') ? 0 : lastLine.length;
            this.sourceRange = new vscode.Range(startPos, new vscode.Position(endLine, endChar));
        }
        
        // Only show notification for manual updates
        if (!isAuto) {
            vscode.window.showInformationMessage(`Equation ${wasUpdate ? 'updated' : 'inserted'}`);
        }
    }

    /**
     * Get HTML for equation editor
     */
    private getEditorHtml(): string {
        const katexCss = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
        const katexJs = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${katexCss}">
    <script src="${katexJs}"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        /* Toolbar */
        .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 12px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            align-items: center;
        }

        .toolbar-group {
            display: flex;
            gap: 4px;
            align-items: center;
            padding: 0 8px;
            border-right: 1px solid var(--vscode-panel-border);
        }

        .toolbar-group:last-child {
            border-right: none;
        }

        .toolbar-label {
            font-size: 11px;
            opacity: 0.8;
            margin-right: 4px;
        }

        select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }

        select:hover {
            background: var(--vscode-dropdown-listBackground);
        }

        .toolbar-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            min-width: 32px;
            text-align: center;
        }

        .toolbar-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .toolbar-btn.text {
            font-size: 11px;
            font-family: var(--vscode-font-family);
        }

        .mode-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }

        .mode-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .mode-btn:hover:not(.active) {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        /* Main content area */
        .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .editor-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 16px;
            overflow: auto;
            min-height: 0;
        }

        textarea {
            width: 100%;
            height: 100%;
            min-height: 120px;
            max-height: 100%;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            padding: 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            resize: none;
        }

        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .preview-section {
            padding: 16px;
            background: var(--vscode-sideBar-background);
            border-top: 1px solid var(--vscode-panel-border);
            min-height: 100px;
            max-height: 200px;
            overflow: auto;
        }

        .preview-label {
            font-size: 11px;
            opacity: 0.8;
            margin-bottom: 8px;
        }

        .preview {
            background: white;
            padding: 16px;
            border-radius: 4px;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }

        .preview em {
            color: #888;
            font-style: italic;
        }

        /* Action buttons */
        .actions {
            display: flex;
            gap: 8px;
            padding: 12px;
            background: var(--vscode-sideBar-background);
            border-top: 1px solid var(--vscode-panel-border);
        }

        .btn-primary {
            flex: 1;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 10px 20px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
        }

        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <!-- Toolbar -->
    <div class="toolbar">
        <!-- Mode Selection -->
        <div class="toolbar-group">
            <span class="toolbar-label">Mode:</span>
            <button class="mode-btn" id="inlineMode">Inline</button>
            <button class="mode-btn active" id="displayMode">Display</button>
            <button class="mode-btn" id="equationMode">Equation</button>
        </div>

        <!-- Greek Letters -->
        <div class="toolbar-group">
            <span class="toolbar-label">Greek:</span>
            <select id="greekSelect">
                <option value="">Select...</option>
                <option value="\\alpha">α (alpha)</option>
                <option value="\\beta">β (beta)</option>
                <option value="\\gamma">γ (gamma)</option>
                <option value="\\Gamma">Γ (Gamma)</option>
                <option value="\\delta">δ (delta)</option>
                <option value="\\Delta">Δ (Delta)</option>
                <option value="\\epsilon">ε (epsilon)</option>
                <option value="\\zeta">ζ (zeta)</option>
                <option value="\\eta">η (eta)</option>
                <option value="\\theta">θ (theta)</option>
                <option value="\\Theta">Θ (Theta)</option>
                <option value="\\kappa">κ (kappa)</option>
                <option value="\\lambda">λ (lambda)</option>
                <option value="\\Lambda">Λ (Lambda)</option>
                <option value="\\mu">μ (mu)</option>
                <option value="\\nu">ν (nu)</option>
                <option value="\\xi">ξ (xi)</option>
                <option value="\\Xi">Ξ (Xi)</option>
                <option value="\\pi">π (pi)</option>
                <option value="\\Pi">Π (Pi)</option>
                <option value="\\rho">ρ (rho)</option>
                <option value="\\sigma">σ (sigma)</option>
                <option value="\\Sigma">Σ (Sigma)</option>
                <option value="\\tau">τ (tau)</option>
                <option value="\\phi">φ (phi)</option>
                <option value="\\Phi">Φ (Phi)</option>
                <option value="\\chi">χ (chi)</option>
                <option value="\\psi">ψ (psi)</option>
                <option value="\\Psi">Ψ (Psi)</option>
                <option value="\\omega">ω (omega)</option>
                <option value="\\Omega">Ω (Omega)</option>
            </select>
        </div>

        <!-- Templates -->
        <div class="toolbar-group">
            <span class="toolbar-label">Templates:</span>
            <select id="templateSelect">
                <option value="">Select...</option>
                <option value="\\frac{a}{b}">Fraction (a/b)</option>
                <option value="x^{2}">Superscript (x²)</option>
                <option value="x_{i}">Subscript (xᵢ)</option>
                <option value="\\sqrt{x}">Square root (√x)</option>
                <option value="\\int_{a}^{b}">Integral (∫)</option>
                <option value="\\sum_{i=1}^{n}">Sum (∑)</option>
                <option value="\\prod_{i=1}^{n}">Product (∏)</option>
                <option value="\\lim_{x \\to \\infty}">Limit (lim)</option>
                <option value="\\begin{pmatrix} a & b \\\\\\\\ c & d \\end{pmatrix}">Matrix (2x2)</option>
                <option value="\\begin{bmatrix} a & b \\\\\\\\ c & d \\end{bmatrix}">Bracket Matrix [2x2]</option>
                <option value="\\begin{cases} x & \\text{if } x > 0 \\\\\\\\ -x & \\text{if } x \\leq 0 \\end{cases}">Cases</option>
            </select>
        </div>

        <!-- Operators & Relations -->
        <div class="toolbar-group">
            <span class="toolbar-label">Operators:</span>
            <select id="operatorSelect">
                <option value="">Select...</option>
                <option value="\\leq">≤ (less or equal)</option>
                <option value="\\geq">≥ (greater or equal)</option>
                <option value="\\neq">≠ (not equal)</option>
                <option value="\\approx">≈ (approximately)</option>
                <option value="\\equiv">≡ (equivalent)</option>
                <option value="\\sim">∼ (similar)</option>
                <option value="\\cong">≅ (congruent)</option>
                <option value="\\propto">∝ (proportional)</option>
                <option value="\\ll">≪ (much less)</option>
                <option value="\\gg">≫ (much greater)</option>
            </select>
        </div>

        <!-- Sets & Logic -->
        <div class="toolbar-group">
            <span class="toolbar-label">Sets:</span>
            <select id="setSelect">
                <option value="">Select...</option>
                <option value="\\in">∈ (element of)</option>
                <option value="\\notin">∉ (not in)</option>
                <option value="\\subset">⊂ (subset)</option>
                <option value="\\subseteq">⊆ (subset or equal)</option>
                <option value="\\supset">⊃ (superset)</option>
                <option value="\\supseteq">⊇ (superset or equal)</option>
                <option value="\\cup">∪ (union)</option>
                <option value="\\cap">∩ (intersection)</option>
                <option value="\\setminus">∖ (set difference)</option>
                <option value="\\emptyset">∅ (empty set)</option>
                <option value="\\varnothing">∅ (empty set alt)</option>
            </select>
        </div>

        <!-- Arrows -->
        <div class="toolbar-group">
            <span class="toolbar-label">Arrows:</span>
            <select id="arrowSelect">
                <option value="">Select...</option>
                <option value="\\to">→ (to)</option>
                <option value="\\rightarrow">→ (right arrow)</option>
                <option value="\\leftarrow">← (left arrow)</option>
                <option value="\\leftrightarrow">↔ (left-right)</option>
                <option value="\\Rightarrow">⇒ (implies)</option>
                <option value="\\Leftarrow">⇐ (implied by)</option>
                <option value="\\Leftrightarrow">⇔ (iff)</option>
                <option value="\\uparrow">↑ (up arrow)</option>
                <option value="\\downarrow">↓ (down arrow)</option>
                <option value="\\updownarrow">↕ (up-down)</option>
                <option value="\\mapsto">↦ (maps to)</option>
            </select>
        </div>

        <!-- More Symbols -->
        <div class="toolbar-group">
            <span class="toolbar-label">More:</span>
            <select id="moreSymbols">
                <option value="">Symbols...</option>
                <option value="\\infty">∞ (infinity)</option>
                <option value="\\partial">∂ (partial)</option>
                <option value="\\nabla">∇ (nabla)</option>
                <option value="\\forall">∀ (for all)</option>
                <option value="\\exists">∃ (exists)</option>
                <option value="\\nexists">∄ (not exists)</option>
                <option value="\\pm">± (plus-minus)</option>
                <option value="\\mp">∓ (minus-plus)</option>
                <option value="\\times">× (times)</option>
                <option value="\\div">÷ (divide)</option>
                <option value="\\cdot">· (cdot)</option>
                <option value="\\circ">∘ (compose)</option>
                <option value="\\oplus">⊕ (oplus)</option>
                <option value="\\otimes">⊗ (otimes)</option>
                <option value="\\odot">⊙ (odot)</option>
                <option value="\\perp">⊥ (perpendicular)</option>
                <option value="\\parallel">∥ (parallel)</option>
                <option value="\\angle">∠ (angle)</option>
                <option value="\\triangle">△ (triangle)</option>
                <option value="\\neg">¬ (not)</option>
                <option value="\\wedge">∧ (and)</option>
                <option value="\\vee">∨ (or)</option>
                <option value="\\top">⊤ (top)</option>
                <option value="\\bot">⊥ (bottom)</option>
                <option value="\\ell">ℓ (ell)</option>
                <option value="\\hbar">ℏ (hbar)</option>
                <option value="\\Re">ℜ (real part)</option>
                <option value="\\Im">ℑ (imaginary part)</option>
                <option value="\\aleph">ℵ (aleph)</option>
            </select>
        </div>
    </div>

    <!-- Editor Content -->
    <div class="content">
        <div class="editor-area">
            <textarea id="equation" placeholder="Enter LaTeX equation...">${this.currentEquation}</textarea>
        </div>
        
        <div class="preview-section">
            <div class="preview-label">PREVIEW</div>
            <div class="preview" id="preview"></div>
        </div>
    </div>

    <!-- Actions -->
    <div class="actions">
        <button class="btn-secondary" id="clearBtn">Clear</button>
        <button class="btn-primary" id="insertBtn">Insert into Document</button>
    </div>


    <script>
        const vscode = acquireVsCodeApi();
        const textarea = document.getElementById('equation');
        const preview = document.getElementById('preview');
        const insertBtn = document.getElementById('insertBtn');
        const clearBtn = document.getElementById('clearBtn');
        const inlineModeBtn = document.getElementById('inlineMode');
        const displayModeBtn = document.getElementById('displayMode');
        const equationModeBtn = document.getElementById('equationMode');
        const greekSelect = document.getElementById('greekSelect');
        const templateSelect = document.getElementById('templateSelect');
        const operatorSelect = document.getElementById('operatorSelect');
        const setSelect = document.getElementById('setSelect');
        const arrowSelect = document.getElementById('arrowSelect');
        const moreSymbols = document.getElementById('moreSymbols');
        let currentMode = 'display';
        let updateTimeout = null;
        let hasSourceRange = false; // Track if we're editing an existing equation

        function updatePreview() {
            const equation = textarea.value.trim();
            if (!equation) {
                preview.innerHTML = '<em>Enter an equation to see preview</em>';
                return;
            }

            try {
                katex.render(equation, preview, {
                    displayMode: currentMode !== 'inline',
                    throwOnError: false
                });
            } catch (error) {
                preview.innerHTML = '<em style="color: red;">Invalid LaTeX</em>';
            }
        }

        function scheduleAutoUpdate() {
            if (!hasSourceRange) return; // Only auto-update when editing existing equation
            
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            
            updateTimeout = setTimeout(() => {
                vscode.postMessage({
                    command: 'insert',
                    equation: textarea.value,
                    mode: currentMode,
                    auto: true
                });
            }, 800); // Wait 800ms after user stops typing
        }

        function insertAtCursor(text) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;
            textarea.value = value.substring(0, start) + text + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + text.length;
            textarea.focus();
            updatePreview();
        }

        // Event listeners
        textarea.addEventListener('input', () => {
            updatePreview();
            scheduleAutoUpdate();
        });

        insertBtn.addEventListener('click', () => {
            vscode.postMessage({
                command: 'insert',
                equation: textarea.value,
                mode: currentMode
            });
        });

        clearBtn.addEventListener('click', () => {
            textarea.value = '';
            updatePreview();
        });

        // Mode buttons
        inlineModeBtn.addEventListener('click', () => {
            currentMode = 'inline';
            inlineModeBtn.classList.add('active');
            displayModeBtn.classList.remove('active');
            equationModeBtn.classList.remove('active');
            updatePreview();
        });

        displayModeBtn.addEventListener('click', () => {
            currentMode = 'display';
            displayModeBtn.classList.add('active');
            inlineModeBtn.classList.remove('active');
            equationModeBtn.classList.remove('active');
            updatePreview();
        });

        equationModeBtn.addEventListener('click', () => {
            currentMode = 'equation';
            equationModeBtn.classList.add('active');
            inlineModeBtn.classList.remove('active');
            displayModeBtn.classList.remove('active');
            updatePreview();
        });

        // Dropdown selects
        greekSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                insertAtCursor(e.target.value);
                e.target.value = '';
            }
        });

        templateSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                insertAtCursor(e.target.value);
                e.target.value = '';
            }
        });

        operatorSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                insertAtCursor(e.target.value);
                e.target.value = '';
            }
        });

        setSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                insertAtCursor(e.target.value);
                e.target.value = '';
            }
        });

        arrowSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                insertAtCursor(e.target.value);
                e.target.value = '';
            }
        });

        moreSymbols.addEventListener('change', (e) => {
            if (e.target.value) {
                insertAtCursor(e.target.value);
                e.target.value = '';
            }
        });

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setEquation') {
                textarea.value = message.equation || '';
                hasSourceRange = !!message.equation; // We have a source range if equation was provided
                if (message.mode) {
                    currentMode = message.mode;
                    // Update button states
                    inlineModeBtn.classList.toggle('active', currentMode === 'inline');
                    displayModeBtn.classList.toggle('active', currentMode === 'display');
                    equationModeBtn.classList.toggle('active', currentMode === 'equation');
                }
                updatePreview();
                textarea.focus();
            }
        });

        // Initial preview
        updatePreview();
    </script>
</body>
</html>`;
    }

    /**
     * Insert math symbol at cursor
     */
    private async insertMathSymbol(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const categories = [...new Set(this.mathSymbols.map(s => s.category))];
        const category = await vscode.window.showQuickPick(categories, {
            placeHolder: 'Select symbol category'
        });

        if (!category) {
            return;
        }

        const symbols = this.mathSymbols.filter(s => s.category === category);
        const selected = await vscode.window.showQuickPick(
            symbols.map(s => ({
                label: `${s.symbol} ${s.latex}`,
                description: s.latex,
                detail: s.category,
                latex: s.latex
            })),
            { placeHolder: 'Select symbol' }
        );

        if (!selected) {
            return;
        }

        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, selected.latex);
        });
    }

    /**
     * Wrap selection in math mode
     */
    private async wrapInMath(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const mode = await vscode.window.showQuickPick([
            { label: 'Inline ($...$)', value: 'inline' },
            { label: 'Display (\\[...\\])', value: 'display' },
            { label: 'Equation environment', value: 'equation' }
        ], { placeHolder: 'Select math mode' });

        if (!mode) {
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        let wrapped: string;
        switch (mode.value) {
            case 'inline':
                wrapped = `$${text}$`;
                break;
            case 'display':
                wrapped = `\\[\n    ${text}\n\\]`;
                break;
            case 'equation':
                wrapped = `\\begin{equation}\n    ${text}\n\\end{equation}`;
                break;
            default:
                return;
        }

        editor.edit(editBuilder => {
            editBuilder.replace(selection, wrapped);
        });
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
