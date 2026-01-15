import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

export class EnvironmentDetector {
    constructor(private logger: Logger) {}

    async hasLocalTexLive(): Promise<boolean> {
        try {
            await execAsync('pdflatex --version');
            return true;
        } catch {
            return false;
        }
    }

    async hasDocker(): Promise<boolean> {
        try {
            await execAsync('docker --version');
            return true;
        } catch {
            return false;
        }
    }

    async getTexLiveVersion(): Promise<string> {
        try {
            const { stdout } = await execAsync('pdflatex --version');
            const match = stdout.match(/TeX Live (\d+)/);
            return match ? match[1] : 'Unknown';
        } catch {
            return 'Unknown';
        }
    }

    async getDockerVersion(): Promise<string> {
        try {
            const { stdout } = await execAsync('docker --version');
            const match = stdout.match(/Docker version ([\d.]+)/);
            return match ? match[1] : 'Unknown';
        } catch {
            return 'Unknown';
        }
    }

    async hasLatexmk(): Promise<boolean> {
        try {
            await execAsync('latexmk --version');
            return true;
        } catch {
            return false;
        }
    }
}
