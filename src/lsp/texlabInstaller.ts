import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as child_process from 'child_process';

export class TexlabInstaller {
    private readonly extensionPath: string;
    private readonly binPath: string;
    private readonly texlabPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.extensionPath = context.extensionPath;
        this.binPath = path.join(this.extensionPath, 'bin');
        this.texlabPath = path.join(this.binPath, 'texlab');
    }

    /**
     * Check if texlab is installed (either in PATH or in extension bin)
     */
    public isInstalled(): boolean {
        // Check in extension bin directory
        if (fs.existsSync(this.texlabPath)) {
            return true;
        }

        // Check if texlab is in PATH
        try {
            child_process.execSync('texlab --version', { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the installed texlab version
     */
    public getInstalledVersion(): string | null {
        try {
            // Try extension bin first
            if (fs.existsSync(this.texlabPath)) {
                const output = child_process.execSync(`"${this.texlabPath}" --version`, { 
                    timeout: 5000,
                    encoding: 'utf8'
                });
                const match = output.match(/texlab (\d+\.\d+\.\d+)/);
                return match ? match[1] : null;
            }

            // Try system texlab
            const output = child_process.execSync('texlab --version', { 
                timeout: 5000,
                encoding: 'utf8'
            });
            const match = output.match(/texlab (\d+\.\d+\.\d+)/);
            return match ? match[1] : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get the latest texlab version from GitHub
     */
    private async getLatestVersion(): Promise<string | null> {
        return new Promise((resolve) => {
            https.get('https://api.github.com/repos/latex-lsp/texlab/releases/latest', {
                headers: { 'User-Agent': 'VTeX-VSCode-Extension' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const version = json.tag_name?.replace(/^v/, '');
                        resolve(version);
                    } catch {
                        resolve(null);
                    }
                });
            }).on('error', () => resolve(null));
        });
    }

    /**
     * Download and install texlab
     */
    public async installOrUpdate(): Promise<boolean> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Installing texlab LSP server",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "Checking latest version..." });
                
                const latestVersion = await this.getLatestVersion();
                if (!latestVersion) {
                    throw new Error('Could not determine latest texlab version');
                }

                progress.report({ message: `Downloading texlab v${latestVersion}...` });

                // Create bin directory if it doesn't exist
                if (!fs.existsSync(this.binPath)) {
                    fs.mkdirSync(this.binPath, { recursive: true });
                }

                // Determine platform-specific download URL
                const platform = process.platform as string;
                let downloadUrl: string;
                let extractedName = 'texlab';

                if (platform === 'linux') {
                    downloadUrl = `https://github.com/latex-lsp/texlab/releases/latest/download/texlab-x86_64-linux.tar.gz`;
                } else if (platform === 'darwin') {
                    downloadUrl = `https://github.com/latex-lsp/texlab/releases/latest/download/texlab-x86_64-macos.tar.gz`;
                } else if (platform === 'win32') {
                    downloadUrl = `https://github.com/latex-lsp/texlab/releases/latest/download/texlab-x86_64-windows.zip`;
                    extractedName = 'texlab.exe';
                } else {
                    throw new Error(`Unsupported platform: ${platform}`);
                }

                // Download to temp location
                const tempFile = path.join(this.binPath, 'texlab_download');
                await this.downloadFile(downloadUrl, tempFile);

                progress.report({ message: "Extracting..." });

                // Extract based on platform
                if (platform === 'win32') {
                    // For Windows, we'd need a zip extraction (skip for now, require manual install)
                    throw new Error('Automatic installation on Windows not yet supported. Please install texlab manually.');
                }
                
                // Unix-like systems: extract tar.gz
                await this.extractTarGz(tempFile, this.binPath);

                // Make executable (Unix-like only)
                fs.chmodSync(this.texlabPath, 0o755);

                // Clean up temp file
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }

                progress.report({ message: "Installation complete!" });
            });

            return true;

        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to install texlab: ${error instanceof Error ? error.message : String(error)}`
            );
            return false;
        }
    }

    /**
     * Download a file from a URL
     */
    private downloadFile(url: string, destination: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destination);
            
            https.get(url, {
                headers: { 'User-Agent': 'VTeX-VSCode-Extension' }
            }, (response) => {
                // Follow redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        file.close();
                        fs.unlinkSync(destination);
                        return this.downloadFile(redirectUrl, destination).then(resolve).catch(reject);
                    }
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed with status ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

            }).on('error', (err) => {
                fs.unlinkSync(destination);
                reject(err);
            });

            file.on('error', (err) => {
                fs.unlinkSync(destination);
                reject(err);
            });
        });
    }

    /**
     * Extract a tar.gz file
     */
    private extractTarGz(tarPath: string, destDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            child_process.exec(
                `tar -xzf "${tarPath}" -C "${destDir}"`,
                (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Prompt user to install texlab if not already installed
     */
    public async promptInstallIfNeeded(): Promise<void> {
        if (this.isInstalled()) {
            return;
        }

        const config = vscode.workspace.getConfiguration('vtex');
        const lspEnabled = config.get<boolean>('lsp.enabled', true);
        
        if (!lspEnabled) {
            return; // User has disabled LSP
        }

        const choice = await vscode.window.showInformationMessage(
            'VTeX: texlab LSP server is not installed. Would you like to download it for enhanced editing features (auto-completion, diagnostics, etc.)?',
            'Install',
            'Not Now',
            'Don\'t Ask Again'
        );

        if (choice === 'Install') {
            const success = await this.installOrUpdate();
            if (success) {
                vscode.window.showInformationMessage(
                    'texlab installed successfully! Please reload the window to activate LSP features.',
                    'Reload Window'
                ).then(action => {
                    if (action === 'Reload Window') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            }
        } else if (choice === 'Don\'t Ask Again') {
            await config.update('lsp.enabled', false, vscode.ConfigurationTarget.Global);
        }
    }
}
