import Tengoku.All

namespace Foo

variable {α : Type*} [Group α]

theorem t1 (a b : α) : (a * b)⁻¹ = b⁻¹ * a⁻¹ := by simp

end Foo
