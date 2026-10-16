import Tengoku.All

theorem g1 (s t : Set ℕ) : s ∩ t ⊆ s ∪ t := by
  intro x hx
  exact Or.inl hx.1
