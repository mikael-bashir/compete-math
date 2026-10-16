import Tengoku.All

theorem o1 (f g : ℕ → ℕ) (h : ∀ n, f n = g n) : f = g := funext h
