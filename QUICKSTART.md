# Quick Start Guide

Get started with VTeX in under 5 minutes!

## Prerequisites

Choose ONE of the following:

### Option A: Local TeX Live (Recommended for speed)
- **Linux**: `sudo apt install texlive-full` (Ubuntu/Debian)
- **Mac**: Download [MacTeX](https://www.tug.org/mactex/)
- **Windows**: Download [TeX Live](https://www.tug.org/texlive/) or [MiKTeX](https://miktex.org/)

### Option B: Docker (Recommended for clean setup)
- **All Platforms**: [Install Docker](https://docs.docker.com/get-docker/)
- No LaTeX installation needed!

## Installation

### For Development (Current)
1. Clone this repository
2. Open in VS Code
3. Run `npm install`
4. Press `F5` to launch Extension Development Host

### From Marketplace (Coming Soon)
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "VTeX"
4. Click Install

## First LaTeX Document

### Step 1: Create a New File
Create a file named `hello.tex`:

```latex
\documentclass{article}
\begin{document}

Hello, VTeX!

\end{document}
```

### Step 2: Build the Document
- **Method 1**: Save the file (Ctrl+S / Cmd+S) - auto-builds by default
- **Method 2**: Click the build icon in the editor toolbar
- **Method 3**: Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P) → "VTeX: Build LaTeX Document"

### Step 3: View the PDF
- Click the PDF icon in the editor toolbar, OR
- Command Palette → "VTeX: View PDF"

That's it! 🎉

## Configuration

Open Settings (Ctrl+, / Cmd+,) and search for "VTeX":

### Essential Settings

**Choose Build Method:**
```json
"vtex.buildMethod": "auto"  // auto, local, or docker
```

**Choose LaTeX Engine:**
```json
"vtex.buildEngine": "latexmk"  // latexmk, pdflatex, xelatex, or lualatex
```

**Auto-build on Save:**
```json
"vtex.buildOnSave": true  // true or false
```

### Docker Settings (if using Docker)

**Docker Image:**
```json
"vtex.docker.image": "texlive/texlive:latest"
```

**Enable Package Caching:**
```json
"vtex.docker.enableCache": true  // Speeds up subsequent builds
```

## Troubleshooting

### Build Fails
1. Check the Output channel: View → Output → Select "VTeX"
2. Verify your setup:
   - Command Palette → "VTeX: Detect Environment"
3. Check for LaTeX errors in your document

### "No LaTeX environment detected"
- **Local**: Run `pdflatex --version` in terminal to verify installation
- **Docker**: Run `docker --version` to verify Docker is installed
- Install one of the prerequisites above

### Docker Permission Error (Linux)
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### Build is Slow
- **Docker Users**: Make sure caching is enabled:
  ```json
  "vtex.docker.enableCache": true
  ```
- **Local Users**: Consider installing `latexmk` for incremental builds

## Tips & Tricks

### Keyboard Shortcuts
- `Ctrl+S` / `Cmd+S`: Save and build (if auto-build enabled)
- Use Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) for all VTeX commands

### Recommended Workflow
1. Open your LaTeX project folder in VS Code
2. VTeX will auto-detect your environment
3. Edit your `.tex` files
4. Save to auto-build
5. View PDF in side-by-side pane

### Multi-file Projects
For projects with multiple `.tex` files:
1. Open the main file
2. Build from the main file
3. (Advanced multi-file support coming in future updates)

### Cleaning Up
Remove auxiliary files (`.aux`, `.log`, etc.):
- Command Palette → "VTeX: Clean Auxiliary Files"

## Example Documents

Check the `examples/` folder for sample documents:
- `minimal.tex`: Bare minimum LaTeX document
- `sample.tex`: Full-featured example with math, lists, formatting

## Need Help?

- **Documentation**: See [README.md](README.md) for full documentation
- **Development**: See [DEVELOPMENT.md](DEVELOPMENT.md) for contributing
- **Roadmap**: See [ROADMAP.md](ROADMAP.md) for upcoming features
- **Issues**: Report bugs on GitHub (coming soon)

## What's Next?

After getting comfortable with basic building:

1. **Explore Settings**: Customize build options to your preference
2. **Try Different Engines**: Test `xelatex` for Unicode support
3. **Docker Setup**: Try containerized builds for reproducibility
4. **Stay Updated**: Check [CHANGELOG.md](CHANGELOG.md) for new features

---

Happy LaTeXing! 📝✨
