import { describe, it, expect } from "vitest";
import { parseSkillMarkdown } from "../src/parser.js";

describe("parseSkillMarkdown", () => {
  it("parses valid skill markdown with frontmatter", () => {
    const content = `---
name: greeting
description: A greeting skill
---

# Hello World`;

    const result = parseSkillMarkdown(content);
    expect(result.name).toBe("greeting");
    expect(result.description).toBe("A greeting skill");
    expect(result.body).toBe("# Hello World");
  });

  it("parses skill with multi-line body", () => {
    const content = `---
name: multi
description: Multi-line body
---

# Title

Paragraph one.

Paragraph two.`;

    const result = parseSkillMarkdown(content);
    expect(result.name).toBe("multi");
    expect(result.body).toContain("Paragraph one.");
    expect(result.body).toContain("Paragraph two.");
  });

  it("defaults description to empty string when missing", () => {
    const content = `---
name: no-desc
---

Body content here.`;

    const result = parseSkillMarkdown(content);
    expect(result.name).toBe("no-desc");
    expect(result.description).toBe("");
    expect(result.body).toBe("Body content here.");
  });

  it("handles malformed frontmatter gracefully", () => {
    const content = `This is not frontmatter
Just plain text`;

    const result = parseSkillMarkdown(content);
    expect(result.name).toBe("");
    expect(result.description).toBe("");
    expect(result.body).toBe(content.trim());
  });

  it("handles frontmatter with missing closing delimiter", () => {
    const content = `---
name: broken
description: oops`;

    const result = parseSkillMarkdown(content);
    expect(result.name).toBe("");
    expect(result.body).toBe(content.trim());
  });
});
