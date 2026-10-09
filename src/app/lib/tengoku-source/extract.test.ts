import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScript, declaredKeyword, moduleCandidates, resolveModule, declaredName, displayUrl, extractDeclaration, moduleOf, openContext, parseSourceUrl, rawUrl, splitHeaderAndProof, toolchainTag } from "./extract";

const SHA = "8cfa337c09cfc7ade3b3f024cfa82a436f700349";
const URL = `https://github.com/competemath/tengoku/blob/${SHA}/Tengoku/Algebra/Group/Semigroup.lean#L227`;

// Real lines of the tree (Tengoku/Algebra/Group/Semigroup.lean and Tengoku/Data/Nat/Prime/Defs.lean), and the shapes around them.
const SEMIGROUP = `section CommMagma

variable [CommMagma G] {a : G}

@[to_additive]
theorem mul_comm : ∀ a b : G, a * b = b * a := CommMagma.mul_comm

@[to_additive]
instance CommMagma.to_isCommutative : IsMulCommutative G := ⟨⟨mul_comm⟩⟩
`;
const PRIME = `theorem Prime.coprime_iff_not_dvd {p n : ℕ} (pp : Prime p) : Coprime p n ↔ ¬p ∣ n :=
  ⟨fun co d => pp.not_dvd_one <| co.dvd_of_dvd_mul_left (by simp [d]), fun nd =>
    coprime_of_dvd fun _ m2 mp => ((prime_dvd_prime_iff_eq m2 pp).1 mp).symm ▸ nd⟩

theorem Prime.dvd_mul {p m n : ℕ} (pp : Prime p) : p ∣ m * n ↔ p ∣ m ∨ p ∣ n :=
  ⟨fun H => or_iff_not_imp_left.2 fun h => (pp.coprime_iff_not_dvd.2 h).dvd_of_dvd_mul_left H,
    Or.rec (fun h : p ∣ m => h.mul_right _) fun h : p ∣ n => h.mul_left _⟩

alias ⟨Prime.dvd_or_dvd, _⟩ := Prime.dvd_mul
`;

test("only links to a file of the Tengoku tree at a commit are accepted", () => {
  assert.deepEqual(parseSourceUrl(URL), { sha: SHA, tag: null, path: "Tengoku/Algebra/Group/Semigroup.lean", line: 227, root: "tree" });
  for (const bad of [
    URL.replace("competemath/tengoku", "evil/tengoku"), URL.replace("https://github.com", "https://example.com"), URL.replace(SHA, "main"),
    URL.replace("Tengoku/Algebra", "Tengoku/../Algebra"), URL.replace(".lean#L227", ".md#L227"), URL.replace("#L227", ""), URL.replace("blob", "raw"),
    `${URL}&x=1`, URL.replace("Tengoku/Algebra", "scripts/Algebra"),
  ]) assert.equal(parseSourceUrl(bad), null, bad);
  assert.equal(moduleOf("Tengoku/Algebra/Group/Semigroup.lean"), "Tengoku.Algebra.Group.Semigroup");
});

test("an attribute and a term proof: the proof is what follows the declaration's own :=", () => {
  const d = extractDeclaration(SEMIGROUP, 5)!;
  assert.equal(d.startLine, 5);
  assert.equal(d.endLine, 6);
  assert.equal(d.declared, "mul_comm");
  assert.equal(d.proof, "CommMagma.mul_comm");
  assert.ok(d.code.startsWith("@[to_additive]\ntheorem mul_comm"));
  assert.ok(!d.code.includes("instance"));
});

test("an index line that points at the keyword takes the attribute above it", () => {
  assert.equal(extractDeclaration(SEMIGROUP, 6)!.startLine, 5);
});

test("a multi-line anonymous-constructor proof ends before the next command", () => {
  const d = extractDeclaration(PRIME, 5)!;
  assert.equal(d.declared, "Prime.dvd_mul");
  assert.ok(d.proof.startsWith("⟨fun H =>"));
  assert.ok(d.proof.endsWith("h.mul_left _⟩"));
  assert.ok(!d.code.includes("alias"));
  assert.ok(d.header.endsWith("p ∣ m ∨ p ∣ n"));
});

test("a tactic block runs to the next column-0 command, blank lines and all", () => {
  const src = `theorem foo (a b : ℕ) : a + b = b + a := by
  induction a with
  | zero => simp

  | succ n ih => omega

theorem bar : True := trivial
`;
  const d = extractDeclaration(src, 1)!;
  assert.equal(d.endLine, 5);
  assert.ok(d.proof.startsWith("by\n  induction a with"));
  assert.ok(d.proof.endsWith("omega"));
});

test("a docstring above the keyword is part of the declaration, and the := inside a binder default is not its own", () => {
  const src = `/-- The sum of two numbers is
commutative. -/
theorem foo {n : ℕ} (x : ℕ := 3) : x + n = n + x := Nat.add_comm _ _
`;
  const d = extractDeclaration(src, 3)!;
  assert.equal(d.startLine, 1);
  assert.equal(d.proof, "Nat.add_comm _ _");
  assert.ok(d.header.includes("(x : ℕ := 3)"));
});

test("equation-style definitions split at the first | line, and column-0 words in block comments do not end the declaration", () => {
  const src = `def fib : ℕ → ℕ
  | 0 => 0
  | 1 => 1
  /-
theorem inside_comment : False := sorry
-/
  | (n + 2) => fib n + fib (n + 1)

def next : ℕ := 1
`;
  const d = extractDeclaration(src, 1)!;
  assert.equal(d.endLine, 7);
  assert.ok(d.proof.startsWith("| 0 => 0"));
  assert.equal(d.header, "def fib : ℕ → ℕ");
});

test("a structure has no proof, and declaredName reads past attributes and modifiers", () => {
  assert.equal(splitHeaderAndProof("structure Foo where\n  x : ℕ").proof, "");
  assert.equal(declaredName("@[simp] protected theorem Nat.foo : True := trivial"), "Nat.foo");
  assert.equal(declaredName("/-- doc -/\n@[to_additive]\nprivate lemma bar : True := trivial"), "bar");
  assert.equal(declaredName("instance : Foo := ⟨⟩"), null);
});

test("opens and namespaces in scope: a section's opens are gone after its end", () => {
  const src = `import X
open BigOperators
namespace Nat
section A
open Finset
end A
open scoped Real
theorem t : True := trivial
`;
  assert.deepEqual(openContext(src, 8), { opens: ["BigOperators", "scoped Real"], namespaces: ["Nat"] });
  assert.deepEqual(openContext(src, 6), { opens: ["BigOperators", "Finset"], namespaces: ["Nat"] });
});

const base = { module: "Tengoku.Algebra.Group.Semigroup", name: "add_comm", library: "mathlib", tier: "trusted", sourceUrl: URL, opens: [], namespaces: [] };

test("the script imports the module, checks the statement, prints the axioms and closes the statement with the theorem", () => {
  const s = buildScript({ ...base, statement: "∀ {G : Type u_1} [inst : AddCommMagma G] (a b : G), a + b = b + a" });
  assert.match(s, /^\/-\n {2}Tengoku: add_comm {2}\(library mathlib, trusted\)/);
  assert.ok(s.includes("\nimport Tengoku.Algebra.Group.Semigroup\n"));
  assert.ok(s.includes("\nuniverse u_1\n"));
  assert.ok(s.includes("#check @add_comm\n#print axioms add_comm\n"));
  assert.ok(s.includes("#guard_msgs (drop all) in\nexample : ∀ {G : Type u_1} [inst : AddCommMagma G] (a b : G), a + b = b + a :=\n  @add_comm\n"));
  assert.ok(s.includes("lake env lean example.lean"));
});

test("namespaces and opens of the file are opened, a statement with an inaccessible name gets no typed example", () => {
  const s = buildScript({ ...base, name: "Nat.Prime.dvd_mul", statement: "∀ {p m n : ℕ}, Nat.Prime p → (p ∣ m * n ↔ p ∣ m ∨ p ∣ n)", opens: ["scoped Real"], namespaces: ["Nat"] });
  assert.ok(s.includes("open Nat\nopen scoped Real\n"));
  assert.ok(!s.includes("universe"));
  const t = buildScript({ ...base, statement: "∀ (a✝ : ℕ), a✝ = a✝" });
  assert.ok(t.includes("#check @add_comm"));
  assert.ok(!t.includes("example :"));
});

test("universe names are found in Type, Sort and max expressions", () => {
  const s = buildScript({ ...base, statement: "∀ {α : Type u} {β : Sort (max u v)} {γ : Type (max u_1 u_2)}, True" });
  assert.ok(s.includes("\nuniverse u u_1 u_2 v\n"), s);
});

test("Lean core files: the index links them under the tree's commit, they are read from leanprover/lean4 at the toolchain tag", () => {
  const link = `https://github.com/competemath/tengoku/blob/${SHA}/Init/Data/Nat/Basic.lean#L326`;
  const ref = parseSourceUrl(link)!;
  assert.deepEqual(ref, { sha: SHA, tag: null, path: "Init/Data/Nat/Basic.lean", line: 326, root: "core" });
  assert.equal(toolchainTag("leanprover/lean4:v4.34.0-rc2\n"), "v4.34.0-rc2");
  assert.equal(toolchainTag("garbage"), "v4.34.0-rc2");
  assert.equal(toolchainTag(null, "v9"), "v9");
  const shown = displayUrl(ref, "v4.34.0-rc2");
  assert.equal(shown, "https://github.com/leanprover/lean4/blob/v4.34.0-rc2/src/Init/Data/Nat/Basic.lean#L326");
  assert.equal(rawUrl(ref, "v4.34.0-rc2"), "https://raw.githubusercontent.com/leanprover/lean4/v4.34.0-rc2/src/Init/Data/Nat/Basic.lean");
  // the corrected link is accepted again by the source route (the results list sends what it was shown)
  assert.deepEqual(parseSourceUrl(shown), { sha: null, tag: "v4.34.0-rc2", path: "Init/Data/Nat/Basic.lean", line: 326, root: "core" });
  assert.equal(parseSourceUrl(shown.replace("leanprover/lean4", "evil/lean4")), null);
  assert.equal(parseSourceUrl(shown.replace("src/Init", "src/Elsewhere")), null);
  assert.equal(moduleOf("Init/Data/Nat/Basic.lean"), "Init.Data.Nat.Basic");
  assert.equal(rawUrl(parseSourceUrl(URL)!, "v4.34.0-rc2"), `https://raw.githubusercontent.com/competemath/tengoku/${SHA}/Tengoku/Algebra/Group/Semigroup.lean`);
});

test("a module of an older commit is found where the tree has it today (the Mathlib seed moved under Seed), else the whole tree is imported", async () => {
  assert.deepEqual(moduleCandidates("Tengoku/Algebra/Group/Semigroup.lean"), ["Tengoku.Algebra.Group.Semigroup", "Tengoku.Seed.Algebra.Group.Semigroup"]);
  assert.deepEqual(moduleCandidates("Tengoku/Seed/Algebra/Group/Semigroup.lean"), ["Tengoku.Seed.Algebra.Group.Semigroup"]);
  assert.deepEqual(moduleCandidates("Init/Data/Nat/Basic.lean"), ["Init.Data.Nat.Basic"]);
  const has = (files: string[]) => async (p: string) => files.includes(p);
  assert.equal(await resolveModule("Tengoku/Algebra/Group/Semigroup.lean", has(["Tengoku/Seed/Algebra/Group/Semigroup.lean"])), "Tengoku.Seed.Algebra.Group.Semigroup");
  assert.equal(await resolveModule("Tengoku/Apap/Basic.lean", has(["Tengoku/Apap/Basic.lean"])), "Tengoku.Apap.Basic");
  assert.equal(await resolveModule("Tengoku/Gone/Basic.lean", has([])), "Tengoku.All");
  assert.equal(await resolveModule("Init/Data/Nat/Basic.lean", has([])), "Init.Data.Nat.Basic");
});

test("the script silences the unused-instance warning of the written-out statement and ends with a newline", () => {
  const s = buildScript({ ...base, statement: "∀ {G : Type u_1} [inst : AddCommMagma G] (a b : G), a + b = b + a" });
  assert.ok(s.includes("set_option linter.unusedVariables false"));
  assert.ok(s.endsWith("@add_comm\n"));
});

test("a statement with a lambda or a projection is not repeated as an example (it does not elaborate again), the checks stay", () => {
  for (const statement of ["∀ {α : Type u_1} [TopologicalSpace α], Continuous fun p : α × α => max p.1 p.2", "Continuous fun x => x", "∀ (p : ℕ × ℕ), p.1 = p.1"]) {
    const s = buildScript({ ...base, name: "continuous_max", statement });
    assert.ok(!s.includes("example :"), statement);
    assert.ok(s.includes("#check @continuous_max\n#print axioms continuous_max\n"));
  }
  assert.ok(buildScript({ ...base, statement: "∀ (a b : ℕ), a + b = b + a" }).includes("example : ∀ (a b : ℕ), a + b = b + a :="));
});

test("a definition is printed, not restated: its type is the definition itself (a noncomputable one would not compile as an example)", () => {
  const s = buildScript({ ...base, name: "Real.exp", kind: "def", statement: "ℂ → ℂ" });
  assert.ok(s.includes("#print Real.exp\n"));
  assert.ok(!s.includes("example :"));
  for (const kind of ["instance", "structure", "class", "abbrev", "inductive", "axiom", "opaque"]) assert.ok(!buildScript({ ...base, kind, statement: "Type" }).includes("example :"), kind);
  for (const kind of ["theorem", "lemma", undefined]) assert.ok(buildScript({ ...base, kind, statement: "True" }).includes("example : True"), String(kind));
});

test("the keyword of a declaration, past a docstring, attributes and modifiers", () => {
  assert.equal(declaredKeyword("/-- doc -/\n@[simp]\nprotected theorem Nat.foo : True := trivial"), "theorem");
  assert.equal(declaredKeyword("noncomputable def Real.exp (x : ℝ) : ℝ := x"), "def");
  assert.equal(declaredKeyword("instance : Foo := ⟨⟩"), "instance");
  assert.equal(extractDeclaration("lemma bar : True := trivial\n", 1)!.kind, "lemma");
});
