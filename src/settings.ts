// Renderer for the settings window.
//
// Loaded as a plain <script> (like notes.ts), so it must not use import/export
// or it stops being a global script. Everything is wrapped in an IIFE to keep
// its names out of the shared global scope.

(function () {
  const enabledEl = <HTMLInputElement>document.getElementById("obsidian-enabled");
  const fieldsEl = <HTMLDivElement>document.getElementById("obsidian-fields");
  const vaultEl = <HTMLInputElement>document.getElementById("obsidian-vault");
  const chooseEl = <HTMLButtonElement>document.getElementById("obsidian-choose");
  const subfolderEl = <HTMLInputElement>document.getElementById("obsidian-subfolder");
  const filenameEl = <HTMLInputElement>document.getElementById("obsidian-filename");
  const outboundEl = <HTMLSelectElement>document.getElementById("obsidian-delete-outbound");
  const inboundEl = <HTMLSelectElement>document.getElementById("obsidian-delete-inbound");
  const testEl = <HTMLButtonElement>document.getElementById("obsidian-test");
  const statusEl = <HTMLSpanElement>document.getElementById("obsidian-status");

  function setStatus(text: string, kind?: "ok" | "bad") {
    statusEl.textContent = text;
    statusEl.className = kind ? `status ${kind}` : "status";
  }

  async function save() {
    await window.integrations.setConfig({
      obsidian: {
        enabled: enabledEl.checked,
        vaultPath: vaultEl.value,
        subfolder: subfolderEl.value.trim() || "NoteDrop",
        filenameTemplate: filenameEl.value.trim() || "{date}-{slug}",
        deleteOutbound: <"ask" | "always" | "never">outboundEl.value,
        deleteInbound: inboundEl.value === "remove",
      },
    });
    fieldsEl.hidden = !enabledEl.checked;
  }

  async function test() {
    testEl.disabled = true;
    setStatus("Checking…");
    try {
      const result = await window.integrations.test("obsidian");
      setStatus(result.message, result.ok ? "ok" : "bad");
    } finally {
      testEl.disabled = false;
    }
  }

  enabledEl.addEventListener("change", async () => {
    await save();
    // Switching it on with a bad vault should say so immediately rather than
    // failing silently the next time a note is added.
    if (enabledEl.checked) await test();
    else setStatus("");
  });

  chooseEl.addEventListener("click", async () => {
    const picked = await window.integrations.pickVault();
    if (!picked) return;
    vaultEl.value = picked;
    await save();
    await test();
  });

  // Both change where files land, so re-test to show the resulting example.
  for (const el of [subfolderEl, filenameEl]) {
    el.addEventListener("change", async () => {
      el.value = el.value.trim();
      await save();
      if (enabledEl.checked) await test();
    });
  }

  // Deletion policy is independent of whether the vault is reachable, so
  // these just save — no need to re-test.
  outboundEl.addEventListener("change", save);
  inboundEl.addEventListener("change", save);

  testEl.addEventListener("click", test);

  window.integrations.getConfig().then((config) => {
    enabledEl.checked = config.obsidian.enabled;
    vaultEl.value = config.obsidian.vaultPath;
    subfolderEl.value = config.obsidian.subfolder;
    filenameEl.value = config.obsidian.filenameTemplate;
    outboundEl.value = config.obsidian.deleteOutbound;
    inboundEl.value = config.obsidian.deleteInbound ? "remove" : "keep";
    fieldsEl.hidden = !config.obsidian.enabled;
  });
})();
