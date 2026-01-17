# VTeX PDF Viewer UI Guide

## Overview

VTeX includes a modern, professional PDF viewer built with PDF.js that provides a clean interface for viewing compiled LaTeX documents.

## User Interface

### Toolbar Layout

The PDF viewer features a dark-themed toolbar with the following controls (from left to right):

```
[←] [Page: 1 / 2] [→] | [−] [150%] [+] | [Fit Width] [Fit Page] ... [⟳]
```

### Controls

#### Navigation
- **Previous Page** (`←` button) - Navigate to previous page
  - Keyboard: `←` or `Page Up`
  - Disabled on first page

- **Next Page** (`→` button) - Navigate to next page
  - Keyboard: `→` or `Page Down`
  - Disabled on last page

- **Page Number Input** - Jump to specific page
  - Type page number and press `Enter`
  - Shows current page and total pages (e.g., "1 / 2")

#### Zoom Controls
- **Zoom Out** (`−` button) - Decrease zoom level
  - Keyboard: `-` key
  - Minimum zoom: 25%

- **Zoom In** (`+` button) - Increase zoom level
  - Keyboard: `+` or `=` key
  - Maximum zoom: 500%

- **Zoom Level Display** - Shows current zoom percentage (e.g., "150%")
  - Updates automatically when zooming

- **Mouse Wheel Zoom** - Hold `Ctrl` (or `Cmd` on Mac) and scroll to zoom
  - Scroll up: zoom in
  - Scroll down: zoom out

- **Reset Zoom** - Press `0` key to reset to 100%

#### Fit Modes
- **Fit Width** - Scale PDF to fit container width
  - Maintains aspect ratio
  - Ideal for reading documents

- **Fit Page** - Scale PDF to fit entire page in viewport
  - Shows whole page without scrolling
  - Ideal for overview

#### Utilities
- **Refresh** (`⟳` button) - Reload PDF
  - Useful after rebuilding document
  - Maintains current page and zoom

### SVG Icons

All toolbar icons are inline SVG for crisp rendering at any scale:

- **Previous/Next**: Material Design chevron icons
- **Zoom In/Out**: Plus/minus icons
- **Fit Width**: Rectangle icon
- **Fit Page**: Document icon
- **Refresh**: Circular arrow icon

### Color Scheme

The viewer uses a professional dark theme matching VS Code:

- **Toolbar Background**: `#34495e` (dark slate)
- **Canvas Background**: `#2b3e50` (darker slate)
- **Button Borders**: `#4a5f7f` (muted blue)
- **Button Hover**: `#4a5f7f` → `#5a7ea0` (lighter blue)
- **Text**: `#ecf0f1` (light gray)
- **PDF Background**: White with shadow

## Features

### SyncTeX Integration

**Forward Search** (Editor → PDF):
- Press `Ctrl+Alt+J` in LaTeX editor
- PDF viewer jumps to corresponding location
- Works with the VTeX PDF viewer

**Inverse Search** (PDF → Editor):
- Hold `Ctrl` (or `Cmd`) and click on PDF
- Editor jumps to corresponding LaTeX source
- Shows line and file

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Previous page | `←` or `Page Up` |
| Next page | `→` or `Page Down` |
| Zoom in | `+` or `=` |
| Zoom out | `-` |
| Reset zoom (100%) | `0` |
| Ctrl + scroll | Zoom with mouse wheel |
| `Enter` in page input | Jump to page |

### Smart Refresh

The PDF viewer automatically refreshes when:
- Document is rebuilt successfully
- "Refresh" button is clicked
- Maintains your current page and zoom level

### Responsive Design

- Toolbar adapts to available space
- Icons scale properly on high-DPI displays
- Fit modes automatically adjust to window size
- Smooth transitions and hover effects

## Technical Details

### Implementation
- **Framework**: PDF.js 3.11.174
- **Rendering**: HTML5 Canvas
- **Data**: Base64-encoded PDF (WSL compatible)
- **UI**: Vanilla JavaScript with modern CSS

### Browser Compatibility
Works in VS Code's embedded Chromium browser, supporting:
- Modern CSS3 (Flexbox, Grid)
- SVG inline graphics
- Canvas API
- ES6+ JavaScript

### Performance
- Single-page rendering (renders only current page)
- Efficient canvas updates
- Minimal reflows with proper CSS
- Lazy loading with visual feedback

## Customization

### Changing Colors

Edit the CSS in `src/preview/pdfPreview.ts` → `getWebviewContent()`:

```css
#toolbar {
    background-color: #34495e; /* Toolbar background */
    color: #ecf0f1; /* Text color */
}

.toolbar-button {
    border: 1px solid #4a5f7f; /* Button border */
}

.toolbar-button:hover {
    background-color: #4a5f7f; /* Hover background */
}
```

### Adding Custom Buttons

1. Add button HTML in the toolbar div:
```html
<button class="toolbar-button" id="myButton" title="My Feature">
    <svg viewBox="0 0 24 24"><path d="..."/></svg>
    Label
</button>
```

2. Add event listener in JavaScript:
```javascript
document.getElementById('myButton').addEventListener('click', () => {
    // Your code here
});
```

### Custom Icons

Use Material Design SVG paths or create your own:
```html
<svg viewBox="0 0 24 24">
    <path d="M12 2L2 7v10l10 5 10-5V7z"/>
</svg>
```

## Comparison with Native Viewer

| Feature | VTeX Viewer (PDF.js) | Native Viewer |
|---------|---------------------|---------------|
| Custom controls | ✅ Full control | ❌ Limited |
| SyncTeX | ✅ Both directions | ❌ Not supported |
| Keyboard shortcuts | ✅ Extensive | ⚠️ Basic |
| Fit modes | ✅ Width & Page | ⚠️ Browser-dependent |
| Zoom control | ✅ Fine-grained | ⚠️ Basic |
| File size | ⚠️ PDF.js library | ✅ No extra library |
| Styling | ✅ Full customization | ❌ Browser default |

## Future Enhancements

Potential improvements for future versions:
- [ ] Thumbnail sidebar for quick navigation
- [ ] Search within PDF
- [ ] Text selection and copy
- [ ] Annotations and highlights
- [ ] Print button
- [ ] Download button
- [ ] Full-screen mode
- [ ] Dark mode for PDF content (invert colors)
- [ ] Multi-page continuous scroll view
- [ ] Minimap/overview panel

## Troubleshooting

### PDF not loading
- Check VS Code Output panel (VTeX channel)
- Verify PDF was built successfully
- Try clicking "Refresh" button

### Blurry text at certain zoom levels
- This is normal for raster rendering
- PDF.js renders at the exact zoom level
- Try "Fit Width" for optimal reading

### Slow performance
- Large PDFs (>100 pages) may render slowly
- Consider splitting document into chapters
- Single-page rendering is intentional for performance

### SyncTeX not working
- Ensure `-synctex=1` is in build options
- Rebuild document after adding flag
- Check that texlive-synctex is installed

## Resources

- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Material Design Icons](https://fonts.google.com/icons)
- [SyncTeX Documentation](https://www.tug.org/TUGboat/tb29-3/tb93laurens.pdf)
