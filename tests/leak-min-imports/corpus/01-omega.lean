import Tengoku.All

theorem a1 (a b : ℕ) (h : a < b) : a + 1 ≤ b := by omega

theorem a2 (n : ℕ) : n % 2 = 0 ∨ n % 2 = 1 := by omega
