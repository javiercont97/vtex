# Build System Fix - PDF Generation with Warnings

## Problem Summary

When building a LaTeX document with warnings or non-fatal errors (like undefined references, citations, or TikZ errors), latexmk would:
1. Generate a valid PDF file
2. Return a non-zero exit code due to warnings
3. VTeX would see the non-zero exit code and declare the build "failed"
4. PDF preview would not refresh, even though a valid PDF existed

**Real-world example:** Your TikZ document with `Unknown arrow tip kind 'latex''` error still generated a 118KB PDF, but VTeX reported it as failed and didn't show the PDF.

---

## Solution Implemented

### 1. Smart PDF Detection
Both `LocalBuilder` and `DockerBuilder` now:
- Check if a PDF file exists even when exit code is non-zero
- Distinguish between fatal errors and non-fatal warnings
- Treat build as "partial success" if PDF exists

### 2. Non-Fatal Error Recognition
Added pattern matching for common non-fatal errors:
- Undefined references (`\ref`)
- Undefined citations (`\cite`)
- Multiply defined labels
- "Rerun to get cross-references right" messages
- "Label(s) may have changed" warnings

### 3. Better User Feedback
- **Full success**: No errors → PDF refreshes, no notification (clean workflow)
- **Partial success**: PDF generated but with warnings → Shows warning message + PDF refreshes
- **Complete failure**: No PDF generated → Shows error message, suggests package installation

### 4. New Command: "Clean Build"
Added `VTeX: Clean and Build` command that:
- Deletes all auxiliary files (`.aux`, `.fdb_latexmk`, `.log`, etc.)
- Clears latexmk's cache
- Performs a fresh build
- Useful for resolving cached error states

---

## Technical Changes

### Modified Files

#### `src/buildSystem/localBuilder.ts`
```typescript
// Now checks for PDF even on error
catch (error: any) {
    // Check if PDF was generated despite non-zero exit code
    const pdfExists = await this.fileExists(pdfPath);
    
    if (pdfExists) {
        // Filter out non-fatal errors
        const fatalErrors = errors.filter(e => 
            e.severity === 'error' && !this.isNonFatalError(e.message)
        );
        
        return {
            success: fatalErrors.length === 0,
            output,
            errors,
            pdfPath  // PDF path included even on "failure"
        };
    }
}
```

Added `isNonFatalError()` method to identify warnings that shouldn't block PDF display.

#### `src/buildSystem/dockerBuilder.ts`
Same changes as LocalBuilder for consistency across both build methods.

#### `src/extension.ts`
```typescript
async function buildDocument(document: vscode.TextDocument): Promise<void> {
    const result = await buildSystem.build(docToBuild);
    
    if (result.success) {
        // Full success
        await pdfPreview.showPDF(rootFile);
    } else if (result.pdfPath) {
        // Partial success - PDF exists but has errors
        await pdfPreview.showPDF(rootFile);  // Still show PDF!
        vscode.window.showWarningMessage(
            `Build completed with errors. PDF may be incomplete.`
        );
    } else {
        // Complete failure
        vscode.window.showErrorMessage('LaTeX build failed.');
    }
}
```

Added `vtex.cleanBuild` command for fresh builds.

#### `package.json`
Added new command:
```json
{
  "command": "vtex.cleanBuild",
  "title": "VTeX: Clean and Build",
  "icon": "$(refresh)"
}
```

---

## Usage Examples

### Scenario 1: Undefined References (Your Case)
**Before:**
- Build returns error → VTeX shows "Build failed" → PDF doesn't refresh

**After:**
- Build returns error → VTeX detects PDF exists → Shows "Build completed with 2 error(s). PDF may be incomplete" → **PDF refreshes automatically**

### Scenario 2: Missing Package
**Behavior (unchanged):**
- Build fails, no PDF → Shows package installation prompt

### Scenario 3: Perfect Build
**Behavior (unchanged):**
- Build succeeds → PDF refreshes silently, no popup

### Scenario 4: Cached Error State
**New workflow:**
1. Run `VTeX: Clean and Build` to clear latexmk cache
2. Fresh build without historical errors
3. Clean slate for troubleshooting

---

## Non-Fatal Error Patterns Recognized

The system now recognizes these as **non-fatal** (won't block PDF display):
- `undefined references`
- `undefined citations`
- `label.*multiply defined`
- `reference.*undefined`
- `citation.*undefined`
- `there were undefined`
- `rerun to get`
- `label(s) may have changed`

---

## Benefits

### For Users
1. **See your work immediately**: Even with errors, if a PDF is generated, you can view it
2. **Better feedback**: Clear distinction between "no PDF" vs "PDF with errors"
3. **Faster workflow**: No need to hunt for the PDF manually when VTeX reports failure
4. **Clean builds**: New command to clear cached errors

### For Developers (You!)
1. **Iterate on TikZ graphics**: See partial results even when syntax errors exist
2. **Debug undefined references**: View PDF while fixing citation issues
3. **Incremental development**: Don't lose preview during multi-pass compilation

---

## Testing Performed

✅ Tested with your exact scenario:
- TikZ error: `Unknown arrow tip kind 'latex''`
- Undefined references
- PDF generated (118KB)
- **Result**: PDF now refreshes, warning shown

✅ Tested missing package scenario:
- Package error → No PDF generated
- **Result**: Shows package installation prompt (existing behavior preserved)

✅ Tested clean build:
- Undefined reference → Build fails
- Run "Clean and Build"
- **Result**: Fresh build, cache cleared

✅ Tested perfect build:
- No errors
- **Result**: Silent success, PDF refreshes (no change to existing behavior)

---

## Migration Notes

**Backward Compatible**: All existing functionality preserved. This is a **pure enhancement** that makes the build system smarter without breaking any workflows.

**Configuration**: No new settings required. Works automatically.

**Commands**: New `VTeX: Clean and Build` command available but optional.

---

## Future Enhancements (Optional)

Possible improvements for later:
1. Add setting to control "partial success" behavior (some users may want strict mode)
2. Show inline error annotations in editor for non-fatal errors
3. Add "Quick Fix" code actions for common errors
4. Build statistics (success rate, avg build time)

---

## Debug Information

For troubleshooting, logs now show:
```
[WARN] Build command returned non-zero exit code
[INFO] PDF was generated despite non-zero exit code
[ERROR] 2 error(s) found
```

This helps distinguish between:
- Fatal errors (no PDF)
- Non-fatal errors (PDF with warnings)
- Cached errors (latexmk state issue)

---

## Summary

Your TikZ document will now:
1. ✅ Generate PDF (as it did before)
2. ✅ Show the PDF in preview (NEW!)
3. ✅ Display warning about errors (informative)
4. ✅ Let you iterate quickly (productivity boost)

The build system is now **smarter about success** - it checks what actually matters (did a PDF get created?) rather than blindly trusting exit codes.

**Result**: You can now see your TikZ diagrams even when LaTeX reports warnings! 🎉
