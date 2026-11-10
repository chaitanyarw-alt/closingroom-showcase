import { describe, expect, it } from "vitest";

describe("Slack integration credentials", () => {
  it("authenticates the configured Slack bot token", async () => {
    const token = process.env.SLACK_BOT_TOKEN;
    expect(token, "SLACK_BOT_TOKEN must be configured").toBeTruthy();

    const response = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok).toBe(true);

    const payload = (await response.json()) as { ok?: boolean; error?: string };
    expect(payload.ok, payload.error ?? "Slack auth.test failed").toBe(true);
  }, 15_000);
});
