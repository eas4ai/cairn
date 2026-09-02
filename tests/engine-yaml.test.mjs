import { test, expect } from "bun:test";
import { parseYaml, stringifyYaml, YamlError } from "../skills/new-project/scripts/engine/yaml.ts";

// The engine's YAML subset (iteration 001, ENG-188): every file the
// engine writes round-trips through its own reader, and hand edits in
// the same subset parse; anything outside it is an error with a line.

test("round-trips nested mappings, sequences, and scalars", () => {
  const value = {
    version: 1,
    specs: ["docs/specs/x", "docs/superpowers/specs"],
    default_profile: "default",
    profiles: { default: { require: { any: [{ kind: "test" }, { sensitivity: "challenged" }], binding: { basis: "backend", developer_confirmed: true } } } },
    domains: {},
    validators: [],
    note: null,
    ratio: 0.5,
  };
  const text = stringifyYaml(value, ["header line"]);
  expect(text.startsWith("# header line\n")).toBe(true);
  expect(parseYaml(text)).toEqual(value);
});

test("quotes the strings that would otherwise change meaning", () => {
  const value = {
    colon: "a: b",
    hash: "x #y",
    leading: " padded",
    empty: "",
    bool: "true",
    num: "123",
    nul: "null",
    dash: "- item",
    multi: "line one\nline two",
    tab: "a\tb",
    quote: 'say "hi" \\ back',
  };
  const text = stringifyYaml(value);
  expect(parseYaml(text)).toEqual(value);
  expect(text).toContain('colon: "a: b"');
  expect(text).toContain('bool: "true"');
  expect(text).toContain('multi: "line one\\nline two"');
});

test("reads comments, literal blocks, and sequences of mappings", () => {
  const text = [
    "# top comment",
    "name: x   # trailing comment",
    "items:",
    "  - a",
    "  - b",
    "steps:",
    "- key: one",
    "  extra: 1",
    "- key: two",
    "text: |",
    "  first line",
    "  second line",
    "empty_list: []",
    "empty_map: {}",
    "",
  ].join("\n");
  expect(parseYaml(text)).toEqual({
    name: "x",
    items: ["a", "b"],
    steps: [{ key: "one", extra: 1 }, { key: "two" }],
    text: "first line\nsecond line\n",
    empty_list: [],
    empty_map: {},
  });
});

test("reports what is outside the subset, with the line", () => {
  const bad = [
    ["a: &anchor 1", /unsupported syntax.*\(line 1\)/],
    ["a: [1, 2]", /flow collections.*\(line 1\)/],
    ["a: 1\n\tb: 2", /tab indentation.*\(line 2\)/],
    ["a: 1\na: 2", /duplicate key a.*\(line 2\)/],
    ['a: "open', /unterminated.*\(line 1\)/],
    ["a: 1\n   b: 2", /unexpected indentation.*\(line 2\)/],
  ];
  for (const [text, re] of bad) {
    let err = null;
    try {
      parseYaml(text);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(YamlError);
    expect(err.message).toMatch(re);
  }
});

test("an empty document is an empty mapping", () => {
  expect(parseYaml("")).toEqual({});
  expect(parseYaml("# only a comment\n")).toEqual({});
});
