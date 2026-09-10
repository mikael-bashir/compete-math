import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lean_extract import extract_declarations


def test_simple_theorem():
    src = "theorem add_comm (a b : Nat) : a + b = b + a := by ring"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "add_comm"
    assert decls[0].statement == "theorem add_comm (a b : Nat) : a + b = b + a"


def test_lemma_keyword():
    src = "lemma foo : True := trivial"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "foo"


def test_default_argument_colon_equals_not_a_boundary():
    # The `:=` inside the parens (a default argument value) must NOT be
    # mistaken for the start of the proof.
    src = "theorem bar (n : Nat := 0) : n = n := rfl"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].statement == "theorem bar (n : Nat := 0) : n = n"


def test_multiline_signature():
    src = (
        "theorem long_one\n"
        "    (a b c : Nat)\n"
        "    (h : a = b) :\n"
        "    a + c = b + c := by\n"
        "  rw [h]\n"
    )
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert "a + c = b + c" in decls[0].statement
    assert "rw [h]" not in decls[0].statement


def test_attribute_and_modifiers():
    src = "@[simp] private theorem hidden_thing : 1 = 1 := rfl"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "hidden_thing"


def test_line_comment_does_not_break_scan():
    src = "theorem c : 1 = 1 := by -- trivially true\n  rfl"
    decls = extract_declarations(src)
    assert len(decls) == 1
    assert decls[0].name == "c"


def test_multiple_declarations_in_one_file():
    src = (
        "theorem one : 1 = 1 := rfl\n\n"
        "theorem two : 2 = 2 := rfl\n"
    )
    decls = extract_declarations(src)
    assert [d.name for d in decls] == ["one", "two"]


def test_no_declarations_returns_empty():
    assert extract_declarations("def foo := 1\n#eval foo") == []


def test_unterminated_declaration_is_skipped():
    src = "theorem broken (a : Nat"  # never closes, no :=
    assert extract_declarations(src) == []
