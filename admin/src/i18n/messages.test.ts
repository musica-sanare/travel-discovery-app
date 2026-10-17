import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../shared/locales";
import { resources } from "./resources";

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(keyPath, value);
    } else {
      for (const [nested, nestedValue] of flatten(value, keyPath)) entries.set(nested, nestedValue);
    }
  }
  return entries;
}

describe("admin message catalogs", () => {
  const reference = [...flatten(resources.ja.translation).keys()].sort();

  it.each(SUPPORTED_LOCALES)("%s has the reference keys and no blank messages", (locale) => {
    const messages = flatten(resources[locale].translation);
    expect([...messages.keys()].sort()).toEqual(reference);
    expect([...messages].filter(([, value]) => value.trim() === "").map(([key]) => key)).toEqual([]);
  });
});
