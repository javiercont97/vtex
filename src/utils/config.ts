import * as vscode from 'vscode';

export class Config {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('vtex');
    }

    refresh(): void {
        this.config = vscode.workspace.getConfiguration('vtex');
    }

    getBuildMethod(): 'auto' | 'local' | 'docker' {
        return this.config.get<'auto' | 'local' | 'docker'>('buildMethod', 'auto');
    }

    getDockerImage(): string {
        return this.config.get<string>('docker.image', 'texlive/texlive:latest');
    }

    getDockerEnableCache(): boolean {
        return this.config.get<boolean>('docker.enableCache', true);
    }

    getBuildOnSave(): boolean {
        return this.config.get<boolean>('buildOnSave', true);
    }

    getBuildEngine(): string {
        return this.config.get<string>('buildEngine', 'latexmk');
    }

    getLatexmkOptions(): string[] {
        return this.config.get<string[]>('latexmk.options', [
            '-pdf',
            '-interaction=nonstopmode',
            '-synctex=1',
            '-file-line-error'
        ]);
    }

    getOutputDirectory(): string {
        return this.config.get<string>('outputDirectory', 'out');
    }

    getRootFile(): string {
        return this.config.get<string>('rootFile', '');
    }

    getShowOutputChannel(): 'never' | 'onError' | 'always' {
        return this.config.get<'never' | 'onError' | 'always'>('showOutputChannel', 'onError');
    }
}
