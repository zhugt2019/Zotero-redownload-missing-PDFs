async function processAllLibrary_Zotero7_English() {
  // ========================================================================
  // Core Settings
  // ========================================================================
  
  // 1. Get the main window object (Standard way for Zotero 7)
  const win = Zotero.getMainWindow();
  
  // 2. Get the User's Library ID
  const libraryID = Zotero.Libraries.userLibraryID;

  // 3. UI: Initializing database read
  const loader = new Zotero.ProgressWindow();
  loader.changeHeadline("Reading database...");
  loader.show();
  
  // Get all "Top Level" items (onlyTopLevel=true) to exclude notes and attachments automatically.
  // Note: getAll is asynchronous in Zotero 7; await is required.
  let items = await Zotero.Items.getAll(libraryID, true, false);
  
  loader.close();

  if (!items || items.length === 0) {
    win.alert("No items found in the library.");
    return;
  }
  
  const total = items.length;

  // ========================================================================
  // Confirmation Dialog
  // ========================================================================
  const msg = `Zotero 7 Library Maintenance\n\n` +
              `Detected ${total} item(s).\n` +
              `The script will:\n` +
              `1. [Clean] Remove PDF entries pointing to missing files (dead links).\n` +
              `2. [Fetch] Attempt to download PDFs if no valid file exists.\n\n` +
              `Do you want to proceed?`;
              
  if (!win.confirm(msg)) {
    return "Operation cancelled by user.";
  }

  // ========================================================================
  // Initialize Progress Window
  // ========================================================================
  const pw = new Zotero.ProgressWindow();
  pw.changeHeadline("Library Maintenance (Zotero 7)");
  const progressBar = new pw.ItemProgress(
    "chrome://zotero/skin/tick.png",
    `Initializing...`
  );
  pw.show();

  let stats = {
    cleaned: 0,    // Number of dead links removed
    downloaded: 0, // Number of successful downloads
    skipped: 0,    // Items already having valid PDFs
    failed: 0      // Download attempts that yielded no results
  };

  // Anti-bot delay function
  const randomDelay = () => new Promise(resolve => 
    setTimeout(resolve, 1500 + Math.random() * 2000)
  );

  // ========================================================================
  // Processing Loop
  // ========================================================================
  for (let i = 0; i < total; i++) {
    const item = items[i];

    // Update Progress UI
    const percent = Math.round(((i + 1) / total) * 100);
    progressBar.setText(`[${i + 1}/${total}] ${item.getDisplayTitle()}`);
    progressBar.setProgress(percent);

    try {
      // Ensure it is a regular item (Journal Article, Book, etc.)
      if (!item.isRegularItem()) continue;

      // -------------------------------------------------------------
      // Step A: Check Attachment Validity & Identify Dead Links
      // -------------------------------------------------------------
      const attachmentIDs = item.getAttachments();
      let hasValidPDF = false;
      let brokenIDs = [];

      for (let id of attachmentIDs) {
        // Zotero 7 recommends getAsync for better performance
        let att = await Zotero.Items.getAsync(id); 
        if (!att) continue;

        if (att.isPDFAttachment()) {
          if (await att.fileExists()) {
            hasValidPDF = true;
          } else {
            // File missing on disk, mark ID for removal
            brokenIDs.push(id);
          }
        }
      }

      // -------------------------------------------------------------
      // Step B: Execute Cleanup
      // -------------------------------------------------------------
      if (brokenIDs.length > 0) {
        // Zotero.Items.erase accepts an array of IDs
        await Zotero.Items.erase(brokenIDs);
        stats.cleaned += brokenIDs.length;
        Zotero.debug(`[Cleanup] Removed dead attachment IDs: ${brokenIDs.join(", ")}`);
      }

      // -------------------------------------------------------------
      // Step C: Decision Logic
      // -------------------------------------------------------------
      // Skip download if a valid file was found during cleanup check
      if (hasValidPDF) {
        stats.skipped++;
        continue;
      }

      // -------------------------------------------------------------
      // Step D: Fetch New PDF
      // -------------------------------------------------------------
      await randomDelay(); // Delay to prevent IP blocking

      let newAtt = null;
      try {
        newAtt = await Zotero.Attachments.addAvailablePDF(item);
      } catch (err) {
        // Catch download errors (e.g., 404, 403, or no PDF found)
      }

      if (newAtt) {
        stats.downloaded++;
      } else {
        stats.failed++;
      }

    } catch (e) {
      Zotero.debug(`Exception while processing item: ${e}`);
    }
  }

  // ========================================================================
  // Final Report
  // ========================================================================
  progressBar.setText("Completed");
  progressBar.setProgress(100);
  pw.addDescription(`🗑️ Dead links removed: ${stats.cleaned}`);
  pw.addDescription(`✅ Successfully downloaded: ${stats.downloaded}`);
  pw.addDescription(`⏭️ Skipped (already has PDF): ${stats.skipped}`);
  pw.addDescription(`❌ PDF not found/failed: ${stats.failed}`);

  // Auto-close progress window after 10 seconds
  pw.startCloseTimer(10000);

  return stats;
}

return await processAllLibrary_Zotero7_English();
