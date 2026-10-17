import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../shared/locales";
import { resources } from "./resources";

type MessageTree = { [key: string]: string | MessageTree };

function flattenKeys(tree: MessageTree, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(path, value);
    } else {
      for (const [nestedPath, nestedValue] of flattenKeys(value, path)) {
        entries.set(nestedPath, nestedValue);
      }
    }
  }
  return entries;
}

describe("UI message catalogs", () => {
  const reference = flattenKeys(resources.ja.translation);

  it.each(SUPPORTED_LOCALES)("%s has exactly the reference keys", (locale) => {
    const messages = flattenKeys(resources[locale].translation);

    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it.each(SUPPORTED_LOCALES)("%s has no blank messages", (locale) => {
    const blank = [...flattenKeys(resources[locale].translation)]
      .filter(([, value]) => value.trim() === "")
      .map(([key]) => key);

    expect(blank).toEqual([]);
  });
});
