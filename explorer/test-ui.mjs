import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8000";

async function test() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();
  const results = [];

  function log(ok, msg) {
    results.push({ ok, msg });
    console.log(`${ok ? "PASS" : "FAIL"}: ${msg}`);
  }

  try {
    // 1. Landing page loads
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 15000 });
    const title = await page.title();
    log(title.includes("Nomenclador"), `Title is "${title}"`);

    // 2. Capabilities band shows new labels
    const capSection = page.locator('[aria-label="Capacidades de inteligencia"]');
    await capSection.waitFor({ timeout: 5000 });
    const capText = await capSection.innerText();
    log(capText.includes("Proveniencia PROV-O"), "Capability: Proveniencia PROV-O");
    log(capText.includes("Lineage visual"), "Capability: Lineage visual");
    log(capText.includes("Instrumento indicativo"), "Capability: Instrumento indicativo");
    log(capText.includes("Interoperabilidad"), "Capability: Interoperabilidad");
    log(capText.includes("Razonamiento"), "Capability: Razonamiento");
    log(capText.includes("Temporal"), "Capability: Temporal");
    log(!capText.includes("Mapa de cercanía"), "Old 'Mapa de cercanía' removed");
    log(!capText.includes("Vecindario enfocado"), "Old 'Vecindario enfocado' removed");
    log(!capText.includes("Comunidades agrupadas"), "Old 'Comunidades agrupadas' removed");
    log(!capText.includes("Trazar caminos"), "Old 'Trazar caminos' removed");
    log(!capText.includes("Búsqueda index"), "Old 'Búsqueda index' removed");

    // 3. Gobernanza workspace has Instrumento tab
    await page.getByRole("button", { name: "Gobernanza", exact: true }).click();
    await page.waitForTimeout(1000);
    const instrumentoTab = page.getByRole("button", { name: "Instrumento", exact: true });
    await instrumentoTab.waitFor({ timeout: 5000 });
    log(true, "Gobernanza: Instrumento tab visible");

    // 4. Instrumento tab works
    await instrumentoTab.click();
    await page.waitForTimeout(1000);
    const heading = await page.locator("h3").first().innerText();
    log(heading.includes("instrumento"), `Instrumento heading: "${heading}"`);

    // 5. Textarea and button present
    const textarea = page.locator("textarea").first();
    await textarea.waitFor({ timeout: 5000 });
    log(true, "Instrumento: textarea visible");
    const genBtn = page.getByRole("button", { name: "Generar instrumento" });
    log(await genBtn.isVisible(), "Instrumento: 'Generar instrumento' button visible");

    // 6. Analizar workspace
    await page.getByRole("button", { name: "Analizar", exact: true }).click();
    await page.waitForTimeout(1000);
    const sparqlTab = page.getByRole("button", { name: "Consultas SPARQL" });
    await sparqlTab.waitFor({ timeout: 5000 });
    log(true, "Analizar: SPARQL tab visible");
    await sparqlTab.click();
    await page.waitForTimeout(500);
    const runBtn = page.getByRole("button", { name: "Ejecutar consulta" });
    log(await runBtn.isVisible(), "SPARQL: 'Ejecutar consulta' button visible");

    // 7. Explorar workspace
    await page.getByRole("button", { name: "Explorar", exact: true }).click();
    await page.waitForTimeout(2000);
    log(true, "Explorar: workspace loads without crash");

  } catch (err) {
    log(false, `Exception: ${err.message}`);
  }

  await browser.close();

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
