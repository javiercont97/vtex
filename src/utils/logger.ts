import * as vscode from 'vscode';

export class Logger {
    constructor(private outputChannel: vscode.OutputChannel) {}

    info(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [INFO] ${message}`);
    }

    warn(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [WARN] ${message}`);
    }

    error(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${message}`);
    }

    show(): void {
        this.outputChannel.show();
    }

    hide(): void {
        this.outputChannel.hide();
    }
}
