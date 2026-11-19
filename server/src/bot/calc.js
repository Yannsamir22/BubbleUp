import { all, create } from "mathjs";

/**
 * A sandboxed mathjs instance: no import/parse tricks and no functions that can
 * allocate huge matrices (e.g. range(1, 1e9)) and freeze the server.
 */
const math = create(all);
const evaluate = math.evaluate;
const blocked = (name) => () => {
  throw new Error(`${name} is disabled here`);
};
math.import(
  Object.fromEntries(
    ["import", "createUnit", "evaluate", "parse", "simplify", "derivative", "compile", "resolve", "reviver",
      "range", "zeros", "ones", "identity", "matrix", "sparse", "random", "randomInt", "pickRandom", "kron", "diag", "resize",
    ].map((n) => [n, blocked(n)]),
  ),
  { override: true },
);

export function calculate(expression) {
  const expr = expression.trim();
  if (!expr) throw new Error("Give me something to calculate, e.g. /calc 2 * (3 + 4)");
  if (expr.length > 200) throw new Error("That expression is too long.");
  const result = evaluate(expr);
  if (typeof result === "function") throw new Error("That's a function, not a number.");
  return math.format(result, { precision: 12 });
}
