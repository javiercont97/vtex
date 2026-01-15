# Example custom Docker image for VTeX
# This is optional - VTeX works with the default texlive/texlive:latest

FROM texlive/texlive:latest

# Update tlmgr
RUN tlmgr update --self

# Install additional packages if needed
# RUN tlmgr install <package-name>

# Set working directory
WORKDIR /workspace

# Default command
CMD ["latexmk", "--help"]
