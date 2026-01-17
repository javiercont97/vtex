import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

export interface Template {
    id: string;
    name: string;
    description: string;
    category: 'document' | 'presentation' | 'academic' | 'professional';
    files: TemplateFile[];
}

export interface TemplateFile {
    name: string;
    content: string;
    folder?: string;
}

export class TemplateManager {
    private templates: Map<string, Template>;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        this.templates = new Map();
        this.loadBuiltInTemplates();
    }

    /**
     * Load built-in templates
     */
    private loadBuiltInTemplates() {
        // Article template
        this.templates.set('article', {
            id: 'article',
            name: 'Article',
            description: 'Basic academic article with sections',
            category: 'document',
            files: [{
                name: 'main.tex',
                content: this.getArticleTemplate()
            }]
        });

        // Beamer presentation template
        this.templates.set('beamer', {
            id: 'beamer',
            name: 'Beamer Presentation',
            description: 'Presentation slides with Beamer',
            category: 'presentation',
            files: [{
                name: 'presentation.tex',
                content: this.getBeamerTemplate()
            }]
        });

        // Book template
        this.templates.set('book', {
            id: 'book',
            name: 'Book',
            description: 'Book with chapters',
            category: 'document',
            files: [
                {
                    name: 'main.tex',
                    content: this.getBookTemplate()
                },
                {
                    name: 'chapter1.tex',
                    content: this.getChapterTemplate(),
                    folder: 'chapters'
                }
            ]
        });

        // Thesis template
        this.templates.set('thesis', {
            id: 'thesis',
            name: 'Thesis',
            description: 'PhD/Master thesis template',
            category: 'academic',
            files: [
                {
                    name: 'main.tex',
                    content: this.getThesisTemplate()
                },
                {
                    name: 'abstract.tex',
                    content: this.getAbstractTemplate(),
                    folder: 'frontmatter'
                },
                {
                    name: 'chapter1.tex',
                    content: this.getChapterTemplate(),
                    folder: 'chapters'
                },
                {
                    name: 'references.bib',
                    content: this.getReferencesTemplate(),
                    folder: 'bibliography'
                }
            ]
        });

        // CV template
        this.templates.set('cv', {
            id: 'cv',
            name: 'Curriculum Vitae',
            description: 'Professional CV/Resume',
            category: 'professional',
            files: [{
                name: 'cv.tex',
                content: this.getCVTemplate()
            }]
        });

        // Letter template
        this.templates.set('letter', {
            id: 'letter',
            name: 'Letter',
            description: 'Formal letter',
            category: 'professional',
            files: [{
                name: 'letter.tex',
                content: this.getLetterTemplate()
            }]
        });

        this.logger.info(`Loaded ${this.templates.size} built-in templates`);
    }

    /**
     * Get all available templates
     */
    getTemplates(): Template[] {
        return Array.from(this.templates.values());
    }

    /**
     * Get templates by category
     */
    getTemplatesByCategory(category: string): Template[] {
        return this.getTemplates().filter(t => t.category === category);
    }

    /**
     * Get a specific template by ID
     */
    getTemplate(id: string): Template | undefined {
        return this.templates.get(id);
    }

    /**
     * Create a new project from template
     */
    async createFromTemplate(templateId: string, targetFolder: vscode.Uri): Promise<void> {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        this.logger.info(`Creating project from template: ${template.name}`);

        try {
            // Create all template files
            for (const file of template.files) {
                const filePath = file.folder
                    ? path.join(targetFolder.fsPath, file.folder, file.name)
                    : path.join(targetFolder.fsPath, file.name);

                // Create directory if needed
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                // Write file
                fs.writeFileSync(filePath, file.content, 'utf-8');
                this.logger.info(`Created file: ${filePath}`);
            }

            this.logger.info('Project created successfully');

            // Open main file
            const mainFile = template.files[0];
            const mainFilePath = path.join(targetFolder.fsPath, mainFile.name);
            const document = await vscode.workspace.openTextDocument(mainFilePath);
            await vscode.window.showTextDocument(document);

            vscode.window.showInformationMessage(
                `Project created from ${template.name} template`
            );
        } catch (error) {
            this.logger.error(`Failed to create project from template: ${error}`);
            throw error;
        }
    }

    // Template content methods
    private getArticleTemplate(): string {
        return `\\documentclass[11pt,a4paper]{article}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{graphicx}
\\usepackage{amsmath,amssymb}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

% Title information
\\title{Your Article Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This is the abstract of your article. Provide a brief summary of your work here.
\\end{abstract}

\\section{Introduction}
\\label{sec:introduction}

Your introduction goes here. You can reference sections like Section~\\ref{sec:methods}.

\\section{Methods}
\\label{sec:methods}

Describe your methodology here.

\\subsection{Data Collection}

Details about data collection.

\\section{Results}
\\label{sec:results}

Present your results here. You can include figures:

\\begin{figure}[ht]
    \\centering
    % \\includegraphics[width=0.8\\textwidth]{figure.pdf}
    \\caption{Caption for your figure}
    \\label{fig:example}
\\end{figure}

\\section{Discussion}
\\label{sec:discussion}

Discuss your findings.

\\section{Conclusion}
\\label{sec:conclusion}

Conclude your work.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;
    }

    private getBeamerTemplate(): string {
        return `\\documentclass[aspectratio=169]{beamer}

% Theme
\\usetheme{Madrid}
\\usecolortheme{default}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{graphicx}
\\usepackage{amsmath,amssymb}

% Title information
\\title{Your Presentation Title}
\\subtitle{Optional Subtitle}
\\author{Your Name}
\\institute{Your Institution}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}
\\frametitle{Outline}
\\tableofcontents
\\end{frame}

\\section{Introduction}

\\begin{frame}
\\frametitle{Introduction}
\\begin{itemize}
    \\item First point
    \\item Second point
    \\item Third point
\\end{itemize}
\\end{frame}

\\section{Main Content}

\\begin{frame}
\\frametitle{Main Slide}
\\begin{block}{Important Point}
This is an important point highlighted in a block.
\\end{block}

\\begin{alertblock}{Warning}
This is a warning or alert.
\\end{alertblock}

\\begin{exampleblock}{Example}
This is an example.
\\end{exampleblock}
\\end{frame}

\\begin{frame}
\\frametitle{Lists and Equations}
\\begin{columns}
\\column{0.5\\textwidth}
Some text in the left column:
\\begin{enumerate}
    \\item First item
    \\item Second item
\\end{enumerate}

\\column{0.5\\textwidth}
An equation:
\\begin{equation}
E = mc^2
\\end{equation}
\\end{columns}
\\end{frame}

\\section{Conclusion}

\\begin{frame}
\\frametitle{Conclusion}
\\begin{itemize}
    \\item Summary point 1
    \\item Summary point 2
    \\item Thank you!
\\end{itemize}
\\end{frame}

\\end{document}
`;
    }

    private getBookTemplate(): string {
        return `\\documentclass[11pt,a4paper,oneside]{book}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{graphicx}
\\usepackage{amsmath,amssymb}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

% Title information
\\title{Your Book Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\frontmatter
\\maketitle

\\tableofcontents

\\chapter{Preface}
This is the preface to your book.

\\mainmatter

\\include{chapters/chapter1}

% Add more chapters here
% \\include{chapters/chapter2}

\\appendix
\\chapter{Additional Material}
Appendix content goes here.

\\backmatter
\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;
    }

    private getThesisTemplate(): string {
        return `\\documentclass[12pt,a4paper,oneside]{book}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{graphicx}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}
\\usepackage{setspace}

% Line spacing
\\onehalfspacing

% Title information
\\title{Thesis Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\frontmatter

% Title page
\\begin{titlepage}
\\centering
\\vspace*{2cm}
{\\Huge\\bfseries Thesis Title\\par}
\\vspace{1.5cm}
{\\Large Your Name\\par}
\\vspace{1cm}
{\\large A thesis submitted for the degree of\\\\
Doctor of Philosophy\\par}
\\vspace{1cm}
{\\large Department Name\\\\
University Name\\par}
\\vspace{1cm}
{\\large \\today\\par}
\\end{titlepage}

% Abstract
\\include{frontmatter/abstract}

% Table of contents
\\tableofcontents
\\listoffigures
\\listoftables

\\mainmatter

% Chapters
\\include{chapters/chapter1}

% Add more chapters as needed

\\appendix
\\chapter{Supplementary Material}

\\backmatter
\\bibliographystyle{plain}
\\bibliography{bibliography/references}

\\end{document}
`;
    }

    private getAbstractTemplate(): string {
        return `\\chapter*{Abstract}
\\addcontentsline{toc}{chapter}{Abstract}

Write your thesis abstract here. This should be a concise summary of your entire thesis, typically 200-300 words.
`;
    }

    private getChapterTemplate(): string {
        return `\\chapter{Chapter Title}
\\label{ch:chapter1}

\\section{Introduction}

Begin your chapter here.

\\section{Main Content}

Your content goes here.

\\section{Summary}

Summarize the chapter.
`;
    }

    private getCVTemplate(): string {
        return `\\documentclass[11pt,a4paper]{article}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}

% Custom commands
\\newcommand{\\name}[1]{\\centerline{\\Huge\\bfseries #1}}
\\newcommand{\\contact}[1]{\\centerline{#1}}
\\newcommand{\\heading}[1]{\\vspace{0.3cm}\\noindent{\\Large\\bfseries #1}\\\\[0.1cm]\\hrule\\vspace{0.2cm}}

\\pagestyle{empty}

\\begin{document}

\\name{Your Name}
\\contact{Email: your.email@example.com $|$ Phone: +1234567890 $|$ Location: City, Country}
\\contact{LinkedIn: linkedin.com/in/yourprofile $|$ GitHub: github.com/yourusername}

\\heading{Education}

\\textbf{Degree Title} \\hfill Year \\\\
University Name, Location \\\\
Details about your degree, GPA, honors, etc.

\\heading{Experience}

\\textbf{Job Title} \\hfill Start Date -- End Date \\\\
Company Name, Location \\\\
\\begin{itemize}[leftmargin=*,noitemsep]
    \\item Achievement or responsibility 1
    \\item Achievement or responsibility 2
    \\item Achievement or responsibility 3
\\end{itemize}

\\heading{Skills}

\\textbf{Programming:} Python, C++, Java, JavaScript \\\\
\\textbf{Tools:} Git, Docker, LaTeX, Linux \\\\
\\textbf{Languages:} English (native), Spanish (fluent)

\\heading{Projects}

\\textbf{Project Title} \\hfill Year \\\\
Brief description of the project and your role.

\\heading{Publications}

\\begin{enumerate}[leftmargin=*]
    \\item Author1, \\textbf{Your Name}, Author3. \`\`Paper Title.'' Conference/Journal Name, Year.
\\end{enumerate}

\\heading{Awards \\& Honors}

\\textbf{Award Name} \\hfill Year \\\\
Brief description of the award.

\\end{document}
`;
    }

    private getLetterTemplate(): string {
        return `\\documentclass[11pt]{letter}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}

% Sender information
\\address{Your Name \\\\ Your Address \\\\ City, State ZIP}

% Date
\\date{\\today}

\\begin{document}

\\begin{letter}{Recipient Name \\\\ Recipient Title \\\\ Company/Organization \\\\ Address \\\\ City, State ZIP}

\\opening{Dear Recipient Name,}

This is the first paragraph of your letter. Introduce yourself and state the purpose of your letter.

This is the second paragraph. Provide more details and context.

This is the third paragraph. Include additional information or make your request.

\\closing{Sincerely,}

\\end{letter}

\\end{document}
`;
    }

    private getReferencesTemplate(): string {
        return `@article{example2023,
    author = {Author, First and Author, Second},
    title = {Example Article Title},
    journal = {Journal Name},
    year = {2023},
    volume = {10},
    pages = {123--145},
    doi = {10.1234/example}
}

@book{example_book2022,
    author = {Book Author},
    title = {Example Book Title},
    publisher = {Publisher Name},
    year = {2022},
    address = {City, Country}
}

@inproceedings{example_conf2023,
    author = {Conference Author},
    title = {Example Conference Paper},
    booktitle = {Proceedings of Example Conference},
    year = {2023},
    pages = {45--60}
}
`;
    }
}
