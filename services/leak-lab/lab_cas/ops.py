"""The CAS operations by name, with the wall-clock budget each is given. The worker looks them up here; the server calls them through the worker."""
from __future__ import annotations

from typing import Callable

from . import algebra, data, maps, numtheory

# name -> (function, wall seconds). Budgets are per call and enforced from outside by lab_common.limits.
OPS: dict[str, tuple[Callable[..., dict], float]] = {
    "evaluate": (numtheory.evaluate, 10),
    "factor": (numtheory.factor, 25),
    "primes": (numtheory.primes, 20),
    "arithmetic": (numtheory.arithmetic, 10),
    "base_digits": (numtheory.base_digits, 10),
    "mod_pow": (numtheory.mod_pow, 10),
    "power_cycle": (numtheory.power_cycle, 20),
    "mod_order": (numtheory.mod_order, 10),
    "unit_group": (numtheory.unit_group, 30),
    "solve_congruence": (numtheory.solve_congruence, 10),
    "crt": (numtheory.crt, 10),
    "solve_polynomial_mod": (numtheory.solve_polynomial_mod, 25),
    "map_orbit": (maps.map_orbit, 20),
    "map_scan": (maps.map_scan, 25),
    "map_cylinders": (maps.map_cylinders, 25),
    "map_cycles": (maps.map_cycles, 30),
    "polynomial": (algebra.polynomial, 25),
    "ideal_certificate": (algebra.ideal_certificate, 40),
    "scan_predicate": (data.scan_predicate, 25),
    "tabulate": (data.tabulate, 15),
    "residue_histogram": (data.residue_histogram, 25),
    "guess_sequence": (data.guess_sequence, 15),
}
