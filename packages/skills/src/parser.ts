export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

export function parseSkillMarkdown(content: string): ParsedSkill {
  const trimmed = content.trim();

  if (!trimmed.startsWith("---")) {
    return { name: "", description: "", body: trimmed };
  }

  const secondDelimiter = trimmed.indexOf("---", 3);
  if (secondDelimiter === -1) {
    return { name: "", description: "", body: trimmed };
  }

  const frontmatter = trimmed.slice(3, secondDelimiter).trim();
  const body = trimmed.slice(secondDelimiter + 3).trim();

  let name = "";
  let description = "";

  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key === "name") name = value;
    if (key === "description") description = value;
  }

  return { name, description, body };
}
