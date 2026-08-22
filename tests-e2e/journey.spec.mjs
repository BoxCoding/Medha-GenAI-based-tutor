/* End-to-end browser tests for the learner journey.
 *
 * These cover what unit tests cannot: that the SPA actually boots, that the
 * primary navigation buttons work, and that a full session produces no
 * console errors or failed network requests.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PASSWORD = "e2e-pass-1234";
const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}@medha.test`;

/** Collect every console error and failed/4xx/5xx request for later assertion. */
function watchForProblems(page) {
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) =>
    problems.push(`requestfailed: ${request.url()}`)
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
}

async function signUp(page) {
  await page.goto("/");
  // The auth view is revealed by JavaScript; if the SPA failed to boot, the
  // raw HTML would leave the onboarding view showing instead.
  await expect(page.locator("#view-auth")).toBeVisible();
  await page.locator("#tab-register").click();
  await page.fill("#r-name", "E2E Learner");
  await page.fill("#r-email", uniqueEmail());
  await page.fill("#r-password", PASSWORD);
  await page.locator("#register-form button[type=submit]").click();
  await expect(page.locator("#view-onboard")).toBeVisible();
}

async function buildLearningPath(page, topic = "Graph Theory") {
  await page.fill("#f-name", "E2E Learner");
  await page.fill("#f-topic", topic);
  await page.locator("#onboard-submit").click();
  await expect(page.locator("#view-dashboard")).toBeVisible();
  // The form is JS-driven: a native submit would push values into the URL.
  expect(new URL(page.url()).search).toBe("");
}

test("primary Learn button opens the lesson", async ({ page }) => {
  await signUp(page);
  await buildLearningPath(page);

  await page.locator("#recommendation .btn-primary").click();
  await expect(page.locator("#view-lesson")).toBeVisible();
  await expect(page.locator("#lesson-title")).not.toBeEmpty();
});

test("per-concept Learn button opens the lesson", async ({ page }) => {
  await signUp(page);
  await buildLearningPath(page);

  await page
    .locator("#concept-list .concept-actions .btn")
    .filter({ hasText: "Learn" })
    .first()
    .click();
  await expect(page.locator("#view-lesson")).toBeVisible();
  await expect(page.locator("#lesson-title")).not.toBeEmpty();
});

test("lesson carries a visual and a storytelling section", async ({ page }) => {
  await signUp(page);
  await buildLearningPath(page);
  await page.locator("#recommendation .btn-primary").click();
  await expect(page.locator("#view-lesson")).toBeVisible();

  await expect(page.locator("#lesson-content .viz-figure").first()).toBeVisible();
  await expect(
    page.locator("#lesson-content").getByText("Learn Through Storytelling")
  ).toBeVisible();
});

test("adaptive quiz can be answered and updates mastery", async ({ page }) => {
  await signUp(page);
  await buildLearningPath(page);

  await page
    .locator("#concept-list .concept-actions .btn")
    .filter({ hasText: "Quiz" })
    .first()
    .click();
  await expect(page.locator("#view-quiz")).toBeVisible();

  for (const block of await page.locator("#quiz-form .q-block").all()) {
    await block.locator("input[type=radio]").first().check();
  }
  await page.locator("#quiz-form button[type=submit]").click();
  await expect(page.locator("#quiz-result .result-banner")).toBeVisible();
  await expect(page.locator("#quiz-result .mastery-shift")).toContainText("Mastery");
});

test("a full session produces no console errors or failed requests", async ({ page }) => {
  const problems = watchForProblems(page);

  await signUp(page);
  await buildLearningPath(page);
  await page.locator("#recommendation .btn-primary").click();
  await expect(page.locator("#view-lesson")).toBeVisible();
  await page.locator("[data-back]").first().click();
  await expect(page.locator("#view-dashboard")).toBeVisible();
  await page.locator("#tutor-open").click();
  await expect(page.locator("#tutor-panel")).toBeVisible();
  await page.locator("#logout-btn").click();
  await expect(page.locator("#view-auth")).toBeVisible();

  expect(problems).toEqual([]);
});

// Scan with reduced motion so colours are sampled in their settled state:
// mid-fade opacity would report transient, meaningless contrast values.
test.describe("accessibility", () => {
  test.use({ reducedMotion: "reduce" });

  test("no serious or critical WCAG violations", async ({ page }) => {
    const scan = async (label) => {
      // Let the view's fade-in finish. Sampling mid-animation reads blended
      // opacity values rather than the colours a reader actually sees.
      await page.waitForTimeout(500);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const blocking = violations.filter((v) =>
        ["serious", "critical"].includes(v.impact)
      );
      // Name the offending elements so a failure is actionable, not just a rule id.
      expect(
        blocking.map(
          (v) => `${label} → ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`
        )
      ).toEqual([]);
    };

    await signUp(page);
    await scan("onboarding");
    await buildLearningPath(page);
    await scan("dashboard");
    await page.locator("#recommendation .btn-primary").click();
    await expect(page.locator("#view-lesson")).toBeVisible();
    await scan("lesson");
  });
});
