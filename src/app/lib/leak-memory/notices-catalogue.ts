// What a notice about the review of your kept theorems means, and what a driver (the agent that is doing the proving) can do about it.
//
// A notice is the outcome of one step of the intake of a kept theorem into Tengoku (the pull request the intake job opened for it, a check on that pull
// request, a reviewer's verdict on one theorem). Every notice carries a CODE; this table is the only place a code gets its words, so the same words are
// shown to the account in the modal and handed to the driver, and nothing a reviewer or another account wrote ever reaches the driver as text: the driver
// is told what the code means and what to do, in this file's sentences, plus the names of the theorems it is about.

export type NoticeKind = 'submitted' | 'merged' | 'gate_failed' | 'changes_requested' | 'returned' | 'rejected' | 'closed';
export type NoticeLevel = 'info' | 'success' | 'warn' | 'error';

export const NOTICE_KINDS: readonly NoticeKind[] = ['submitted', 'merged', 'gate_failed', 'changes_requested', 'returned', 'rejected', 'closed'];

export interface CatalogueEntry {
  title: string;
  /** what happened, for the account */
  meaning: string;
  /** what the driver should do about it: an imperative sentence the driver reads. Empty: nothing to do. */
  action: string;
}

export const KIND_LEVEL: Record<NoticeKind, NoticeLevel> = {
  submitted: 'info',
  merged: 'success',
  gate_failed: 'error',
  changes_requested: 'warn',
  returned: 'warn',
  rejected: 'error',
  closed: 'warn',
};

export const KIND_LABEL: Record<NoticeKind, string> = {
  submitted: 'Submitted',
  merged: 'Merged',
  gate_failed: 'A check failed',
  changes_requested: 'Changes requested',
  returned: 'Returned',
  rejected: 'Rejected',
  closed: 'Closed',
};

const REVISE = 'Revise the theorem (same name, better statement or proof), verify it on Leak IV and save it again; a returned theorem is offered again only when its text changed.';

// exact codes first; a code the table does not know falls back to its first dotted part (`style.line_length` -> `style`), then to GENERIC
export const CATALOGUE: Record<string, CatalogueEntry> = {
  'pr.opened': {
    title: 'Submitted to Tengoku',
    meaning: 'A pull request was opened for these theorems. It waits for its checks and for a person to approve it.',
    action: '',
  },
  'pr.merged': {
    title: 'Merged into Tengoku',
    meaning: 'These theorems are part of Tengoku now.',
    action: 'They are in Tengoku: do not prove them again. Build on them by name; the Leak I search finds them.',
  },
  'pr.closed': {
    title: 'Closed without merging',
    meaning: 'The pull request was closed by a person or by the intake without being merged. The theorems stay kept and are not offered again unless they change.',
    action: 'Treat these as not accepted. Do not rely on them being in Tengoku.',
  },
  'review.changes': {
    title: 'A reviewer asked for changes',
    meaning: 'A reviewer asked for changes on the pull request. The reason is on the pull request.',
    action: 'The account reads the reviewer\'s reason. Meanwhile keep improving the generality and clarity of these theorems, and save the better version.',
  },
  'gate.studied': {
    title: 'The studied-class check failed',
    meaning: 'The check that every intake pull request must pass (shape of the files, the report, the evidence) failed.',
    action: 'Nothing for you to do mid-run: the account is told. Do not resubmit; save a better version if you improve the theorem.',
  },
  'gate.isnad': {
    title: 'The identity tags are missing or wrong',
    meaning: 'Every theorem must carry its isnad tag when it enters Tengoku. The tag was missing or did not match the theorem.',
    action: 'Nothing for you to do: the tags are written by the intake, not by the prover. Do not add or edit @isnad lines.',
  },
  'gate.build': {
    title: 'The theorem did not build on the Tengoku tree',
    meaning: 'Compiled against the real Tengoku tree (not Leak IV alone), the module failed to build.',
    action: 'Prefer lemmas that exist in the Tengoku tree: confirm every name you use with the Leak I search, then verify again on Leak IV. ' + REVISE,
  },
  'gate.lint': {
    title: 'The content rules refused the module',
    meaning: 'The rules every library module must follow (no sorry, no new axioms, no notation or option changes, allowed commands only) refused it.',
    action: 'Remove anything that is not a plain definition, lemma or theorem with a proof: no notation, no set_option, no attributes that change global behaviour. ' + REVISE,
  },
  'gate.other': {
    title: 'A check failed',
    meaning: 'A check on the pull request failed. The log is on the pull request.',
    action: 'Nothing for you to do mid-run; the account is told.',
  },
  'bar.merit': {
    title: 'No sign it is useful or general',
    meaning: 'Nothing in Tengoku uses a result of this shape, it does not generalise anything already there, and it is not rated five stars: the bar asks for one of the three.',
    action: 'Make it more general (fewer hypotheses, an arbitrary ring or order instead of one type, a variable instead of a numeral), or show a use: prove a second theorem of this target from it and save both. ' + REVISE,
  },
  'generalise.patch': {
    title: 'A more general statement exists',
    meaning: 'The same proof proves a more general statement (a hypothesis dropped, a numeral made a variable, a type made a type class). The compiler accepted it.',
    action: 'State the general form (the patch is attached to the pull request\'s report) and derive the specific one from it. ' + REVISE,
  },
  'dedupe.identical': {
    title: 'Already in Tengoku',
    meaning: 'A theorem with the same statement (up to renaming) is already in Tengoku or in the same bundle.',
    action: 'Do not save another proof of a statement that exists; use the existing theorem by name. If your proof is genuinely different and shorter, say so in the NOTE.',
  },
  'dedupe.instance_of': {
    title: 'A special case of an existing theorem',
    meaning: 'An existing theorem is more general: this one is an instance of it.',
    action: 'Use the existing theorem instead of proving the special case again, or prove something that is not an instance of it.',
  },
  'dedupe.near_duplicate': {
    title: 'Almost the same as an existing theorem',
    meaning: 'A very similar statement already exists.',
    action: 'Check the existing theorem with the Leak I search and use it; keep this one only if it says something the existing one does not.',
  },
  'style.sorry': {
    title: 'Contains sorry',
    meaning: 'A sorry or admit was found.',
    action: 'Save only theorems verified without sorry.',
  },
  'style.native_decide': {
    title: 'Uses native_decide',
    meaning: 'native_decide trusts the compiler, not the kernel.',
    action: 'Prove it with decide, simp, omega or an explicit proof; never native_decide.',
  },
  'naming.placeholder': {
    title: 'The name says nothing',
    meaning: 'The theorem\'s name is a placeholder or looks machine-made.',
    action: 'Name theorems by what they say, in snake_case, the way Mathlib does (add_comm, lt_of_le_of_lt). ' + REVISE,
  },
  'naming.case': {
    title: 'The name breaks the case convention',
    meaning: 'Theorems are snake_case, types UpperCamelCase, data-valued definitions lowerCamelCase.',
    action: 'Rename it to follow the convention. ' + REVISE,
  },
  'docs.module_doc': {
    title: 'No module docstring',
    meaning: 'A module needs a /-! # Title ... -/ docstring that says what it proves.',
    action: 'Nothing for you to do: the module is generated by the intake from your theorem. Give the theorem a docstring that says what it means.',
  },
  'docs.def_doc': {
    title: 'A definition has no docstring',
    meaning: 'Every public definition needs a docstring.',
    action: 'Give every definition a one-sentence /-- docstring --/ saying what it is. ' + REVISE,
  },
  'lint.env': {
    title: 'A library linter complained',
    meaning: 'One of Batteries\' library linters (unused arguments, simp normal form, missing docs) reported the declaration.',
    action: 'Remove unused arguments, state simp lemmas so the left side is in simp normal form. ' + REVISE,
  },
  'compat.forward': {
    title: 'It will not build on the next toolchain',
    meaning: 'The module compiles today and fails on the Lean and Mathlib the tree will move to.',
    action: 'Avoid deprecated names and tactics that changed; confirm names with the Leak I search. ' + REVISE,
  },
  'robust.fragile': {
    title: 'It only works on your settings',
    meaning: 'The proof needs a set_option, autoImplicit, or most of the heartbeat limit.',
    action: 'Prove it without set_option or autoImplicit, with a margin on the time limit. ' + REVISE,
  },
};

// by first dotted part
const BY_PREFIX: Record<string, CatalogueEntry> = {
  style: { title: 'A style rule', meaning: 'A Mathlib style rule fired on the module.', action: 'Follow Mathlib style: lines up to 100 characters, no trailing spaces, no isolated `by` or `·`. ' + REVISE },
  naming: { title: 'A naming rule', meaning: 'A naming convention was broken.', action: 'Follow Mathlib\'s naming conventions. ' + REVISE },
  docs: { title: 'A documentation rule', meaning: 'A documentation rule was broken.', action: 'Add the missing docstring. ' + REVISE },
  api: { title: 'The API is incomplete', meaning: 'A sibling lemma is missing or a statement is not in the form Mathlib states it.', action: 'State conclusions with ≤ and <, write ≠ and ∉, and prove the missing _left/_right counterpart. ' + REVISE },
  dedupe: { title: 'Already there', meaning: 'A very similar statement exists.', action: 'Use the existing theorem. ' },
  generalise: { title: 'A more general statement exists', meaning: 'The same proof proves more.', action: 'State the general form. ' + REVISE },
  reuse: { title: 'Nothing uses it', meaning: 'Nothing in Tengoku proves an instance of this inline.', action: 'Show a use. ' + REVISE },
  minimise: { title: 'The proof can be shorter', meaning: 'Steps of the proof are not needed.', action: 'Remove the unneeded steps. ' + REVISE },
  robust: { title: 'The proof is fragile', meaning: 'It depends on the author\'s settings.', action: 'Prove it on the default settings. ' + REVISE },
  lint: { title: 'A library linter complained', meaning: 'A library linter reported the declaration.', action: REVISE },
  compat: { title: 'Compatibility', meaning: 'It does not hold up on the next toolchain.', action: REVISE },
  gate: { title: 'A check failed', meaning: 'A check on the pull request failed.', action: 'Nothing for you to do mid-run; the account is told.' },
  bar: { title: 'Below the bar', meaning: 'The bar for entering Tengoku was not met.', action: REVISE },
  pr: { title: 'Pull request', meaning: 'Something happened to the pull request.', action: '' },
  review: { title: 'Review', meaning: 'A reviewer acted on the pull request.', action: '' },
};
const GENERIC: CatalogueEntry = { title: 'Notice', meaning: 'Something happened to a submission.', action: '' };

export const CODE = /^[a-z][a-z0-9_]{0,30}(\.[a-z0-9_]{1,40}){0,2}$/;

export function lookup(code: string): CatalogueEntry {
  return CATALOGUE[code] ?? BY_PREFIX[code.split('.')[0]] ?? GENERIC;
}

/** every code the catalogue names, for the modal's "ignore this kind of notice" list */
export const KNOWN_CODES: string[] = Object.keys(CATALOGUE).sort();
