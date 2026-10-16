import Tengoku.All

structure P where
  x : ℕ
  y : ℕ

def P.add (a b : P) : P := ⟨a.x + b.x, a.y + b.y⟩

instance : Add P := ⟨P.add⟩

theorem p1 (a b : P) : (a + b).x = a.x + b.x := rfl
