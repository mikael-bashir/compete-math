import Tengoku.All

theorem v1 (n : ℕ) : 2 ^ n ≥ n + 1 := by
  induction n with
  | zero => simp
  | succ k ih =>
    rw [pow_succ]
    omega
