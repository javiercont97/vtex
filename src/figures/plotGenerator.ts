import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * Helper for generating plots and diagrams
 */
export class PlotGenerator {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger
    ) {}

    /**
     * Register plot generation commands
     */
    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('vtex.generatePlot', () => this.generatePlot()),
            vscode.commands.registerCommand('vtex.insertPgfplotsTemplate', () => this.insertPgfplotsTemplate())
        ];
    }

    /**
     * Generate a plot with wizard
     */
    private async generatePlot(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            vscode.window.showErrorMessage('Please open a LaTeX file first');
            return;
        }

        const plotType = await vscode.window.showQuickPick([
            { label: 'Line Plot', value: 'line' },
            { label: 'Scatter Plot', value: 'scatter' },
            { label: 'Bar Chart', value: 'bar' },
            { label: 'Histogram', value: 'histogram' },
            { label: 'Function Plot', value: 'function' },
            { label: 'Parametric Plot', value: 'parametric' },
            { label: 'Contour Plot', value: 'contour' },
            { label: 'Custom', value: 'custom' }
        ], { placeHolder: 'Select plot type' });

        if (!plotType) {
            return;
        }

        let plotCode: string;

        switch (plotType.value) {
            case 'line':
                plotCode = await this.generateLinePlot();
                break;
            case 'scatter':
                plotCode = await this.generateScatterPlot();
                break;
            case 'bar':
                plotCode = await this.generateBarChart();
                break;
            case 'histogram':
                plotCode = await this.generateHistogram();
                break;
            case 'function':
                plotCode = await this.generateFunctionPlot();
                break;
            case 'parametric':
                plotCode = await this.generateParametricPlot();
                break;
            case 'contour':
                plotCode = await this.generateContourPlot();
                break;
            default:
                return;
        }

        if (plotCode) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, plotCode);
            });
        }
    }

    /**
     * Generate line plot code
     */
    private async generateLinePlot(): Promise<string> {
        const dataSource = await vscode.window.showQuickPick([
            { label: 'Manual Data Points', value: 'manual' },
            { label: 'CSV File', value: 'csv' },
            { label: 'Table in Document', value: 'table' }
        ], { placeHolder: 'Data source' });

        if (!dataSource) {
            return '';
        }

        if (dataSource.value === 'manual') {
            const points = await vscode.window.showInputBox({
                prompt: 'Enter data points (x,y pairs separated by spaces)',
                placeHolder: '0,0 1,1 2,4 3,9',
                value: '0,0 1,1 2,4 3,9'
            });

            if (!points) {
                return '';
            }

            const coordinates = points.split(/\s+/).map(p => {
                const [x, y] = p.split(',');
                return `(${x},${y})`;
            }).join(' ');

            return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            xlabel={$x$},
            ylabel={$y$},
            grid=major,
            legend pos=north west
        ]
        \\addplot coordinates {${coordinates}};
        \\legend{Data}
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Line plot}
    \\label{fig:lineplot}
\\end{figure}\n`;
        } else if (dataSource.value === 'csv') {
            const filename = await vscode.window.showInputBox({
                prompt: 'Enter CSV filename',
                placeHolder: 'data.csv'
            });

            if (!filename) {
                return '';
            }

            return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            xlabel={$x$},
            ylabel={$y$},
            grid=major,
            legend pos=north west
        ]
        \\addplot table[col sep=comma] {${filename}};
        \\legend{Data}
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Plot from ${filename}}
    \\label{fig:csvplot}
\\end{figure}\n`;
        }

        return '';
    }

    /**
     * Generate scatter plot code
     */
    private async generateScatterPlot(): Promise<string> {
        return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            xlabel={$x$},
            ylabel={$y$},
            grid=major,
            only marks,
            mark=*
        ]
        \\addplot coordinates {(0,0) (1,1) (2,3) (3,2) (4,5)};
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Scatter plot}
    \\label{fig:scatter}
\\end{figure}\n`;
    }

    /**
     * Generate bar chart code
     */
    private async generateBarChart(): Promise<string> {
        const orientation = await vscode.window.showQuickPick([
            { label: 'Vertical', value: 'vertical' },
            { label: 'Horizontal', value: 'horizontal' }
        ], { placeHolder: 'Bar orientation' });

        if (!orientation) {
            return '';
        }

        const plotType = orientation.value === 'horizontal' ? 'xbar' : 'ybar';

        return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            ${plotType},
            symbolic x coords={A,B,C,D},
            xtick=data,
            ylabel={Value},
            xlabel={Category}
        ]
        \\addplot coordinates {(A,20) (B,35) (C,30) (D,45)};
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Bar chart}
    \\label{fig:barchart}
\\end{figure}\n`;
    }

    /**
     * Generate histogram code
     */
    private async generateHistogram(): Promise<string> {
        return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            ybar interval,
            xlabel={Value},
            ylabel={Frequency}
        ]
        \\addplot+[hist={bins=10}] table[y index=0] {data.csv};
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Histogram}
    \\label{fig:histogram}
\\end{figure}\n`;
    }

    /**
     * Generate function plot code
     */
    private async generateFunctionPlot(): Promise<string> {
        const func = await vscode.window.showInputBox({
            prompt: 'Enter function (LaTeX syntax)',
            placeHolder: 'x^2',
            value: 'x^2'
        });

        if (!func) {
            return '';
        }

        const domain = await vscode.window.showInputBox({
            prompt: 'Enter domain (min:max)',
            value: '-5:5'
        });

        if (!domain) {
            return '';
        }

        return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            xlabel={$x$},
            ylabel={$f(x)$},
            grid=major,
            domain=${domain},
            samples=100
        ]
        \\addplot {${func}};
        \\legend{$f(x)=${func}$}
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Function plot: $f(x)=${func}$}
    \\label{fig:function}
\\end{figure}\n`;
    }

    /**
     * Generate parametric plot code
     */
    private async generateParametricPlot(): Promise<string> {
        return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            xlabel={$x$},
            ylabel={$y$},
            grid=major,
            axis equal
        ]
        \\addplot[domain=0:360,samples=100] ({cos(x)},{sin(x)});
        \\legend{Circle}
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Parametric plot}
    \\label{fig:parametric}
\\end{figure}\n`;
    }

    /**
     * Generate contour plot code
     */
    private async generateContourPlot(): Promise<string> {
        return `\\begin{figure}[htbp]
    \\centering
    \\begin{tikzpicture}
        \\begin{axis}[
            view={0}{90},
            xlabel={$x$},
            ylabel={$y$}
        ]
        \\addplot3[
            contour gnuplot={number=10},
            domain=-2:2,
            y domain=-2:2
        ] {x^2 + y^2};
        \\end{axis}
    \\end{tikzpicture}
    \\caption{Contour plot}
    \\label{fig:contour}
\\end{figure}\n`;
    }

    /**
     * Insert pgfplots template
     */
    private async insertPgfplotsTemplate(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'latex') {
            return;
        }

        const templates = {
            'Basic Plot': `\\begin{tikzpicture}
    \\begin{axis}[
        xlabel={$x$},
        ylabel={$y$},
        grid=major
    ]
    \\addplot coordinates {(0,0) (1,1) (2,4) (3,9)};
    \\end{axis}
\\end{tikzpicture}`,
            'Multiple Series': `\\begin{tikzpicture}
    \\begin{axis}[
        xlabel={$x$},
        ylabel={$y$},
        grid=major,
        legend pos=north west
    ]
    \\addplot coordinates {(0,0) (1,1) (2,4)};
    \\addplot coordinates {(0,1) (1,2) (2,3)};
    \\legend{Series 1, Series 2}
    \\end{axis}
\\end{tikzpicture}`,
            '3D Surface': `\\begin{tikzpicture}
    \\begin{axis}[
        xlabel={$x$},
        ylabel={$y$},
        zlabel={$z$}
    ]
    \\addplot3[surf,domain=-2:2] {x^2 + y^2};
    \\end{axis}
\\end{tikzpicture}`,
            'Logarithmic Scale': `\\begin{tikzpicture}
    \\begin{semilogyaxis}[
        xlabel={$x$},
        ylabel={$y$},
        grid=major
    ]
    \\addplot coordinates {(1,10) (2,100) (3,1000)};
    \\end{semilogyaxis}
\\end{tikzpicture}`
        };

        const selected = await vscode.window.showQuickPick(Object.keys(templates), {
            placeHolder: 'Select a pgfplots template'
        });

        if (!selected) {
            return;
        }

        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, templates[selected as keyof typeof templates]);
        });
    }

    public dispose(): void {
        // Cleanup if needed
    }
}
