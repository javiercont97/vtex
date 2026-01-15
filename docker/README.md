# VTeX Docker Configuration

This directory contains Docker configurations for containerized LaTeX builds.

## Default Image

VTeX uses `texlive/texlive:latest` by default, which provides a full TeXLive installation.

## Custom Docker Image (Optional)

If you want to create a custom Docker image with specific packages:

```dockerfile
FROM texlive/texlive:latest

# Install additional packages
RUN tlmgr update --self && \
    tlmgr install <your-packages>

# Or install specific scheme
# RUN tlmgr install scheme-full
```

Build and use:
```bash
docker build -t my-vtex-latex .
```

Then configure in VS Code settings:
```json
"vtex.docker.image": "my-vtex-latex"
```

## Volume Caching

VTeX automatically creates a named Docker volume `vtex-texlive-cache` to cache installed packages between builds. This significantly speeds up subsequent builds.

To manage the cache:
```bash
# View cache volume
docker volume inspect vtex-texlive-cache

# Remove cache (will recreate on next build)
docker volume rm vtex-texlive-cache

# View cache size
docker system df -v | grep vtex
```

## Troubleshooting

### Permission Issues
If you encounter permission issues with Docker builds:
```bash
# On Linux, ensure your user is in the docker group
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

### Image Pull Issues
```bash
# Manually pull the image
docker pull texlive/texlive:latest
```

### Build Performance
For faster builds:
1. Enable volume caching: `"vtex.docker.enableCache": true`
2. Use a smaller base image if you don't need all packages
3. Consider switching to local build if you frequently compile
