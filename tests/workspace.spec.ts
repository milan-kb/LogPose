import { expect, test } from "@playwright/test";

test("complete recorded workflow: 3D, depth, time, instruments and comparison", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const marker = page.getByRole("button", {
    name: "Select profile LP-02",
    exact: true,
  });
  await expect(marker).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Observation inspector" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Inspect LP-03" }),
  ).not.toBeVisible();
  const initialScene = await page.locator(".scene-column").boundingBox();
  expect(initialScene!.width).toBeGreaterThan(1400);
  const canvas = page.locator(".ocean-canvas canvas");
  const first = await canvas.screenshot();
  await page.getByRole("slider", { name: "Depth in metres" }).fill("600");
  await expect(page.getByTestId("depth-value")).toHaveText("600");
  expect((await canvas.screenshot()).equals(first)).toBe(false);
  await page.getByRole("slider", { name: "Depth in metres" }).fill("200");
  await expect(page.getByTestId("ocean-scene")).toHaveAttribute(
    "data-depth",
    "200",
  );
  await page.getByRole("slider", { name: "Ocean time" }).fill("2");
  await expect(page.getByTestId("ocean-scene")).toHaveAttribute(
    "data-time",
    "2",
  );
  await marker.hover();
  await expect(
    page.getByRole("tooltip", { name: /Observation LP-02/ }),
  ).toBeVisible();
  await marker.click();
  await expect(
    page
      .getByRole("complementary", { name: "Observation inspector" })
      .getByRole("heading", { name: "Observation LP-02", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /profiles for LP-02/ }),
  ).toBeVisible();
  const numeric = async (id: string) =>
    parseFloat((await page.getByTestId(id).textContent())!.replace("−", "-"));
  await page.getByRole("slider", { name: "Depth in metres" }).fill("225");
  await expect(
    page.getByText("At the selected depth · 225 m below surface"),
  ).toBeVisible();
  expect(
    Math.abs(
      (await numeric("point-difference")) -
        ((await numeric("model-value")) - (await numeric("observed-value"))),
    ),
  ).toBeLessThan(0.02);
  await expect(page.getByText("0 h · same demo snapshot")).not.toBeVisible();
  const beforeTime = await page.getByTestId("model-value").textContent();
  await page.getByRole("slider", { name: "Ocean time" }).fill("4");
  await expect(page.getByTestId("model-value")).not.toHaveText(beforeTime!);
  await expect(
    page.getByRole("button", { name: "Select profile LP-02", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Observation profiles", { exact: true }).uncheck();
  await expect(marker).toHaveCount(0);
  await page.getByLabel("Observation profiles", { exact: true }).check();
  await page
    .getByRole("button", { name: "Close profile", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select profile LP-03", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select profile LP-03", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play time playback" }).click();
  await expect(page.getByTestId("ocean-scene")).not.toHaveAttribute(
    "data-time",
    "4",
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: "Pause time playback" }).click();
  const box = (await canvas.boundingBox())!;
  const beforeRotate = await canvas.screenshot();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, {
    steps: 15,
  });
  await page.mouse.up();
  expect((await canvas.screenshot()).equals(beforeRotate)).toBe(false);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page
    .getByRole("button", { name: "Close profile", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Observation inspector" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select profile LP-01", exact: true })
    .click();
  await page.getByText("Comparison details", { exact: true }).click();
  await expect(page.getByText("0 h · same demo snapshot")).toBeVisible();
  await page.getByRole("button", { name: "About this demo" }).click();
  await expect(
    page.getByText("This is a representative prototype."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("local-only loading and phone layout", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Select profile LP-01", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".scene-marker").evaluateAll((markers) => {
        const boxes = markers.map((marker) => marker.getBoundingClientRect());
        return boxes.every((a, i) =>
          boxes
            .slice(i + 1)
            .every(
              (b) =>
                a.right <= b.left ||
                a.left >= b.right ||
                a.bottom <= b.top ||
                a.top >= b.bottom,
            ),
        );
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Select profile LP-04", exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Observation inspector" })
      .getByRole("heading", { name: "Observation LP-04", exact: true }),
  ).toBeVisible();
  expect(external).toEqual([]);
});

test("local data failures show a recoverable error", async ({ page }) => {
  await page.route("**/coastline.geojson", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Unable to open the workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
});
