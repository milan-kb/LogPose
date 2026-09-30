import { expect, test } from "@playwright/test";

test("real local case: scientific values, depth/time, selection, metadata and camera", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [], external: string[] = [], failed: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("requestfailed", r => failed.push(r.url()));
  // Upstream services are deliberately unavailable for the entire browser session.
  await page.route("**/*", route => {
    if (!["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  const marker = page.getByRole("button", { name: "Select profile 2902766", exact: true });
  await expect(marker).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Observation inspector" })).toHaveCount(0);
  await expect(page.locator(".demo-info")).toContainText("Copernicus Marine GLORYS12V1 Reanalysis · Real Argo");
  await expect(page.getByTestId("depth-value")).toHaveText("250");
  await expect(page.locator(".timeline .control-heading")).toContainText("15 Sept 2023 Daily mean · UTC");
  const canvas = page.locator(".ocean-canvas canvas");
  const initial = await canvas.screenshot();
  await page.getByRole("slider", { name: "Depth in metres" }).fill("600");
  await expect(page.locator(".depth-slice-tag")).toContainText("600 m");
  expect((await canvas.screenshot()).equals(initial)).toBe(false);
  await marker.hover();
  await expect(marker.getByRole("tooltip")).toContainText("21:32:52 UTC");
  await expect(marker.getByRole("tooltip")).toContainText("cycle 135");
  await marker.click();
  await expect(page.locator(".inspector-heading h2")).toHaveText("Observation 2902766");
  await expect(page.getByRole("img", { name: /profiles for 2902766, cycle 135/ })).toBeVisible();
  await expect(marker).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("slider", { name: "Depth in metres" }).fill("225");
  await expect(page.getByTestId("model-value")).toHaveText("12.611 °C");
  await expect(page.getByTestId("observed-value")).toHaveText("12.485 °C");
  await expect(page.getByTestId("point-difference")).toHaveText("+0.125 °C");
  await expect(page.locator(".selected-depth-label")).toHaveText("225");
  await page.getByText("Comparison details", { exact: true }).click();
  await expect(page.locator(".match-details")).toContainText("15 Sept 2023 21:32:52 UTC");
  await expect(page.locator(".match-details")).toContainText("15 Sept 2023 12:00:00 UTC");
  await expect(page.locator(".match-details")).toContainText("9.55 h after mean centre");
  await expect(page.locator(".match-details")).toContainText("independence is not established");
  const chart = page.locator(".profile-chart svg");
  const cb = (await chart.boundingBox())!;
  await page.mouse.click(cb.x + cb.width * .6, cb.y + cb.height * .6);
  const chartDepth = await page.locator(".selected-depth-label").textContent();
  await expect(page.getByTestId("depth-value")).toHaveText(chartDepth!);
  await expect(page.locator(".comparison-depth")).toContainText(`${chartDepth} m`);
  await page.getByRole("slider", { name: "Depth in metres" }).fill("1");
  await expect(page.getByTestId("observed-value")).toHaveText("28.922 °C");
  await expect(page.getByTestId("point-difference")).toHaveText("−0.023 °C");
  await page.getByLabel("Observation profiles", { exact: true }).uncheck();
  await expect(marker).toHaveCount(0);
  await page.getByLabel("Observation profiles", { exact: true }).check();
  await expect(marker).toBeVisible();
  await page.getByRole("slider", { name: "Depth in metres" }).fill("250");
  const firstDay = await canvas.screenshot();
  await page.getByRole("slider", { name: "Ocean time" }).fill("1");
  await expect(page.getByTestId("ocean-scene")).toHaveAttribute("data-time", "1");
  await expect(marker).toHaveCount(0);
  await expect(page.locator(".inspector")).toHaveCount(0);
  await expect(page.locator(".scene-heading")).toContainText("No observation in this case on this day");
  expect((await canvas.screenshot()).equals(firstDay)).toBe(false);
  await page.getByRole("slider", { name: "Ocean time" }).fill("0");
  await expect(marker).toBeVisible();
  await expect(page.locator(".inspector-heading h2")).toHaveText("Observation 2902766");
  await page.getByRole("button", { name: "Close profile", exact: true }).click();
  await page.getByRole("button", { name: "Play time playback" }).click();
  await expect(page.getByTestId("ocean-scene")).not.toHaveAttribute("data-time", "0", { timeout: 5000 });
  await page.getByRole("button", { name: "Pause time playback" }).click();
  await page.getByRole("slider", { name: "Ocean time" }).fill("0");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.waitForTimeout(300); // Let the inspector/tooltip CSS transitions settle before pixel comparison.
  const baseline = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .35, box.y + box.height * .65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .55, { steps: 15 });
  await page.mouse.up();
  expect((await canvas.screenshot()).equals(baseline)).toBe(false);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(baseline)).toBe(true);
  await page.getByRole("button", { name: "About this demo" }).click();
  await expect(page.locator("dialog")).toContainText("This prototype uses real historical data.");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(failed).toEqual([]);
});

test("real case phone layout and profile selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const marker = page.getByRole("button", { name: "Select profile 2902766", exact: true });
  await expect(marker).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await marker.click();
  await expect(page.locator(".inspector-heading h2")).toHaveText("Observation 2902766");
});

test("missing real data fails visibly without synthetic fallback", async ({ page }) => {
  await page.route("**/real-case/temperature.f32", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Unable to open the workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
