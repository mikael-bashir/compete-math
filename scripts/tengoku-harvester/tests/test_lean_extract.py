import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lean_extract import extract_declarations


def test_simple_theorem_keeps_statement_and_proof():
    src = "theorem add_comm (a b : Nat) : a + b = b + a := by ring"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "add_comm"
    assert decls[0].statement == "theorem add_comm (a b : Nat) : a + b = b + a"
    assert decls[0].proof == ":= by ring"


def test_lemma_keyword():
    src = "lemma foo : True := trivial"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "foo"
    assert decls[0].proof == ":= trivial"


def test_default_argument_colon_equals_not_a_boundary():
    # The `:=` inside the parens (a default argument value) must NOT be
    # mistaken for the start of the proof.
    src = "theorem bar (n : Nat := 0) : n = n := rfl"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].statement == "theorem bar (n : Nat := 0) : n = n"
    assert decls[0].proof == ":= rfl"


def test_multiline_proof_captured_in_full():
    src = (
        "theorem long_one\n"
        "    (a b c : Nat)\n"
        "    (h : a = b) :\n"
        "    a + c = b + c := by\n"
        "  rw [h]\n"
        "  ring\n"
    )
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert "a + c = b + c" in decls[0].statement
    assert "rw [h]" in decls[0].proof
    assert "ring" in decls[0].proof


def test_attribute_and_modifiers():
    src = "@[simp] private theorem hidden_thing : 1 = 1 := rfl"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "hidden_thing"
    assert decls[0].proof == ":= rfl"


def test_line_comment_does_not_break_scan():
    src = "theorem c : 1 = 1 := by -- trivially true\n  rfl"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "c"
    assert "rfl" in decls[0].proof


def test_multiple_declarations_proof_does_not_bleed_into_next():
    src = (
        "theorem one : 1 = 1 := by\n"
        "  rfl\n\n"
        "theorem two : 2 = 2 := by\n"
        "  rfl\n"
    )
    decls = extract_declarations(src)
    assert [d.name for d in decls] == ["one", "two"]
    assert "two" not in decls[0].proof
    assert "one" not in decls[1].proof


def test_last_declaration_proof_runs_to_eof():
    src = "theorem only_one : 1 = 1 := by\n  rfl\n"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert "rfl" in decls[0].proof


def test_no_declarations_returns_empty():
    assert extract_declarations("def foo := 1\n#eval foo") == []


def test_unterminated_declaration_is_skipped():
    src = "theorem broken (a : Nat"  # never closes, no :=
    assert extract_declarations(src) == []


def test_bare_sorry_proof_is_rejected():
    src = "theorem admitted : 1 = 1 := sorry"
    assert extract_declarations(src) == []


def test_sorry_inside_a_longer_tactic_proof_is_still_rejected():
    src = "theorem partial_proof : 1 = 1 := by\n  have h := rfl\n  sorry\n"
    assert extract_declarations(src) == []


def test_identifier_containing_sorry_as_a_substring_is_not_flagged():
    # "sorry" must match as a whole word — an identifier that merely
    # contains it (e.g. a hypothetical `sorryAx`-adjacent helper name) must
    # not falsely disqualify a real proof.
    src = "theorem uses_helper : 1 = 1 := by exact sorryLikeHelperButNotReally rfl"
    decls = extract_declarations(src)
    assert len(decls) == 1


def test_proven_and_sorry_declarations_in_the_same_file_are_separated():
    src = (
        "theorem proven_one : 1 = 1 := rfl\n\n"
        "theorem still_open : 2 = 2 := sorry\n\n"
        "theorem proven_two : 3 = 3 := rfl\n"
    )
    decls = extract_declarations(src)
    assert [d.name for d in decls] == ["proven_one", "proven_two"]
